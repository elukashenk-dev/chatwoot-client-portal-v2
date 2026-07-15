import { describe, expect, it, vi } from 'vitest'

import type { ChatMessagesSnapshot } from '../chat-messages/service.js'
import { createChatwootWebhookService } from './service.js'
import { chatwootWebhookTestInternals } from './service.js'

type CreateChatwootWebhookServiceOptions = Parameters<
  typeof createChatwootWebhookService
>[0]
type DeliverMessageCreated = NonNullable<
  CreateChatwootWebhookServiceOptions['pushDeliveryService']
>['deliverMessageCreated']
type FindConversationMapping =
  CreateChatwootWebhookServiceOptions['webhookRepository']['findConversationMappingByChatwootConversationId']
type GetCurrentUserChatMessages =
  CreateChatwootWebhookServiceOptions['chatMessagesService']['getCurrentUserChatMessages']
type PublishThreadMessages =
  CreateChatwootWebhookServiceOptions['realtimeHub']['publishThreadMessages']
type PublishThreadTyping =
  CreateChatwootWebhookServiceOptions['realtimeHub']['publishThreadTyping']
type RecordDelivery =
  CreateChatwootWebhookServiceOptions['webhookRepository']['recordDelivery']
type RecordMessageCreatedUnread = NonNullable<
  CreateChatwootWebhookServiceOptions['chatUnreadService']
>['recordMessageCreatedUnread']

const webhookSecret = 'test-webhook-secret'
const now = new Date('2026-04-21T12:00:00.000Z')
const timestamp = String(Math.floor(now.getTime() / 1000))

