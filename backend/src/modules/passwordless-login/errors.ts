import { ApiError } from '../../lib/errors.js'

export function createCodeExpiredError() {
  return new ApiError(
    410,
    'PASSWORDLESS_LOGIN_CODE_EXPIRED',
    'Срок действия кода входа истек. Запросите новый код.',
  )
}

export function createInvalidCodeError() {
  return new ApiError(
    400,
    'PASSWORDLESS_LOGIN_INVALID_CODE',
    'Неверный код входа. Проверьте код и попробуйте еще раз.',
  )
}

export function createLegalAcceptanceRequiredError() {
  return new ApiError(
    400,
    'PASSWORDLESS_LOGIN_LEGAL_ACCEPTANCE_REQUIRED',
    'Чтобы продолжить, подтвердите согласие с документами сервиса.',
  )
}

export function createLegalDocumentsNotConfiguredError() {
  return new ApiError(
    503,
    'LEGAL_DOCUMENTS_NOT_CONFIGURED',
    'Вход временно недоступен: юридические документы еще не загружены.',
  )
}

export function createNotFoundOrInvalidatedError() {
  return new ApiError(
    409,
    'PASSWORDLESS_LOGIN_NOT_FOUND_OR_INVALIDATED',
    'Этот код входа больше недействителен. Запросите новый код.',
  )
}

export function createTooManyAttemptsError() {
  return new ApiError(
    409,
    'PASSWORDLESS_LOGIN_TOO_MANY_ATTEMPTS',
    'Слишком много неверных попыток. Запросите новый код входа.',
  )
}
