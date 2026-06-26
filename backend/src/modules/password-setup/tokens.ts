import { createHash, randomBytes, randomInt } from 'node:crypto'

export const PASSWORD_SETUP_CODE_LENGTH = 6
export const PASSWORD_SETUP_TTL_SECONDS = 15 * 60
export const PASSWORD_SETUP_RESEND_COOLDOWN_SECONDS = 60
export const PASSWORD_SETUP_CONTINUATION_TTL_SECONDS = 15 * 60

export function createSetupCode() {
  return String(randomInt(0, 10 ** PASSWORD_SETUP_CODE_LENGTH)).padStart(
    PASSWORD_SETUP_CODE_LENGTH,
    '0',
  )
}

export function createContinuationToken() {
  return randomBytes(32).toString('base64url')
}

export function hashContinuationToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function verifyContinuationToken({
  providedToken,
  storedTokenHash,
}: {
  providedToken: string
  storedTokenHash: string | null
}) {
  return Boolean(
    storedTokenHash && hashContinuationToken(providedToken) === storedTokenHash,
  )
}
