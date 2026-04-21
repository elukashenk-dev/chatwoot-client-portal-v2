export function getPasswordRuleStates(
  password: string,
  confirmPassword: string,
) {
  const trimmedPassword = password.trim()

  return {
    hasLength: trimmedPassword.length >= 8,
    hasLetter: /[A-Za-zА-Яа-яЁё]/.test(password),
    hasNumber: /\d/.test(password),
    matches: password.length > 0 && password === confirmPassword,
  }
}
