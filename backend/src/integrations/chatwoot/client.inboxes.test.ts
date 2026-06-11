import { describe, expect, it, vi } from 'vitest'

import { createChatwootClient } from './client.js'

const accountOnlyChatwootConfig = {
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

function readJsonBody(init: RequestInit | undefined) {
  return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
}

describe('createChatwootClient inbox provisioning APIs', () => {
  it('finds an existing API inbox by exact name without a configured portal inbox id', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        payload: [
          {
            channel_type: 'Channel::Email',
            id: 1,
            inbox_identifier: null,
            name: 'Portal buhfirma',
          },
          {
            channel_type: 'Channel::Api',
            id: 9,
            inbox_identifier: 'api-source-id',
            name: 'Portal buhfirma',
          },
          {
            channel_type: 'Channel::Api',
            id: 10,
            inbox_identifier: 'other-source-id',
            name: 'Portal other',
          },
        ],
      }),
    )
    const client = createChatwootClient({
      config: accountOnlyChatwootConfig,
      fetchFn,
    })

    await expect(
      client.findPortalApiInboxByName({
        name: ' Portal buhfirma ',
      }),
    ).resolves.toEqual({
      channelType: 'Channel::Api',
      id: 9,
      inboxIdentifier: 'api-source-id',
      name: 'Portal buhfirma',
    })
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      'http://127.0.0.1:3000/api/v1/accounts/3/inboxes',
    )
  })

  it('returns null when no exact API inbox name exists without a configured portal inbox id', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        payload: [
          {
            channel_type: 'Channel::Api',
            id: 9,
            inbox_identifier: 'api-source-id',
            name: 'Portal other',
          },
        ],
      }),
    )
    const client = createChatwootClient({
      config: accountOnlyChatwootConfig,
      fetchFn,
    })

    await expect(
      client.findPortalApiInboxByName({
        name: 'Portal buhfirma',
      }),
    ).resolves.toBeNull()
  })

  it('creates an API channel inbox without a configured portal inbox id', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        channel_type: 'Channel::Api',
        id: 9,
        inbox_identifier: 'api-source-id',
        lock_to_single_conversation: true,
        name: 'Portal buhfirma',
        secret: 'api-channel-secret',
        webhook_url: null,
      }),
    )
    const client = createChatwootClient({
      config: accountOnlyChatwootConfig,
      fetchFn,
    })

    await expect(
      client.createPortalApiInbox({
        name: ' Portal buhfirma ',
      }),
    ).resolves.toEqual({
      channelType: 'Channel::Api',
      id: 9,
      inboxIdentifier: 'api-source-id',
      lockToSingleConversation: true,
      name: 'Portal buhfirma',
      webhookSecret: 'api-channel-secret',
      webhookUrl: null,
    })

    const [requestUrl, requestOptions] = fetchFn.mock.calls[0] ?? []

    expect(String(requestUrl)).toBe(
      'http://127.0.0.1:3000/api/v1/accounts/3/inboxes',
    )
    expect(requestOptions?.method).toBe('POST')
    expect(readJsonBody(requestOptions)).toEqual({
      channel: {
        type: 'api',
      },
      lock_to_single_conversation: true,
      name: 'Portal buhfirma',
    })
  })
})
