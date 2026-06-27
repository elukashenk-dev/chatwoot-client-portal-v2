import { normalizeEmail } from '../../lib/email.js'
import type { AuthService } from '../auth/service.js'
import { createCustomerEmailProofExpiresAt } from '../auth/emailProof.js'
import type { CustomerAccessLegalDocumentVersions } from '../legal-documents/service.js'
import {
  createLegalAcceptanceRequiredError,
  createNotFoundOrInvalidatedError,
} from './errors.js'
import type { PasswordlessLoginRepository } from './repository.js'
import {
  buildCompletedResponse,
  type PasswordlessLoginCompletedSession,
} from './responses.js'
import { hashContinuationToken } from './tokens.js'

export async function acceptLegal({
  authService,
  continuationToken,
  email,
  ipAddress,
  legalDocumentsReader,
  now,
  passwordlessLoginRepository,
  personalDataConsentAccepted,
  tenantId,
  termsAccepted,
  userAgent,
}: {
  authService: Pick<AuthService, 'issueSessionForUser'>
  continuationToken: string
  email: string
  ipAddress?: string | null
  legalDocumentsReader: {
    getActiveVersionsForCustomerAccess(): Promise<CustomerAccessLegalDocumentVersions>
  }
  now: () => Date
  passwordlessLoginRepository: PasswordlessLoginRepository
  personalDataConsentAccepted: true
  tenantId: number
  termsAccepted: true
  userAgent?: string | null
}): Promise<PasswordlessLoginCompletedSession> {
  if (!termsAccepted || !personalDataConsentAccepted) {
    throw createLegalAcceptanceRequiredError()
  }

  const normalizedEmail = normalizeEmail(email)
  const normalizedContinuationToken = continuationToken.trim()
  const acceptedAt = now()
  const legalVersions =
    await legalDocumentsReader.getActiveVersionsForCustomerAccess()

  const completionResult =
    await passwordlessLoginRepository.transactionWithScopedLock(
      normalizedEmail,
      async (tx) => {
        const verifiedLogin =
          await passwordlessLoginRepository.findLatestVerifiedLoginByEmail(
            normalizedEmail,
            tx,
          )

        if (!verifiedLogin) {
          return { outcome: 'not_found_or_invalidated' as const }
        }

        if (
          !verifiedLogin.continuationTokenHash ||
          !verifiedLogin.continuationTokenExpiresAt ||
          verifiedLogin.continuationTokenExpiresAt.getTime() <=
            acceptedAt.getTime()
        ) {
          await passwordlessLoginRepository.recordInvalidAttempt(
            {
              attemptsCount: verifiedLogin.maxAttempts,
              recordId: verifiedLogin.id,
              status: 'invalidated',
              updatedAt: acceptedAt,
            },
            tx,
          )

          return { outcome: 'not_found_or_invalidated' as const }
        }

        if (
          hashContinuationToken(normalizedContinuationToken) !==
          verifiedLogin.continuationTokenHash
        ) {
          return { outcome: 'not_found_or_invalidated' as const }
        }

        let user = verifiedLogin.portalUserId
          ? await passwordlessLoginRepository.findActivePortalUserById(
              verifiedLogin.portalUserId,
              tx,
            )
          : null
        let createdUser = false

        if (!user) {
          const existingUser =
            await passwordlessLoginRepository.findPortalUserByEmail(
              normalizedEmail,
              tx,
            )

          if (existingUser && !existingUser.isActive) {
            await passwordlessLoginRepository.recordInvalidAttempt(
              {
                attemptsCount: verifiedLogin.maxAttempts,
                recordId: verifiedLogin.id,
                status: 'invalidated',
                updatedAt: acceptedAt,
              },
              tx,
            )

            return { outcome: 'not_found_or_invalidated' as const }
          }

          user = existingUser?.isActive ? existingUser : null
        }

        if (!user) {
          if (!verifiedLogin.chatwootContactId) {
            await passwordlessLoginRepository.recordInvalidAttempt(
              {
                attemptsCount: verifiedLogin.maxAttempts,
                recordId: verifiedLogin.id,
                status: 'invalidated',
                updatedAt: acceptedAt,
              },
              tx,
            )

            return { outcome: 'not_found_or_invalidated' as const }
          }

          const nextUser = await passwordlessLoginRepository.createPortalUser(
            {
              email: normalizedEmail,
              fullName: verifiedLogin.fullName,
            },
            tx,
          )

          if (!nextUser) {
            throw new Error(
              'Portal user could not be created during code-login legal acceptance.',
            )
          }

          user = nextUser
          createdUser = true
        }

        if (createdUser && verifiedLogin.chatwootContactId) {
          await passwordlessLoginRepository.createPortalUserContactLink(
            {
              chatwootContactId: verifiedLogin.chatwootContactId,
              userId: user.id,
            },
            tx,
          )
        }

        await passwordlessLoginRepository.createLegalAcceptance(
          {
            acceptedAt,
            email: normalizedEmail,
            personalDataConsentAccepted,
            portalUserId: user.id,
            privacyPolicyVersion: legalVersions.privacyPolicyVersion,
            requestIp: ipAddress ?? null,
            termsAccepted,
            termsVersion: legalVersions.termsVersion,
            userAgent: userAgent ?? null,
          },
          tx,
        )

        const consumedLogin =
          await passwordlessLoginRepository.consumeVerifiedLogin(
            verifiedLogin.id,
            acceptedAt,
            tx,
          )

        if (!consumedLogin) {
          return { outcome: 'not_found_or_invalidated' as const }
        }

        const issuedSession = await authService.issueSessionForUser({
          emailProofExpiresAt: createCustomerEmailProofExpiresAt(acceptedAt),
          executor: tx,
          ...(ipAddress !== undefined ? { ipAddress } : {}),
          tenantId,
          user,
          userId: user.id,
          ...(userAgent !== undefined ? { userAgent } : {}),
        })

        return {
          outcome: 'completed' as const,
          response: buildCompletedResponse(issuedSession),
        }
      },
    )

  if (completionResult.outcome === 'completed') {
    return completionResult.response
  }

  throw createNotFoundOrInvalidatedError()
}
