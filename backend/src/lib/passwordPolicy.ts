import { z } from 'zod'

import { ApiError } from './errors.js'

export const PORTAL_PASSWORD_MIN_LENGTH = 8
export const PORTAL_PASSWORD_LETTER_PATTERN = /[A-Za-zА-Яа-яЁё]/
export const PORTAL_PASSWORD_NUMBER_PATTERN = /\d/
export const PORTAL_PASSWORD_POLICY_MESSAGE =
  'Пароль должен содержать не менее 8 символов, букву и цифру.'

export const portalPasswordSchema = z
  .string()
  .min(
    PORTAL_PASSWORD_MIN_LENGTH,
    'Пароль должен содержать не менее 8 символов',
  )
  .regex(PORTAL_PASSWORD_LETTER_PATTERN, 'Пароль должен содержать букву')
  .regex(PORTAL_PASSWORD_NUMBER_PATTERN, 'Пароль должен содержать цифру')

export function isValidPortalPassword(password: string) {
  return (
    password.trim().length >= PORTAL_PASSWORD_MIN_LENGTH &&
    PORTAL_PASSWORD_LETTER_PATTERN.test(password) &&
    PORTAL_PASSWORD_NUMBER_PATTERN.test(password)
  )
}

export function assertValidPortalPassword(password: string) {
  if (isValidPortalPassword(password)) {
    return
  }

  throw new ApiError(400, 'INVALID_REQUEST', PORTAL_PASSWORD_POLICY_MESSAGE)
}
