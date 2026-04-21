import { isValidEmail } from '../../../shared/lib/validation'
import type {
  PasswordResetRequestFormErrors,
  PasswordResetRequestFormValues,
} from '../types'

export function validatePasswordResetRequestForm(
  values: PasswordResetRequestFormValues,
): PasswordResetRequestFormErrors {
  const nextErrors: PasswordResetRequestFormErrors = {}
  const email = values.email.trim()

  if (!email) {
    nextErrors.email = 'Введите email'
  } else if (!isValidEmail(email)) {
    nextErrors.email = 'Введите email в корректном формате'
  }

  return nextErrors
}
