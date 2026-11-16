import { describe, expect, it, vi } from 'vitest'

import type { ChatMessagesSnapshot } from '../chat-messages/service.js'
import { createChatwootWebhookService } from './service.js'
import { chatwootWebhookTestInternals } from './service.js'

type CreateChatwootWebhookServiceOptions = Parameters<
  typeof createChatwootWebhookService
>[0]
type FindConversationMapping =
  CreateChatwootWebhookServiceOptions['webhookRepository']['findConversationMappingByChatwootConversationId']
type GetCurrentUserChatMessages = (input: {
  userId: number
  threadId?: string
}) => Promise<ChatMessagesSnapshot>
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
      chatwootInboxId: 9,
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
      publishThreadTyping: vi.fn(),
      subscribe:
        vi.fn<
          CreateChatwootWebhookServiceOptions['realtimeHub']['subscribe']
        >(),
    } satisfies CreateChatwootWebhookServiceOptions['realtimeHub'])
  const service = createChatwootWebhookService({
    chatwootAccountId: 3,
    chatwootBaseUrl: 'https://chatwoot.example.test',
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

  it('acknowledges durably accepted work without waiting for snapshot delivery', async () => {
    const publishThreadMessages = vi.fn<PublishThreadMessages>(
      () => new Promise(() => {}),
    )
    const { service, recordDelivery } = createService({ publishThreadMessages })
    await expect(
      service.handleWebhook(
        createSignedWebhook({
          conversation: { id: 101 },
          event: 'message_created',
          id: 501,
        }),
      ),
    ).resolves.toEqual({ result: 'accepted' })
    expect(recordDelivery).toHaveBeenCalledOnce()
    expect(publishThreadMessages).not.toHaveBeenCalled()
  })

  it('does not acknowledge a failed durable acceptance', async () => {
    const { service } = createService({
      recordDelivery: vi
        .fn()
        .mockRejectedValue(new Error('database unavailable')),
    })
    await expect(
      service.handleWebhook(
        createSignedWebhook({
          conversation: { id: 101 },
          event: 'message_created',
          id: 501,
        }),
      ),
    ).rejects.toThrow('database unavailable')
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
