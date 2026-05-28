import { describe, expect, it, vi } from 'vitest'

import { createChatNotificationPushDeliveryService } from './pushDeliveryService.js'
import type { PushTransport, PushTransportResult } from './pushTransport.js'

const threadMapping = {
  chatwootConversationId: 11,
  portalChatThreadId: 22,
  threadId: 'private:me',
  threadType: 'private',
  userId: 7,
} as const

function createRepository() {
  return {
    findChatOverrides: vi.fn(async () => null),
    findUserSettings: vi.fn(async () => ({
      newMessagesEnabled: true,
      pushEnabled: true,
      soundEnabled: true,
    })),
    listActivePushSubscriptions: vi.fn(async () => [
      {
        auth: 'auth-secret',
        endpoint: 'https://push.example.test/subscription/1',
        id: 100,
        p256dh: 'p256dh-key',
      },
    ]),
    markPushSubscriptionExpired: vi.fn(async () => undefined),
    recordPushDeliveryAttempt: vi.fn<() => Promise<number | null>>(
      async () => 500,
    ),
    updatePushDeliveryStatus: vi.fn(async () => undefined),
    updatePushSubscriptionFailure: vi.fn(async () => undefined),
  }
}

function createRecipientResolver() {
  return {
    resolveRecipients: vi.fn(async () => [
      {
        portalChatThreadId: 22,
        portalUserId: 7,
        threadId: 'private:me',
        threadTitle: 'Личный чат',
        threadType: 'private' as const,
      },
    ]),
  }
}

function createTransport(result: PushTransportResult = { status: 'sent' }) {
  return {
    sendNotification: vi.fn<PushTransport['sendNotification']>(
      async () => result,
    ),
  }
}

function parseFirstNotificationPayload(
  transport: ReturnType<typeof createTransport>,
) {
  const payload = transport.sendNotification.mock.calls[0]?.[1]

  expect(payload).toBeTypeOf('string')

  return JSON.parse(String(payload))
}

