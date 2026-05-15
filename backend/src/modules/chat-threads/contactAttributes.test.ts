import { describe, expect, it } from 'vitest'

import {
  assertPortalCompanyContactEnabled,
  assertPortalPersonContactEnabled,
  parsePortalCompanyContactIdsAttribute,
  parsePortalContactAttributes,
  PORTAL_COMPANY_CONTACT_IDS_MAX,
} from './contactAttributes.js'

function buildCompanyIds(count: number) {
  return Array.from({ length: count }, (_, index) => String(index + 1)).join(',')
}

describe('portal contact attributes', () => {
  it('parses enabled person contacts with deduplicated company contact IDs', () => {
    expect(
      parsePortalContactAttributes({
        portal_client_company_contact_ids: '154, 203,154, 203',
        portal_contact_type: 'person',
        portal_enabled: true,
      }),
    ).toEqual({
      companyContactIds: [154, 203],
      enabled: true,
      type: 'person',
    })
  })

  it('accepts the maximum company contact ID count', () => {
    expect(
      parsePortalCompanyContactIdsAttribute(
        buildCompanyIds(PORTAL_COMPANY_CONTACT_IDS_MAX),
      ),
    ).toHaveLength(PORTAL_COMPANY_CONTACT_IDS_MAX)
  })

  it('rejects malformed company contact IDs', () => {
    for (const value of [
      '154, bad',
      '154,,203',
      '154,0',
      '154,-1',
      '154,1.5',
      '154,9007199254740992',
      ['154', '203'],
    ]) {
      expect(() => parsePortalCompanyContactIdsAttribute(value)).toThrowError(
        expect.objectContaining({
          code: 'portal_client_company_contact_ids_invalid',
          statusCode: 403,
        }),
      )
    }
  })

  it('rejects oversized company contact ID lists before Chatwoot lookups', () => {
    expect(() =>
      parsePortalCompanyContactIdsAttribute(
        buildCompanyIds(PORTAL_COMPANY_CONTACT_IDS_MAX + 1),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'portal_client_company_contact_ids_invalid',
        statusCode: 403,
      }),
    )
  })

  it('parses enabled company contacts without memberships', () => {
    expect(
      parsePortalContactAttributes({
        portal_client_company_contact_ids: '',
        portal_contact_type: 'company',
        portal_enabled: true,
      }),
    ).toEqual({
      companyContactIds: [],
      enabled: true,
      type: 'company',
    })
  })

  it('requires person contacts to be portal enabled', () => {
    expect(() =>
      assertPortalPersonContactEnabled({
        customAttributes: {
          portal_contact_type: 'company',
          portal_enabled: true,
        },
        id: 154,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'portal_contact_type_invalid',
        statusCode: 403,
      }),
    )

    expect(() =>
      assertPortalPersonContactEnabled({
        customAttributes: {
          portal_contact_type: 'person',
          portal_enabled: false,
        },
        id: 155,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'portal_contact_disabled',
        statusCode: 403,
      }),
    )
  })

  it('requires company contacts to be portal enabled companies', () => {
    expect(() =>
      assertPortalCompanyContactEnabled({
        customAttributes: {
          portal_contact_type: 'person',
          portal_enabled: true,
        },
        id: 44,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'portal_company_contact_type_invalid',
        statusCode: 403,
      }),
    )

    expect(() =>
      assertPortalCompanyContactEnabled({
        customAttributes: {
          portal_contact_type: 'company',
          portal_enabled: false,
        },
        id: 154,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'portal_company_contact_disabled',
        statusCode: 403,
      }),
    )
  })
})
