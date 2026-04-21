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
        CHATWOOT_PORTAL_INBOX_ID: 9,
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
        CHATWOOT_PORTAL_INBOX_ID: 9,
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

    await expect(
      client.findContactByEmail('name@company.ru'),
    ).resolves.toBeNull()
  })

  it('lists only configured API inbox conversations for a contact', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        payload: [
          {
            created_at: 100,
            id: 11,
            inbox_id: 9,
            last_activity_at: 150,
            meta: {
              assignee: {
                name: 'Анна Смирнова',
              },
              channel: 'Channel::Api',
            },
            status: 'open',
          },
          {
            created_at: 101,
            id: 12,
            inbox_id: 10,
            last_activity_at: 151,
            meta: {
              channel: 'Channel::Api',
            },
            status: 'open',
          },
          {
            created_at: 102,
            id: 13,
            inbox_id: 9,
            last_activity_at: 152,
            meta: {
              channel: 'Channel::WebWidget',
            },
            status: 'open',
          },
        ],
      }),
    )
    const client = createChatwootClient({
      env: {
        CHATWOOT_ACCOUNT_ID: 3,
        CHATWOOT_API_ACCESS_TOKEN: 'token',
        CHATWOOT_BASE_URL: 'http://127.0.0.1:3000',
        CHATWOOT_PORTAL_INBOX_ID: 9,
      },
      fetchFn,
    })

    await expect(client.listContactConversations(7)).resolves.toEqual([
      {
        assigneeName: 'Анна Смирнова',
        channelType: 'Channel::Api',
        createdAt: 100,
        id: 11,
        inboxId: 9,
        lastActivityAt: 150,
        status: 'open',
      },
    ])
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      'http://127.0.0.1:3000/api/v1/accounts/3/contacts/7/conversations',
    )
  })

  it('lists bounded conversation messages with internal-message filtering', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        payload: [
          {
            attachments: [],
            content: 'Agent reply',
            content_type: 'text',
            created_at: 1_776_000_001,
            id: 21,
            message_type: 1,
            private: false,
            sender: {
              id: 5,
              name: 'Анна Смирнова',
              type: 'user',
            },
            status: 'sent',
          },
          {
            attachments: [],
            content: 'Portal message',
            content_type: 'text',
            created_at: 1_776_000_002,
            id: 22,
            message_type: 0,
            private: false,
            sender: {
              id: 7,
              name: 'Portal User',
              type: 'contact',
            },
            status: 'sent',
          },
        ],
      }),
    )
    const client = createChatwootClient({
      env: {
        CHATWOOT_ACCOUNT_ID: 3,
        CHATWOOT_API_ACCESS_TOKEN: 'token',
        CHATWOOT_BASE_URL: 'http://127.0.0.1:3000',
        CHATWOOT_PORTAL_INBOX_ID: 9,
      },
      fetchFn,
    })

    await expect(client.listConversationMessages(101)).resolves.toMatchObject({
      hasMoreOlder: false,
      messages: [
        {
          content: 'Agent reply',
          id: 21,
          messageType: 1,
        },
        {
          content: 'Portal message',
          id: 22,
          messageType: 0,
        },
      ],
      nextOlderCursor: null,
    })

    const requestUrl = fetchFn.mock.calls[0]?.[0]

    expect(requestUrl).toBeInstanceOf(URL)
    expect(
      (requestUrl as URL).searchParams.get('filter_internal_messages'),
    ).toBe('true')
  })
})
