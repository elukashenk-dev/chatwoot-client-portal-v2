import { createHash, randomBytes, randomInt } from 'node:crypto'

import type {
  EmailMessage,
  SmtpEmailDelivery,
} from '../../integrations/email/smtp.js'
import {
  SmtpEmailDeliveryConfigurationError,
  SmtpEmailDeliveryError,
} from '../../integrations/email/smtp.js'
import { normalizeEmail } from '../../lib/email.js'
import { ApiError } from '../../lib/errors.js'
import { hashPassword, verifyPassword } from '../../lib/password.js'
import type {
  PasswordResetRecord,
  PasswordResetRepository,
} from './repository.js'

const PASSWORD_RESET_CODE_LENGTH = 6
const PASSWORD_RESET_TTL_SECONDS = 15 * 60
const PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = 60
const PASSWORD_RESET_CONTINUATION_TTL_SECONDS = 15 * 60
const PASSWORD_RESET_PURPOSE = 'password_reset'

type CreatePasswordResetServiceOptions = {
  emailDelivery: Pick<SmtpEmailDelivery, 'send'>
  now?: () => Date
  passwordResetRepository: PasswordResetRepository
}

type PasswordResetRequestResult = {
  accepted: true
  email: string
  expiresInSeconds: number
  nextStep: 'verify_code'
  purpose: 'password_reset'
  resendAvailableInSeconds: number
  result: 'password_reset_requested'
}

type PasswordResetVerifyResult = {
  continuationToken: string
  continuationExpiresInSeconds: number
  email: string
  nextStep: 'set_password'
  purpose: 'password_reset'
  result: 'password_reset_verified'
}

type PasswordResetSetPasswordResult = {
  email: string
  nextStep: 'login'
  purpose: 'password_reset'
  result: 'password_reset_completed'
}

function createResetCode() {
  return String(randomInt(0, 10 ** PASSWORD_RESET_CODE_LENGTH)).padStart(
    PASSWORD_RESET_CODE_LENGTH,
    '0',
  )
}

function createContinuationToken() {
  return randomBytes(32).toString('base64url')
}

function hashContinuationToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function buildResetEmail({ code }: { code: string }): EmailMessage {
  return {
    subject: 'Код восстановления пароля для Client Portal',
    text: [
      'Ваш код восстановления пароля для Client Portal:',
      '',
      code,
      '',
      'Код действует 15 минут.',
      'Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.',
    ].join('\n'),
    to: '',
  }
}

function calculateSecondsUntil(target: Date, now: Date) {
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 1000))
}

function buildRequestResponse({
  email,
  expiresAt,
  now,
  resendNotBefore,
}: {
  email: string
  expiresAt: Date
  now: Date
  resendNotBefore: Date
}): PasswordResetRequestResult {
  return {
    accepted: true,
    email,
    expiresInSeconds: calculateSecondsUntil(expiresAt, now),
    nextStep: 'verify_code',
    purpose: PASSWORD_RESET_PURPOSE,
    resendAvailableInSeconds: calculateSecondsUntil(resendNotBefore, now),
    result: 'password_reset_requested',
  }
}

function buildVerifyResponse({
  continuationToken,
  continuationTokenExpiresAt,
  email,
  now,
}: {
  continuationToken: string
  continuationTokenExpiresAt: Date
  email: string
  now: Date
}): PasswordResetVerifyResult {
  return {
    continuationToken,
    continuationExpiresInSeconds: calculateSecondsUntil(
      continuationTokenExpiresAt,
      now,
    ),
    email,
    nextStep: 'set_password',
    purpose: PASSWORD_RESET_PURPOSE,
    result: 'password_reset_verified',
  }
}

function buildCompletedResponse(email: string): PasswordResetSetPasswordResult {
  return {
    email,
    nextStep: 'login',
    purpose: PASSWORD_RESET_PURPOSE,
    result: 'password_reset_completed',
  }
}

function createInvalidCodeError() {
  return new ApiError(
    400,
    'PASSWORD_RESET_INVALID_CODE',
    'Неверный код восстановления. Проверьте код и попробуйте еще раз.',
  )
}

function createCodeExpiredError() {
  return new ApiError(
    410,
    'PASSWORD_RESET_CODE_EXPIRED',
    'Срок действия кода восстановления истек. Запросите новый код.',
  )
}

function createTooManyAttemptsError() {
  return new ApiError(
    409,
    'PASSWORD_RESET_TOO_MANY_ATTEMPTS',
    'Слишком много неверных попыток. Запросите новый код восстановления.',
  )
}

