import { normalizeEmail } from '../../lib/email.js'
import { verifyPassword } from '../../lib/password.js'
import type { TenantAdminAuthRepository } from './adminAuthRepository.js'
import { createTenantAdminAuditLogger } from './adminAuthAudit.js'
import {
  ADMIN_SESSION_TTL_HOURS,
  createAdminSessionToken,
  createChallengeNotFoundOrInvalidatedError,
  createCodeExpiredError,
  createInvalidCodeError,
  createTooManyAttemptsError,
  hashValue,
  mapVerificationResultToError,
  toPublicAdmin,
} from './adminAuthPrimitives.js'
import type { TenantAdminVerificationService } from './adminVerification.js'

type VerifyTenantAdminLoginCodeOptions = {
  code: string
  email: string
  now: () => Date
  repository: TenantAdminAuthRepository
  requestIp: string | null
  tenantAdminVerificationService: Pick<
    TenantAdminVerificationService,
    'verifyTenantAdminEmail'
  >
  tenantId: number
  userAgent: string | null
}

function matchesChallengeAuthority({
  challenge,
  currentAuthority,
}: {
  challenge: {
    chatwootAgentId: number
    email: string
  }
  currentAuthority: Awaited<
    ReturnType<TenantAdminVerificationService['verifyTenantAdminEmail']>
  >
}) {
  return (
    currentAuthority.result === 'eligible' &&
    currentAuthority.agent.id === challenge.chatwootAgentId &&
    normalizeEmail(currentAuthority.agent.email) ===
      normalizeEmail(challenge.email)
  )
}

