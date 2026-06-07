import type { SmtpEmailDelivery } from '../../integrations/email/smtp.js'
import { normalizeEmail } from '../../lib/email.js'
import { hashPassword, verifyPassword } from '../../lib/password.js'
import type { TenantAdminVerificationService } from './adminVerification.js'
import type { TenantAdminAuthRepository } from './adminAuthRepository.js'
import { createTenantAdminAuditLogger } from './adminAuthAudit.js'
import {
  ADMIN_LOGIN_CHALLENGE_TTL_SECONDS,
  ADMIN_LOGIN_RESEND_COOLDOWN_SECONDS,
  ADMIN_SESSION_TTL_HOURS,
  buildAdminLoginEmail,
  buildChallengeRequestedResponse,
  createAdminLoginCode,
  createAdminSessionToken,
  createChallengeNotFoundOrInvalidatedError,
  createCodeExpiredError,
  createDeliveryInProgressError,
  createDeliveryUnavailableError,
  createInvalidCodeError,
  createTooManyAttemptsError,
  hashValue,
  mapVerificationResultToError,
  type PublicTenantAdminSession,
  shouldTreatAsDeliveryUnavailable,
  toPublicAdmin,
  toPublicAdminSession,
} from './adminAuthPrimitives.js'
export type {
  PublicTenantAdmin,
  PublicTenantAdminSession,
} from './adminAuthPrimitives.js'

type CreateTenantAdminAuthServiceOptions = {
  emailDelivery: Pick<SmtpEmailDelivery, 'send'>
  now?: () => Date
  repository: TenantAdminAuthRepository
  tenantAdminVerificationService: Pick<
    TenantAdminVerificationService,
    'verifyTenantAdminEmail'
  >
  tenantId: number
}

type RequestMetadata = {
  requestIp: string | null
  userAgent: string | null
}