function createNotFoundOrInvalidatedError() {
  return new ApiError(
    409,
    'PASSWORD_RESET_NOT_FOUND_OR_INVALIDATED',
    'Этот код восстановления больше недействителен. Запросите новый код.',
  )
}

function createVerificationRequiredError() {
  return new ApiError(
    409,
    'PASSWORD_RESET_VERIFICATION_REQUIRED',
    'Сначала снова подтвердите email, прежде чем задавать новый пароль.',
  )
}

function createContinuationInvalidError() {
  return new ApiError(
    409,
    'PASSWORD_RESET_CONTINUATION_INVALID',
    'Подтверждение восстановления больше недействительно. Запросите новый код и попробуйте еще раз.',
  )
}

function validatePassword(password: string) {
  if (password.trim().length < 8) {
    throw new ApiError(
      400,
      'INVALID_REQUEST',
      'Пароль должен содержать не менее 8 символов.',
    )
  }
}

function verifyContinuationToken({
  providedToken,
  storedTokenHash,
}: {
  providedToken: string
  storedTokenHash: string | null
}) {
  if (!storedTokenHash) {
    return false
  }

  return hashContinuationToken(providedToken) === storedTokenHash
}

function shouldSuppressDeliveryError(error: unknown) {
  return (
    error instanceof SmtpEmailDeliveryConfigurationError ||
    error instanceof SmtpEmailDeliveryError
  )
}

async function cleanupFailedResetDelivery({
  passwordResetRepository,
  previousPendingReset,
  resetRecord,
  updatedAt,
}: {
  passwordResetRepository: PasswordResetRepository
  previousPendingReset: PasswordResetRecord | null
  resetRecord: PasswordResetRecord
  updatedAt: Date
}) {
  await passwordResetRepository.transactionWithScopedLock(
    resetRecord.email,
    async (tx) => {
      if (previousPendingReset) {
        await passwordResetRepository.replacePendingReset(
          {
            attemptsCount: previousPendingReset.attemptsCount,
            codeHash: previousPendingReset.codeHash,
            expiresAt: previousPendingReset.expiresAt,
            lastSentAt: previousPendingReset.lastSentAt,
            portalUserId: previousPendingReset.portalUserId,
            recordId: previousPendingReset.id,
            resendCount: previousPendingReset.resendCount,
            resendNotBefore: previousPendingReset.resendNotBefore,
            updatedAt,
          },
          tx,
        )
        return
      }

      await passwordResetRepository.deleteResetRecord(resetRecord.id, tx)
    },
  )
}

async function deliverResetEmail({
  emailDelivery,
  normalizedEmail,
  passwordResetRepository,
  previousPendingReset,
  requestedAt,
  resetCode,
  resetRecord,
}: {
  emailDelivery: Pick<SmtpEmailDelivery, 'send'>
  normalizedEmail: string
  passwordResetRepository: PasswordResetRepository
  previousPendingReset: PasswordResetRecord | null
  requestedAt: Date
  resetCode: string
  resetRecord: PasswordResetRecord
}) {
  try {
    const resetEmail = buildResetEmail({
      code: resetCode,
    })

    await emailDelivery.send({
      ...resetEmail,
      to: normalizedEmail,
    })
  } catch (error) {
    await cleanupFailedResetDelivery({
      passwordResetRepository,
      previousPendingReset,
      resetRecord,
      updatedAt: requestedAt,
    })

    if (!shouldSuppressDeliveryError(error)) {
      throw error
    }
  }
}

function dispatchResetEmail(input: Parameters<typeof deliverResetEmail>[0]) {
  setImmediate(() => {
    void deliverResetEmail(input).catch(() => undefined)
  })
}

