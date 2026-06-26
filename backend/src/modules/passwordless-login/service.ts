import { randomInt } from 'node:crypto'

import type { SmtpEmailDelivery } from '../../integrations/email/smtp.js'
import { normalizeEmail } from '../../lib/email.js'
import { ApiError } from '../../lib/errors.js'
import { hashPassword, verifyPassword } from '../../lib/password.js'
import type { AuthService, AuthenticatedPortalUser } from '../auth/service.js'
import { dispatchPasswordlessLoginEmail } from './delivery.js'
import {
  PASSWORDLESS_LOGIN_PURPOSE,
  type PasswordlessLoginRepository,
} from './repository.js'

const PASSWORDLESS_LOGIN_CODE_LENGTH = 6
const PASSWORDLESS_LOGIN_TTL_SECONDS = 15 * 60
const PASSWORDLESS_LOGIN_RESEND_COOLDOWN_SECONDS = 60

type CreatePasswordlessLoginServiceOptions = {
  authService: Pick<AuthService, 'issueSessionForUser'>
  emailDelivery: Pick<SmtpEmailDelivery, 'send'>
  now?: () => Date
  passwordlessLoginRepository: PasswordlessLoginRepository
  tenantId: number
}

type PasswordlessLoginRequestResult = {
  accepted: true
  email: string
  expiresInSeconds: number
  nextStep: 'verify_code'
  purpose: 'passwordless_login'
  resendAvailableInSeconds: number
  result: 'passwordless_login_requested'
}

type PasswordlessLoginCompletedSession = {
  nextStep: 'chat'
  purpose: 'passwordless_login'
  result: 'passwordless_login_completed'
  session: {
    expiresAt: Date
  }
  sessionToken: string
  user: AuthenticatedPortalUser
}

function createLoginCode() {
  return String(randomInt(0, 10 ** PASSWORDLESS_LOGIN_CODE_LENGTH)).padStart(
    PASSWORDLESS_LOGIN_CODE_LENGTH,
    '0',
  )
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
}): PasswordlessLoginRequestResult {
  return {
    accepted: true,
    email,
    expiresInSeconds: calculateSecondsUntil(expiresAt, now),
    nextStep: 'verify_code',
    purpose: PASSWORDLESS_LOGIN_PURPOSE,
    resendAvailableInSeconds: calculateSecondsUntil(resendNotBefore, now),
    result: 'passwordless_login_requested',
  }
}

function buildCompletedResponse({
  session,
  sessionToken,
  user,
}: Pick<
  PasswordlessLoginCompletedSession,
  'session' | 'sessionToken' | 'user'
>): PasswordlessLoginCompletedSession {
  return {
    nextStep: 'chat',
    purpose: PASSWORDLESS_LOGIN_PURPOSE,
    result: 'passwordless_login_completed',
    session,
    sessionToken,
    user,
  }
}

function createInvalidCodeError() {
  return new ApiError(
    400,
    'PASSWORDLESS_LOGIN_INVALID_CODE',
    'Неверный код входа. Проверьте код и попробуйте еще раз.',
  )
}

function createCodeExpiredError() {
  return new ApiError(
    410,
    'PASSWORDLESS_LOGIN_CODE_EXPIRED',
    'Срок действия кода входа истек. Запросите новый код.',
  )
}

function createTooManyAttemptsError() {
  return new ApiError(
    409,
    'PASSWORDLESS_LOGIN_TOO_MANY_ATTEMPTS',
    'Слишком много неверных попыток. Запросите новый код входа.',
  )
}

function createNotFoundOrInvalidatedError() {
  return new ApiError(
    409,
    'PASSWORDLESS_LOGIN_NOT_FOUND_OR_INVALIDATED',
    'Этот код входа больше недействителен. Запросите новый код.',
  )
}

