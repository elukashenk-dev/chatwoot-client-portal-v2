import { createHash, randomBytes, randomInt } from 'node:crypto'

import type { EmailMessage } from '../../integrations/email/smtp.js'
import {
  SmtpEmailDeliveryConfigurationError,
  SmtpEmailDeliveryError,
} from '../../integrations/email/smtp.js'
import { normalizeEmail } from '../../lib/email.js'
import { ApiError } from '../../lib/errors.js'

export const ADMIN_LOGIN_CHALLENGE_TTL_SECONDS = 15 * 60
export const ADMIN_LOGIN_RESEND_COOLDOWN_SECONDS = 60
export const ADMIN_SESSION_TTL_HOURS = 12
export const ADMIN_LOGIN_PURPOSE = 'tenant_admin_login'

const ADMIN_LOGIN_CODE_LENGTH = 6

export type PublicTenantAdmin = {
  chatwootAgentId: number
  email: string
  role: 'administrator'
}

export type PublicTenantAdminSession = {
  admin: PublicTenantAdmin
  expiresAt: Date
}

export function createAdminLoginCode() {
  return String(randomInt(0, 10 ** ADMIN_LOGIN_CODE_LENGTH)).padStart(
    ADMIN_LOGIN_CODE_LENGTH,
    '0',
  )
}

export function createAdminSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashValue(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function calculateSecondsUntil(target: Date, now: Date) {
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 1000))
}

export function buildAdminLoginEmail({ code }: { code: string }): EmailMessage {
  return {
    subject: 'Код входа администратора Client Portal',
    text: [
      'Ваш код входа администратора Client Portal:',
      '',
      code,
      '',
      'Код действует 15 минут.',
      'Если вы не запрашивали вход администратора, просто проигнорируйте это письмо.',
    ].join('\n'),
    to: '',
  }
}

export function toPublicAdmin(challenge: {
  chatwootAgentId: number
  email: string
}): PublicTenantAdmin {
  return {
    chatwootAgentId: challenge.chatwootAgentId,
    email: normalizeEmail(challenge.email),
    role: 'administrator',
  }
}

export function toPublicAdminSession(session: {
  admin: {
    chatwootAgentId: number
    email: string
    role: string
  }
  expiresAt: Date
}): PublicTenantAdminSession {
  return {
    admin: {
      chatwootAgentId: session.admin.chatwootAgentId,
      email: normalizeEmail(session.admin.email),
      role: 'administrator',
    },
    expiresAt: session.expiresAt,
  }
}

export function createNotEligibleError() {
  return new ApiError(
    403,
    'TENANT_ADMIN_NOT_ELIGIBLE',
    'Нет прав администратора для этого портала.',
  )
}

export function createVerificationUnavailableError() {
  return new ApiError(
    503,
    'TENANT_ADMIN_VERIFICATION_UNAVAILABLE',
    'Админ-вход сейчас недоступен. Попробуйте позже.',
  )
}

export function createDeliveryUnavailableError() {
  return new ApiError(
    503,
    'TENANT_ADMIN_DELIVERY_UNAVAILABLE',
    'Мы не смогли отправить код входа. Попробуйте чуть позже.',
  )
}

export function createDeliveryInProgressError() {
  return new ApiError(
    409,
    'TENANT_ADMIN_DELIVERY_IN_PROGRESS',
    'Код входа уже отправляется. Подождите немного и попробуйте снова.',
  )
}

export function createInvalidCodeError() {
  return new ApiError(
    400,
    'TENANT_ADMIN_INVALID_CODE',
    'Неверный код входа. Проверьте код и попробуйте еще раз.',
  )
}

export function createCodeExpiredError() {
  return new ApiError(
    410,
    'TENANT_ADMIN_CODE_EXPIRED',
    'Срок действия кода входа истек. Запросите новый код.',
  )
}

export function createTooManyAttemptsError() {
  return new ApiError(
    409,
    'TENANT_ADMIN_TOO_MANY_ATTEMPTS',
    'Слишком много неверных попыток. Запросите новый код входа.',
  )
}

export function createChallengeNotFoundOrInvalidatedError() {
  return new ApiError(
    409,
    'TENANT_ADMIN_CHALLENGE_NOT_FOUND_OR_INVALIDATED',
    'Этот код входа больше недействителен. Запросите новый код.',
  )
}

export function mapVerificationResultToError(result: string) {
  if (
    result === 'not_configured' ||
    result === 'invalid_token_secret' ||
    result === 'chatwoot_permission_denied'
  ) {
    return createVerificationUnavailableError()
  }

  return createNotEligibleError()
}

export function shouldTreatAsDeliveryUnavailable(error: unknown) {
  return (
    error instanceof SmtpEmailDeliveryConfigurationError ||
    error instanceof SmtpEmailDeliveryError
  )
}

export function buildChallengeRequestedResponse({
  challenge,
  delivery,
  now,
}: {
  challenge: {
    email: string
    expiresAt: Date
    resendNotBefore: Date
  }
  delivery: 'sent' | 'existing_pending'
  now: Date
}) {
  return {
    delivery,
    email: normalizeEmail(challenge.email),
    expiresInSeconds: calculateSecondsUntil(challenge.expiresAt, now),
    nextStep: 'verify_code' as const,
    purpose: ADMIN_LOGIN_PURPOSE,
    resendAvailableInSeconds: calculateSecondsUntil(
      challenge.resendNotBefore,
      now,
    ),
    result: 'admin_login_challenge_requested' as const,
  }
}
