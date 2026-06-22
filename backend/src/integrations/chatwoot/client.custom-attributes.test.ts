import { describe, expect, it, vi } from 'vitest'

import { createChatwootClient } from './client.js'

const testChatwootConfig = {
  accountId: 3,
  apiAccessToken: 'token',
  baseUrl: 'http://127.0.0.1:3000',
  portalInboxId: 9,
}

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

describe('createChatwootClient portal contact custom attributes', () => {
  it('creates missing portal contact custom attribute definitions for an account', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createJsonResponse([]))
      .mockResolvedValueOnce(
        createJsonResponse({
          attribute_display_name: 'Доступен в портале',
          attribute_display_type: 'checkbox',
          attribute_key: 'portal_enabled',
          attribute_model: 'contact_attribute',
          id: 51,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          attribute_display_name: 'Тип контакта портала',
          attribute_display_type: 'list',
          attribute_key: 'portal_contact_type',
          attribute_model: 'contact_attribute',
          attribute_values: ['person', 'group'],
          id: 52,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          attribute_display_name: 'ID групп портала',
          attribute_display_type: 'text',
          attribute_key: 'portal_client_group_contact_ids',
          attribute_model: 'contact_attribute',
          id: 53,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          attribute_display_name: 'Куратор',
          attribute_display_type: 'text',
          attribute_key: 'curator_name',
          attribute_model: 'contact_attribute',
          id: 54,
        }),
      )
    const client = createChatwootClient({
      config: testChatwootConfig,
      fetchFn,
    })

    const result = await client.ensurePortalContactCustomAttributeDefinitions()

    expect(result).toEqual({
      created: [
        'portal_enabled',
        'portal_contact_type',
        'portal_client_group_contact_ids',
        'curator_name',
      ],
      unchanged: [],
      updated: [],
    })
    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      new URL(
        'http://127.0.0.1:3000/api/v1/accounts/3/custom_attribute_definitions?attribute_model=contact_attribute',
      ),
      expect.objectContaining({
        method: 'GET',
      }),
    )
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      new URL(
        'http://127.0.0.1:3000/api/v1/accounts/3/custom_attribute_definitions',
      ),
      expect.objectContaining({
        body: JSON.stringify({
          custom_attribute_definition: {
            attribute_display_name: 'Доступен в портале',
            attribute_display_type: 'checkbox',
            attribute_key: 'portal_enabled',
            attribute_model: 'contact_attribute',
          },
        }),
        method: 'POST',
      }),
    )
    expect(fetchFn).toHaveBeenNthCalledWith(
      3,
      new URL(
        'http://127.0.0.1:3000/api/v1/accounts/3/custom_attribute_definitions',
      ),
      expect.objectContaining({
        body: JSON.stringify({
          custom_attribute_definition: {
            attribute_display_name: 'Тип контакта портала',
            attribute_display_type: 'list',
            attribute_key: 'portal_contact_type',
            attribute_model: 'contact_attribute',
            attribute_values: ['person', 'group'],
          },
        }),
        method: 'POST',
      }),
    )
    expect(fetchFn).toHaveBeenNthCalledWith(
      4,
      new URL(
        'http://127.0.0.1:3000/api/v1/accounts/3/custom_attribute_definitions',
      ),
      expect.objectContaining({
        body: JSON.stringify({
          custom_attribute_definition: {
            attribute_display_name: 'ID групп портала',
            attribute_display_type: 'text',
            attribute_key: 'portal_client_group_contact_ids',
            attribute_model: 'contact_attribute',
          },
        }),
        method: 'POST',
      }),
    )
    expect(fetchFn).toHaveBeenNthCalledWith(
      5,
      new URL(
        'http://127.0.0.1:3000/api/v1/accounts/3/custom_attribute_definitions',
      ),
      expect.objectContaining({
        body: JSON.stringify({
          custom_attribute_definition: {
            attribute_display_name: 'Куратор',
            attribute_display_type: 'text',
            attribute_key: 'curator_name',
            attribute_model: 'contact_attribute',
          },
        }),
        method: 'POST',
      }),
    )
    expect(fetchFn).toHaveBeenCalledTimes(5)
  })

  it('updates existing portal contact custom attribute definitions when their UI schema drifts', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse([
          {
            attribute_display_name: 'Old enabled',
            attribute_display_type: 'text',
            attribute_key: 'portal_enabled',
            attribute_model: 'contact_attribute',
            id: 61,
          },
          {
            attribute_display_name: 'Тип контакта портала',
            attribute_display_type: 'list',
            attribute_key: 'portal_contact_type',
            attribute_model: 'contact_attribute',
            attribute_values: ['person'],
            id: 62,
          },
          {
            attribute_display_name: 'ID групп портала',
            attribute_display_type: 'text',
            attribute_key: 'portal_client_group_contact_ids',
            attribute_model: 'contact_attribute',
            id: 63,
          },
          {
            attribute_display_name: 'Куратор',
            attribute_display_type: 'text',
            attribute_key: 'curator_name',
            attribute_model: 'contact_attribute',
            id: 64,
          },
        ]),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          attribute_display_name: 'Доступен в портале',
          attribute_display_type: 'checkbox',
          attribute_key: 'portal_enabled',
          attribute_model: 'contact_attribute',
          id: 61,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          attribute_display_name: 'Тип контакта портала',
          attribute_display_type: 'list',
          attribute_key: 'portal_contact_type',
          attribute_model: 'contact_attribute',
          attribute_values: ['person', 'group'],
          id: 62,
        }),
      )
    const client = createChatwootClient({
      config: testChatwootConfig,
      fetchFn,
    })

    const result = await client.ensurePortalContactCustomAttributeDefinitions()

    expect(result).toEqual({
      created: [],
      unchanged: ['portal_client_group_contact_ids', 'curator_name'],
      updated: ['portal_enabled', 'portal_contact_type'],
    })
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      new URL(
        'http://127.0.0.1:3000/api/v1/accounts/3/custom_attribute_definitions/61',
      ),
      expect.objectContaining({
        body: JSON.stringify({
          custom_attribute_definition: {
            attribute_display_name: 'Доступен в портале',
            attribute_display_type: 'checkbox',
            attribute_key: 'portal_enabled',
            attribute_model: 'contact_attribute',
          },
        }),
        method: 'PATCH',
      }),
    )
    expect(fetchFn).toHaveBeenNthCalledWith(
      3,
      new URL(
        'http://127.0.0.1:3000/api/v1/accounts/3/custom_attribute_definitions/62',
      ),
      expect.objectContaining({
        body: JSON.stringify({
          custom_attribute_definition: {
            attribute_display_name: 'Тип контакта портала',
            attribute_display_type: 'list',
            attribute_key: 'portal_contact_type',
            attribute_model: 'contact_attribute',
            attribute_values: ['person', 'group'],
          },
        }),
        method: 'PATCH',
      }),
    )
  })
})
