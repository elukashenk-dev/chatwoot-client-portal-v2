import { and, eq } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import {
  chatwootWebhookDeliveries,
  portalChatThreads,
} from '../../db/schema.js'
import { PRIVATE_CHAT_THREAD_ID } from '../chat-threads/privateThread.js'

export type ChatwootWebhookDeliveryStatus =
  | 'accepted'
  | 'ignored_event'
  | 'ignored_private'
  | 'unroutable'

type RecordDeliveryInput = {
  chatwootConversationId: number | null
  chatwootMessageId: number | null
  deliveryKey: string
  eventName: string
  now: Date
  payloadSha256: string
  status: ChatwootWebhookDeliveryStatus
}

type TenantRepositoryScope = {
  tenantId: number
}

export type ChatwootConversationThreadMapping = {
  chatwootConversationId: number
  portalChatThreadId: number
  threadId: typeof PRIVATE_CHAT_THREAD_ID | `company:${number}`
  threadType: 'company' | 'private'
  userId: number | null
}

function mapThreadType(threadType: string) {
  if (threadType !== 'private' && threadType !== 'company') {
    throw new Error('Unexpected portal chat thread type.')
  }

  return threadType
}

export function createChatwootWebhookRepository(
  db: AppDatabase,
  { tenantId }: TenantRepositoryScope,
) {
  return {
    async findConversationMappingByChatwootConversationId(
      chatwootConversationId: number,
    ) {
      const [mapping] = await db
        .select({
          chatwootContactId: portalChatThreads.chatwootContactId,
          chatwootConversationId: portalChatThreads.chatwootConversationId,
          id: portalChatThreads.id,
          threadType: portalChatThreads.threadType,
          userId: portalChatThreads.portalUserId,
        })
        .from(portalChatThreads)
        .where(
          and(
            eq(portalChatThreads.tenantId, tenantId),
            eq(
              portalChatThreads.chatwootConversationId,
              chatwootConversationId,
            ),
          ),
        )
        .limit(1)

      if (!mapping || mapping.chatwootConversationId === null) {
        return null
      }

      const threadType = mapThreadType(mapping.threadType)

      return {
        chatwootConversationId: mapping.chatwootConversationId,
        portalChatThreadId: mapping.id,
        threadId:
          threadType === 'private'
            ? PRIVATE_CHAT_THREAD_ID
            : `company:${mapping.chatwootContactId}`,
        threadType,
        userId: mapping.userId,
      } satisfies ChatwootConversationThreadMapping
    },

    async recordDelivery(input: RecordDeliveryInput) {
      const [delivery] = await db
        .insert(chatwootWebhookDeliveries)
        .values({
          chatwootConversationId: input.chatwootConversationId,
          chatwootMessageId: input.chatwootMessageId,
          deliveryKey: input.deliveryKey,
          eventName: input.eventName,
          payloadSha256: input.payloadSha256,
          processedAt: input.now,
          receivedAt: input.now,
          status: input.status,
          tenantId,
        })
        .onConflictDoNothing()
        .returning({
          deliveryKey: chatwootWebhookDeliveries.deliveryKey,
        })

      return delivery ? 'recorded' : 'duplicate'
    },
  }
}

export type ChatwootWebhookRepository = ReturnType<
  typeof createChatwootWebhookRepository
>
