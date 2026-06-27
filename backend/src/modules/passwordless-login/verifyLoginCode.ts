import { verifyPassword } from '../../lib/password.js'
import type { AuthService } from '../auth/service.js'
import { createCustomerEmailProofExpiresAt } from '../auth/emailProof.js'
import { PASSWORDLESS_LOGIN_CONTINUATION_TTL_SECONDS } from './constants.js'
import {
  createCodeExpiredError,
  createInvalidCodeError,
  createLegalDocumentsNotConfiguredError,
  createNotFoundOrInvalidatedError,
  createTooManyAttemptsError,
} from './errors.js'
import type { PasswordlessLoginRepository } from './repository.js'
import {
  buildCompletedResponse,
  buildLegalRequiredResponse,
  type PasswordlessLoginVerifyResult,
} from './responses.js'
import { createContinuationToken, hashContinuationToken } from './tokens.js'

export async function verifyLoginCode({
  authService,
  code,
  email,
  now,
  passwordlessLoginRepository,
  tenantId,
}: {
  authService: Pick<AuthService, 'issueSessionForUser'>
  code: string
  email: string
  now: () => Date
  passwordlessLoginRepository: PasswordlessLoginRepository
  tenantId: number
}): Promise<PasswordlessLoginVerifyResult> {
  const submittedCode = code.trim()
  const verifiedAt = now()

  const verificationResult =
    await passwordlessLoginRepository.transactionWithScopedLock(
      email,
      async (tx) => {
        const pendingLogin =
          await passwordlessLoginRepository.findLatestPendingLoginByEmail(
            email,
            tx,
          )

        if (!pendingLogin) {
          const latestLogin =
            await passwordlessLoginRepository.findLatestLoginByEmail(email, tx)

          return {
            outcome:
              latestLogin?.status === 'expired'
                ? ('expired' as const)
                : ('not_found_or_invalidated' as const),
          }
        }

        if (pendingLogin.expiresAt.getTime() <= verifiedAt.getTime()) {
          await passwordlessLoginRepository.expireLoginRecord(
            pendingLogin.id,
            verifiedAt,
            tx,
          )

          return { outcome: 'expired' as const }
        }

        const isCodeValid = await verifyPassword(
          submittedCode,
          pendingLogin.codeHash,
        )

        if (!isCodeValid) {
          const attemptsCount = pendingLogin.attemptsCount + 1
          const tooManyAttempts = attemptsCount >= pendingLogin.maxAttempts

          await passwordlessLoginRepository.recordInvalidAttempt(
            {
              attemptsCount,
              recordId: pendingLogin.id,
              status: tooManyAttempts ? 'invalidated' : 'pending',
              updatedAt: verifiedAt,
            },
            tx,
          )

          return {
            outcome: tooManyAttempts
              ? ('too_many_attempts' as const)
              : ('invalid_code' as const),
          }
        }

        if (!pendingLogin.portalUserId && !pendingLogin.chatwootContactId) {
          await passwordlessLoginRepository.recordInvalidAttempt(
            {
              attemptsCount: pendingLogin.maxAttempts,
              recordId: pendingLogin.id,
              status: 'invalidated',
              updatedAt: verifiedAt,
            },
            tx,
          )

          return { outcome: 'not_found_or_invalidated' as const }
        }

        if (pendingLogin.portalUserId) {
          const user =
            await passwordlessLoginRepository.findActivePortalUserById(
              pendingLogin.portalUserId,
              tx,
            )

          if (!user) {
            await passwordlessLoginRepository.recordInvalidAttempt(
              {
                attemptsCount: pendingLogin.maxAttempts,
                recordId: pendingLogin.id,
                status: 'invalidated',
                updatedAt: verifiedAt,
              },
              tx,
            )

            return { outcome: 'not_found_or_invalidated' as const }
          }

          const legalVersions =
            await passwordlessLoginRepository.findActiveCustomerAccessLegalDocumentVersions(
              tx,
            )

          if (!legalVersions) {
            return { outcome: 'legal_documents_not_configured' as const }
          }

          const legalAcceptance =
            await passwordlessLoginRepository.findLatestLegalAcceptanceForUser(
              {
                privacyPolicyVersion: legalVersions.privacyPolicyVersion,
                termsVersion: legalVersions.termsVersion,
                userId: user.id,
              },
              tx,
            )

          if (legalAcceptance) {
            const consumedLogin =
              await passwordlessLoginRepository.consumePendingLogin(
                pendingLogin.id,
                verifiedAt,
                tx,
              )

            if (!consumedLogin) {
              return { outcome: 'not_found_or_invalidated' as const }
            }

            const issuedSession = await authService.issueSessionForUser({
              emailProofExpiresAt: createCustomerEmailProofExpiresAt(verifiedAt),
              executor: tx,
              tenantId,
              user,
              userId: user.id,
            })

            return {
              outcome: 'verified' as const,
              response: buildCompletedResponse(issuedSession),
            }
          }
        }

        const continuationToken = createContinuationToken()
        const continuationExpiresAt = new Date(
          verifiedAt.getTime() +
            PASSWORDLESS_LOGIN_CONTINUATION_TTL_SECONDS * 1000,
        )
        const verifiedLogin =
          await passwordlessLoginRepository.verifyPendingLoginForLegal(
            {
              continuationTokenExpiresAt: continuationExpiresAt,
              continuationTokenHash: hashContinuationToken(continuationToken),
              recordId: pendingLogin.id,
              updatedAt: verifiedAt,
              verifiedAt,
            },
            tx,
          )

        if (!verifiedLogin) {
          return { outcome: 'not_found_or_invalidated' as const }
        }

        return {
          outcome: 'legal_required' as const,
          response: buildLegalRequiredResponse({
            continuationExpiresAt,
            continuationToken,
            email: verifiedLogin.email,
            now: verifiedAt,
          }),
        }
      },
    )

  if (verificationResult.outcome === 'verified') {
    return verificationResult.response
  }

  if (verificationResult.outcome === 'legal_required') {
    return verificationResult.response
  }

  if (verificationResult.outcome === 'expired') {
    throw createCodeExpiredError()
  }

  if (verificationResult.outcome === 'too_many_attempts') {
    throw createTooManyAttemptsError()
  }

  if (verificationResult.outcome === 'invalid_code') {
    throw createInvalidCodeError()
  }

  if (verificationResult.outcome === 'legal_documents_not_configured') {
    throw createLegalDocumentsNotConfiguredError()
  }

  throw createNotFoundOrInvalidatedError()
}
