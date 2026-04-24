import { describe, expect, it, vi } from 'vitest'

import type { ChatwootAccountWebhook } from '../integrations/chatwoot/client.js'
import {
  configureAccountWebhook,
  createSafeWebhookReport,
  formatInstallerWebhookOutput,
} from './configure-chatwoot-account-webhook-core.js'

const callbackUrl =
  'https://portal.example.com/api/integrations/chatwoot/webhooks/account'
const subscriptions = ['message_created', 'message_updated']

function createWebhook(
  overrides: Partial<ChatwootAccountWebhook> = {},
): ChatwootAccountWebhook {
  return {
    id: 2,
    name: 'Portal realtime',
    secret: 'webhook-secret',
    subscriptions,
    url: callbackUrl,
    ...overrides,
  }
}

describe('configureAccountWebhook', () => {
  it('updates an existing webhook matched by callback path and uses the save response secret', async () => {
    const existingWebhook = createWebhook({
      secret: 'old-secret',
      subscriptions: ['message_created'],
      url: 'https://old.example.com/api/integrations/chatwoot/webhooks/account',
    })
    const savedWebhook = createWebhook({
      secret: 'actual-secret',
    })
    const chatwootClient = {
      createAccountWebhook: vi.fn(),
      listAccountWebhooks: vi.fn().mockResolvedValue([existingWebhook]),
      updateAccountWebhook: vi.fn().mockResolvedValue(savedWebhook),
    }

    const result = await configureAccountWebhook({
      callbackUrl,
      chatwootClient,
      explicitWebhookId: null,
      subscriptions,
    })

    expect(chatwootClient.createAccountWebhook).not.toHaveBeenCalled()
    expect(chatwootClient.updateAccountWebhook).toHaveBeenCalledWith({
      name: 'Portal realtime',
      subscriptions,
      url: callbackUrl,
      webhookId: existingWebhook.id,
    })
    expect(chatwootClient.listAccountWebhooks).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      action: 'updated',
      secret: 'actual-secret',
      secretSource: 'save-response',
      webhook: {
        hasSecret: true,
        id: savedWebhook.id,
        url: callbackUrl,
      },
    })
  })

  it('refetches the created webhook when the save response omits the secret', async () => {
    const createdWithoutSecret = createWebhook({
      id: 3,
      secret: null,
    })
    const createdWithSecret = createWebhook({
      id: 3,
      secret: 'refetched-secret',
    })
    const chatwootClient = {
      createAccountWebhook: vi.fn().mockResolvedValue(createdWithoutSecret),
      listAccountWebhooks: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([createdWithSecret]),
      updateAccountWebhook: vi.fn(),
    }

    const result = await configureAccountWebhook({
      callbackUrl,
      chatwootClient,
      explicitWebhookId: null,
      subscriptions,
    })

    expect(chatwootClient.createAccountWebhook).toHaveBeenCalledWith({
      name: 'Portal realtime',
      subscriptions,
      url: callbackUrl,
    })
    expect(chatwootClient.listAccountWebhooks).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      action: 'created',
      secret: 'refetched-secret',
      secretSource: 'refreshed-list',
      webhook: {
        hasSecret: true,
        id: 3,
      },
    })
  })

  it('keeps safe output redacted while installer output carries the secret', () => {
    const result = {
      action: 'updated',
      callbackUrl,
      secret: 'machine-secret',
      secretSource: 'matched-webhook',
      subscriptions,
      webhook: {
        hasSecret: true,
        id: 2,
        url: callbackUrl,
      },
    } as const

    expect(
      JSON.stringify(createSafeWebhookReport({ envUpdated: true, result })),
    ).not.toContain('machine-secret')
    expect(formatInstallerWebhookOutput(result)).toContain(
      'WEBHOOK_SECRET=machine-secret',
    )
  })
})
