import { describe, expect, it } from 'vitest'

import {
  createSupportContact,
  isValidSupportPhoneDisplay,
} from './supportPhone.js'

describe('support phone helpers', () => {
  it('normalizes configured support phone to a tel href', () => {
    expect(createSupportContact('+7 (846) 211-11-11')).toEqual({
      phoneDisplay: '+7 (846) 211-11-11',
      phoneHref: 'tel:+78462111111',
    })
  })

  it('treats empty support phone as missing contact metadata', () => {
    expect(createSupportContact('')).toEqual({
      phoneDisplay: null,
      phoneHref: null,
    })
  })

  it('rejects values that cannot produce a valid tel href', () => {
    expect(isValidSupportPhoneDisplay('846 211')).toBe(false)
  })
})
