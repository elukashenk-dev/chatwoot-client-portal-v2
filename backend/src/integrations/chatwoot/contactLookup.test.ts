import { describe, expect, it, vi } from 'vitest'

import {
  findChatwootContactById,
  findChatwootContactsByPhone,
} from './contactLookup.js'
import { ChatwootClientRequestError } from './errors.js'
import { createChatwootFetch } from './request.js'

const testChatwootConfig = {
  accountId: 3,
  apiAccessToken: 'token',
  baseUrl: 'http://127.0.0.1:3000',
}

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

function createLookup(fetchFn: typeof fetch) {
  return (contactId: number) =>
    findChatwootContactById({
      config: testChatwootConfig,
      contactId,
      fetchChatwoot: createChatwootFetch({
        fetchFn,
        requestTimeoutMs: 15_000,
      }),
    })
}

function createPhoneLookup(fetchFn: typeof fetch) {
  return (phone: string) =>
    findChatwootContactsByPhone({
      config: testChatwootConfig,
      fetchChatwoot: createChatwootFetch({
        fetchFn,
        requestTimeoutMs: 15_000,
      }),
      phone,
    })
}

describe('findChatwootContactById', () => {
  it('finds a contact by id with custom attributes', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        payload: {
          avatar_url: '/rails/active_storage/group-avatar.png',
          custom_attributes: {
            portal_client_group_contact_ids: '154',
            portal_enabled: true,
          },
          email: 'ivan@example.com',
          id: 44,
          name: 'Иван Петров',
          phone_number: '+79991234567',
        },
      }),
    )

    await expect(createLookup(fetchFn)(44)).resolves.toEqual({
      avatarUrl: 'http://127.0.0.1:3000/rails/active_storage/group-avatar.png',
      customAttributes: {
        portal_client_group_contact_ids: '154',
        portal_enabled: true,
      },
      email: 'ivan@example.com',
      id: 44,
      name: 'Иван Петров',
      phoneNumber: '+79991234567',
    })

    expect(fetchFn).toHaveBeenCalledWith(
      new URL('http://127.0.0.1:3000/api/v1/accounts/3/contacts/44'),
      expect.objectContaining({
        method: 'GET',
      }),
    )
  })

  it('returns null when contact lookup by id returns 404', async () => {
    const lookup = createLookup(
      vi.fn<typeof fetch>().mockResolvedValue(
        createJsonResponse(
          {
            error: 'Not found',
          },
          404,
        ),
      ),
    )

    await expect(lookup(999)).resolves.toBeNull()
  })
})

describe('findChatwootContactsByPhone', () => {
  it('filters contacts by exact normalized phone in the tenant account', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        payload: [
          {
            email: 'ivan@example.com',
            id: 44,
            name: 'Иван Петров',
            phone_number: '+7 (916) 123-45-67',
          },
          {
            email: 'other@example.com',
            id: 45,
            name: 'Wrong Phone',
            phone_number: '+79160000000',
          },
          {
            email: 'broken@example.com',
            id: 'not-a-number',
            name: 'Broken',
            phone_number: '+79161234567',
          },
        ],
      }),
    )

    await expect(createPhoneLookup(fetchFn)('8 916 123 45 67')).resolves.toEqual(
      [
        {
          email: 'ivan@example.com',
          id: 44,
          name: 'Иван Петров',
          phoneNumber: '+7 (916) 123-45-67',
        },
      ],
    )

    expect(fetchFn).toHaveBeenCalledWith(
      new URL('http://127.0.0.1:3000/api/v1/accounts/3/contacts/filter'),
      expect.objectContaining({
        body: JSON.stringify({
          payload: [
            {
              attribute_key: 'phone_number',
              attribute_model: 'standard',
              custom_attribute_type: '',
              filter_operator: 'equal_to',
              values: ['+79161234567'],
            },
          ],
        }),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          api_access_token: 'token',
        }),
        method: 'POST',
      }),
    )
  })

  it('returns an empty list for no exact normalized matches, empty payloads, and 404', async () => {
    await expect(
      createPhoneLookup(
        vi.fn<typeof fetch>().mockResolvedValue(
          createJsonResponse({
            payload: [
              {
                id: 44,
                phone_number: '+79160000000',
              },
            ],
          }),
        ),
      )('89161234567'),
    ).resolves.toEqual([])

    await expect(
      createPhoneLookup(
        vi.fn<typeof fetch>().mockResolvedValue(createJsonResponse({ payload: [] })),
      )('89161234567'),
    ).resolves.toEqual([])

    await expect(
      createPhoneLookup(
        vi.fn<typeof fetch>().mockResolvedValue(
          createJsonResponse(
            {
              error: 'Not found',
            },
            404,
          ),
        ),
      )('89161234567'),
    ).resolves.toEqual([])
  })

  it('rejects invalid phone inputs before calling Chatwoot', async () => {
    const fetchFn = vi.fn<typeof fetch>()

    await expect(createPhoneLookup(fetchFn)('not a phone')).rejects.toThrow(
      ChatwootClientRequestError,
    )

    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('throws a typed error for invalid response shapes', async () => {
    await expect(
      createPhoneLookup(
        vi.fn<typeof fetch>().mockResolvedValue(
          createJsonResponse({
            payload: {
              id: 44,
            },
          }),
        ),
      )('89161234567'),
    ).rejects.toThrow(ChatwootClientRequestError)
  })
})
