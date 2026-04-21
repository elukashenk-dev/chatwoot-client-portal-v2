import { isValidEmail } from '../../../shared/lib/validation'
import type { LoginFormErrors, LoginFormValues } from '../types'

export function validateLoginForm(values: LoginFormValues): LoginFormErrors {
  const nextErrors: LoginFormErrors = {}
  const email = values.email.trim()
  const password = values.password.trim()

  if (!email) {
    nextErrors.email = 'Введите email'
  } else if (!isValidEmail(email)) {
    nextErrors.email = 'Введите email в корректном формате'
  }

  if (!password) {
    nextErrors.password = 'Введите пароль'
  }

  return nextErrors
}
