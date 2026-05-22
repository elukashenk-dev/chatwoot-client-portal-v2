import { describe, expect, it, vi } from 'vitest'

import type { ChatMessagesSnapshot } from '../chat-messages/service.js'
import { createChatRealtimeHub } from '../chat-realtime/hub.js'
import { createChatwootWebhookService } from './service.js'
import { chatwootWebhookTestInternals } from './service.js'

type CreateChatwootWebhookServiceOptions = Parameters<
  typeof createChatwootWebhookService
>[0]
type FindConversationMapping =
  CreateChatwootWebhookServiceOptions['webhookRepository']['findConversationMappingByChatwootConversationId']
type GetCurrentUserChatMessages =
  CreateChatwootWebhookServiceOptions['chatMessagesService']['getCurrentUserChatMessages']
type PublishThreadMessages =
  CreateChatwootWebhookServiceOptions['realtimeHub']['publishThreadMessages']
type RecordDelivery =
  CreateChatwootWebhookServiceOptions['webhookRepository']['recordDelivery']

const webhookSecret = 'test-webhook-secret'
const now = new Date('2026-04-21T12:00:00.000Z')
const timestamp = String(Math.floor(now.getTime() / 1000))

const readySnapshot: ChatMessagesSnapshot = {
  hasMoreOlder: false,
  activeThread: {
    id: 'private:me',
    subtitle: 'Вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  },
  messages: [
    {
      attachments: [],
      authorName: 'Анна Смирнова',
      authorRole: 'agent',
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
    publishThreadMessages?: PublishThreadMessages
    realtimeHub?: CreateChatwootWebhookServiceOptions['realtimeHub']
    recordDelivery?: RecordDelivery
  } = {},
) {
  const findConversationMappingByChatwootConversationId =
    overrides.findConversationMappingByChatwootConversationId ??
    vi.fn<FindConversationMapping>().mockResolvedValue({
      chatwootConversationId: 101,
      portalChatThreadId: 1,
      threadId: 'private:me',
      threadType: 'private',
      userId: 7,
    })
  const getCurrentUserChatMessages =
    overrides.getCurrentUserChatMessages ??
    vi.fn<GetCurrentUserChatMessages>().mockResolvedValue(readySnapshot)
  const publishThreadMessages =
    overrides.publishThreadMessages ??
    vi.fn<PublishThreadMessages>(async ({ createSnapshotForUser }) => {
      await createSnapshotForUser(7)

      return 2
    })
  const recordDelivery =
    overrides.recordDelivery ??
    vi.fn<RecordDelivery>().mockResolvedValue('recorded')
  const realtimeHub =
    overrides.realtimeHub ??
    ({
      publishThreadMessages,
      subscribe:
        vi.fn<
          CreateChatwootWebhookServiceOptions['realtimeHub']['subscribe']
        >(),
    } satisfies CreateChatwootWebhookServiceOptions['realtimeHub'])
  const service = createChatwootWebhookService({
    chatMessagesService: {
      getCurrentUserChatMessages,
    },
    chatwootAccountId: 3,
    chatwootPortalInboxId: 9,
    now: () => now,
    realtimeHub,
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
    publishThreadMessages,
    recordDelivery,
    realtimeHub,
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
      publishThreadMessages,
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
    expect(publishThreadMessages).not.toHaveBeenCalled()
  })

  it('records private/internal message events without refreshing the public transcript', async () => {
    const {
      getCurrentUserChatMessages,
      publishThreadMessages,
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
    expect(publishThreadMessages).not.toHaveBeenCalled()
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
    const { publishThreadMessages, recordDelivery, service } = createService()
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
    expect(publishThreadMessages).not.toHaveBeenCalled()
  })

  it('publishes the canonical latest snapshot for a mapped message event', async () => {
    const {
      getCurrentUserChatMessages,
      publishThreadMessages,
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
    expect(publishThreadMessages).toHaveBeenCalledWith({
      createSnapshotForUser: expect.any(Function),
      tenantId: 1,
      threadId: 'private:me',
    })
  })

  it('fans out a group webhook only to active subscribers whose thread access is still ready', async () => {
    const realtimeHub = createChatRealtimeHub()
    const firstSend = vi.fn()
    const secondSend = vi.fn()
    realtimeHub.subscribe({
      send: firstSend,
      tenantId: 1,
      threadId: 'group:154',
      userId: 7,
    })
    realtimeHub.subscribe({
      send: secondSend,
      tenantId: 1,
      threadId: 'group:154',
      userId: 8,
    })
    const readyGroupSnapshot: ChatMessagesSnapshot = {
      ...readySnapshot,
      activeThread: {
        id: 'group:154',
        subtitle: 'Групповой чат',
        title: 'ООО "Ромашка"',
        type: 'group',
      },
    }
    const revokedSnapshot: ChatMessagesSnapshot = {
      activeThread: null,
      hasMoreOlder: false,
      messages: [],
      nextOlderCursor: null,
      reason: 'thread_access_denied',
      result: 'not_ready',
    }
    const getCurrentUserChatMessages = vi.fn<GetCurrentUserChatMessages>(
      async ({ userId }) =>
        userId === 7 ? revokedSnapshot : readyGroupSnapshot,
    )
    const { service } = createService({
      findConversationMappingByChatwootConversationId: vi
        .fn<FindConversationMapping>()
        .mockResolvedValue({
          chatwootConversationId: 301,
          portalChatThreadId: 2,
          threadId: 'group:154',
          threadType: 'group',
          userId: null,
        }),
      getCurrentUserChatMessages,
      realtimeHub,
    })
    const webhook = createSignedWebhook({
      account: {
        id: 3,
      },
      conversation: {
        account_id: 3,
        id: 301,
        inbox_id: 9,
      },
      event: 'message_created',
      id: 801,
      inbox: {
        id: 9,
      },
      private: false,
    })

    await expect(service.handleWebhook(webhook)).resolves.toEqual({
      deliveredClients: 1,
      result: 'accepted',
    })
    expect(getCurrentUserChatMessages).toHaveBeenCalledTimes(2)
    expect(getCurrentUserChatMessages).toHaveBeenCalledWith({
      threadId: 'group:154',
      userId: 7,
    })
    expect(getCurrentUserChatMessages).toHaveBeenCalledWith({
      threadId: 'group:154',
      userId: 8,
    })
    expect(firstSend).not.toHaveBeenCalled()
    expect(secondSend).toHaveBeenCalledWith({
      data: readyGroupSnapshot,
      type: 'messages',
    })
  })

  it('keeps an unmapped Chatwoot conversation unroutable without recovery from contact validity alone', async () => {
    const {
      getCurrentUserChatMessages,
      publishThreadMessages,
      recordDelivery,
      service,
    } = createService({
      findConversationMappingByChatwootConversationId: vi
        .fn<FindConversationMapping>()
        .mockResolvedValue(null),
    })
    const webhook = createSignedWebhook({
      account: {
        id: 3,
      },
      conversation: {
        account_id: 3,
        id: 404,
        inbox_id: 9,
      },
      event: 'message_created',
      id: 901,
      inbox: {
        id: 9,
      },
      private: false,
    })

    await expect(service.handleWebhook(webhook)).resolves.toEqual({
      reason: 'unmapped_conversation',
      result: 'ignored',
    })
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        chatwootConversationId: 404,
        chatwootMessageId: 901,
        status: 'unroutable',
      }),
    )
    expect(getCurrentUserChatMessages).not.toHaveBeenCalled()
    expect(publishThreadMessages).not.toHaveBeenCalled()
  })
})
