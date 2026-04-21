import { eq } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import {
  portalUserChatwootConversations,
  portalUserContactLinks,
  portalUsers,
} from '../../db/schema.js'

type ContactLinkInput = {
  chatwootContactId: number
  userId: number
}

type ConversationMappingInput = {
  chatwootContactId: number
  chatwootConversationId: number
  chatwootInboxId: number
  now: Date
  userId: number
}

export function createChatContextRepository(db: AppDatabase) {
  async function findContactLinkByUserId(userId: number) {
    const [link] = await db
      .select({
        chatwootContactId: portalUserContactLinks.chatwootContactId,
        userId: portalUserContactLinks.userId,
      })
      .from(portalUserContactLinks)
      .where(eq(portalUserContactLinks.userId, userId))
      .limit(1)

    return link ?? null
  }

  return {
    async createContactLink({ chatwootContactId, userId }: ContactLinkInput) {
      const [link] = await db
        .insert(portalUserContactLinks)
        .values({
          chatwootContactId,
          userId,
        })
        .onConflictDoNothing()
        .returning({
          chatwootContactId: portalUserContactLinks.chatwootContactId,
          userId: portalUserContactLinks.userId,
        })

      return link ?? findContactLinkByUserId(userId)
    },

    findContactLinkByUserId,

    async findPortalUserById(userId: number) {
      const [user] = await db
        .select({
          email: portalUsers.email,
          id: portalUsers.id,
        })
        .from(portalUsers)
        .where(eq(portalUsers.id, userId))
        .limit(1)

      return user ?? null
    },

    async findConversationMappingByUserId(userId: number) {
      const [mapping] = await db
        .select({
          chatwootContactId: portalUserChatwootConversations.chatwootContactId,
          chatwootConversationId:
            portalUserChatwootConversations.chatwootConversationId,
          chatwootInboxId: portalUserChatwootConversations.chatwootInboxId,
          userId: portalUserChatwootConversations.userId,
        })
        .from(portalUserChatwootConversations)
        .where(eq(portalUserChatwootConversations.userId, userId))
        .limit(1)

      return mapping ?? null
    },

    async upsertConversationMapping({
      chatwootContactId,
      chatwootConversationId,
      chatwootInboxId,
      now,
      userId,
    }: ConversationMappingInput) {
      const [mapping] = await db
        .insert(portalUserChatwootConversations)
        .values({
          chatwootContactId,
          chatwootConversationId,
          chatwootInboxId,
          updatedAt: now,
          userId,
        })
        .onConflictDoUpdate({
          set: {
            chatwootContactId,
            chatwootConversationId,
            chatwootInboxId,
            updatedAt: now,
          },
          target: portalUserChatwootConversations.userId,
        })
        .returning({
          chatwootContactId: portalUserChatwootConversations.chatwootContactId,
          chatwootConversationId:
            portalUserChatwootConversations.chatwootConversationId,
          chatwootInboxId: portalUserChatwootConversations.chatwootInboxId,
          userId: portalUserChatwootConversations.userId,
        })

      return mapping ?? null
    },
  }
}

export type ChatContextRepository = ReturnType<
  typeof createChatContextRepository
>
