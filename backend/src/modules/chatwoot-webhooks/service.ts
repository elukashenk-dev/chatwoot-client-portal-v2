import type { IncomingHttpHeaders } from 'node:http'

import { ApiError } from '../../lib/errors.js'
import type { ChatRealtimeHub } from '../chat-realtime/hub.js'
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

type CreateChatwootWebhookServiceOptions = {
  chatwootAccountId: number
  chatwootBaseUrl: string
  chatwootPortalInboxId: number
  now?: () => Date
  notifyAccepted?: () => void
  realtimeHub: ChatRealtimeHub
  tenantId: number
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
  | 'missing_message'
  | 'private_message'
  | 'unmapped_conversation'
  | 'unsupported_event'

type HandleChatwootWebhookResult =
  | {
      result: 'accepted'
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
  source,
  webhookRepository,
}: {
  chatwootConversationId: number | null
  chatwootMessageId: number | null
  deliveryKey: string
  eventName: string
  now: Date
  payloadSha256: string
  status: ChatwootWebhookDeliveryStatus
  source?: { accountId: number; inboxId: number; baseUrl: string }
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
    ...(source ? { source } : {}),
  })

  return outcome === 'duplicate'
}

export function createChatwootWebhookService({
  chatwootAccountId,
  chatwootBaseUrl,
  chatwootPortalInboxId,
  now = () => new Date(),
  notifyAccepted = () => {},
  realtimeHub,
  tenantId,
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
          'Webhook системы поддержки не настроен.',
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
          'Подпись webhook системы поддержки недействительна.',
        )
      }

      if (!isPlainObject(payload)) {
        throw new ApiError(
          400,
          'chatwoot_webhook_payload_invalid',
          'Payload webhook системы поддержки некорректен.',
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
          'Событие webhook системы поддержки обязательно.',
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

      if (
        eventName === 'message_created' &&
        (!chatwootMessageId || chatwootMessageId < 1)
      ) {
        const duplicate = await recordDeliveryOrReturnDuplicate({
          chatwootConversationId,
          chatwootMessageId,
          deliveryKey,
          eventName,
          now: currentTime,
          payloadSha256,
          status: 'unroutable',
          webhookRepository,
        })
        return duplicate
          ? { result: 'duplicate' }
          : buildIgnoredResult('missing_message')
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

      const isDuplicate = await recordDeliveryOrReturnDuplicate({
        chatwootConversationId,
        chatwootMessageId,
        deliveryKey,
        eventName,
        now: currentTime,
        payloadSha256,
        status: 'accepted',
        source: {
          accountId: chatwootAccountId,
          inboxId: chatwootPortalInboxId,
          baseUrl: chatwootBaseUrl,
        },
        webhookRepository,
      })

      if (isDuplicate) {
        return {
          result: 'duplicate',
        }
      }

      try {
        notifyAccepted()
      } catch {
        /* Durable polling recovers a missed wakeup. */
      }
      return {
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
