import { randomBytes, randomInt } from 'node:crypto'

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
import { hashPassword, verifyPassword } from '../../lib/password.js'
import { assertValidPortalPassword } from '../../lib/passwordPolicy.js'
import type { AuthService, AuthenticatedPortalUser } from '../auth/service.js'
import type { PortalUsersRepository } from '../portal-users/repository.js'
import {
  createContactNotFoundError,
  type RegistrationSupportContactReader,
} from './contactNotFoundError.js'
import {
  createAccountExistsError,
  createChatwootUnavailableError,
  createDeliveryInProgressError,
  createDeliveryUnavailableError,
  createRegistrationUnavailableError,
  createVerificationCodeExpiredError,
  createVerificationInvalidCodeError,
  createVerificationNotFoundOrInvalidatedError,
  createVerificationTooManyAttemptsError,
} from './errors.js'
import {
  buildLegalAcceptanceRecord,
  type RegistrationLegalDocumentVersions,
  type RegistrationLegalAcceptanceInput,
} from './legalAcceptance.js'
import {
  assertRegistrationCompletionReadyBeforeExpensiveWork,
  checkRegistrationCompletionReadiness,
  hashRegistrationContinuationToken,
  throwRegistrationCompletionFailure,
} from './completionReadiness.js'
import type { RegistrationRepository } from './repository.js'

const REGISTRATION_VERIFICATION_CODE_LENGTH = 6
const REGISTRATION_VERIFICATION_TTL_SECONDS = 15 * 60
const REGISTRATION_RESEND_COOLDOWN_SECONDS = 60
const REGISTRATION_CONTINUATION_TTL_SECONDS = 15 * 60
const REGISTRATION_PURPOSE = 'registration'

