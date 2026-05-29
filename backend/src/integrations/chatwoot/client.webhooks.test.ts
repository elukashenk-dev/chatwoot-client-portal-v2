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

describe('createChatwootClient webhook APIs', () => {
  it('lists account webhooks with their callback secret when Chatwoot returns it', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        payload: {
          webhooks: [
            {
              id: 2,
              name: 'Portal realtime',
              secret: 'webhook-secret',
              subscriptions: ['message_created', 'message_updated'],
              url: 'http://127.0.0.1:3301/api/chatwoot/webhooks',
            },
          ],
        },
      }),
    )
    const client = createChatwootClient({
      config: testChatwootConfig,
      fetchFn,
    })

    await expect(client.listAccountWebhooks()).resolves.toEqual([
      {
        id: 2,
        name: 'Portal realtime',
        secret: 'webhook-secret',
        subscriptions: ['message_created', 'message_updated'],
        url: 'http://127.0.0.1:3301/api/chatwoot/webhooks',
      },
    ])
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      'http://127.0.0.1:3000/api/v1/accounts/3/webhooks',
    )
  })

  it('updates an account webhook through the Chatwoot account API', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        payload: {
          webhook: {
            id: 2,
            name: 'Portal realtime',
            secret: 'webhook-secret',
            subscriptions: ['message_created', 'message_updated'],
            url: 'http://127.0.0.1:3301/api/chatwoot/webhooks',
          },
        },
      }),
    )
    const client = createChatwootClient({
      config: testChatwootConfig,
      fetchFn,
    })

    await expect(
      client.updateAccountWebhook({
        name: 'Portal realtime',
        subscriptions: ['message_created', 'message_updated'],
        url: 'http://127.0.0.1:3301/api/chatwoot/webhooks',
        webhookId: 2,
      }),
    ).resolves.toMatchObject({
      id: 2,
      secret: 'webhook-secret',
    })

    expect(fetchFn).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Portal realtime',
          subscriptions: ['message_created', 'message_updated'],
          url: 'http://127.0.0.1:3301/api/chatwoot/webhooks',
        }),
        method: 'PATCH',
      }),
    )
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      'http://127.0.0.1:3000/api/v1/accounts/3/webhooks/2',
    )
  })

  it('configures the API channel webhook URL and returns its dedicated signing secret', async () => {
    const callbackUrl = 'https://lk.buhfirma.test/api/chatwoot/webhooks'
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse({
          channel_type: 'Channel::Api',
          id: 9,
          lock_to_single_conversation: true,
          secret: 'old-api-channel-secret',
          webhook_url: null,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          channel_type: 'Channel::Api',
          id: 9,
          lock_to_single_conversation: true,
          secret: 'api-channel-secret',
          webhook_url: callbackUrl,
        }),
      )
    const client = createChatwootClient({
      config: testChatwootConfig,
      fetchFn,
    })

    await expect(
      client.configurePortalInboxWebhook({
        url: callbackUrl,
      }),
    ).resolves.toEqual({
      id: 9,
      secret: 'api-channel-secret',
      url: callbackUrl,
    })
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      expect.any(URL),
      expect.objectContaining({
        body: JSON.stringify({
          channel: {
            webhook_url: callbackUrl,
          },
        }),
        method: 'PATCH',
      }),
    )
    expect(String(fetchFn.mock.calls[1]?.[0])).toBe(
      'http://127.0.0.1:3000/api/v1/accounts/3/inboxes/9',
    )
  })
})
