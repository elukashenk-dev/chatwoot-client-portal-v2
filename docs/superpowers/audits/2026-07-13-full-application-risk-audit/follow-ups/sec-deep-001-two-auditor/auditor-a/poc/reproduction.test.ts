import { describe, expect, it, vi } from 'vitest'

import type { ChatwootMessage } from '../../../../../../../../backend/src/integrations/chatwoot/client.js'
import { getCurrentUserChatSearch } from '../../../../../../../../backend/src/modules/chat-messages/searchService.js'
import type { CurrentUserChatThreadContext } from '../../../../../../../../backend/src/modules/chat-threads/types.js'
import {
  chatwootWebhookTestInternals,
  createChatwootWebhookService,
} from '../../../../../../../../backend/src/modules/chatwoot-webhooks/service.js'

function createReadyContext(): CurrentUserChatThreadContext {
  return {
    activeThread: {
      id: 'private:me',
      subtitle: 'Вы и поддержка',
      title: 'Личный чат',
      type: 'private',
    },
    chatwootContactSourceId: 'portal-contact:source',
    chatwootConversation: {
      assigneeName: null,
      id: 1001,
      inboxId: 9,
      lastActivityAt: 1_779_148_800,
      status: 'open',
    },
    currentUserEmail: 'user@example.test',
    currentUserName: 'Portal User',
    linkedContactId: 44,
    portalChatThreadId: 10,
    reason: 'none',
    result: 'ready',
    targetChatwootContactId: 44,
    threadType: 'private',
  }
}

function createReplyingMessage(id: number, replyTo: number): ChatwootMessage {
  return {
    attachments: [],
    content: `ordinary message ${id}`,
    contentAttributes: { in_reply_to: replyTo },
    contentType: 'text',
    createdAt: 1_779_148_800,
    id,
    messageType: 1,
    private: false,
    sender: { id: 8, name: 'Support', type: 'user' },
    sourceId: null,
    status: 'sent',
  }
}

describe('Auditor A bounded reproductions', () => {
  it('accepts one signed webhook body twice when only the unsigned delivery header changes', async () => {
    const acceptedKeys = new Set<string>()
    const recordDelivery = vi.fn(async (input: { deliveryKey: string }) => {
      if (acceptedKeys.has(input.deliveryKey)) return 'duplicate' as const
      acceptedKeys.add(input.deliveryKey)
      return 'recorded' as const
    })
    const publishThreadMessages = vi.fn(async () => 1)
    const service = createChatwootWebhookService({
      chatMessagesService: {
        getCurrentUserChatMessages: vi.fn(),
      },
      chatwootAccountId: 3,
      chatwootPortalInboxId: 9,
      now: () => new Date('2026-07-19T12:00:00.000Z'),
      realtimeHub: {
        publishThreadMessages,
        publishThreadTyping: vi.fn(),
        subscribe: vi.fn(),
      },
      tenantId: 1,
      tenantSlug: 'default',
      webhookRepository: {
        findConversationMappingByChatwootConversationId: vi
          .fn()
          .mockResolvedValue({
            chatwootConversationId: 101,
            portalChatThreadId: 1,
            threadId: 'private:me',
            threadType: 'private',
            userId: 7,
          }),
        recordDelivery,
      },
      webhookSecret: 'test-webhook-secret',
    })
    const payload = {
      account: { id: 3 },
      conversation: { account_id: 3, id: 101, inbox_id: 9 },
      event: 'message_updated',
      id: 501,
      inbox: { id: 9 },
      private: false,
    }
    const rawBody = Buffer.from(JSON.stringify(payload))
    const timestamp = String(
      Math.floor(new Date('2026-07-19T12:00:00.000Z').getTime() / 1000),
    )
    const signature = chatwootWebhookTestInternals.createSignatureDigest({
      rawBody,
      secret: 'test-webhook-secret',
      timestamp,
    })

    for (const delivery of ['delivery-a', 'delivery-b']) {
      await expect(
        service.handleWebhook({
          headers: {
            'x-chatwoot-delivery': delivery,
            'x-chatwoot-signature': signature,
            'x-chatwoot-timestamp': timestamp,
          },
          payload,
          rawBody,
        }),
      ).resolves.toMatchObject({ result: 'accepted' })
    }

    expect(
      recordDelivery.mock.calls.map(([input]) => input.deliveryKey),
    ).toEqual(['delivery-a', 'delivery-b'])
    expect(publishThreadMessages).toHaveBeenCalledTimes(2)
  })

  it('performs 160 reply-target lookups while scanning the bounded eight-page search window', async () => {
    const pages = Array.from({ length: 8 }, (_, pageIndex) => ({
      hasMoreOlder: true,
      messages: Array.from({ length: 20 }, (_, messageIndex) => {
        const id = 10_000 - pageIndex * 100 - messageIndex
        return createReplyingMessage(id, id - 1_000)
      }),
      nextOlderCursor: 9_900 - pageIndex * 100,
    }))
    const listConversationMessages = vi.fn()
    for (const page of pages)
      listConversationMessages.mockResolvedValueOnce(page)
    const findConversationMessageById = vi.fn().mockResolvedValue(null)

    await expect(
      getCurrentUserChatSearch({
        chatThreadsRepository: {
          findSendLedgerAuthorsByMessageIds: vi.fn(),
        },
        chatThreadsService: {
          getCurrentUserThreadContext: vi
            .fn()
            .mockResolvedValue(createReadyContext()),
        },
        chatwootClient: {
          findConversationMessageById,
          listConversationMessages,
        },
        query: 'needle',
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toMatchObject({ items: [], result: 'ready' })

    expect(listConversationMessages).toHaveBeenCalledTimes(8)
    expect(findConversationMessageById).toHaveBeenCalledTimes(160)
  })
})