describe('chat notification push delivery service', () => {
  it('skips delivery when transport is unavailable', async () => {
    const service = createChatNotificationPushDeliveryService({
      recipientResolver: createRecipientResolver(),
      repository: createRepository(),
      transport: null,
    })

    await expect(
      service.deliverMessageCreated({
        chatwootMessageId: 9001,
        tenantSlug: 'default',
        threadMapping,
      }),
    ).resolves.toEqual({
      expired: 0,
      failed: 0,
      recipients: 0,
      sent: 0,
      skipped: 0,
      subscriptions: 0,
    })
  })

  it('skips delivery when message id is missing', async () => {
    const transport = createTransport()
    const service = createChatNotificationPushDeliveryService({
      recipientResolver: createRecipientResolver(),
      repository: createRepository(),
      transport,
    })

    await service.deliverMessageCreated({
      chatwootMessageId: null,
      tenantSlug: 'default',
      threadMapping,
    })

    expect(transport.sendNotification).not.toHaveBeenCalled()
  })

  it('sends a generic payload to active subscriptions', async () => {
    const repository = createRepository()
    const transport = createTransport()
    const service = createChatNotificationPushDeliveryService({
      now: () => new Date('2026-05-23T00:00:00.000Z'),
      recipientResolver: createRecipientResolver(),
      repository,
      transport,
    })

    await expect(
      service.deliverMessageCreated({
        chatwootMessageId: 9001,
        tenantSlug: 'default',
        threadMapping,
      }),
    ).resolves.toMatchObject({
      recipients: 1,
      sent: 1,
      subscriptions: 1,
    })
    expect(transport.sendNotification).toHaveBeenCalledWith(
      {
        endpoint: 'https://push.example.test/subscription/1',
        keys: {
          auth: 'auth-secret',
          p256dh: 'p256dh-key',
        },
      },
      JSON.stringify({
        chatwootMessageId: 9001,
        notificationTag: 'portal-chat-message-default-9001',
        portalUserId: 7,
        tenantSlug: 'default',
        threadId: 'private:me',
        threadTitle: 'Личный чат',
        threadType: 'private',
        type: 'chat_message',
        url: '/',
      }),
    )
    const parsedPayload = parseFirstNotificationPayload(transport)

    expect(parsedPayload).not.toHaveProperty('content')
    expect(parsedPayload).not.toHaveProperty('text')
    expect(parsedPayload).not.toHaveProperty('authorName')
    expect(parsedPayload).not.toHaveProperty('attachments')
    expect(parsedPayload).not.toHaveProperty('chatwootBaseUrl')
    expect(repository.updatePushDeliveryStatus).toHaveBeenCalledWith({
      deliveryId: 500,
      errorCode: null,
      status: 'sent',
    })
  })

  it('keeps unresolved thread metadata as safe nulls', async () => {
    const repository = createRepository()
    const transport = createTransport()
    const service = createChatNotificationPushDeliveryService({
      recipientResolver: {
        resolveRecipients: vi.fn(async () => [
          {
            portalChatThreadId: 22,
            portalUserId: 7,
            threadId: 'group:155',
            threadTitle: null,
            threadType: null,
          },
        ]),
      },
      repository,
      transport,
    })

    await service.deliverMessageCreated({
      chatwootMessageId: 9001,
      tenantSlug: 'default',
      threadMapping: {
        ...threadMapping,
        threadId: 'group:155',
        threadType: 'group',
        userId: null,
      },
    })

    const parsedPayload = parseFirstNotificationPayload(transport)

    expect(parsedPayload).toMatchObject({
      chatwootMessageId: 9001,
      notificationTag: 'portal-chat-message-default-9001',
      portalUserId: 7,
      tenantSlug: 'default',
      threadId: 'group:155',
      threadTitle: null,
      threadType: null,
      type: 'chat_message',
      url: '/',
    })
    expect(parsedPayload).not.toHaveProperty('content')
    expect(parsedPayload).not.toHaveProperty('text')
    expect(parsedPayload).not.toHaveProperty('authorName')
    expect(parsedPayload).not.toHaveProperty('attachments')
    expect(parsedPayload).not.toHaveProperty('chatwootBaseUrl')
  })

  it('skips users muted by effective settings', async () => {
    const repository = createRepository()
    repository.findUserSettings.mockResolvedValueOnce({
      newMessagesEnabled: false,
      pushEnabled: true,
      soundEnabled: true,
    })
    const transport = createTransport()
    const service = createChatNotificationPushDeliveryService({
      recipientResolver: createRecipientResolver(),
      repository,
      transport,
    })

    await expect(
      service.deliverMessageCreated({
        chatwootMessageId: 9001,
        tenantSlug: 'default',
        threadMapping,
      }),
    ).resolves.toMatchObject({
      sent: 0,
      skipped: 1,
    })
    expect(transport.sendNotification).not.toHaveBeenCalled()
  })

  it('does not resend duplicate delivery attempts', async () => {
    const repository = createRepository()
    repository.recordPushDeliveryAttempt.mockResolvedValueOnce(null)
    const transport = createTransport()
    const service = createChatNotificationPushDeliveryService({
      recipientResolver: createRecipientResolver(),
      repository,
      transport,
    })

    await expect(
      service.deliverMessageCreated({
        chatwootMessageId: 9001,
        tenantSlug: 'default',
        threadMapping,
      }),
    ).resolves.toMatchObject({
      sent: 0,
      skipped: 1,
    })
    expect(transport.sendNotification).not.toHaveBeenCalled()
  })

  it('marks expired subscriptions on 410 or 404 transport results', async () => {
    const repository = createRepository()
    const transport = createTransport({
      errorCode: 'web_push_410',
      status: 'expired',
    })
    const service = createChatNotificationPushDeliveryService({
      now: () => new Date('2026-05-23T00:00:00.000Z'),
      recipientResolver: createRecipientResolver(),
      repository,
      transport,
    })

    await expect(
      service.deliverMessageCreated({
        chatwootMessageId: 9001,
        tenantSlug: 'default',
        threadMapping,
      }),
    ).resolves.toMatchObject({
      expired: 1,
      sent: 0,
    })
    expect(repository.markPushSubscriptionExpired).toHaveBeenCalledWith({
      error: 'web_push_410',
      now: new Date('2026-05-23T00:00:00.000Z'),
      subscriptionId: 100,
    })
  })

  it('records non-expiring transport failures', async () => {
    const repository = createRepository()
    const transport = createTransport({
      errorCode: 'web_push_500',
      status: 'failed',
    })
    const service = createChatNotificationPushDeliveryService({
      now: () => new Date('2026-05-23T00:00:00.000Z'),
      recipientResolver: createRecipientResolver(),
      repository,
      transport,
    })

    await expect(
      service.deliverMessageCreated({
        chatwootMessageId: 9001,
        tenantSlug: 'default',
        threadMapping,
      }),
    ).resolves.toMatchObject({
      failed: 1,
      sent: 0,
    })
    expect(repository.updatePushSubscriptionFailure).toHaveBeenCalledWith({
      error: 'web_push_500',
      now: new Date('2026-05-23T00:00:00.000Z'),
      subscriptionId: 100,
    })
  })
})
