import { describe, expect, it, vi } from 'vitest'

import { createChatwootClient } from './client.js'

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

describe('createChatwootClient', () => {
  it('returns an exact email match from Chatwoot search results', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        payload: [
          {
            email: 'other@company.ru',
            id: 4,
            name: 'Other User',
          },
          {
            email: 'Name@Company.RU',
            id: 7,
            name: 'Portal User',
          },
        ],
      }),
    )
    const client = createChatwootClient({
      env: {
        CHATWOOT_ACCOUNT_ID: 3,
        CHATWOOT_API_ACCESS_TOKEN: 'token',
        CHATWOOT_BASE_URL: 'http://127.0.0.1:3000/',
      },
      fetchFn,
    })

    const contact = await client.findContactByEmail(' name@company.ru ')

    expect(contact).toEqual({
      email: 'Name@Company.RU',
      id: 7,
      name: 'Portal User',
    })
    expect(fetchFn).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: expect.objectContaining({
          api_access_token: 'token',
        }),
        method: 'GET',
      }),
    )
  })

  it('returns null when Chatwoot search does not include an exact email match', async () => {
    const client = createChatwootClient({
      env: {
        CHATWOOT_ACCOUNT_ID: 3,
        CHATWOOT_API_ACCESS_TOKEN: 'token',
        CHATWOOT_BASE_URL: 'http://127.0.0.1:3000',
      },
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(
        createJsonResponse({
          payload: [
            {
              email: 'other@company.ru',
              id: 4,
              name: 'Other User',
            },
          ],
        }),
      ),
    })

    await expect(client.findContactByEmail('name@company.ru')).resolves.toBeNull()
  })
})
