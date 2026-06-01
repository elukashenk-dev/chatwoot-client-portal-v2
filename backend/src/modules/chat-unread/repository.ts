import { and, count, eq, inArray } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import { portalChatUnreadMessages } from '../../db/schema.js'

type TenantRepositoryScope = {
  tenantId: number
}

export type InsertUnreadMessageInput = {
  chatwootMessageId: number
  now: Date
  portalChatThreadId: number | null
  portalUserId: number
  threadId: string
}

function toCount(value: unknown) {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

export function createChatUnreadRepository(
  db: AppDatabase,
  { tenantId }: TenantRepositoryScope,
) {
  async function countUnreadByThread({
    portalUserId,
    threadIds,
  }: {
    portalUserId: number
    threadIds: string[]
  }) {
    const result = new Map(threadIds.map((threadId) => [threadId, 0]))

    if (threadIds.length === 0) {
      return result
    }

    const rows = await db
      .select({
        threadId: portalChatUnreadMessages.threadId,
        unreadCount: count(),
      })
      .from(portalChatUnreadMessages)
      .where(
        and(
          eq(portalChatUnreadMessages.tenantId, tenantId),
          eq(portalChatUnreadMessages.portalUserId, portalUserId),
          inArray(portalChatUnreadMessages.threadId, threadIds),
        ),
      )
      .groupBy(portalChatUnreadMessages.threadId)

    for (const row of rows) {
      result.set(row.threadId, toCount(row.unreadCount))
    }

    return result
  }

  return {
    async insertUnreadMessages(rows: InsertUnreadMessageInput[]) {
      if (rows.length === 0) {
        return
      }

      await db
        .insert(portalChatUnreadMessages)
        .values(
          rows.map((row) => ({
            chatwootMessageId: row.chatwootMessageId,
            createdAt: row.now,
            portalChatThreadId: row.portalChatThreadId,
            portalUserId: row.portalUserId,
            tenantId,
            threadId: row.threadId,
          })),
        )
        .onConflictDoNothing()
    },

    countUnreadByThread,

    async countThreadUnreadForUser({
      portalUserId,
      threadId,
    }: {
      portalUserId: number
      threadId: string
    }) {
      const counts = await countUnreadByThread({
        portalUserId,
        threadIds: [threadId],
      })

      return counts.get(threadId) ?? 0
    },

    async clearThreadUnreadAndCountVisible({
      portalUserId,
      threadId,
      visibleThreadIds,
    }: {
      portalUserId: number
      threadId: string
      visibleThreadIds: string[]
    }) {
      return db.transaction(async (tx) => {
        await tx
          .delete(portalChatUnreadMessages)
          .where(
            and(
              eq(portalChatUnreadMessages.tenantId, tenantId),
              eq(portalChatUnreadMessages.portalUserId, portalUserId),
              eq(portalChatUnreadMessages.threadId, threadId),
            ),
          )

        if (visibleThreadIds.length === 0) {
          return { totalUnreadCount: 0 }
        }

        const rows = await tx
          .select({
            unreadCount: count(),
          })
          .from(portalChatUnreadMessages)
          .where(
            and(
              eq(portalChatUnreadMessages.tenantId, tenantId),
              eq(portalChatUnreadMessages.portalUserId, portalUserId),
              inArray(portalChatUnreadMessages.threadId, visibleThreadIds),
            ),
          )

        return {
          totalUnreadCount: toCount(rows[0]?.unreadCount),
        }
      })
    },
  }
}

export type ChatUnreadRepository = ReturnType<typeof createChatUnreadRepository>
