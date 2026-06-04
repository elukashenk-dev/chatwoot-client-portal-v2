import { describe, expect, it, vi } from 'vitest'

import { ChatwootClientRequestError } from './errors.js'
import { createPublicConversationEventsClient } from './publicConversationEvents.js'

function createJsonResponse(status = 200) {
  return new Response(status === 200 ? '{}' : '{"error":"not_found"}', {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

describe('createPublicConversationEventsClient', () => {
  it('posts update_last_seen to the Chatwoot public API path', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(createJsonResponse())
    const client = createPublicConversationEventsClient({
      baseUrl: 'https://chatwoot.example.test',
      fetchFn,
      requestTimeoutMs: 10_000,
    })

    await client.updateLastSeen({
      contactIdentifier: 'portal-contact:source',
      conversationDisplayId: 12,
      inboxIdentifier: 'api-inbox-token',
    })

    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      'https://chatwoot.example.test/public/api/v1/inboxes/api-inbox-token/contacts/portal-contact%3Asource/conversations/12/update_last_seen',
    )
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
    })
  })

  it('posts toggle_typing with on and off statuses', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(createJsonResponse())
    const client = createPublicConversationEventsClient({
      baseUrl: 'https://chatwoot.example.test',
      fetchFn,
      requestTimeoutMs: 10_000,
    })

    await client.toggleTyping({
      contactIdentifier: 'portal-contact:source',
      conversationDisplayId: 12,
      inboxIdentifier: 'api-inbox-token',
      typingStatus: 'on',
    })
    await client.toggleTyping({
      contactIdentifier: 'portal-contact:source',
      conversationDisplayId: 12,
      inboxIdentifier: 'api-inbox-token',
      typingStatus: 'off',
    })

    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      'https://chatwoot.example.test/public/api/v1/inboxes/api-inbox-token/contacts/portal-contact%3Asource/conversations/12/toggle_typing',
    )
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      typing_status: 'on',
    })
    expect(JSON.parse(String(fetchFn.mock.calls[1]?.[1]?.body))).toEqual({
      typing_status: 'off',
    })
  })

  it('throws a request error for missing public identifiers', async () => {
    const client = createPublicConversationEventsClient({
      baseUrl: 'https://chatwoot.example.test',
      fetchFn: vi.fn(),
      requestTimeoutMs: 10_000,
    })

    await expect(
      client.updateLastSeen({
        contactIdentifier: '',
        conversationDisplayId: 12,
        inboxIdentifier: 'api-inbox-token',
      }),
    ).rejects.toBeInstanceOf(ChatwootClientRequestError)
  })

  it('throws a request error when Chatwoot public API rejects the event', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(createJsonResponse(404))
    const client = createPublicConversationEventsClient({
      baseUrl: 'https://chatwoot.example.test',
      fetchFn,
      requestTimeoutMs: 10_000,
    })

    await expect(
      client.updateLastSeen({
        contactIdentifier: 'portal-contact:source',
        conversationDisplayId: 12,
        inboxIdentifier: 'api-inbox-token',
      }),
    ).rejects.toMatchObject({
      name: 'ChatwootClientRequestError',
    })
  })

  it('uses the default Chatwoot request timeout when no override is supplied', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(createJsonResponse())
    const client = createPublicConversationEventsClient({
      baseUrl: 'https://chatwoot.example.test',
      fetchFn,
    })

    await client.updateLastSeen({
      contactIdentifier: 'portal-contact:source',
      conversationDisplayId: 12,
      inboxIdentifier: 'api-inbox-token',
    })

    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})
