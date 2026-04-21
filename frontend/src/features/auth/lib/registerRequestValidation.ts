import { isValidEmail } from '../../../shared/lib/validation'
import type { RegisterRequestFormErrors, RegisterRequestFormValues } from '../types'

export function validateRegisterRequestForm(
  values: RegisterRequestFormValues,
): RegisterRequestFormErrors {
  const nextErrors: RegisterRequestFormErrors = {}
  const fullName = values.fullName.trim()
  const email = values.email.trim()

  if (!fullName) {
    nextErrors.fullName = 'Введите имя'
  }

  if (!email) {
    nextErrors.email = 'Введите email'
  } else if (!isValidEmail(email)) {
    nextErrors.email = 'Введите email в корректном формате'
  }

  return nextErrors
}
