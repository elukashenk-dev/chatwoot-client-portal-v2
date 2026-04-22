import { eq } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import {
  chatwootWebhookDeliveries,
  portalUserChatwootConversations,
} from '../../db/schema.js'

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

export function createChatwootWebhookRepository(db: AppDatabase) {
  return {
    async findConversationMappingByChatwootConversationId(
      chatwootConversationId: number,
    ) {
      const [mapping] = await db
        .select({
          chatwootContactId: portalUserChatwootConversations.chatwootContactId,
          chatwootConversationId:
            portalUserChatwootConversations.chatwootConversationId,
          chatwootInboxId: portalUserChatwootConversations.chatwootInboxId,
          userId: portalUserChatwootConversations.userId,
        })
        .from(portalUserChatwootConversations)
        .where(
          eq(
            portalUserChatwootConversations.chatwootConversationId,
            chatwootConversationId,
          ),
        )
        .limit(1)

      return mapping ?? null
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
