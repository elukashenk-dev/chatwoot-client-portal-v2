import { normalizeEmail } from '../../lib/email.js'
import { hashPassword, verifyPassword } from '../../lib/password.js'
import { assertValidPortalPassword } from '../../lib/passwordPolicy.js'
import { cleanupFailedDelivery } from './deliveryCleanup.js'
import {
  createCodeExpiredError,
  createContinuationInvalidError,
  createDeliveryUnavailableError,
  createInvalidCodeError,
  createNotFoundOrInvalidatedError,
  createPasswordAlreadySetError,
  createTooManyAttemptsError,
  createVerificationRequiredError,
  isDeliveryConfigurationError,
} from './errors.js'
import {
  buildCompletedResponse,
  buildRequestResponse,
  buildSetupEmail,
  buildVerifyResponse,
} from './responses.js'
import {
  ensureActivePasswordlessUser,
  readPasswordSetupRequestPreflight,
  validateVerifiedSetup,
} from './state.js'
import {
  createContinuationToken,
  createSetupCode,
  hashContinuationToken,
  PASSWORD_SETUP_CONTINUATION_TTL_SECONDS,
  PASSWORD_SETUP_RESEND_COOLDOWN_SECONDS,
  PASSWORD_SETUP_TTL_SECONDS,
} from './tokens.js'
import type {
  CreatePasswordSetupServiceOptions,
  PasswordSetupCompletedSession,
  PasswordSetupRequestResult,
  PasswordSetupScope,
  PasswordSetupVerifyResult,
} from './types.js'

export type { PasswordSetupCompletedSession } from './types.js'

function throwSetPasswordOutcome(outcome: string): never {
  if (outcome === 'already_set') {
    throw createPasswordAlreadySetError()
  }

  if (outcome === 'continuation_invalid') {
    throw createContinuationInvalidError()
  }

  if (outcome === 'not_found_or_consumed') {
    throw createNotFoundOrInvalidatedError()
  }

  throw createVerificationRequiredError()
}

