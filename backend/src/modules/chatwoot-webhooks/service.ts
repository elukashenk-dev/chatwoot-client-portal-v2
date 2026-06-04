import type { IncomingHttpHeaders } from 'node:http'

import { ApiError } from '../../lib/errors.js'
import type { ChatMessagesSnapshot } from '../chat-messages/service.js'
import type { ChatNotificationPushDeliveryService } from '../chat-notifications/pushDeliveryService.js'
import type { ChatRealtimeHub } from '../chat-realtime/hub.js'
import type { ChatUnreadService } from '../chat-unread/service.js'
import type {
  ChatwootWebhookDeliveryStatus,
  ChatwootWebhookRepository,
} from './repository.js'
import { assertChatwootWebhookPayloadTenantInvariants } from './payloadTenantInvariants.js'
import {
  CHATWOOT_DELIVERY_HEADER,
  createPayloadSha256,
  createSignatureDigest,
  readHeader,
  verifyChatwootSignature,
} from './signature.js'
import {
  handleChatwootTypingWebhook,
  isChatwootTypingEvent,
} from './typingEvents.js'

const SUPPORTED_MESSAGE_EVENTS = new Set(['message_created', 'message_updated'])

type ChatwootWebhookMapping = NonNullable<
  Awaited<
    ReturnType<
      ChatwootWebhookRepository['findConversationMappingByChatwootConversationId']
    >
  >
>

type CreateChatwootWebhookServiceOptions = {
  chatMessagesService: {
    getCurrentUserChatMessages: (input: {
      threadId?: string
      userId: number
    }) => Promise<ChatMessagesSnapshot>
  }
  chatUnreadService?: Pick<ChatUnreadService, 'recordMessageCreatedUnread'>
  chatwootAccountId: number
  chatwootPortalInboxId: number
  now?: () => Date
  pushDeliveryService?: Pick<
    ChatNotificationPushDeliveryService,
    'deliverMessageCreated'
  >
  realtimeHub: ChatRealtimeHub
  tenantId: number
  tenantSlug: string
  webhookSecret: string
  webhookRepository: ChatwootWebhookRepository
}

type HandleChatwootWebhookInput = {
  headers: IncomingHttpHeaders
  payload: unknown
  rawBody: Buffer
}

type IgnoredWebhookReason =
  | 'contact_typing'
  | 'missing_conversation'
  | 'private_message'
  | 'unmapped_conversation'
  | 'unsupported_event'

type HandleChatwootWebhookResult =
  | {
      result: 'accepted'
      deliveredClients: number
    }
  | {
      reason: IgnoredWebhookReason
      result: 'ignored'
    }
  | {
      result: 'duplicate'
    }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function readInteger(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value)
  }

  return null
}

function readObject(value: unknown) {
  return isPlainObject(value) ? value : null
}

function readEventName(payload: Record<string, unknown>) {
  return readString(payload.event)?.trim() || null
}

function readConversationId(payload: Record<string, unknown>) {
  const directConversationId = readInteger(payload.conversation_id)

  if (directConversationId !== null) {
    return directConversationId
  }

  const conversation = readObject(payload.conversation)

  return readInteger(conversation?.id)
}

function readMessageId(payload: Record<string, unknown>) {
  return readInteger(payload.id)
}

function readIsPrivate(payload: Record<string, unknown>) {
  return payload.private === true
}

function createDeliveryKey({
  headers,
  payloadSha256,
}: {
  headers: IncomingHttpHeaders
  payloadSha256: string
}) {
  return (
    readHeader(headers, CHATWOOT_DELIVERY_HEADER)?.trim() ||
    `payload:${payloadSha256}`
  )
}

function buildIgnoredResult(
  reason: IgnoredWebhookReason,
): HandleChatwootWebhookResult {
  return {
    reason,
    result: 'ignored',
  }
}

async function recordDeliveryOrReturnDuplicate({
  chatwootConversationId,
  chatwootMessageId,
  deliveryKey,
  eventName,
  now,
  payloadSha256,
  status,
  webhookRepository,
}: {
  chatwootConversationId: number | null
  chatwootMessageId: number | null
  deliveryKey: string
  eventName: string
  now: Date
  payloadSha256: string
  status: ChatwootWebhookDeliveryStatus
  webhookRepository: ChatwootWebhookRepository
}) {
  const outcome = await webhookRepository.recordDelivery({
    chatwootConversationId,
    chatwootMessageId,
    deliveryKey,
    eventName,
    now,
    payloadSha256,
    status,
  })

  return outcome === 'duplicate'
}

async function publishCurrentSnapshot({
  chatMessagesService,
  mapping,
  realtimeHub,
  tenantId,
}: {
  chatMessagesService: CreateChatwootWebhookServiceOptions['chatMessagesService']
  mapping: ChatwootWebhookMapping
  realtimeHub: ChatRealtimeHub
  tenantId: number
}) {
  return realtimeHub.publishThreadMessages({
    createSnapshotForUser: (userId) =>
      chatMessagesService.getCurrentUserChatMessages({
        threadId: mapping.threadId,
        userId,
      }),
    tenantId,
    threadId: mapping.threadId,
  })
}