export function createPasswordlessLoginService({
  authService,
  emailDelivery,
  now = () => new Date(),
  passwordlessLoginRepository,
  tenantId,
}: CreatePasswordlessLoginServiceOptions) {
  return {
    async requestLoginCode({
      email,
    }: {
      email: string
    }): Promise<PasswordlessLoginRequestResult> {
      const normalizedEmail = normalizeEmail(email)
      const requestedAt = now()

      const result =
        await passwordlessLoginRepository.transactionWithScopedLock(
          normalizedEmail,
          async (tx) => {
            const user =
              await passwordlessLoginRepository.findPortalUserByEmail(
                normalizedEmail,
                tx,
              )
            const activeUser = user?.isActive ? user : null
            const existingPendingLogin =
              await passwordlessLoginRepository.findLatestPendingLoginByEmail(
                normalizedEmail,
                tx,
              )

            if (existingPendingLogin) {
              const isExpired =
                existingPendingLogin.expiresAt.getTime() <=
                requestedAt.getTime()

              if (!isExpired) {
                const isResendLocked =
                  existingPendingLogin.resendNotBefore.getTime() >
                  requestedAt.getTime()

                if (isResendLocked) {
                  return {
                    loginCode: null,
                    loginRecord: existingPendingLogin,
                    previousPendingLogin: existingPendingLogin,
                    shouldSendEmail: false,
                  }
                }
              } else {
                await passwordlessLoginRepository.expireLoginRecord(
                  existingPendingLogin.id,
                  requestedAt,
                  tx,
                )
              }
            }

            const loginCode = createLoginCode()
            const codeHash = await hashPassword(loginCode)
            const expiresAt = new Date(
              requestedAt.getTime() + PASSWORDLESS_LOGIN_TTL_SECONDS * 1000,
            )
            const resendNotBefore = new Date(
              requestedAt.getTime() +
                PASSWORDLESS_LOGIN_RESEND_COOLDOWN_SECONDS * 1000,
            )
            const previousPendingLogin =
              existingPendingLogin &&
              existingPendingLogin.expiresAt.getTime() > requestedAt.getTime()
                ? existingPendingLogin
                : null
            const loginRecord = previousPendingLogin
              ? await passwordlessLoginRepository.replacePendingLogin(
                  {
                    codeHash,
                    expiresAt,
                    lastSentAt: requestedAt,
                    portalUserId: activeUser?.id ?? null,
                    recordId: previousPendingLogin.id,
                    resendCount: previousPendingLogin.resendCount + 1,
                    resendNotBefore,
                    updatedAt: requestedAt,
                  },
                  tx,
                )
              : await passwordlessLoginRepository.createPendingLogin(
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
              loginCode,
              loginRecord,
              previousPendingLogin,
              shouldSendEmail: Boolean(activeUser),
            }
          },
        )

      if (result.shouldSendEmail && result.loginCode) {
        dispatchPasswordlessLoginEmail({
          emailDelivery,
          loginCode: result.loginCode,
          loginRecord: result.loginRecord,
          normalizedEmail,
          passwordlessLoginRepository,
          previousPendingLogin: result.previousPendingLogin,
          requestedAt,
        })
      }

      return buildRequestResponse({
        email: normalizedEmail,
        expiresAt: result.loginRecord.expiresAt,
        now: requestedAt,
        resendNotBefore: result.loginRecord.resendNotBefore,
      })
    },

    async verifyLoginCode({
      code,
      email,
    }: {
      code: string
      email: string
    }): Promise<PasswordlessLoginCompletedSession> {
      const normalizedEmail = normalizeEmail(email)
      const submittedCode = code.trim()
      const verifiedAt = now()

      const verificationResult =
        await passwordlessLoginRepository.transactionWithScopedLock(
          normalizedEmail,
          async (tx) => {
            const pendingLogin =
              await passwordlessLoginRepository.findLatestPendingLoginByEmail(
                normalizedEmail,
                tx,
              )

            if (!pendingLogin) {
              const latestLogin =
                await passwordlessLoginRepository.findLatestLoginByEmail(
                  normalizedEmail,
                  tx,
                )

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
              const tooManyAttempts =
                attemptsCount >= pendingLogin.maxAttempts

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

            if (!pendingLogin.portalUserId) {
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
              executor: tx,
              tenantId,
              user,
              userId: user.id,
            })

            return {
              outcome: 'verified' as const,
              response: buildCompletedResponse(issuedSession),
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
  }
}

export type PasswordlessLoginService = ReturnType<
  typeof createPasswordlessLoginService
>