export async function verifyTenantAdminLoginCode({
  code,
  email,
  now,
  repository,
  requestIp,
  tenantAdminVerificationService,
  tenantId,
  userAgent,
}: VerifyTenantAdminLoginCodeOptions) {
  const audit = createTenantAdminAuditLogger(repository)
  const normalizedEmail = normalizeEmail(email)
  const codeVerifiedAt = now()

  const codeVerificationResult = await repository.transactionWithScopedLock(
    normalizedEmail,
    async (tx) => {
      const challenge = await repository.findLatestPendingChallengeByEmail(
        normalizedEmail,
        tx,
      )

      if (!challenge) {
        await audit({
          action: 'admin_login_verified',
          executor: tx,
          outcome: 'challenge_not_found',
          requestIp,
          subjectEmail: normalizedEmail,
          userAgent,
        })

        return { outcome: 'challenge_not_found_or_invalidated' as const }
      }

      if (challenge.expiresAt.getTime() <= codeVerifiedAt.getTime()) {
        await repository.expireChallenge(challenge.id, codeVerifiedAt, tx)
        await audit({
          action: 'admin_login_verified',
          actor: toPublicAdmin(challenge),
          executor: tx,
          outcome: 'expired',
          requestIp,
          subjectEmail: normalizedEmail,
          userAgent,
        })

        return { outcome: 'expired' as const }
      }

      if (challenge.attemptsCount >= challenge.maxAttempts) {
        await audit({
          action: 'admin_login_verified',
          actor: toPublicAdmin(challenge),
          executor: tx,
          metadata: { attemptsCount: challenge.attemptsCount },
          outcome: 'too_many_attempts',
          requestIp,
          subjectEmail: normalizedEmail,
          userAgent,
        })

        return { outcome: 'too_many_attempts' as const }
      }

      const isCodeValid = await verifyPassword(code.trim(), challenge.codeHash)

      if (!isCodeValid) {
        const updatedChallenge = await repository.incrementChallengeAttempts({
          executor: tx,
          recordId: challenge.id,
          updatedAt: codeVerifiedAt,
        })
        await audit({
          action: 'admin_login_verified',
          actor: toPublicAdmin(challenge),
          executor: tx,
          metadata: { attemptsCount: updatedChallenge.attemptsCount },
          outcome: 'invalid_code',
          requestIp,
          subjectEmail: normalizedEmail,
          userAgent,
        })

        return {
          outcome:
            updatedChallenge.attemptsCount >= updatedChallenge.maxAttempts
              ? ('too_many_attempts' as const)
              : ('invalid_code' as const),
        }
      }

      return {
        challenge,
        outcome: 'current_role_recheck_required' as const,
      }
    },
  )

  if (codeVerificationResult.outcome === 'expired') {
    throw createCodeExpiredError()
  }

  if (codeVerificationResult.outcome === 'too_many_attempts') {
    throw createTooManyAttemptsError()
  }

  if (codeVerificationResult.outcome === 'invalid_code') {
    throw createInvalidCodeError()
  }

  if (codeVerificationResult.outcome === 'challenge_not_found_or_invalidated') {
    throw createChallengeNotFoundOrInvalidatedError()
  }

  if (
    codeVerificationResult.outcome !== 'current_role_recheck_required' ||
    !codeVerificationResult.challenge
  ) {
    throw createChallengeNotFoundOrInvalidatedError()
  }

  const verifiedCodeChallenge = codeVerificationResult.challenge
  const currentAuthority =
    await tenantAdminVerificationService.verifyTenantAdminEmail({
      email: normalizedEmail,
      tenantId,
    })
  const authorityMatches = matchesChallengeAuthority({
    challenge: verifiedCodeChallenge,
    currentAuthority,
  })
  const authorityOutcome =
    currentAuthority.result === 'eligible' && !authorityMatches
      ? 'identity_mismatch'
      : currentAuthority.result
  const authorityError =
    authorityMatches && currentAuthority.result === 'eligible'
      ? null
      : mapVerificationResultToError(
          authorityOutcome === 'identity_mismatch'
            ? 'not_eligible'
            : authorityOutcome,
        )

  if (authorityError?.statusCode === 503) {
    await audit({
      action: 'admin_login_verified',
      actor: toPublicAdmin(verifiedCodeChallenge),
      metadata: { verificationResult: authorityOutcome },
      outcome: 'current_role_unavailable',
      requestIp,
      subjectEmail: normalizedEmail,
      userAgent,
    })

    throw authorityError
  }

  const finalizationResult = await repository.transactionWithScopedLock(
    normalizedEmail,
    async (tx) => {
      const finalizedAt = now()
      const currentChallenge =
        await repository.findLatestPendingChallengeByEmail(normalizedEmail, tx)

      if (
        !currentChallenge ||
        currentChallenge.id !== verifiedCodeChallenge.id ||
        currentChallenge.codeHash !== verifiedCodeChallenge.codeHash
      ) {
        await audit({
          action: 'admin_login_verified',
          executor: tx,
          outcome: 'challenge_not_found',
          requestIp,
          subjectEmail: normalizedEmail,
          userAgent,
        })

        return { outcome: 'challenge_not_found_or_invalidated' as const }
      }

      if (currentChallenge.expiresAt.getTime() <= finalizedAt.getTime()) {
        await repository.expireChallenge(currentChallenge.id, finalizedAt, tx)
        await audit({
          action: 'admin_login_verified',
          actor: toPublicAdmin(currentChallenge),
          executor: tx,
          outcome: 'expired',
          requestIp,
          subjectEmail: normalizedEmail,
          userAgent,
        })

        return { outcome: 'expired' as const }
      }

      if (currentChallenge.attemptsCount >= currentChallenge.maxAttempts) {
        await audit({
          action: 'admin_login_verified',
          actor: toPublicAdmin(currentChallenge),
          executor: tx,
          metadata: { attemptsCount: currentChallenge.attemptsCount },
          outcome: 'too_many_attempts',
          requestIp,
          subjectEmail: normalizedEmail,
          userAgent,
        })

        return { outcome: 'too_many_attempts' as const }
      }

      if (authorityError) {
        const invalidatedChallenge = await repository.invalidateChallenge(
          currentChallenge.id,
          finalizedAt,
          tx,
        )

        if (!invalidatedChallenge) {
          return { outcome: 'challenge_not_found_or_invalidated' as const }
        }

        await audit({
          action: 'admin_login_verified',
          actor: toPublicAdmin(invalidatedChallenge),
          executor: tx,
          metadata: { verificationResult: authorityOutcome },
          outcome: 'current_role_denied',
          requestIp,
          subjectEmail: normalizedEmail,
          userAgent,
        })

        return { outcome: 'current_role_denied' as const }
      }

      const verifiedChallenge = await repository.markChallengeVerified({
        executor: tx,
        recordId: currentChallenge.id,
        verifiedAt: finalizedAt,
      })
      const sessionToken = createAdminSessionToken()
      const expiresAt = new Date(
        finalizedAt.getTime() + ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000,
      )

      await repository.createSession(
        {
          chatwootAgentId: verifiedChallenge.chatwootAgentId,
          email: verifiedChallenge.email,
          expiresAt,
          lastSeenAt: finalizedAt,
          role: 'administrator',
          tokenHash: hashValue(sessionToken),
        },
        tx,
      )

      const admin = toPublicAdmin(verifiedChallenge)

      await audit({
        action: 'admin_login_verified',
        actor: admin,
        executor: tx,
        outcome: 'success',
        requestIp,
        subjectEmail: normalizedEmail,
        userAgent,
      })

      return {
        outcome: 'verified' as const,
        response: {
          admin,
          expiresAt,
          sessionToken,
        },
      }
    },
  )

  if (finalizationResult.outcome === 'verified') {
    return finalizationResult.response
  }

  if (finalizationResult.outcome === 'expired') {
    throw createCodeExpiredError()
  }

  if (finalizationResult.outcome === 'too_many_attempts') {
    throw createTooManyAttemptsError()
  }

  if (finalizationResult.outcome === 'current_role_denied') {
    if (!authorityError) {
      throw new Error('Current tenant admin authority denial is required.')
    }

    throw authorityError
  }

  throw createChallengeNotFoundOrInvalidatedError()
}
