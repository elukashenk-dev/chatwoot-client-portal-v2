import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const tenantSecretAlgorithm = 'aes-256-gcm'
const tenantSecretVersion = 'v1'
const tenantSecretIvBytes = 12
const tenantSecretTagBytes = 16
const tenantSecretAad = Buffer.from(
  'chatwoot-client-portal-v2:tenant-secret:v1',
)

export class TenantSecretKeyError extends Error {
  constructor(message: string) {
    super(message)

    this.name = 'TenantSecretKeyError'
  }
}

export class TenantSecretCiphertextError extends Error {
  constructor(message: string) {
    super(message)

    this.name = 'TenantSecretCiphertextError'
  }
}

function toBase64Url(value: Buffer) {
  return value.toString('base64url')
}

function fromBase64Url(value: string, fieldName: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new TenantSecretCiphertextError(
      `Tenant secret ${fieldName} is not valid base64url.`,
    )
  }

  try {
    return Buffer.from(value, 'base64url')
  } catch {
    throw new TenantSecretCiphertextError(
      `Tenant secret ${fieldName} is not valid base64url.`,
    )
  }
}

function normalizeBase64SecretKey(rawKey: string) {
  const trimmedKey = rawKey.trim()
  const unprefixedKey = trimmedKey.startsWith('base64:')
    ? trimmedKey.slice('base64:'.length)
    : trimmedKey
  const base64Key = unprefixedKey.replace(/-/g, '+').replace(/_/g, '/')

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Key)) {
    throw new TenantSecretKeyError(
      'PORTAL_TENANT_SECRET_KEY must be a base64-encoded 32-byte key.',
    )
  }

  if (base64Key.length % 4 === 1) {
    throw new TenantSecretKeyError(
      'PORTAL_TENANT_SECRET_KEY must be valid base64.',
    )
  }

  return base64Key.padEnd(Math.ceil(base64Key.length / 4) * 4, '=')
}

export function decodeTenantSecretKey(rawKey: string) {
  const key = Buffer.from(normalizeBase64SecretKey(rawKey), 'base64')

  if (key.length !== 32) {
    throw new TenantSecretKeyError(
      'PORTAL_TENANT_SECRET_KEY must decode to exactly 32 bytes.',
    )
  }

  return key
}

export function encryptTenantSecret(plaintext: string, key: Buffer) {
  if (!plaintext) {
    throw new TenantSecretCiphertextError(
      'Tenant secret plaintext is required.',
    )
  }

  if (key.length !== 32) {
    throw new TenantSecretKeyError('Tenant secret key must be 32 bytes.')
  }

  const iv = randomBytes(tenantSecretIvBytes)
  const cipher = createCipheriv(tenantSecretAlgorithm, key, iv, {
    authTagLength: tenantSecretTagBytes,
  })

  cipher.setAAD(tenantSecretAad)

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    tenantSecretVersion,
    toBase64Url(iv),
    toBase64Url(authTag),
    toBase64Url(ciphertext),
  ].join(':')
}

export function decryptTenantSecret(ciphertextValue: string, key: Buffer) {
  if (key.length !== 32) {
    throw new TenantSecretKeyError('Tenant secret key must be 32 bytes.')
  }

  const [version, encodedIv, encodedAuthTag, encodedCiphertext, extraPart] =
    ciphertextValue.split(':')

  if (
    version !== tenantSecretVersion ||
    !encodedIv ||
    !encodedAuthTag ||
    !encodedCiphertext ||
    extraPart !== undefined
  ) {
    throw new TenantSecretCiphertextError(
      'Tenant secret ciphertext has an unsupported format.',
    )
  }

  const iv = fromBase64Url(encodedIv, 'iv')
  const authTag = fromBase64Url(encodedAuthTag, 'auth tag')
  const ciphertext = fromBase64Url(encodedCiphertext, 'ciphertext')

  if (iv.length !== tenantSecretIvBytes) {
    throw new TenantSecretCiphertextError(
      'Tenant secret ciphertext uses an invalid iv length.',
    )
  }

  if (authTag.length !== tenantSecretTagBytes) {
    throw new TenantSecretCiphertextError(
      'Tenant secret ciphertext uses an invalid auth tag length.',
    )
  }

  const decipher = createDecipheriv(tenantSecretAlgorithm, key, iv, {
    authTagLength: tenantSecretTagBytes,
  })

  decipher.setAAD(tenantSecretAad)
  decipher.setAuthTag(authTag)

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8')
}