export function createPasswordResetService({
  emailDelivery,
  now = () => new Date(),
  passwordResetRepository,
}: CreatePasswordResetServiceOptions) {
  return {
    async requestPasswordReset({
      email,
    }: {
      email: string
    }): Promise<PasswordResetRequestResult> {
      const normalizedEmail = normalizeEmail(email)
      const requestedAt = now()

      const result = await passwordResetRepository.transactionWithScopedLock(
        normalizedEmail,
        async (tx) => {
          const user = await passwordResetRepository.findPortalUserByEmail(
            normalizedEmail,
            tx,
          )
          const activeUser = user?.isActive ? user : null
          const existingPendingReset =
            await passwordResetRepository.findLatestPendingResetByEmail(
              normalizedEmail,
              tx,
            )

          if (existingPendingReset) {
            const isExpired =
              existingPendingReset.expiresAt.getTime() <= requestedAt.getTime()

            if (!isExpired) {
              const isResendLocked =
                existingPendingReset.resendNotBefore.getTime() >
                requestedAt.getTime()

              if (isResendLocked) {
                return {
                  activeUser,
                  previousPendingReset: existingPendingReset,
                  resetCode: null,
                  resetRecord: existingPendingReset,
                  shouldSendEmail: false,
                }
              }
            } else {
              await passwordResetRepository.expireResetRecord(
                existingPendingReset.id,
                requestedAt,
                tx,
              )
            }
          }

          const resetCode = createResetCode()
          const codeHash = await hashPassword(resetCode)
          const expiresAt = new Date(
            requestedAt.getTime() + PASSWORD_RESET_TTL_SECONDS * 1000,
          )
          const resendNotBefore = new Date(
            requestedAt.getTime() +
              PASSWORD_RESET_RESEND_COOLDOWN_SECONDS * 1000,
          )
          const previousPendingReset =
            existingPendingReset &&
            existingPendingReset.expiresAt.getTime() > requestedAt.getTime()
              ? existingPendingReset
              : null

          const resetRecord = previousPendingReset
            ? await passwordResetRepository.replacePendingReset(
                {
                  codeHash,
                  expiresAt,
                  lastSentAt: requestedAt,
                  portalUserId: activeUser?.id ?? null,
                  recordId: previousPendingReset.id,
                  resendCount: previousPendingReset.resendCount + 1,
                  resendNotBefore,
                  updatedAt: requestedAt,
                },
                tx,
              )
            : await passwordResetRepository.createPendingReset(
                {
                  codeHash,
                  email: normalizedEmail,
                  expiresAt,
                  lastSentAt: requestedAt,
                  portalUserId: activeUser?.id ?? null,
                  resendCount: 0,
                  resendNotBefore,
                },
                tx,
              )

          return {
            activeUser,
            previousPendingReset,
            resetCode,
            resetRecord,
            shouldSendEmail: Boolean(activeUser),
          }
        },
      )

      if (result.shouldSendEmail && result.resetCode) {
        dispatchResetEmail({
          emailDelivery,
          normalizedEmail,
          passwordResetRepository,
          previousPendingReset: result.previousPendingReset,
          requestedAt,
          resetCode: result.resetCode,
          resetRecord: result.resetRecord,
        })
      }

      return buildRequestResponse({
        email: normalizedEmail,
        expiresAt: result.resetRecord.expiresAt,
        now: requestedAt,
        resendNotBefore: result.resetRecord.resendNotBefore,
      })
    },

    async confirmPasswordReset({
      code,
      email,
    }: {
      code: string
      email: string
    }): Promise<PasswordResetVerifyResult> {
      const normalizedEmail = normalizeEmail(email)
      const submittedCode = code.trim()
      const requestedAt = now()

      const verificationResult =
        await passwordResetRepository.transactionWithScopedLock(
          normalizedEmail,
          async (tx) => {
            const pendingReset =
              await passwordResetRepository.findLatestPendingResetByEmail(
                normalizedEmail,
                tx,
              )

            if (!pendingReset) {
              const latestReset =
                await passwordResetRepository.findLatestResetByEmail(
                  normalizedEmail,
                  tx,
                )

              return {
                outcome:
                  latestReset?.status === 'expired'
                    ? ('expired' as const)
                    : ('not_found_or_invalidated' as const),
              }
            }

            const isExpired =
              pendingReset.expiresAt.getTime() <= requestedAt.getTime()

            if (isExpired) {
              await passwordResetRepository.expireResetRecord(
                pendingReset.id,
                requestedAt,
                tx,
              )

              return {
                outcome: 'expired' as const,
              }
            }

            const isCodeValid = await verifyPassword(
              submittedCode,
              pendingReset.codeHash,
            )

            if (!isCodeValid) {
              const attemptsCount = pendingReset.attemptsCount + 1

              if (attemptsCount >= pendingReset.maxAttempts) {
                await passwordResetRepository.recordInvalidAttempt(
                  {
                    attemptsCount,
                    recordId: pendingReset.id,
                    status: 'invalidated',
                    updatedAt: requestedAt,
                  },
                  tx,
                )

                return {
                  outcome: 'too_many_attempts' as const,
                }
              }

              await passwordResetRepository.recordInvalidAttempt(
                {
                  attemptsCount,
                  recordId: pendingReset.id,
                  updatedAt: requestedAt,
                },
                tx,
              )

              return {
                outcome: 'invalid_code' as const,
              }
            }

            if (!pendingReset.portalUserId) {
              await passwordResetRepository.recordInvalidAttempt(
                {
                  attemptsCount: pendingReset.maxAttempts,
                  recordId: pendingReset.id,
                  status: 'invalidated',
                  updatedAt: requestedAt,
                },
                tx,
              )

              return {
                outcome: 'not_found_or_invalidated' as const,
              }
            }

            const continuationToken = createContinuationToken()
            const continuationTokenExpiresAt = new Date(
              requestedAt.getTime() +
                PASSWORD_RESET_CONTINUATION_TTL_SECONDS * 1000,
            )

            const verifiedRecord =
              await passwordResetRepository.verifyPendingReset(
                {
                  continuationTokenExpiresAt,
                  continuationTokenHash:
                    hashContinuationToken(continuationToken),
                  recordId: pendingReset.id,
                  updatedAt: requestedAt,
                  verifiedAt: requestedAt,
                },
                tx,
              )

            if (!verifiedRecord) {
              return {
                outcome: 'not_found_or_invalidated' as const,
              }
            }

            return {
              outcome: 'verified' as const,
              response: buildVerifyResponse({
                continuationToken,
                continuationTokenExpiresAt,
                email: normalizedEmail,
                now: requestedAt,
              }),
            }
          },
        )

      if (verificationResult.outcome === 'verified') {
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

      throw createNotFoundOrInvalidatedError()
    },

    async setPassword({
      continuationToken,
      email,
      newPassword,
    }: {
      continuationToken: string
      email: string
      newPassword: string
    }): Promise<PasswordResetSetPasswordResult> {
      const normalizedEmail = normalizeEmail(email)
      const normalizedContinuationToken = continuationToken.trim()
      const completedAt = now()

      validatePassword(newPassword)

      const completionResult =
        await passwordResetRepository.transactionWithScopedLock(
          normalizedEmail,
          async (tx) => {
            const verifiedRecord =
              await passwordResetRepository.findLatestVerifiedResetByEmail(
                normalizedEmail,
                tx,
              )

            if (!verifiedRecord) {
              const latestReset =
                await passwordResetRepository.findLatestResetByEmail(
                  normalizedEmail,
                  tx,
                )

              if (latestReset?.status === 'consumed') {
                return {
                  outcome: 'not_found_or_consumed' as const,
                }
              }

              return {
                outcome: 'verification_required' as const,
              }
            }

            const isContinuationExpired =
              !verifiedRecord.continuationTokenExpiresAt ||
              verifiedRecord.continuationTokenExpiresAt.getTime() <=
                completedAt.getTime()

            if (isContinuationExpired) {
              await passwordResetRepository.invalidateVerifiedReset(
                verifiedRecord.id,
                completedAt,
                tx,
              )

              return {
                outcome: 'verification_required' as const,
              }
            }

            if (
              !verifyContinuationToken({
                providedToken: normalizedContinuationToken,
                storedTokenHash: verifiedRecord.continuationTokenHash,
              })
            ) {
              return {
                outcome: 'continuation_invalid' as const,
              }
            }

            const targetUser =
              await passwordResetRepository.findPortalUserByEmail(
                normalizedEmail,
                tx,
              )

            if (
              !targetUser ||
              !targetUser.isActive ||
              targetUser.id !== verifiedRecord.portalUserId
            ) {
              await passwordResetRepository.invalidateVerifiedReset(
                verifiedRecord.id,
                completedAt,
                tx,
              )

              return {
                outcome: 'not_found_or_consumed' as const,
              }
            }

            const updatedUser =
              await passwordResetRepository.updatePortalUserPassword(
                {
                  passwordHash: await hashPassword(newPassword),
                  updatedAt: completedAt,
                  userId: targetUser.id,
                },
                tx,
              )

            if (!updatedUser?.isActive) {
              throw new Error(
                'Portal user password could not be updated during reset.',
              )
            }

            const consumedRecord =
              await passwordResetRepository.consumeVerifiedReset(
                verifiedRecord.id,
                completedAt,
                tx,
              )

            if (!consumedRecord) {
              return {
                outcome: 'not_found_or_consumed' as const,
              }
            }

            await passwordResetRepository.deleteSessionsForUser(
              targetUser.id,
              tx,
            )

            return {
              outcome: 'completed' as const,
              response: buildCompletedResponse(normalizedEmail),
            }
          },
        )

      if (completionResult.outcome === 'continuation_invalid') {
        throw createContinuationInvalidError()
      }

      if (completionResult.outcome === 'not_found_or_consumed') {
        throw createNotFoundOrInvalidatedError()
      }

      if (completionResult.outcome === 'verification_required') {
        throw createVerificationRequiredError()
      }

      return completionResult.response
    },
  }
}

export type PasswordResetService = ReturnType<typeof createPasswordResetService>
