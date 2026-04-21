import { createHash, randomBytes, randomInt } from 'node:crypto'

import type { ChatwootClient } from '../../integrations/chatwoot/client.js'
import {
  ChatwootClientConfigurationError,
  ChatwootClientRequestError,
} from '../../integrations/chatwoot/client.js'
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
import type { PortalUsersRepository } from '../portal-users/repository.js'
import type { RegistrationRepository } from './repository.js'

const REGISTRATION_VERIFICATION_CODE_LENGTH = 6
const REGISTRATION_VERIFICATION_TTL_SECONDS = 15 * 60
const REGISTRATION_RESEND_COOLDOWN_SECONDS = 60
const REGISTRATION_CONTINUATION_TTL_SECONDS = 15 * 60
const REGISTRATION_PURPOSE = 'registration'

type CreateRegistrationServiceOptions = {
  chatwootClient: Pick<ChatwootClient, 'findContactByEmail'>
  emailDelivery: Pick<SmtpEmailDelivery, 'send'>
  now?: () => Date
  portalUsersRepository: Pick<PortalUsersRepository, 'findByEmail'>
  registrationRepository: RegistrationRepository
}

type RegistrationVerificationRequestResult = {
  delivery: 'sent' | 'existing_pending'
  email: string
  expiresInSeconds: number
  nextStep: 'verify_code'
  purpose: 'registration'
  resendAvailableInSeconds: number
  result: 'verification_requested'
}

type RegistrationVerificationConfirmResult = {
  continuationToken: string
  continuationExpiresInSeconds: number
  email: string
  nextStep: 'set_password'
  purpose: 'registration'
  result: 'verification_confirmed'
}

type RegistrationSetPasswordResult = {
  email: string
  nextStep: 'login'
  purpose: 'registration'
  result: 'registration_completed'
}

function createRegistrationVerificationCode() {
  return String(
    randomInt(0, 10 ** REGISTRATION_VERIFICATION_CODE_LENGTH),
  ).padStart(REGISTRATION_VERIFICATION_CODE_LENGTH, '0')
}

function createRegistrationContinuationToken() {
  return randomBytes(32).toString('base64url')
}

function buildVerificationEmail({ code }: { code: string }): EmailMessage {
  return {
    subject: 'Код подтверждения для Client Portal',
    text: [
      'Ваш код подтверждения для Client Portal:',
      '',
      code,
      '',
      'Код действует 15 минут.',
      'Если вы не запрашивали регистрацию, просто проигнорируйте это письмо.',
    ].join('\n'),
    to: '',
  }
}

function calculateSecondsUntil(target: Date, now: Date) {
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 1000))
}

function buildVerificationRequestedResponse(
  delivery: RegistrationVerificationRequestResult['delivery'],
  email: string,
  expiresAt: Date,
  resendNotBefore: Date,
  now: Date,
): RegistrationVerificationRequestResult {
  return {
    delivery,
    email,
    expiresInSeconds: calculateSecondsUntil(expiresAt, now),
    nextStep: 'verify_code',
    purpose: REGISTRATION_PURPOSE,
    resendAvailableInSeconds: calculateSecondsUntil(resendNotBefore, now),
    result: 'verification_requested',
  }
}

function buildVerificationConfirmedResponse(
  email: string,
  continuationToken: string,
  continuationTokenExpiresAt: Date,
  now: Date,
): RegistrationVerificationConfirmResult {
  return {
    continuationToken,
    continuationExpiresInSeconds: calculateSecondsUntil(
      continuationTokenExpiresAt,
      now,
    ),
    email,
    nextStep: 'set_password',
    purpose: REGISTRATION_PURPOSE,
    result: 'verification_confirmed',
  }
}

function buildRegistrationCompletedResponse(
  email: string,
): RegistrationSetPasswordResult {
  return {
    email,
    nextStep: 'login',
    purpose: REGISTRATION_PURPOSE,
    result: 'registration_completed',
  }
}

function createRegistrationUnavailableError() {
  return new ApiError(
    503,
    'REGISTRATION_UNAVAILABLE',
    'Регистрация сейчас недоступна. Попробуйте позже.',
  )
}

function createChatwootUnavailableError() {
  return new ApiError(
    502,
    'CHATWOOT_UNAVAILABLE',
    'Мы не смогли проверить доступ через Chatwoot. Попробуйте чуть позже.',
  )
}

