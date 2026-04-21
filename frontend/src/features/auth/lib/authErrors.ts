import { ApiClientError } from '../api/authClient'

const DEFAULT_REQUEST_ERROR_MESSAGE =
  'Мы не смогли выполнить запрос. Попробуйте еще раз чуть позже.'

export function getAuthRequestErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message
  }

  return DEFAULT_REQUEST_ERROR_MESSAGE
}
