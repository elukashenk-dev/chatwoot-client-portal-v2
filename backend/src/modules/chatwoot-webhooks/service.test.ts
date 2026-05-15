import { describe, expect, it, vi } from 'vitest'

import type { ChatMessagesSnapshot } from '../chat-messages/service.js'
import { createChatwootWebhookService } from './service.js'
import { chatwootWebhookTestInternals } from './service.js'

type CreateChatwootWebhookServiceOptions = Parameters<
  typeof createChatwootWebhookService
>[0]
type FindConversationMapping =
  CreateChatwootWebhookServiceOptions['webhookRepository']['findConversationMappingByChatwootConversationId']
type GetCurrentUserChatMessages =
  CreateChatwootWebhookServiceOptions['chatMessagesService']['getCurrentUserChatMessages']
type PublishMessages =
  CreateChatwootWebhookServiceOptions['realtimeHub']['publishMessages']
type RecordDelivery =
  CreateChatwootWebhookServiceOptions['webhookRepository']['recordDelivery']

const webhookSecret = 'test-webhook-secret'
const now = new Date('2026-04-21T12:00:00.000Z')
const timestamp = String(Math.floor(now.getTime() / 1000))

const readySnapshot: ChatMessagesSnapshot = {
  hasMoreOlder: false,
  activeThread: {
    id: 'private:me',
    subtitle: 'Только вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  },
  linkedContact: {
    id: 44,
  },
  messages: [
    {
      attachments: [],
      authorName: 'Анна Смирнова',
      content: 'Ответ агента',
      contentType: 'text',
      createdAt: '2026-04-21T12:00:00.000Z',
      direction: 'incoming',
      id: 501,
      replyTo: null,
      status: 'sent',
    },
  ],
  nextOlderCursor: null,
  reason: 'none',
  result: 'ready',
}

function createSignedWebhook(payload: Record<string, unknown>) {
  const rawBody = Buffer.from(JSON.stringify(payload))

  return {
    headers: {
      'x-chatwoot-delivery': 'delivery-1',
      'x-chatwoot-signature':
        chatwootWebhookTestInternals.createSignatureDigest({
          rawBody,
          secret: webhookSecret,
          timestamp,
        }),
      'x-chatwoot-timestamp': timestamp,
    },
    payload,
    rawBody,
  }
}

function createService(
  overrides: {
    findConversationMappingByChatwootConversationId?: FindConversationMapping
    getCurrentUserChatMessages?: GetCurrentUserChatMessages
    publishMessages?: PublishMessages
    recordDelivery?: RecordDelivery
  } = {},
) {
  const findConversationMappingByChatwootConversationId =
    overrides.findConversationMappingByChatwootConversationId ??
    vi.fn<FindConversationMapping>().mockResolvedValue({
      chatwootContactId: 44,
      chatwootConversationId: 101,
      chatwootInboxId: 9,
      userId: 7,
    })
  const getCurrentUserChatMessages =
    overrides.getCurrentUserChatMessages ??
    vi.fn<GetCurrentUserChatMessages>().mockResolvedValue(readySnapshot)
  const publishMessages =
    overrides.publishMessages ?? vi.fn<PublishMessages>().mockReturnValue(2)
  const recordDelivery =
    overrides.recordDelivery ??
    vi.fn<RecordDelivery>().mockResolvedValue('recorded')
  const service = createChatwootWebhookService({
    chatMessagesService: {
      getCurrentUserChatMessages,
    },
    chatwootAccountId: 3,
    chatwootPortalInboxId: 9,
    now: () => now,
    realtimeHub: {
      publishMessages,
      subscribe:
        vi.fn<
          CreateChatwootWebhookServiceOptions['realtimeHub']['subscribe']
        >(),
    },
    tenantId: 1,
    webhookRepository: {
      findConversationMappingByChatwootConversationId,
      recordDelivery,
    },
    webhookSecret,
  })

  return {
    findConversationMappingByChatwootConversationId,
    getCurrentUserChatMessages,
    publishMessages,
    recordDelivery,
    service,
  }
}

describe('createChatwootWebhookService', () => {
  it('rejects requests with an invalid Chatwoot signature', async () => {
    const { service } = createService()
    const webhook = createSignedWebhook({
      conversation: {
        id: 101,
      },
      event: 'message_created',
      id: 501,
      private: false,
    })

    await expect(
      service.handleWebhook({
        ...webhook,
        headers: {
          ...webhook.headers,
          'x-chatwoot-signature': 'sha256=invalid',
        },
      }),
    ).rejects.toMatchObject({
      code: 'chatwoot_webhook_signature_invalid',
      statusCode: 401,
    })
  })

  it('accepts Chatwoot v4.13 webhook signature headers signed over timestamp and raw body', async () => {
    const { service } = createService()
    const payload = {
      account: {
        id: 3,
      },
      conversation: {
        account_id: 3,
        id: 101,
        inbox_id: 9,
      },
      event: 'message_created',
      id: 501,
      inbox: {
        id: 9,
      },
      private: false,
    }
    const rawBody = Buffer.from(JSON.stringify(payload))

    await expect(
      service.handleWebhook({
        headers: {
          'X-Chatwoot-Delivery': 'delivery-v4-13',
          'X-Chatwoot-Signature':
            chatwootWebhookTestInternals.createSignatureDigest({
              rawBody,
              secret: webhookSecret,
              timestamp,
            }),
          'X-Chatwoot-Timestamp': timestamp,
        },
        payload,
        rawBody,
      }),
    ).resolves.toEqual({
      deliveredClients: 2,
      result: 'accepted',
    })
  })

  it('deduplicates a signed delivery before publishing to SSE subscribers', async () => {
    const {
      getCurrentUserChatMessages,
      publishMessages,
      recordDelivery,
      service,
    } = createService({
      recordDelivery: vi.fn().mockResolvedValue('duplicate'),
    })
    const webhook = createSignedWebhook({
      conversation: {
        id: 101,
      },
      event: 'message_created',
      id: 501,
      private: false,
    })

    await expect(service.handleWebhook(webhook)).resolves.toEqual({
      result: 'duplicate',
    })
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryKey: 'delivery-1',
        status: 'accepted',
      }),
    )
    expect(getCurrentUserChatMessages).not.toHaveBeenCalled()
    expect(publishMessages).not.toHaveBeenCalled()
  })

  it('records private/internal message events without refreshing the public transcript', async () => {
    const {
      getCurrentUserChatMessages,
      publishMessages,
      recordDelivery,
      service,
    } = createService()
    const webhook = createSignedWebhook({
      conversation: {
        id: 101,
      },
      event: 'message_created',
      id: 502,
      private: true,
    })

    await expect(service.handleWebhook(webhook)).resolves.toEqual({
      reason: 'private_message',
      result: 'ignored',
    })
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        chatwootConversationId: 101,
        chatwootMessageId: 502,
        deliveryKey: 'delivery-1',
        status: 'ignored_private',
      }),
    )
    expect(getCurrentUserChatMessages).not.toHaveBeenCalled()
    expect(publishMessages).not.toHaveBeenCalled()
  })

  it('rejects signed webhook payloads from another Chatwoot account before recording delivery', async () => {
    const { recordDelivery, service } = createService()
    const webhook = createSignedWebhook({
      account: {
        id: 4,
      },
      conversation: {
        account_id: 4,
        id: 101,
        inbox_id: 9,
      },
      event: 'message_created',
      id: 501,
      private: false,
    })

    await expect(service.handleWebhook(webhook)).rejects.toMatchObject({
      code: 'chatwoot_webhook_tenant_mismatch',
      statusCode: 403,
    })
    expect(recordDelivery).not.toHaveBeenCalled()
  })

  it('rejects signed webhook payloads from another Chatwoot inbox before publishing', async () => {
    const { publishMessages, recordDelivery, service } = createService()
    const webhook = createSignedWebhook({
      account: {
        id: 3,
      },
      conversation: {
        account_id: 3,
        contact_inbox: {
          inbox_id: 10,
        },
        id: 101,
        inbox_id: 10,
      },
      event: 'message_created',
      id: 501,
      inbox: {
        id: 10,
      },
      private: false,
    })

    await expect(service.handleWebhook(webhook)).rejects.toMatchObject({
      code: 'chatwoot_webhook_tenant_mismatch',
      statusCode: 403,
    })
    expect(recordDelivery).not.toHaveBeenCalled()
    expect(publishMessages).not.toHaveBeenCalled()
  })

  it('publishes the canonical latest snapshot for a mapped message event', async () => {
    const {
      getCurrentUserChatMessages,
      publishMessages,
      recordDelivery,
      service,
    } = createService()
    const webhook = createSignedWebhook({
      account: {
        id: '3',
      },
      conversation: {
        account_id: 3,
        id: 101,
        inbox_id: 9,
      },
      event: 'message_updated',
      id: 501,
      inbox: {
        id: 9,
      },
      private: false,
    })

    await expect(service.handleWebhook(webhook)).resolves.toEqual({
      deliveredClients: 2,
      result: 'accepted',
    })
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        chatwootConversationId: 101,
        chatwootMessageId: 501,
        deliveryKey: 'delivery-1',
        eventName: 'message_updated',
        status: 'accepted',
      }),
    )
    expect(getCurrentUserChatMessages).toHaveBeenCalledWith({
      threadId: 'private:me',
      userId: 7,
    })
    expect(publishMessages).toHaveBeenCalledWith({
      primaryConversationId: 101,
      snapshot: readySnapshot,
      tenantId: 1,
      userId: 7,
    })
  })
})
