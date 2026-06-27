import { createHash, randomBytes, randomInt } from 'node:crypto'

import { PASSWORDLESS_LOGIN_CODE_LENGTH } from './constants.js'

export function createContinuationToken() {
  return randomBytes(32).toString('base64url')
}

export function createLoginCode() {
  return String(randomInt(0, 10 ** PASSWORDLESS_LOGIN_CODE_LENGTH)).padStart(
    PASSWORDLESS_LOGIN_CODE_LENGTH,
    '0',
  )
}

export function hashContinuationToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
