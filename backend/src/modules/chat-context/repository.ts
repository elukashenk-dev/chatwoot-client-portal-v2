import { createHash } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'

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

type TenantRepositoryScope = {
  tenantId: number
}

function createConversationBootstrapLockKey(
  tenantId: number,
  chatwootContactId: number,
) {
  const digest = createHash('sha256')
    .update(
      `chat-context:conversation-bootstrap:${tenantId}:${chatwootContactId}`,
    )
    .digest()

  return [digest.readInt32BE(0), digest.readInt32BE(4)] as const
}

export function createChatContextRepository(
  db: AppDatabase,
  { tenantId }: TenantRepositoryScope,
) {
  async function findContactLinkByUserId(userId: number) {
    const [link] = await db
      .select({
        chatwootContactId: portalUserContactLinks.chatwootContactId,
        userId: portalUserContactLinks.userId,
      })
      .from(portalUserContactLinks)
      .where(
        and(
          eq(portalUserContactLinks.tenantId, tenantId),
          eq(portalUserContactLinks.userId, userId),
        ),
      )
      .limit(1)

    return link ?? null
  }

  return {
    async transactionWithConversationBootstrapLock<T>(
      chatwootContactId: number,
      handler: () => Promise<T>,
    ) {
      const [lockKeyPartOne, lockKeyPartTwo] =
        createConversationBootstrapLockKey(tenantId, chatwootContactId)

      return db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${lockKeyPartOne}, ${lockKeyPartTwo})`,
        )

        return handler()
      })
    },

    async createContactLink({ chatwootContactId, userId }: ContactLinkInput) {
      const [link] = await db
        .insert(portalUserContactLinks)
        .values({
          chatwootContactId,
          tenantId,
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
        .where(
          and(eq(portalUsers.id, userId), eq(portalUsers.tenantId, tenantId)),
        )
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
        .where(
          and(
            eq(portalUserChatwootConversations.tenantId, tenantId),
            eq(portalUserChatwootConversations.userId, userId),
          ),
        )
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
          tenantId,
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
          target: [
            portalUserChatwootConversations.tenantId,
            portalUserChatwootConversations.userId,
          ],
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
