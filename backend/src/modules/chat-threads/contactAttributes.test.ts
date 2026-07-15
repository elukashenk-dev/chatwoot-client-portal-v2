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
  it('defaults an enabled contact without a group flag to person', () => {
    expect(
      parsePortalContactAttributes({
        portal_client_group_contact_ids: '154, 203,154, 203',
        portal_enabled: true,
      }),
    ).toEqual({
      groupContactIds: [154, 203],
      enabled: true,
      type: 'person',
    })
  })

  it('treats an explicit false group flag as person', () => {
    expect(
      parsePortalContactAttributes({
        portal_enabled: true,
        portal_is_group: false,
      }),
    ).toEqual({
      groupContactIds: [],
      enabled: true,
      type: 'person',
    })
  })

  it('treats a null group flag as an absent checkbox value', () => {
    expect(
      parsePortalContactAttributes({
        portal_enabled: true,
        portal_is_group: null,
      }),
    ).toEqual({
      groupContactIds: [],
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
        portal_enabled: true,
        portal_is_group: true,
      }),
    ).toEqual({
      groupContactIds: [],
      enabled: true,
      type: 'group',
    })
  })

  it.each(['true', 'false', 0, 1, [], {}])(
    'rejects a non-boolean portal_is_group value: %j',
    (portalIsGroup) => {
      expect(() =>
        parsePortalContactAttributes({
          portal_enabled: true,
          portal_is_group: portalIsGroup,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: 'portal_is_group_invalid',
          statusCode: 403,
        }),
      )
    },
  )

  it('requires portal_enabled to remain a real boolean', () => {
    expect(() => parsePortalContactAttributes({})).toThrowError(
      expect.objectContaining({
        code: 'portal_contact_disabled',
        statusCode: 403,
      }),
    )
  })

  it.each(['true', 'false', 0, 1, null, [], {}])(
    'rejects a non-boolean portal_enabled value: %j',
    (portalEnabled) => {
      expect(() =>
        parsePortalContactAttributes({ portal_enabled: portalEnabled }),
      ).toThrowError(
        expect.objectContaining({
          code: 'portal_contact_disabled',
          statusCode: 403,
        }),
      )
    },
  )

  it('requires person contacts to be portal enabled', () => {
    expect(() =>
      assertPortalPersonContactEnabled({
        customAttributes: {
          portal_enabled: true,
          portal_is_group: true,
        },
        id: 154,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'portal_person_contact_expected',
        statusCode: 403,
      }),
    )

    expect(() =>
      assertPortalPersonContactEnabled({
        customAttributes: {
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
          portal_enabled: true,
        },
        id: 44,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'portal_group_flag_required',
        statusCode: 403,
      }),
    )

    expect(() =>
      assertPortalGroupContactEnabled({
        customAttributes: {
          portal_enabled: false,
          portal_is_group: true,
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
