import { describe, expect, it } from 'vitest'

import { normalizeTenantHost, TenantHostValidationError } from './service.js'

describe('normalizeTenantHost', () => {
  it('normalizes host casing, ports and trailing dots', () => {
    expect(normalizeTenantHost(' LK.BUHFIRMA.RU:443. ')).toBe('lk.buhfirma.ru')
    expect(normalizeTenantHost('clinic.127.0.0.1.nip.io:5173')).toBe(
      'clinic.127.0.0.1.nip.io',
    )
    expect(normalizeTenantHost('LOCALHOST:3301')).toBe('localhost')
  })

  it('rejects host values that include protocol, path or unsupported syntax', () => {
    expect(() => normalizeTenantHost('https://lk.example.com')).toThrow(
      TenantHostValidationError,
    )
    expect(() => normalizeTenantHost('lk.example.com/path')).toThrow(
      TenantHostValidationError,
    )
    expect(() => normalizeTenantHost('[::1]:3301')).toThrow(
      TenantHostValidationError,
    )
  })
})
