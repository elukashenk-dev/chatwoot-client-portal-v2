import { describe, expect, it } from 'vitest'

import {
  maskPhoneForLogs,
  normalizePhoneToE164,
  normalizeRussianPhoneToE164,
} from './phone.js'

describe('phone normalization helpers', () => {
  it('normalizes Russian local mobile numbers to E.164', () => {
    expect(normalizePhoneToE164('89161234567')).toBe('+79161234567')
    expect(normalizePhoneToE164('7 916 123-45-67')).toBe('+79161234567')
    expect(normalizePhoneToE164('+7 (916) 123-45-67')).toBe('+79161234567')
  })

  it('preserves explicit valid non-Russian international numbers', () => {
    expect(normalizePhoneToE164('+44 20 7183 8750')).toBe('+442071838750')
  })

  it('rejects empty, malformed, and implicit non-Russian values', () => {
    expect(normalizePhoneToE164('')).toBeNull()
    expect(normalizePhoneToE164(null)).toBeNull()
    expect(normalizePhoneToE164('not a phone')).toBeNull()
    expect(normalizePhoneToE164('+12345')).toBeNull()
    expect(normalizePhoneToE164('442071838750')).toBeNull()
  })

  it('exposes a Russian-only wrapper for future SMS fallback', () => {
    expect(normalizeRussianPhoneToE164('89161234567')).toBe('+79161234567')
    expect(normalizeRussianPhoneToE164('+44 20 7183 8750')).toBeNull()
  })

  it('masks phone numbers without exposing the full original value', () => {
    const masked = maskPhoneForLogs('+7 (916) 123-45-67')

    expect(masked).toMatch(/^\+79/)
    expect(masked).toMatch(/567$/)
    expect(masked).not.toContain('79161234567')
    expect(maskPhoneForLogs('invalid')).toBe('[invalid-phone]')
  })
})
