import { describe, expect, it } from 'vitest'

import {
  decodeTenantSecretKey,
  decryptTenantSecret,
  encryptTenantSecret,
  TenantSecretCiphertextError,
  TenantSecretKeyError,
} from './secrets.js'

const tenantSecretKey = Buffer.alloc(32, 7).toString('base64')

describe('tenant secret encryption', () => {
  it('encrypts and decrypts tenant secrets with authenticated ciphertext', () => {
    const key = decodeTenantSecretKey(tenantSecretKey)
    const ciphertext = encryptTenantSecret('chatwoot-runtime-token', key)

    expect(ciphertext).toMatch(/^v1:/)
    expect(ciphertext).not.toContain('chatwoot-runtime-token')
    expect(decryptTenantSecret(ciphertext, key)).toBe('chatwoot-runtime-token')
  })

  it('uses a random iv for every encryption', () => {
    const key = decodeTenantSecretKey(tenantSecretKey)
    const firstCiphertext = encryptTenantSecret('same-secret', key)
    const secondCiphertext = encryptTenantSecret('same-secret', key)

    expect(firstCiphertext).not.toBe(secondCiphertext)
  })

  it('rejects invalid keys and tampered ciphertext', () => {
    const key = decodeTenantSecretKey(tenantSecretKey)
    const otherKey = Buffer.alloc(32, 9)
    const ciphertext = encryptTenantSecret('chatwoot-webhook-secret', key)
    const ciphertextParts = ciphertext.split(':')
    const encodedCiphertext = ciphertextParts[3] ?? ''
    const tamperedCiphertextBytes = Buffer.from(encodedCiphertext, 'base64url')
    tamperedCiphertextBytes[0] ^= 0xff
    ciphertextParts[3] = tamperedCiphertextBytes.toString('base64url')
    const tamperedCiphertext = ciphertextParts.join(':')

    expect(() => decodeTenantSecretKey('not-base64')).toThrow(
      TenantSecretKeyError,
    )
    expect(() => decryptTenantSecret(tamperedCiphertext, key)).toThrow()
    expect(() => decryptTenantSecret(ciphertext, otherKey)).toThrow()
    expect(() => decryptTenantSecret('v0:bad', key)).toThrow(
      TenantSecretCiphertextError,
    )
  })
})