export function createChatwootWebhookService({
  chatMessagesService,
  chatUnreadService,
  chatwootAccountId,
  chatwootPortalInboxId,
  now = () => new Date(),
  pushDeliveryService,
  realtimeHub,
  tenantId,
  tenantSlug,
  webhookSecret,
  webhookRepository,
}: CreateChatwootWebhookServiceOptions) {
  return {
    async handleWebhook({
      headers,
      payload,
      rawBody,
    }: HandleChatwootWebhookInput): Promise<HandleChatwootWebhookResult> {
      if (!webhookSecret.trim()) {
        throw new ApiError(
          503,
          'chatwoot_webhook_not_configured',
          'Chatwoot webhook secret is not configured.',
        )
      }

      const currentTime = now()

      if (
        !verifyChatwootSignature({
          headers,
          now: currentTime,
          rawBody,
          secret: webhookSecret,
        })
      ) {
        throw new ApiError(
          401,
          'chatwoot_webhook_signature_invalid',
          'Chatwoot webhook signature is invalid.',
        )
      }

      if (!isPlainObject(payload)) {
        throw new ApiError(
          400,
          'chatwoot_webhook_payload_invalid',
          'Chatwoot webhook payload is invalid.',
        )
      }

      assertChatwootWebhookPayloadTenantInvariants({
        chatwootAccountId,
        chatwootPortalInboxId,
        payload,
      })

      const eventName = readEventName(payload)

      if (!eventName) {
        throw new ApiError(
          400,
          'chatwoot_webhook_event_required',
          'Chatwoot webhook event is required.',
        )
      }

      const chatwootConversationId = readConversationId(payload)
      const chatwootMessageId = readMessageId(payload)
      const payloadSha256 = createPayloadSha256(rawBody)
      const deliveryKey = createDeliveryKey({
        headers,
        payloadSha256,
      })

      const isMessageEvent = SUPPORTED_MESSAGE_EVENTS.has(eventName)
      const isTypingEvent = isChatwootTypingEvent(eventName)

      if (!isMessageEvent && !isTypingEvent) {
        const isDuplicate = await recordDeliveryOrReturnDuplicate({
          chatwootConversationId,
          chatwootMessageId,
          deliveryKey,
          eventName,
          now: currentTime,
          payloadSha256,
          status: 'ignored_event',
          webhookRepository,
        })

        return isDuplicate
          ? { result: 'duplicate' }
          : buildIgnoredResult('unsupported_event')
      }

      if (isTypingEvent) {
        return handleChatwootTypingWebhook({
          chatwootConversationId,
          chatwootMessageId,
          deliveryKey,
          eventName,
          now: currentTime,
          payload,
          payloadSha256,
          realtimeHub,
          tenantId,
          webhookRepository,
        })
      }

      if (readIsPrivate(payload)) {
        const isDuplicate = await recordDeliveryOrReturnDuplicate({
          chatwootConversationId,
          chatwootMessageId,
          deliveryKey,
          eventName,
          now: currentTime,
          payloadSha256,
          status: 'ignored_private',
          webhookRepository,
        })

        return isDuplicate
          ? { result: 'duplicate' }
          : buildIgnoredResult('private_message')
      }

      if (!chatwootConversationId) {
        const isDuplicate = await recordDeliveryOrReturnDuplicate({
          chatwootConversationId: null,
          chatwootMessageId,
          deliveryKey,
          eventName,
          now: currentTime,
          payloadSha256,
          status: 'unroutable',
          webhookRepository,
        })

        return isDuplicate
          ? { result: 'duplicate' }
          : buildIgnoredResult('missing_conversation')
      }

      const mapping =
        await webhookRepository.findConversationMappingByChatwootConversationId(
          chatwootConversationId,
        )

      if (!mapping) {
        const isDuplicate = await recordDeliveryOrReturnDuplicate({
          chatwootConversationId,
          chatwootMessageId,
          deliveryKey,
          eventName,
          now: currentTime,
          payloadSha256,
          status: 'unroutable',
          webhookRepository,
        })

        return isDuplicate
          ? { result: 'duplicate' }
          : buildIgnoredResult('unmapped_conversation')
      }

      if (eventName === 'message_created' && chatUnreadService) {
        await chatUnreadService.recordMessageCreatedUnread({
          chatwootMessageId,
          threadMapping: mapping,
        })
      }

      const isDuplicate = await recordDeliveryOrReturnDuplicate({
        chatwootConversationId,
        chatwootMessageId,
        deliveryKey,
        eventName,
        now: currentTime,
        payloadSha256,
        status: 'accepted',
        webhookRepository,
      })

      if (isDuplicate) {
        return {
          result: 'duplicate',
        }
      }

      let deliveredClients = 0

      try {
        deliveredClients = await publishCurrentSnapshot({
          chatMessagesService,
          mapping,
          realtimeHub,
          tenantId,
        })
      } catch {
        // Realtime fanout is best-effort after the webhook is accepted; push delivery must still run.
      }

      if (eventName === 'message_created' && pushDeliveryService) {
        void pushDeliveryService
          .deliverMessageCreated({
            chatwootMessageId,
            tenantSlug,
            threadMapping: mapping,
          })
          .catch(() => {
            // Push is best-effort and must not break Chatwoot webhook acceptance.
          })
      }

      return {
        deliveredClients,
        result: 'accepted',
      }
    },
  }
}

export type ChatwootWebhookService = ReturnType<
  typeof createChatwootWebhookService
>

export const chatwootWebhookTestInternals = {
  createSignatureDigest,
  verifyChatwootSignature,
}
