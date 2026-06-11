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

describe('createChatwootClient public conversation events', () => {
  it('updates customer last seen through the Chatwoot public API', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(createJsonResponse({}))
    const client = createChatwootClient({
      config: testChatwootConfig,
      fetchFn,
    })

    await client.updatePublicConversationLastSeen({
      contactIdentifier: 'portal-contact:source',
      conversationDisplayId: 12,
      inboxIdentifier: 'api-inbox-token',
    })

    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      'http://127.0.0.1:3000/public/api/v1/inboxes/api-inbox-token/contacts/portal-contact%3Asource/conversations/12/update_last_seen',
    )
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
    })
    expect(fetchFn.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      'api_access_token',
    )
  })

  it('toggles customer typing through the Chatwoot public API', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(createJsonResponse({}))
    const client = createChatwootClient({
      config: testChatwootConfig,
      fetchFn,
    })

    await client.togglePublicConversationTyping({
      contactIdentifier: 'portal-contact:source',
      conversationDisplayId: 12,
      inboxIdentifier: 'api-inbox-token',
      typingStatus: 'on',
    })

    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      'http://127.0.0.1:3000/public/api/v1/inboxes/api-inbox-token/contacts/portal-contact%3Asource/conversations/12/toggle_typing',
    )
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      typing_status: 'on',
    })
    expect(fetchFn.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      'api_access_token',
    )
  })
})
