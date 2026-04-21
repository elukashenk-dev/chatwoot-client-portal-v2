import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const SCRYPT_KEY_LENGTH = 64
const scrypt = promisify(scryptCallback)

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const key = (await scrypt(password, salt, SCRYPT_KEY_LENGTH)) as Buffer

  return `scrypt:${salt}:${key.toString('hex')}`
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, keyHex] = storedHash.split(':')

  if (algorithm !== 'scrypt' || !salt || !keyHex) {
    return false
  }

  const storedKey = Buffer.from(keyHex, 'hex')
  const candidateKey = (await scrypt(password, salt, storedKey.length)) as Buffer

  if (storedKey.length !== candidateKey.length) {
    return false
  }

  return timingSafeEqual(storedKey, candidateKey)
}