const readySnapshot: ChatMessagesSnapshot = {
  activeThread: {
    id: 'private:me',
    subtitle: 'Вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  },
  hasMoreOlder: false,
  messages: [],
  nextOlderCursor: null,
  reason: 'none',
  result: 'ready',
}

function createSignedWebhook(payload: Record<string, unknown>) {
  const rawBody = Buffer.from(JSON.stringify(payload))

  return {
    headers: {
      'x-chatwoot-delivery': 'typing-delivery-1',
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

function createTypingPayload(
  event: 'conversation_typing_off' | 'conversation_typing_on',
  overrides: Record<string, unknown> = {},
) {
  return {
    account: {
      id: 3,
    },
    conversation: {
      account_id: 3,
      id: 101,
      inbox_id: 9,
    },
    event,
    inbox: {
      id: 9,
    },
    is_private: false,
    user: {
      email: 'agent@example.test',
      id: 2,
      name: 'Agent',
      type: 'user',
    },
    ...overrides,
  }
}

function createService(
  overrides: {
    findConversationMappingByChatwootConversationId?: FindConversationMapping
    getCurrentUserChatMessages?: GetCurrentUserChatMessages
    chatUnreadService?: CreateChatwootWebhookServiceOptions['chatUnreadService']
    publishThreadMessages?: PublishThreadMessages
    publishThreadTyping?: PublishThreadTyping
    pushDeliveryService?: CreateChatwootWebhookServiceOptions['pushDeliveryService']
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
    vi.fn<PublishThreadMessages>().mockResolvedValue(2)
  const publishThreadTyping =
    overrides.publishThreadTyping ?? vi.fn<PublishThreadTyping>(() => 2)
  const recordDelivery =
    overrides.recordDelivery ??
    vi.fn<RecordDelivery>().mockResolvedValue('recorded')
  const chatUnreadService = overrides.chatUnreadService
  const pushDeliveryService = overrides.pushDeliveryService
  const service = createChatwootWebhookService({
    chatMessagesService: {
      getCurrentUserChatMessages,
    },
    ...(chatUnreadService ? { chatUnreadService } : {}),
    chatwootAccountId: 3,
    chatwootPortalInboxId: 9,
    now: () => now,
    ...(pushDeliveryService ? { pushDeliveryService } : {}),
    realtimeHub: {
      publishThreadMessages,
      publishThreadTyping,
      subscribe: vi.fn(),
    },
    tenantId: 1,
    tenantSlug: 'default',
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
    publishThreadTyping,
    recordDelivery,
    service,
  }
}

describe('createChatwootWebhookService typing events', () => {
  it('publishes mapped agent typing on events without snapshot, unread, or push side effects', async () => {
    const deliverMessageCreated = vi.fn<DeliverMessageCreated>()
    const recordMessageCreatedUnread = vi.fn<RecordMessageCreatedUnread>()
    const {
      getCurrentUserChatMessages,
      publishThreadMessages,
      publishThreadTyping,
      recordDelivery,
      service,
    } = createService({
      chatUnreadService: {
        recordMessageCreatedUnread,
      },
      pushDeliveryService: {
        deliverMessageCreated,
      },
    })
    const webhook = createSignedWebhook(
      createTypingPayload('conversation_typing_on'),
    )

    await expect(service.handleWebhook(webhook)).resolves.toEqual({
      deliveredClients: 2,
      result: 'accepted',
    })
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        chatwootConversationId: 101,
        chatwootMessageId: null,
        deliveryKey: 'typing-delivery-1',
        eventName: 'conversation_typing_on',
        status: 'accepted',
      }),
    )
    expect(publishThreadTyping).toHaveBeenCalledWith({
      isTyping: true,
      tenantId: 1,
      threadId: 'private:me',
    })
    expect(getCurrentUserChatMessages).not.toHaveBeenCalled()
    expect(publishThreadMessages).not.toHaveBeenCalled()
    expect(recordMessageCreatedUnread).not.toHaveBeenCalled()
    expect(deliverMessageCreated).not.toHaveBeenCalled()
  })

  it('publishes mapped agent typing off events', async () => {
    const { publishThreadTyping, service } = createService()
    const webhook = createSignedWebhook(
      createTypingPayload('conversation_typing_off'),
    )

    await expect(service.handleWebhook(webhook)).resolves.toEqual({
      deliveredClients: 2,
      result: 'accepted',
    })
    expect(publishThreadTyping).toHaveBeenCalledWith({
      isTyping: false,
      tenantId: 1,
      threadId: 'private:me',
    })
  })

  it('deduplicates typing deliveries before publishing to portal realtime', async () => {
    const { publishThreadTyping, recordDelivery, service } = createService({
      recordDelivery: vi.fn<RecordDelivery>().mockResolvedValue('duplicate'),
    })
    const webhook = createSignedWebhook(
      createTypingPayload('conversation_typing_on'),
    )

    await expect(service.handleWebhook(webhook)).resolves.toEqual({
      result: 'duplicate',
    })
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'conversation_typing_on',
        status: 'accepted',
      }),
    )
    expect(publishThreadTyping).not.toHaveBeenCalled()
  })

  it('ignores private typing events without publishing to portal realtime', async () => {
    const { publishThreadTyping, recordDelivery, service } = createService()
    const webhook = createSignedWebhook(
      createTypingPayload('conversation_typing_on', {
        is_private: true,
      }),
    )

    await expect(service.handleWebhook(webhook)).resolves.toEqual({
      reason: 'private_message',
      result: 'ignored',
    })
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        chatwootConversationId: 101,
        chatwootMessageId: null,
        status: 'ignored_private',
      }),
    )
    expect(publishThreadTyping).not.toHaveBeenCalled()
  })

  it('ignores contact typing echo from portal users without publishing it back to portal realtime', async () => {
    const { publishThreadTyping, recordDelivery, service } = createService()
    const webhook = createSignedWebhook(
      createTypingPayload('conversation_typing_on', {
        user: {
          account: {
            id: 3,
          },
          custom_attributes: {
            portal_enabled: true,
          },
          email: 'customer@example.test',
          id: 33,
          name: 'Customer',
        },
      }),
    )

    await expect(service.handleWebhook(webhook)).resolves.toEqual({
      reason: 'contact_typing',
      result: 'ignored',
    })
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        chatwootConversationId: 101,
        chatwootMessageId: null,
        status: 'ignored_contact',
      }),
    )
    expect(publishThreadTyping).not.toHaveBeenCalled()
  })

  it('keeps typing webhooks without a conversation id unroutable', async () => {
    const {
      findConversationMappingByChatwootConversationId,
      publishThreadTyping,
      recordDelivery,
      service,
    } = createService()
    const webhook = createSignedWebhook(
      createTypingPayload('conversation_typing_on', {
        conversation: undefined,
      }),
    )

    await expect(service.handleWebhook(webhook)).resolves.toEqual({
      reason: 'missing_conversation',
      result: 'ignored',
    })
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        chatwootConversationId: null,
        chatwootMessageId: null,
        status: 'unroutable',
      }),
    )
    expect(
      findConversationMappingByChatwootConversationId,
    ).not.toHaveBeenCalled()
    expect(publishThreadTyping).not.toHaveBeenCalled()
  })
})
