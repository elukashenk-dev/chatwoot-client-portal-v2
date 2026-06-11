import { describe, expect, it } from 'vitest'

import {
  assertPortalGroupContactEnabled,
  assertPortalPersonContactEnabled,
  parsePortalGroupContactIdsAttribute,
  parsePortalContactAttributes,
  PORTAL_GROUP_CONTACT_IDS_MAX,
} from './contactAttributes.js'

function buildGroupIds(count: number) {
  return Array.from({ length: count }, (_, index) => String(index + 1)).join(
    ',',
  )
}

describe('portal contact attributes', () => {
  it('parses enabled person contacts with deduplicated group contact IDs', () => {
    expect(
      parsePortalContactAttributes({
        portal_client_group_contact_ids: '154, 203,154, 203',
        portal_contact_type: 'person',
        portal_enabled: true,
      }),
    ).toEqual({
      groupContactIds: [154, 203],
      enabled: true,
      type: 'person',
    })
  })

  it('accepts the maximum group contact ID count', () => {
    expect(
      parsePortalGroupContactIdsAttribute(
        buildGroupIds(PORTAL_GROUP_CONTACT_IDS_MAX),
      ),
    ).toHaveLength(PORTAL_GROUP_CONTACT_IDS_MAX)
  })

  it('rejects malformed group contact IDs', () => {
    for (const value of [
      '154, bad',
      '154,,203',
      '154,0',
      '154,-1',
      '154,1.5',
      '154,9007199254740992',
      ['154', '203'],
    ]) {
      expect(() => parsePortalGroupContactIdsAttribute(value)).toThrowError(
        expect.objectContaining({
          code: 'portal_client_group_contact_ids_invalid',
          statusCode: 403,
        }),
      )
    }
  })

  it('rejects oversized group contact ID lists before Chatwoot lookups', () => {
    expect(() =>
      parsePortalGroupContactIdsAttribute(
        buildGroupIds(PORTAL_GROUP_CONTACT_IDS_MAX + 1),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'portal_client_group_contact_ids_invalid',
        statusCode: 403,
      }),
    )
  })

  it('parses enabled group contacts without memberships', () => {
    expect(
      parsePortalContactAttributes({
        portal_client_group_contact_ids: '',
        portal_contact_type: 'group',
        portal_enabled: true,
      }),
    ).toEqual({
      groupContactIds: [],
      enabled: true,
      type: 'group',
    })
  })

  it('rejects retired company contact type values', () => {
    expect(() =>
      parsePortalContactAttributes({
        portal_client_group_contact_ids: '',
        portal_contact_type: 'company',
        portal_enabled: true,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'portal_contact_type_invalid',
        statusCode: 403,
      }),
    )
  })

  it('requires person contacts to be portal enabled', () => {
    expect(() =>
      assertPortalPersonContactEnabled({
        customAttributes: {
          portal_contact_type: 'group',
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

  it('requires group contacts to be portal enabled groups', () => {
    expect(() =>
      assertPortalGroupContactEnabled({
        customAttributes: {
          portal_contact_type: 'person',
          portal_enabled: true,
        },
        id: 44,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'portal_group_contact_type_invalid',
        statusCode: 403,
      }),
    )

    expect(() =>
      assertPortalGroupContactEnabled({
        customAttributes: {
          portal_contact_type: 'group',
          portal_enabled: false,
        },
        id: 154,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'portal_group_contact_disabled',
        statusCode: 403,
      }),
    )
  })
})
