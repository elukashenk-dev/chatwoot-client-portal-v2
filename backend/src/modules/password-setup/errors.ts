import {
  SmtpEmailDeliveryConfigurationError,
  SmtpEmailDeliveryError,
} from '../../integrations/email/smtp.js'
import { ApiError } from '../../lib/errors.js'

export function createInvalidCodeError() {
  return new ApiError(
    400,
    'PASSWORD_SETUP_INVALID_CODE',
    'Неверный код подтверждения. Проверьте код и попробуйте еще раз.',
  )
}

export function createCodeExpiredError() {
  return new ApiError(
    410,
    'PASSWORD_SETUP_CODE_EXPIRED',
    'Срок действия кода подтверждения истек. Запросите новый код.',
  )
}

export function createTooManyAttemptsError() {
  return new ApiError(
    409,
    'PASSWORD_SETUP_TOO_MANY_ATTEMPTS',
    'Слишком много неверных попыток. Запросите новый код подтверждения.',
  )
}

export function createNotFoundOrInvalidatedError() {
  return new ApiError(
    409,
    'PASSWORD_SETUP_NOT_FOUND_OR_INVALIDATED',
    'Этот код подтверждения больше недействителен. Запросите новый код.',
  )
}

export function createVerificationRequiredError() {
  return new ApiError(
    409,
    'PASSWORD_SETUP_VERIFICATION_REQUIRED',
    'Сначала снова подтвердите email, прежде чем задавать пароль.',
  )
}

export function createContinuationInvalidError() {
  return new ApiError(
    409,
    'PASSWORD_SETUP_CONTINUATION_INVALID',
    'Подтверждение создания пароля больше недействительно. Запросите новый код и попробуйте еще раз.',
  )
}

export function createPasswordAlreadySetError() {
  return new ApiError(409, 'PASSWORD_ALREADY_SET', 'Пароль уже задан.')
}

export function createUnauthorizedError() {
  return new ApiError(401, 'UNAUTHORIZED', 'Требуется вход.')
}

export function createDeliveryUnavailableError() {
  return new ApiError(
    503,
    'PASSWORD_SETUP_DELIVERY_UNAVAILABLE',
    'Мы не смогли отправить код подтверждения. Попробуйте чуть позже.',
  )
}

export function isDeliveryConfigurationError(error: unknown) {
  return (
    error instanceof SmtpEmailDeliveryConfigurationError ||
    error instanceof SmtpEmailDeliveryError
  )
}