export function createPasswordSetupService({
  authService,
  emailDelivery,
  now = () => new Date(),
  passwordSetupRepository,
  tenantId,
}: CreatePasswordSetupServiceOptions) {
  return {
    async requestPasswordSetup(
      scope: PasswordSetupScope,
    ): Promise<PasswordSetupRequestResult> {
      const normalizedEmail = normalizeEmail(scope.email)
      const normalizedScope = { email: normalizedEmail, userId: scope.userId }
      const requestedAt = now()
      const preflight = await readPasswordSetupRequestPreflight({
        passwordSetupRepository,
        requestedAt,
        scope: normalizedScope,
      })

      if (preflight.outcome === 'already_set') {
        throw createPasswordAlreadySetError()
      }

      if (preflight.outcome === 'resend_locked') {
        return buildRequestResponse({
          email: normalizedEmail,
          expiresAt: preflight.setupRecord.expiresAt,
          now: requestedAt,
          resendNotBefore: preflight.setupRecord.resendNotBefore,
        })
      }

      const setupCode = createSetupCode()
      const codeHash = await hashPassword(setupCode)

      const result = await passwordSetupRepository.transactionWithScopedLock(
        normalizedScope,
        async (tx) => {
          const userResult = await ensureActivePasswordlessUser({
            passwordSetupRepository,
            scope: normalizedScope,
            tx,
          })

          if (userResult.outcome === 'already_set') {
            return { outcome: 'already_set' as const }
          }

          const existingPendingSetup =
            await passwordSetupRepository.findLatestPendingSetupByUser(
              normalizedScope,
              tx,
            )

          if (existingPendingSetup) {
            const isExpired =
              existingPendingSetup.expiresAt.getTime() <= requestedAt.getTime()

            if (!isExpired) {
              const isResendLocked =
                existingPendingSetup.resendNotBefore.getTime() >
                requestedAt.getTime()

              if (isResendLocked) {
                return {
                  outcome: 'requested' as const,
                  previousPendingSetup: existingPendingSetup,
                  setupCode: null,
                  setupRecord: existingPendingSetup,
                  shouldSendEmail: false,
                }
              }
            } else {
              await passwordSetupRepository.expireSetupRecord(
                existingPendingSetup.id,
                requestedAt,
                tx,
              )
            }
          }

          const expiresAt = new Date(
            requestedAt.getTime() + PASSWORD_SETUP_TTL_SECONDS * 1000,
          )
          const resendNotBefore = new Date(
            requestedAt.getTime() +
              PASSWORD_SETUP_RESEND_COOLDOWN_SECONDS * 1000,
          )
          const previousPendingSetup =
            existingPendingSetup &&
            existingPendingSetup.expiresAt.getTime() > requestedAt.getTime()
              ? existingPendingSetup
              : null
          const setupRecord = previousPendingSetup
            ? await passwordSetupRepository.replacePendingSetup(
                {
                  codeHash,
                  expiresAt,
                  lastSentAt: requestedAt,
                  recordId: previousPendingSetup.id,
                  resendCount: previousPendingSetup.resendCount + 1,
                  resendNotBefore,
                  updatedAt: requestedAt,
                },
                tx,
              )
            : await passwordSetupRepository.createPendingSetup(
                {
                  codeHash,
                  email: normalizedEmail,
                  expiresAt,
                  lastSentAt: requestedAt,
                  resendCount: 0,
                  resendNotBefore,
                  userId: normalizedScope.userId,
                },
                tx,
              )

          return {
            outcome: 'requested' as const,
            previousPendingSetup,
            setupCode,
            setupRecord,
            shouldSendEmail: true,
          }
        },
      )

      if (result.outcome === 'already_set') {
        throw createPasswordAlreadySetError()
      }

      if (result.shouldSendEmail && result.setupCode) {
        try {
          await emailDelivery.send({
            ...buildSetupEmail({ code: result.setupCode }),
            to: normalizedEmail,
          })
        } catch (error) {
          await cleanupFailedDelivery({
            passwordSetupRepository,
            previousPendingSetup: result.previousPendingSetup,
            setupRecord: result.setupRecord,
            updatedAt: requestedAt,
          })

          if (isDeliveryConfigurationError(error)) {
            throw createDeliveryUnavailableError()
          }

          throw error
        }
      }

      return buildRequestResponse({
        email: normalizedEmail,
        expiresAt: result.setupRecord.expiresAt,
        now: requestedAt,
        resendNotBefore: result.setupRecord.resendNotBefore,
      })
    },

    async confirmPasswordSetup({
      code,
      ...scope
    }: PasswordSetupScope & { code: string }): Promise<PasswordSetupVerifyResult> {
      const normalizedScope = {
        email: normalizeEmail(scope.email),
        userId: scope.userId,
      }
      const submittedCode = code.trim()
      const requestedAt = now()

      const verificationResult =
        await passwordSetupRepository.transactionWithScopedLock(
          normalizedScope,
          async (tx) => {
            const userResult = await ensureActivePasswordlessUser({
              passwordSetupRepository,
              scope: normalizedScope,
              tx,
            })

            if (userResult.outcome === 'already_set') {
              return { outcome: 'already_set' as const }
            }

            const pendingSetup =
              await passwordSetupRepository.findLatestPendingSetupByUser(
                normalizedScope,
                tx,
              )

            if (!pendingSetup) {
              const latestSetup =
                await passwordSetupRepository.findLatestSetupByUser(
                  normalizedScope,
                  tx,
                )

              return {
                outcome:
                  latestSetup?.status === 'expired'
                    ? ('expired' as const)
                    : ('not_found_or_invalidated' as const),
              }
            }

            if (pendingSetup.expiresAt.getTime() <= requestedAt.getTime()) {
              await passwordSetupRepository.expireSetupRecord(
                pendingSetup.id,
                requestedAt,
                tx,
              )

              return { outcome: 'expired' as const }
            }

            const isCodeValid = await verifyPassword(
              submittedCode,
              pendingSetup.codeHash,
            )

            if (!isCodeValid) {
              const attemptsCount = pendingSetup.attemptsCount + 1
              const tooManyAttempts = attemptsCount >= pendingSetup.maxAttempts

              await passwordSetupRepository.recordInvalidAttempt(
                {
                  attemptsCount,
                  recordId: pendingSetup.id,
                  status: tooManyAttempts ? 'invalidated' : 'pending',
                  updatedAt: requestedAt,
                },
                tx,
              )

              return {
                outcome: tooManyAttempts
                  ? ('too_many_attempts' as const)
                  : ('invalid_code' as const),
              }
            }

            const continuationToken = createContinuationToken()
            const continuationTokenExpiresAt = new Date(
              requestedAt.getTime() +
                PASSWORD_SETUP_CONTINUATION_TTL_SECONDS * 1000,
            )
            const verifiedRecord =
              await passwordSetupRepository.verifyPendingSetup(
                {
                  continuationTokenExpiresAt,
                  continuationTokenHash:
                    hashContinuationToken(continuationToken),
                  recordId: pendingSetup.id,
                  updatedAt: requestedAt,
                  verifiedAt: requestedAt,
                },
                tx,
              )

            if (!verifiedRecord) {
              return { outcome: 'not_found_or_invalidated' as const }
            }

            return {
              outcome: 'verified' as const,
              response: buildVerifyResponse({
                continuationToken,
                continuationTokenExpiresAt,
                email: normalizedScope.email,
                now: requestedAt,
              }),
            }
          },
        )

      if (verificationResult.outcome === 'verified') {
        return verificationResult.response
      }

      if (verificationResult.outcome === 'already_set') {
        throw createPasswordAlreadySetError()
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

      throw createNotFoundOrInvalidatedError()
    },

    async setPassword({
      continuationToken,
      newPassword,
      ...scope
    }: PasswordSetupScope & {
      continuationToken: string
      newPassword: string
    }): Promise<PasswordSetupCompletedSession> {
      const normalizedScope = {
        email: normalizeEmail(scope.email),
        userId: scope.userId,
      }
      const normalizedContinuationToken = continuationToken.trim()
      const completedAt = now()

      assertValidPortalPassword(newPassword)

      const readinessResult =
        await passwordSetupRepository.transactionWithScopedLock(
          normalizedScope,
          async (tx) =>
            validateVerifiedSetup({
              completedAt,
              continuationToken: normalizedContinuationToken,
              passwordSetupRepository,
              scope: normalizedScope,
              tx,
            }),
        )

      if (readinessResult.outcome !== 'ready') {
        throwSetPasswordOutcome(readinessResult.outcome)
      }

      const passwordHash = await hashPassword(newPassword)
      const completionResult =
        await passwordSetupRepository.transactionWithScopedLock(
          normalizedScope,
          async (tx) => {
            const validation = await validateVerifiedSetup({
              completedAt,
              continuationToken: normalizedContinuationToken,
              passwordSetupRepository,
              scope: normalizedScope,
              tx,
            })

            if (validation.outcome !== 'ready') {
              return validation
            }

            const updatedUser =
              await passwordSetupRepository.updatePortalUserPassword(
                {
                  passwordHash,
                  updatedAt: completedAt,
                  userId: validation.user.id,
                },
                tx,
              )

            if (!updatedUser?.isActive) {
              return { outcome: 'already_set' as const }
            }

            const consumedRecord =
              await passwordSetupRepository.consumeVerifiedSetup(
                validation.verifiedRecord.id,
                completedAt,
                tx,
              )

            if (!consumedRecord) {
              return { outcome: 'not_found_or_consumed' as const }
            }

            await passwordSetupRepository.deleteSessionsForUser(
              validation.user.id,
              tx,
            )

            const issuedSession = await authService.issueSessionForUser({
              executor: tx,
              tenantId,
              user: {
                email: updatedUser.email,
                fullName: updatedUser.fullName,
                id: updatedUser.id,
                passwordConfigured: true,
              },
              userId: updatedUser.id,
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

      throwSetPasswordOutcome(completionResult.outcome)
    },
  }
}

export type PasswordSetupService = ReturnType<typeof createPasswordSetupService>
