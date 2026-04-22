import {
  createHash,
  createHmac,
  timingSafeEqual,
  type BinaryLike,
} from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'
import type { ChatMessagesSnapshot } from '../chat-messages/service.js'
import type { ChatRealtimeHub } from '../chat-realtime/hub.js'
import type {
  ChatwootWebhookDeliveryStatus,
  ChatwootWebhookRepository,
} from './repository.js'

const CHATWOOT_SIGNATURE_HEADER = 'x-chatwoot-signature'
const CHATWOOT_TIMESTAMP_HEADER = 'x-chatwoot-timestamp'
const CHATWOOT_DELIVERY_HEADER = 'x-chatwoot-delivery'
const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 5 * 60
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
      primaryConversationId?: number | null
      userId: number
    }) => Promise<ChatMessagesSnapshot>
  }
  env: Pick<AppEnv, 'CHATWOOT_WEBHOOK_SECRET'>
  now?: () => Date
  realtimeHub: ChatRealtimeHub
  webhookRepository: ChatwootWebhookRepository
}

type HandleChatwootWebhookInput = {
  headers: IncomingHttpHeaders
  payload: unknown
  rawBody: Buffer
}

type IgnoredWebhookReason =
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

function readHeader(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name]

  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function readInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function readObject(value: unknown) {
  return isPlainObject(value) ? value : null
}

function createPayloadSha256(payload: BinaryLike) {
  return createHash('sha256').update(payload).digest('hex')
}

function createSignatureDigest({
  rawBody,
  secret,
  timestamp,
}: {
  rawBody: Buffer
  secret: string
  timestamp: string
}) {
  return `sha256=${createHmac('sha256', secret)
    .update(timestamp)
    .update('.')
    .update(rawBody)
    .digest('hex')}`
}

function isTimingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return (
    leftBuffer.byteLength === rightBuffer.byteLength &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

function verifyChatwootSignature({
  headers,
  now,
  rawBody,
  secret,
}: {
  headers: IncomingHttpHeaders
  now: Date
  rawBody: Buffer
  secret: string
}) {
  const signature = readHeader(headers, CHATWOOT_SIGNATURE_HEADER)
  const timestamp = readHeader(headers, CHATWOOT_TIMESTAMP_HEADER)

  if (!signature || !timestamp) {
    return false
  }

  const timestampSeconds = Number(timestamp)

  if (!Number.isInteger(timestampSeconds)) {
    return false
  }

  if (
    Math.abs(Math.floor(now.getTime() / 1000) - timestampSeconds) >
    WEBHOOK_SIGNATURE_TOLERANCE_SECONDS
  ) {
    return false
  }

  const expectedSignature = createSignatureDigest({
    rawBody,
    secret,
    timestamp,
  })

  return isTimingSafeEqual(signature, expectedSignature)
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
  primaryConversationId,
  realtimeHub,
}: {
  chatMessagesService: CreateChatwootWebhookServiceOptions['chatMessagesService']
  mapping: ChatwootWebhookMapping
  primaryConversationId: number
  realtimeHub: ChatRealtimeHub
}) {
  const snapshot = await chatMessagesService.getCurrentUserChatMessages({
    primaryConversationId,
    userId: mapping.userId,
  })

  return realtimeHub.publishMessages({
    primaryConversationId,
    snapshot,
    userId: mapping.userId,
  })
}

export function createChatwootWebhookService({
  chatMessagesService,
  env,
  now = () => new Date(),
  realtimeHub,
  webhookRepository,
}: CreateChatwootWebhookServiceOptions) {
  return {
    async handleWebhook({
      headers,
      payload,
      rawBody,
    }: HandleChatwootWebhookInput): Promise<HandleChatwootWebhookResult> {
      if (!env.CHATWOOT_WEBHOOK_SECRET) {
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
          secret: env.CHATWOOT_WEBHOOK_SECRET,
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

      if (!SUPPORTED_MESSAGE_EVENTS.has(eventName)) {
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

      const deliveredClients = await publishCurrentSnapshot({
        chatMessagesService,
        mapping,
        primaryConversationId: chatwootConversationId,
        realtimeHub,
      })

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