function createDeliveryUnavailableError() {
  return new ApiError(
    503,
    'REGISTRATION_DELIVERY_UNAVAILABLE',
    'Мы не смогли отправить код подтверждения. Попробуйте чуть позже.',
  )
}

function createDeliveryInProgressError() {
  return new ApiError(
    409,
    'REGISTRATION_DELIVERY_IN_PROGRESS',
    'Код подтверждения уже отправляется. Подождите немного и попробуйте снова.',
  )
}

function createVerificationInvalidCodeError() {
  return new ApiError(
    400,
    'REGISTRATION_VERIFICATION_INVALID_CODE',
    'Неверный код подтверждения. Проверьте код и попробуйте еще раз.',
  )
}

function createVerificationCodeExpiredError() {
  return new ApiError(
    410,
    'REGISTRATION_VERIFICATION_CODE_EXPIRED',
    'Срок действия кода подтверждения истек. Запросите новый код.',
  )
}

function createVerificationTooManyAttemptsError() {
  return new ApiError(
    409,
    'REGISTRATION_VERIFICATION_TOO_MANY_ATTEMPTS',
    'Слишком много неверных попыток. Запросите новый код подтверждения.',
  )
}

function createVerificationNotFoundOrInvalidatedError() {
  return new ApiError(
    409,
    'REGISTRATION_VERIFICATION_NOT_FOUND_OR_INVALIDATED',
    'Этот код подтверждения больше недействителен. Запросите новый код.',
  )
}

function createVerificationRequiredError() {
  return new ApiError(
    409,
    'REGISTRATION_VERIFICATION_REQUIRED',
    'Сначала снова подтвердите email, прежде чем задавать пароль.',
  )
}

function createVerificationContinuationInvalidError() {
  return new ApiError(
    409,
    'REGISTRATION_VERIFICATION_CONTINUATION_INVALID',
    'Подтверждение регистрации больше недействительно. Запросите новый код и попробуйте еще раз.',
  )
}

function createAccountExistsError() {
  return new ApiError(
    409,
    'REGISTRATION_ACCOUNT_EXISTS',
    'Для этого email уже создан аккаунт. Войдите или используйте восстановление пароля.',
  )
}

function hashContinuationToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function validatePassword(password: string) {
  const hasLength = password.trim().length >= 8
  const hasLetter = /[A-Za-zА-Яа-яЁё]/.test(password)
  const hasNumber = /\d/.test(password)

  if (!hasLength || !hasLetter || !hasNumber) {
    throw new ApiError(
      400,
      'INVALID_REQUEST',
      'Пароль должен содержать не менее 8 символов, букву и цифру.',
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

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  )
}

export function createRegistrationService({
  chatwootClient,
  emailDelivery,
  now = () => new Date(),
  portalUsersRepository,
  registrationRepository,
}: CreateRegistrationServiceOptions) {
  return {
    async requestVerification({
      email,
      fullName,
    }: {
      email: string
      fullName: string
    }): Promise<RegistrationVerificationRequestResult> {
      const normalizedEmail = normalizeEmail(email)
      const normalizedFullName = fullName.trim()
      const requestedAt = now()

      const existingPortalUser =
        await portalUsersRepository.findByEmail(normalizedEmail)

      if (existingPortalUser) {
        throw new ApiError(
          409,
          'REGISTRATION_ACCOUNT_EXISTS',
          'Для этого email уже создан аккаунт. Войдите или используйте восстановление пароля.',
        )
      }

      const preflightResult =
        await registrationRepository.transactionWithScopedLock(
          normalizedEmail,
          async (tx) => {
            const existingPendingVerification =
              await registrationRepository.findLatestActiveVerificationByEmail(
                normalizedEmail,
                tx,
              )

            if (!existingPendingVerification) {
              return {
                outcome: 'needs_eligibility_check' as const,
              }
            }

            const isExpired =
              existingPendingVerification.expiresAt.getTime() <=
              requestedAt.getTime()

            if (isExpired) {
              await registrationRepository.expireVerificationRecord(
                existingPendingVerification.id,
                requestedAt,
                tx,
              )

              return {
                outcome: 'needs_eligibility_check' as const,
              }
            }

            if (existingPendingVerification.status === 'sending') {
              return {
                outcome: 'delivery_in_progress' as const,
              }
            }

            const isResendLocked =
              existingPendingVerification.resendNotBefore.getTime() >
              requestedAt.getTime()

            if (isResendLocked) {
              return {
                outcome: 'pending_resend_locked' as const,
                response: buildVerificationRequestedResponse(
                  'existing_pending',
                  normalizedEmail,
                  existingPendingVerification.expiresAt,
                  existingPendingVerification.resendNotBefore,
                  requestedAt,
                ),
              }
            }

            return {
              outcome: 'needs_eligibility_check' as const,
            }
          },
        )

      if (preflightResult.outcome === 'pending_resend_locked') {
        return preflightResult.response
      }

      if (preflightResult.outcome === 'delivery_in_progress') {
        throw createDeliveryInProgressError()
      }

      let contact

      try {
        contact = await chatwootClient.findContactByEmail(normalizedEmail)
      } catch (error) {
        if (
          error instanceof ChatwootClientConfigurationError ||
          error instanceof SmtpEmailDeliveryConfigurationError
        ) {
          throw createRegistrationUnavailableError()
        }

        if (error instanceof ChatwootClientRequestError) {
          throw createChatwootUnavailableError()
        }

        throw error
      }

      if (!contact) {
        throw new ApiError(
          403,
          'REGISTRATION_CONTACT_NOT_FOUND',
          'Мы не нашли доступ для этого email. Обратитесь в вашу компанию.',
        )
      }

      const verificationCode = createRegistrationVerificationCode()
      const verificationCodeHash = await hashPassword(verificationCode)
      const expiresAt = new Date(
        requestedAt.getTime() + REGISTRATION_VERIFICATION_TTL_SECONDS * 1000,
      )
      const resendNotBefore = new Date(
        requestedAt.getTime() + REGISTRATION_RESEND_COOLDOWN_SECONDS * 1000,
      )

      const requestResult =
        await registrationRepository.transactionWithScopedLock(
          normalizedEmail,
          async (tx) => {
            const existingUser =
              await registrationRepository.findPortalUserByEmail(
                normalizedEmail,
                tx,
              )

            if (existingUser) {
              return {
                outcome: 'account_exists' as const,
              }
            }

            const existingPendingVerification =
              await registrationRepository.findLatestActiveVerificationByEmail(
                normalizedEmail,
                tx,
              )

            let previousPendingVerification = null

            if (existingPendingVerification) {
              const isExpired =
                existingPendingVerification.expiresAt.getTime() <=
                requestedAt.getTime()

              if (!isExpired) {
                if (existingPendingVerification.status === 'sending') {
                  return {
                    outcome: 'delivery_in_progress' as const,
                  }
                }

                const isResendLocked =
                  existingPendingVerification.resendNotBefore.getTime() >
                  requestedAt.getTime()

                if (isResendLocked) {
                  return {
                    outcome: 'pending_resend_locked' as const,
                    response: buildVerificationRequestedResponse(
                      'existing_pending',
                      normalizedEmail,
                      existingPendingVerification.expiresAt,
                      existingPendingVerification.resendNotBefore,
                      requestedAt,
                    ),
                  }
                }

                previousPendingVerification = existingPendingVerification
              } else {
                await registrationRepository.expireVerificationRecord(
                  existingPendingVerification.id,
                  requestedAt,
                  tx,
                )
              }
            }

            const pendingVerification = previousPendingVerification
              ? await registrationRepository.replacePendingVerification(
                  {
                    chatwootContactId: contact.id,
                    codeHash: verificationCodeHash,
                    expiresAt,
                    fullName: normalizedFullName,
                    lastSentAt: requestedAt,
                    recordId: previousPendingVerification.id,
                    resendCount: previousPendingVerification.resendCount + 1,
                    resendNotBefore,
                    status: 'sending',
                    updatedAt: requestedAt,
                  },
                  tx,
                )
              : await registrationRepository.createPendingVerification(
                  {
                    chatwootContactId: contact.id,
                    codeHash: verificationCodeHash,
                    email: normalizedEmail,
                    expiresAt,
                    fullName: normalizedFullName,
                    lastSentAt: requestedAt,
                    resendCount: 0,
                    resendNotBefore,
                    status: 'sending',
                  },
                  tx,
                )

            return {
              outcome: 'verification_created' as const,
              pendingVerification,
              previousPendingVerification,
            }
          },
        )

      if (requestResult.outcome === 'account_exists') {
        throw createAccountExistsError()
      }

      if (requestResult.outcome === 'pending_resend_locked') {
        return requestResult.response
      }

      if (requestResult.outcome === 'delivery_in_progress') {
        throw createDeliveryInProgressError()
      }

      const cleanupFailedDelivery = async () => {
        await registrationRepository.transactionWithScopedLock(
          normalizedEmail,
          async (tx) => {
            if (requestResult.previousPendingVerification) {
              await registrationRepository.replacePendingVerification(
                {
                  attemptsCount:
                    requestResult.previousPendingVerification.attemptsCount,
                  chatwootContactId:
                    requestResult.previousPendingVerification
                      .chatwootContactId ?? contact.id,
                  codeHash: requestResult.previousPendingVerification.codeHash,
                  expiresAt:
                    requestResult.previousPendingVerification.expiresAt,
                  fullName:
                    requestResult.previousPendingVerification.fullName ??
                    normalizedFullName,
                  lastSentAt:
                    requestResult.previousPendingVerification.lastSentAt,
                  recordId: requestResult.previousPendingVerification.id,
                  resendCount:
                    requestResult.previousPendingVerification.resendCount,
                  resendNotBefore:
                    requestResult.previousPendingVerification.resendNotBefore,
                  status: 'pending',
                  updatedAt: requestedAt,
                },
                tx,
              )
              return
            }

            await registrationRepository.deleteVerificationRecord(
              requestResult.pendingVerification.id,
              tx,
            )
          },
        )
      }

      try {
        const verificationEmail = buildVerificationEmail({
          code: verificationCode,
        })

        await emailDelivery.send({
          ...verificationEmail,
          to: normalizedEmail,
        })
      } catch (error) {
        if (
          error instanceof SmtpEmailDeliveryConfigurationError ||
          error instanceof ChatwootClientConfigurationError
        ) {
          await cleanupFailedDelivery()
          throw createRegistrationUnavailableError()
        }

        if (error instanceof SmtpEmailDeliveryError) {
          await cleanupFailedDelivery()
          throw createDeliveryUnavailableError()
        }

        throw error
      }

      const deliveredVerification =
        await registrationRepository.transactionWithScopedLock(
          normalizedEmail,
          async (tx) =>
            registrationRepository.markVerificationDeliverySucceeded(
              requestResult.pendingVerification.id,
              requestedAt,
              tx,
            ),
        )

      if (!deliveredVerification) {
        throw new Error('Verification delivery could not be marked as pending.')
      }

      return buildVerificationRequestedResponse(
        'sent',
        normalizedEmail,
        deliveredVerification.expiresAt,
        deliveredVerification.resendNotBefore,
        requestedAt,
      )
    },

    async confirmVerification({
      code,
      email,
    }: {
      code: string
      email: string
    }): Promise<RegistrationVerificationConfirmResult> {
      const normalizedEmail = normalizeEmail(email)
      const submittedCode = code.trim()
      const requestedAt = now()

      const verificationResult =
        await registrationRepository.transactionWithScopedLock(
          normalizedEmail,
          async (tx) => {
            const pendingVerification =
              await registrationRepository.findLatestPendingVerificationByEmail(
                normalizedEmail,
                tx,
              )

            if (!pendingVerification) {
              const latestVerification =
                await registrationRepository.findLatestVerificationByEmail(
                  normalizedEmail,
                  tx,
                )

              return {
                outcome:
                  latestVerification?.status === 'expired'
                    ? ('expired' as const)
                    : ('not_found_or_invalidated' as const),
              }
            }

            const isExpired =
              pendingVerification.expiresAt.getTime() <= requestedAt.getTime()

            if (isExpired) {
              await registrationRepository.expireVerificationRecord(
                pendingVerification.id,
                requestedAt,
                tx,
              )

              return {
                outcome: 'expired' as const,
              }
            }

            const isCodeValid = await verifyPassword(
              submittedCode,
              pendingVerification.codeHash,
            )

            if (!isCodeValid) {
              const attemptsCount = pendingVerification.attemptsCount + 1

              if (attemptsCount >= pendingVerification.maxAttempts) {
                await registrationRepository.recordInvalidAttempt(
                  {
                    attemptsCount,
                    recordId: pendingVerification.id,
                    status: 'invalidated',
                    updatedAt: requestedAt,
                  },
                  tx,
                )

                return {
                  outcome: 'too_many_attempts' as const,
                }
              }

              await registrationRepository.recordInvalidAttempt(
                {
                  attemptsCount,
                  recordId: pendingVerification.id,
                  updatedAt: requestedAt,
                },
                tx,
              )

              return {
                outcome: 'invalid_code' as const,
              }
            }

            const continuationToken = createRegistrationContinuationToken()
            const continuationTokenExpiresAt = new Date(
              requestedAt.getTime() +
                REGISTRATION_CONTINUATION_TTL_SECONDS * 1000,
            )

            const verifiedRecord =
              await registrationRepository.verifyPendingVerification(
                {
                  continuationTokenExpiresAt,
                  continuationTokenHash:
                    hashContinuationToken(continuationToken),
                  recordId: pendingVerification.id,
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
              outcome: 'confirmed' as const,
              response: buildVerificationConfirmedResponse(
                normalizedEmail,
                continuationToken,
                continuationTokenExpiresAt,
                requestedAt,
              ),
            }
          },
        )

      if (verificationResult.outcome === 'confirmed') {
        return verificationResult.response
      }

      if (verificationResult.outcome === 'expired') {
        throw createVerificationCodeExpiredError()
      }

      if (verificationResult.outcome === 'too_many_attempts') {
        throw createVerificationTooManyAttemptsError()
      }

      if (verificationResult.outcome === 'invalid_code') {
        throw createVerificationInvalidCodeError()
      }

      throw createVerificationNotFoundOrInvalidatedError()
    },

    async setPassword({
      continuationToken,
      email,
      newPassword,
    }: {
      continuationToken: string
      email: string
      newPassword: string
    }): Promise<RegistrationSetPasswordResult> {
      const normalizedEmail = normalizeEmail(email)
      const normalizedContinuationToken = continuationToken.trim()
      const completedAt = now()

      validatePassword(newPassword)

      try {
        const completionResult =
          await registrationRepository.transactionWithScopedLock(
            normalizedEmail,
            async (tx) => {
              const verifiedRecord =
                await registrationRepository.findLatestVerifiedVerificationByEmail(
                  normalizedEmail,
                  tx,
                )

              if (!verifiedRecord) {
                const latestVerification =
                  await registrationRepository.findLatestVerificationByEmail(
                    normalizedEmail,
                    tx,
                  )

                if (latestVerification?.status === 'consumed') {
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
                await registrationRepository.invalidateVerifiedVerification(
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

              const existingPortalUser =
                await registrationRepository.findPortalUserByEmail(
                  normalizedEmail,
                  tx,
                )

              if (existingPortalUser) {
                await registrationRepository.invalidateVerifiedVerification(
                  verifiedRecord.id,
                  completedAt,
                  tx,
                )

                return {
                  outcome: 'account_exists' as const,
                }
              }

              const createdUser = await registrationRepository.createPortalUser(
                {
                  email: normalizedEmail,
                  fullName: verifiedRecord.fullName,
                  passwordHash: await hashPassword(newPassword),
                },
                tx,
              )

              if (!createdUser) {
                throw new Error(
                  'Portal user could not be created during registration completion.',
                )
              }

              if (!verifiedRecord.chatwootContactId) {
                throw new Error(
                  'Verified registration record is missing Chatwoot contact id.',
                )
              }

              await registrationRepository.createPortalUserContactLink(
                {
                  chatwootContactId: verifiedRecord.chatwootContactId,
                  userId: createdUser.id,
                },
                tx,
              )

              const consumedRecord =
                await registrationRepository.consumeVerifiedVerification(
                  verifiedRecord.id,
                  completedAt,
                  tx,
                )

              if (!consumedRecord) {
                return {
                  outcome: 'not_found_or_consumed' as const,
                }
              }

              return {
                outcome: 'completed' as const,
                response: buildRegistrationCompletedResponse(normalizedEmail),
              }
            },
          )

        if (completionResult.outcome === 'account_exists') {
          throw createAccountExistsError()
        }

        if (completionResult.outcome === 'continuation_invalid') {
          throw createVerificationContinuationInvalidError()
        }

        if (completionResult.outcome === 'not_found_or_consumed') {
          throw createVerificationNotFoundOrInvalidatedError()
        }

        if (completionResult.outcome === 'verification_required') {
          throw createVerificationRequiredError()
        }

        return completionResult.response
      } catch (error) {
        if (isUniqueViolation(error)) {
          await registrationRepository.transactionWithScopedLock(
            normalizedEmail,
            async (tx) => {
              const verifiedRecord =
                await registrationRepository.findLatestVerifiedVerificationByEmail(
                  normalizedEmail,
                  tx,
                )

              if (!verifiedRecord) {
                return
              }

              await registrationRepository.invalidateVerifiedVerification(
                verifiedRecord.id,
                completedAt,
                tx,
              )
            },
          )

          throw createAccountExistsError()
        }

        throw error
      }
    },
  }
}

export type RegistrationService = ReturnType<typeof createRegistrationService>
