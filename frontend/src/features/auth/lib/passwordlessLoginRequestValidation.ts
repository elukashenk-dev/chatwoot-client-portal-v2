import { isValidEmail } from '../../../shared/lib/validation'
import type {
  PasswordlessLoginRequestFormErrors,
  PasswordlessLoginRequestFormValues,
} from '../types'

export function validatePasswordlessLoginRequestForm(
  values: PasswordlessLoginRequestFormValues,
): PasswordlessLoginRequestFormErrors {
  const nextErrors: PasswordlessLoginRequestFormErrors = {}
  const email = values.email.trim()

  if (!email) {
    nextErrors.email = 'Введите email'
  } else if (!isValidEmail(email)) {
    nextErrors.email = 'Проверьте формат email'
  }

  return nextErrors
}
