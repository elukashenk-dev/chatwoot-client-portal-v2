import { ApiError } from '../../lib/errors.js'

export function createRegistrationUnavailableError() {
  return new ApiError(
    503,
    'REGISTRATION_UNAVAILABLE',
    'Регистрация сейчас недоступна. Попробуйте позже.',
  )
}

export function createChatwootUnavailableError() {
  return new ApiError(
    502,
    'CHATWOOT_UNAVAILABLE',
    'Мы не смогли проверить доступ через Chatwoot. Попробуйте чуть позже.',
  )
}

export function createDeliveryUnavailableError() {
  return new ApiError(
    503,
    'REGISTRATION_DELIVERY_UNAVAILABLE',
    'Мы не смогли отправить код подтверждения. Попробуйте чуть позже.',
  )
}

export function createDeliveryInProgressError() {
  return new ApiError(
    409,
    'REGISTRATION_DELIVERY_IN_PROGRESS',
    'Код подтверждения уже отправляется. Подождите немного и попробуйте снова.',
  )
}

export function createVerificationInvalidCodeError() {
  return new ApiError(
    400,
    'REGISTRATION_VERIFICATION_INVALID_CODE',
    'Неверный код подтверждения. Проверьте код и попробуйте еще раз.',
  )
}

export function createVerificationCodeExpiredError() {
  return new ApiError(
    410,
    'REGISTRATION_VERIFICATION_CODE_EXPIRED',
    'Срок действия кода подтверждения истек. Запросите новый код.',
  )
}

export function createVerificationTooManyAttemptsError() {
  return new ApiError(
    409,
    'REGISTRATION_VERIFICATION_TOO_MANY_ATTEMPTS',
    'Слишком много неверных попыток. Запросите новый код подтверждения.',
  )
}

export function createVerificationNotFoundOrInvalidatedError() {
  return new ApiError(
    409,
    'REGISTRATION_VERIFICATION_NOT_FOUND_OR_INVALIDATED',
    'Этот код подтверждения больше недействителен. Запросите новый код.',
  )
}

export function createVerificationRequiredError() {
  return new ApiError(
    409,
    'REGISTRATION_VERIFICATION_REQUIRED',
    'Сначала снова подтвердите email, прежде чем задавать пароль.',
  )
}

export function createVerificationContinuationInvalidError() {
  return new ApiError(
    409,
    'REGISTRATION_VERIFICATION_CONTINUATION_INVALID',
    'Подтверждение регистрации больше недействительно. Запросите новый код и попробуйте еще раз.',
  )
}

export function createAccountExistsError() {
  return new ApiError(
    409,
    'REGISTRATION_ACCOUNT_EXISTS',
    'Для этого email уже создан аккаунт. Войдите или используйте восстановление пароля.',
  )
}