export function createTenantAdminAuthService({
  emailDelivery,
  now = () => new Date(),
  repository,
  tenantAdminVerificationService,
  tenantId,
}: CreateTenantAdminAuthServiceOptions) {
  const audit = createTenantAdminAuditLogger(repository)

  return {
    async getCurrentAdminSession({
      sessionToken,
    }: {
      sessionToken: string
    }): Promise<PublicTenantAdminSession | null> {
      const resolvedAt = now()
      const session = await repository.findSessionByTokenHash({
        now: resolvedAt,
        tokenHash: hashValue(sessionToken),
      })

      if (!session) {
        return null
      }

      await repository.touchSession({
        at: resolvedAt,
        sessionId: session.sessionId,
      })

      return toPublicAdminSession(session)
    },

    async requestAdminLoginChallenge({
      email,
      requestIp,
      userAgent,
    }: RequestMetadata & {
      email: string
    }) {
      const normalizedEmail = normalizeEmail(email)
      const verificationResult =
        await tenantAdminVerificationService.verifyTenantAdminEmail({
          email: normalizedEmail,
          tenantId,
        })

      if (verificationResult.result !== 'eligible') {
        await audit({
          action: 'admin_login_challenge_requested',
          metadata: { verificationResult: verificationResult.result },
          outcome: 'rejected',
          requestIp,
          subjectEmail: normalizedEmail,
          userAgent,
        })

        throw mapVerificationResultToError(verificationResult.result)
      }

      const requestedAt = now()
      const code = createAdminLoginCode()
      const expiresAt = new Date(
        requestedAt.getTime() + ADMIN_LOGIN_CHALLENGE_TTL_SECONDS * 1000,
      )
      const resendNotBefore = new Date(
        requestedAt.getTime() + ADMIN_LOGIN_RESEND_COOLDOWN_SECONDS * 1000,
      )
      const codeHash = await hashPassword(code)
      const requestResult = await repository.transactionWithScopedLock(
        normalizedEmail,
        async (tx) => {
          const existingChallenge =
            await repository.findLatestActiveChallengeByEmail(
              normalizedEmail,
              tx,
            )

          if (existingChallenge?.status === 'sending') {
            return {
              challenge: existingChallenge,
              outcome: 'delivery_in_progress' as const,
            }
          }

          let previousPendingChallenge = null

          if (existingChallenge) {
            const isExpired =
              existingChallenge.expiresAt.getTime() <= requestedAt.getTime()

            if (!isExpired) {
              if (
                existingChallenge.resendNotBefore.getTime() >
                requestedAt.getTime()
              ) {
                return {
                  challenge: existingChallenge,
                  outcome: 'pending_resend_locked' as const,
                  response: buildChallengeRequestedResponse({
                    challenge: existingChallenge,
                    delivery: 'existing_pending',
                    now: requestedAt,
                  }),
                }
              }

              previousPendingChallenge = existingChallenge
            } else {
              await repository.expireChallenge(
                existingChallenge.id,
                requestedAt,
                tx,
              )
            }
          }

          const challenge = previousPendingChallenge
            ? await repository.replacePendingChallenge(
                {
                  attemptsCount: 0,
                  chatwootAgentId: verificationResult.agent.id,
                  codeHash,
                  email: normalizedEmail,
                  expiresAt,
                  lastSentAt: requestedAt,
                  recordId: previousPendingChallenge.id,
                  resendCount: previousPendingChallenge.resendCount + 1,
                  resendNotBefore,
                  role: 'administrator',
                  status: 'sending',
                  updatedAt: requestedAt,
                },
                tx,
              )
            : await repository.createPendingChallenge(
                {
                  chatwootAgentId: verificationResult.agent.id,
                  codeHash,
                  email: normalizedEmail,
                  expiresAt,
                  lastSentAt: requestedAt,
                  resendNotBefore,
                  role: 'administrator',
                  status: 'sending',
                },
                tx,
              )

          return {
            challenge,
            outcome: 'challenge_created' as const,
            previousPendingChallenge,
          }
        },
      )

      if (requestResult.outcome === 'pending_resend_locked') {
        await audit({
          action: 'admin_login_challenge_requested',
          actor: toPublicAdmin(requestResult.challenge),
          metadata: { delivery: 'existing_pending' },
          outcome: 'resend_locked',
          requestIp,
          subjectEmail: normalizedEmail,
          userAgent,
        })

        return requestResult.response
      }

      if (requestResult.outcome === 'delivery_in_progress') {
        await audit({
          action: 'admin_login_challenge_requested',
          actor: toPublicAdmin(requestResult.challenge),
          metadata: { delivery: 'in_progress' },
          outcome: 'delivery_in_progress',
          requestIp,
          subjectEmail: normalizedEmail,
          userAgent,
        })

        throw createDeliveryInProgressError()
      }

      const cleanupFailedDelivery = async () => {
        await repository.transactionWithScopedLock(
          normalizedEmail,
          async (tx) => {
            if (requestResult.previousPendingChallenge) {
              await repository.replacePendingChallenge(
                {
                  attemptsCount:
                    requestResult.previousPendingChallenge.attemptsCount,
                  chatwootAgentId:
                    requestResult.previousPendingChallenge.chatwootAgentId,
                  codeHash: requestResult.previousPendingChallenge.codeHash,
                  email: requestResult.previousPendingChallenge.email,
                  expiresAt: requestResult.previousPendingChallenge.expiresAt,
                  lastSentAt: requestResult.previousPendingChallenge.lastSentAt,
                  maxAttempts:
                    requestResult.previousPendingChallenge.maxAttempts,
                  recordId: requestResult.previousPendingChallenge.id,
                  resendCount:
                    requestResult.previousPendingChallenge.resendCount,
                  resendNotBefore:
                    requestResult.previousPendingChallenge.resendNotBefore,
                  role: requestResult.previousPendingChallenge.role,
                  status: 'pending',
                  updatedAt: requestedAt,
                },
                tx,
              )

              return
            }

            await repository.deleteChallenge(requestResult.challenge.id, tx)
          },
        )
      }

      try {
        await emailDelivery.send({
          ...buildAdminLoginEmail({ code }),
          to: normalizedEmail,
        })
      } catch (error) {
        if (shouldTreatAsDeliveryUnavailable(error)) {
          await cleanupFailedDelivery()

          await audit({
            action: 'admin_login_challenge_requested',
            actor: toPublicAdmin(requestResult.challenge),
            metadata: { delivery: 'failed' },
            outcome: 'delivery_failed',
            requestIp,
            subjectEmail: normalizedEmail,
            userAgent,
          })

          throw createDeliveryUnavailableError()
        }

        throw error
      }

      const deliveredChallenge = await repository.transactionWithScopedLock(
        normalizedEmail,
        async (tx) =>
          repository.markChallengeDeliverySucceeded(
            requestResult.challenge.id,
            requestedAt,
            tx,
          ),
      )

      if (!deliveredChallenge) {
        throw new Error('Admin login delivery could not be marked as pending.')
      }

      await audit({
        action: 'admin_login_challenge_requested',
        actor: toPublicAdmin(deliveredChallenge),
        metadata: { delivery: 'sent' },
        outcome: 'success',
        requestIp,
        subjectEmail: normalizedEmail,
        userAgent,
      })

      return buildChallengeRequestedResponse({
        challenge: deliveredChallenge,
        delivery: 'sent',
        now: requestedAt,
      })
    },

    async verifyAdminLoginCode({
      code,
      email,
      requestIp,
      userAgent,
    }: RequestMetadata & {
      code: string
      email: string
    }) {
      const normalizedEmail = normalizeEmail(email)
      const verifiedAt = now()

      return repository.transactionWithScopedLock(
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

            throw createChallengeNotFoundOrInvalidatedError()
          }

          if (challenge.expiresAt.getTime() <= verifiedAt.getTime()) {
            await repository.expireChallenge(challenge.id, verifiedAt, tx)
            await audit({
              action: 'admin_login_verified',
              actor: toPublicAdmin(challenge),
              executor: tx,
              outcome: 'expired',
              requestIp,
              subjectEmail: normalizedEmail,
              userAgent,
            })

            throw createCodeExpiredError()
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

            throw createTooManyAttemptsError()
          }

          const isCodeValid = await verifyPassword(
            code.trim(),
            challenge.codeHash,
          )

          if (!isCodeValid) {
            const updatedChallenge =
              await repository.incrementChallengeAttempts({
                executor: tx,
                recordId: challenge.id,
                updatedAt: verifiedAt,
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

            if (
              updatedChallenge.attemptsCount >= updatedChallenge.maxAttempts
            ) {
              throw createTooManyAttemptsError()
            }

            throw createInvalidCodeError()
          }

          const verifiedChallenge = await repository.markChallengeVerified({
            executor: tx,
            recordId: challenge.id,
            verifiedAt,
          })
          const sessionToken = createAdminSessionToken()
          const expiresAt = new Date(
            verifiedAt.getTime() + ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000,
          )

          await repository.createSession(
            {
              chatwootAgentId: verifiedChallenge.chatwootAgentId,
              email: verifiedChallenge.email,
              expiresAt,
              lastSeenAt: verifiedAt,
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
            admin,
            expiresAt,
            sessionToken,
          }
        },
      )
    },

    async logout({
      requestIp,
      sessionToken,
      userAgent,
    }: RequestMetadata & {
      sessionToken: string
    }) {
      const session = await this.getCurrentAdminSession({ sessionToken })

      await repository.deleteSessionByTokenHash(hashValue(sessionToken))
      await audit({
        action: 'admin_logout',
        actor: session?.admin ?? null,
        outcome: session ? 'success' : 'no_session',
        requestIp,
        subjectEmail: session?.admin.email ?? null,
        userAgent,
      })
    },
  }
}

export type TenantAdminAuthService = ReturnType<
  typeof createTenantAdminAuthService
>
