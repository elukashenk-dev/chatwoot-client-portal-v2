import type { ChatRealtimeHub } from '../chat-realtime/hub.js'
import type {
  ChatwootWebhookDeliveryStatus,
  ChatwootWebhookRepository,
} from './repository.js'

const SUPPORTED_TYPING_EVENTS = new Set([
  'conversation_typing_off',
  'conversation_typing_on',
])

type ChatwootWebhookMapping = NonNullable<
  Awaited<
    ReturnType<
      ChatwootWebhookRepository['findConversationMappingByChatwootConversationId']
    >
  >
>

type IgnoredTypingWebhookReason =
  | 'missing_conversation'
  | 'private_message'
  | 'unmapped_conversation'

type TypingWebhookResult =
  | {
      result: 'accepted'
      deliveredClients: number
    }
  | {
      reason: IgnoredTypingWebhookReason
      result: 'ignored'
    }
  | {
      result: 'duplicate'
    }

type HandleTypingWebhookInput = {
  chatwootConversationId: number | null
  chatwootMessageId: number | null
  deliveryKey: string
  eventName: string
  now: Date
  payload: Record<string, unknown>
  payloadSha256: string
  realtimeHub: ChatRealtimeHub
  tenantId: number
  webhookRepository: ChatwootWebhookRepository
}

export function isChatwootTypingEvent(eventName: string) {
  return SUPPORTED_TYPING_EVENTS.has(eventName)
}

function readIsPrivateTyping(payload: Record<string, unknown>) {
  return payload.is_private === true
}

function buildIgnoredResult(
  reason: IgnoredTypingWebhookReason,
): TypingWebhookResult {
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

async function findTypingMapping({
  chatwootConversationId,
  webhookRepository,
}: {
  chatwootConversationId: number
  webhookRepository: ChatwootWebhookRepository
}): Promise<ChatwootWebhookMapping | null> {
  return webhookRepository.findConversationMappingByChatwootConversationId(
    chatwootConversationId,
  )
}

export async function handleChatwootTypingWebhook({
  chatwootConversationId,
  chatwootMessageId,
  deliveryKey,
  eventName,
  now,
  payload,
  payloadSha256,
  realtimeHub,
  tenantId,
  webhookRepository,
}: HandleTypingWebhookInput): Promise<TypingWebhookResult> {
  if (readIsPrivateTyping(payload)) {
    const isDuplicate = await recordDeliveryOrReturnDuplicate({
      chatwootConversationId,
      chatwootMessageId,
      deliveryKey,
      eventName,
      now,
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
      now,
      payloadSha256,
      status: 'unroutable',
      webhookRepository,
    })

    return isDuplicate
      ? { result: 'duplicate' }
      : buildIgnoredResult('missing_conversation')
  }

  const mapping = await findTypingMapping({
    chatwootConversationId,
    webhookRepository,
  })

  if (!mapping) {
    const isDuplicate = await recordDeliveryOrReturnDuplicate({
      chatwootConversationId,
      chatwootMessageId,
      deliveryKey,
      eventName,
      now,
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
    now,
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
    deliveredClients = realtimeHub.publishThreadTyping({
      isTyping: eventName === 'conversation_typing_on',
      tenantId,
      threadId: mapping.threadId,
    })
  } catch {
    // Realtime typing is transient and best-effort after webhook acceptance.
  }

  return {
    deliveredClients,
    result: 'accepted',
  }
}
