import type {
  PasswordSetupFormErrors,
  PasswordSetupFormValues,
} from '../types'

export function validatePasswordSetupForm(
  values: PasswordSetupFormValues,
): PasswordSetupFormErrors {
  const errors: PasswordSetupFormErrors = {}
  const hasLength = values.newPassword.trim().length >= 8
  const hasLetter = /[A-Za-zА-Яа-яЁё]/.test(values.newPassword)
  const hasNumber = /\d/.test(values.newPassword)

  if (!values.newPassword) {
    errors.newPassword = 'Введите новый пароль'
  } else if (!hasLength || !hasLetter || !hasNumber) {
    errors.newPassword = 'Пароль не соответствует требованиям'
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = 'Повторите пароль'
  } else if (values.newPassword !== values.confirmPassword) {
    errors.confirmPassword = 'Пароли не совпадают'
  }

  return errors
}
