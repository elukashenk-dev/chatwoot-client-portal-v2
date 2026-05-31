import { describe, expect, it, vi } from 'vitest'

import { findChatwootContactById } from './contactLookup.js'
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

describe('findChatwootContactById', () => {
  it('finds a contact by id with custom attributes', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        payload: {
          avatar_url: '/rails/active_storage/group-avatar.png',
          custom_attributes: {
            portal_client_group_contact_ids: '154',
            portal_contact_type: 'person',
            portal_enabled: true,
          },
          email: 'ivan@example.com',
          id: 44,
          name: 'Иван Петров',
        },
      }),
    )

    await expect(createLookup(fetchFn)(44)).resolves.toEqual({
      avatarUrl: 'http://127.0.0.1:3000/rails/active_storage/group-avatar.png',
      customAttributes: {
        portal_client_group_contact_ids: '154',
        portal_contact_type: 'person',
        portal_enabled: true,
      },
      email: 'ivan@example.com',
      id: 44,
      name: 'Иван Петров',
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
