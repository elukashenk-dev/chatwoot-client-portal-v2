import type { RegisterVerifyFormErrors, RegisterVerifyFormValues } from '../types'

export function validateRegisterVerifyForm(
  values: RegisterVerifyFormValues,
): RegisterVerifyFormErrors {
  const errors: RegisterVerifyFormErrors = {}
  const normalizedCode = values.code.trim()

  if (!normalizedCode) {
    errors.code = 'Введите код подтверждения'
  } else if (!/^\d{6}$/.test(normalizedCode)) {
    errors.code = 'Введите код из 6 цифр'
  }

  return errors
}