type CreateRegistrationServiceOptions = {
  authService: Pick<AuthService, 'issueSessionForUser'>
  chatwootClient: Pick<ChatwootClient, 'findContactByEmail'>
  emailDelivery: Pick<SmtpEmailDelivery, 'send'>
  legalDocumentsReader: {
    getActiveVersionsForRegistration(): Promise<RegistrationLegalDocumentVersions>
  }
  now?: () => Date
  portalUsersRepository: Pick<PortalUsersRepository, 'findByEmail'>
  registrationRepository: RegistrationRepository
  secretHasher?: typeof hashPassword
  supportContactReader: RegistrationSupportContactReader
  tenantId: number
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

export type RegistrationCompletedSession = {
  nextStep: 'chat'
  purpose: 'registration'
  result: 'registration_completed'
  session: {
    expiresAt: Date
  }
  sessionToken: string
  user: AuthenticatedPortalUser
}

function createRegistrationVerificationCode() {
  const code = randomInt(0, 10 ** REGISTRATION_VERIFICATION_CODE_LENGTH)

  return String(code).padStart(REGISTRATION_VERIFICATION_CODE_LENGTH, '0')
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

function buildRegistrationCompletedResponse({
  session,
  sessionToken,
  user,
}: {
  session: { expiresAt: Date }
  sessionToken: string
  user: AuthenticatedPortalUser
}): RegistrationCompletedSession {
  return {
    nextStep: 'chat',
    purpose: REGISTRATION_PURPOSE,
    result: 'registration_completed',
    session,
    sessionToken,
    user,
  }
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
  authService,
  chatwootClient,
  emailDelivery,
  legalDocumentsReader,
  now = () => new Date(),
  portalUsersRepository,
  registrationRepository,
  secretHasher = hashPassword,
  supportContactReader,
  tenantId,
}: CreateRegistrationServiceOptions) {
  async function completeRegistration({
    continuationToken,
    email,
    ipAddress,
    passwordHash,
    userAgent,
  }: {
    continuationToken: string
    email: string
    ipAddress?: string | null
    passwordHash: string | null
    userAgent?: string | null
  }): Promise<RegistrationCompletedSession> {
    const normalizedEmail = normalizeEmail(email)
    const normalizedContinuationToken = continuationToken.trim()
    const completedAt = now()

    try {
      const completionResult =
        await registrationRepository.transactionWithScopedLock(
          normalizedEmail,
          async (tx) => {
            const readiness = await checkRegistrationCompletionReadiness({
              completedAt,
              normalizedContinuationToken,
              normalizedEmail,
              registrationRepository,
              tx,
            })

            if (readiness.outcome !== 'ready') {
              return readiness
            }

            const createdUser = await registrationRepository.createPortalUser(
              {
                email: normalizedEmail,
                fullName: readiness.verifiedRecord.fullName,
                passwordHash,
              },
              tx,
            )

            if (!createdUser) {
              throw new Error(
                'Portal user could not be created during registration completion.',
              )
            }

            if (!readiness.verifiedRecord.chatwootContactId) {
              throw new Error(
                'Verified registration record is missing Chatwoot contact id.',
              )
            }

            await registrationRepository.createPortalUserContactLink(
              {
                chatwootContactId: readiness.verifiedRecord.chatwootContactId,
                userId: createdUser.id,
              },
              tx,
            )

            const linkedAcceptance =
              await registrationRepository.linkLatestRegistrationAcceptanceToUser(
                {
                  email: normalizedEmail,
                  portalUserId: createdUser.id,
                },
                tx,
              )

            if (!linkedAcceptance) {
              throw new Error(
                'Registration legal acceptance could not be linked to the created portal user.',
              )
            }

            const consumedRecord =
              await registrationRepository.consumeVerifiedVerification(
                readiness.verifiedRecord.id,
                completedAt,
                tx,
              )

            if (!consumedRecord) {
              return {
                outcome: 'not_found_or_consumed' as const,
              }
            }

            const issuedSession = await authService.issueSessionForUser({
              executor: tx,
              tenantId,
              user: createdUser,
              userId: createdUser.id,
              ...(ipAddress !== undefined ? { ipAddress } : {}),
              ...(userAgent !== undefined ? { userAgent } : {}),
            })

            return {
              outcome: 'completed' as const,
              response: buildRegistrationCompletedResponse(issuedSession),
            }
          },
        )

      if (completionResult.outcome !== 'completed') {
        throwRegistrationCompletionFailure(completionResult.outcome)
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
  }

  return {
    async requestVerification({
      email,
      fullName,
      legalAcceptance,
    }: {
      email: string
      fullName: string
      legalAcceptance: RegistrationLegalAcceptanceInput
    }): Promise<RegistrationVerificationRequestResult> {
      const normalizedEmail = normalizeEmail(email)
      const normalizedFullName = fullName.trim()
      const requestedAt = now()

      const existingPortalUser = await portalUsersRepository.findByEmail({
        email: normalizedEmail,
        tenantId,
      })

      if (existingPortalUser) {
        throw createAccountExistsError()
      }

      const legalVersions =
        await legalDocumentsReader.getActiveVersionsForRegistration()
      const legalAcceptanceRecord = buildLegalAcceptanceRecord({
        acceptedAt: requestedAt,
        email: normalizedEmail,
        legalAcceptance,
        legalVersions,
      })

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
              await registrationRepository.createLegalAcceptance(
                legalAcceptanceRecord,
                tx,
              )

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
        throw await createContactNotFoundError(supportContactReader)
      }

      const verificationCode = createRegistrationVerificationCode()
      const verificationCodeHash = await secretHasher(verificationCode)
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
                  await registrationRepository.createLegalAcceptance(
                    legalAcceptanceRecord,
                    tx,
                  )

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
          async (tx) => {
            await registrationRepository.createLegalAcceptance(
              legalAcceptanceRecord,
              tx,
            )

            return registrationRepository.markVerificationDeliverySucceeded(
              requestResult.pendingVerification.id,
              requestedAt,
              tx,
            )
          },
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
                    hashRegistrationContinuationToken(continuationToken),
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
      ipAddress,
      newPassword,
      userAgent,
    }: {
      continuationToken: string
      email: string
      ipAddress?: string | null
      newPassword: string
      userAgent?: string | null
    }): Promise<RegistrationCompletedSession> {
      assertValidPortalPassword(newPassword)
      await assertRegistrationCompletionReadyBeforeExpensiveWork({
        continuationToken,
        email,
        now,
        registrationRepository,
      })

      const passwordHash = await secretHasher(newPassword)

      return completeRegistration({
        continuationToken,
        email,
        passwordHash,
        ...(ipAddress !== undefined ? { ipAddress } : {}),
        ...(userAgent !== undefined ? { userAgent } : {}),
      })
    },

    async skipPassword({
      continuationToken,
      email,
      ipAddress,
      userAgent,
    }: {
      continuationToken: string
      email: string
      ipAddress?: string | null
      userAgent?: string | null
    }): Promise<RegistrationCompletedSession> {
      return completeRegistration({
        continuationToken,
        email,
        passwordHash: null,
        ...(ipAddress !== undefined ? { ipAddress } : {}),
        ...(userAgent !== undefined ? { userAgent } : {}),
      })
    },
  }
}

export type RegistrationService = ReturnType<typeof createRegistrationService>
