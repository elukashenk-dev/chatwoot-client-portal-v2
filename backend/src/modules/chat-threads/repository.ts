import { createHash } from 'node:crypto'

import { and, eq, inArray, sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import { portalChatMessageSends, portalChatThreads } from '../../db/schema.js'

type TenantRepositoryScope = {
  tenantId: number
}

type PortalChatThreadType = 'company' | 'private'

export type PortalChatThreadRecord = {
  chatwootContactId: number
  chatwootConversationId: number | null
  chatwootInboxId: number
  id: number
  portalUserId: number | null
  threadType: PortalChatThreadType
}

type SelectedThread = Omit<PortalChatThreadRecord, 'threadType'> & {
  threadType: string
}

const threadSelection = {
  chatwootContactId: portalChatThreads.chatwootContactId,
  chatwootConversationId: portalChatThreads.chatwootConversationId,
  chatwootInboxId: portalChatThreads.chatwootInboxId,
  id: portalChatThreads.id,
  portalUserId: portalChatThreads.portalUserId,
  threadType: portalChatThreads.threadType,
}

function mapThread(row: SelectedThread): PortalChatThreadRecord {
  if (row.threadType !== 'private' && row.threadType !== 'company') {
    throw new Error('Unexpected portal chat thread type.')
  }

  return {
    ...row,
    threadType: row.threadType,
  }
}

function createThreadBootstrapLockKey(
  tenantId: number,
  chatwootContactId: number,
) {
  const digest = createHash('sha256')
    .update(
      `chat-threads:conversation-bootstrap:${tenantId}:${chatwootContactId}`,
    )
    .digest()

  return [digest.readInt32BE(0), digest.readInt32BE(4)] as const
}

export function createChatThreadsRepository(
  db: AppDatabase,
  { tenantId }: TenantRepositoryScope,
) {
  async function findThreadById(id: number) {
    const [thread] = await db
      .select(threadSelection)
      .from(portalChatThreads)
      .where(
        and(
          eq(portalChatThreads.tenantId, tenantId),
          eq(portalChatThreads.id, id),
        ),
      )
      .limit(1)

    return thread ? mapThread(thread) : null
  }

  return {
    async transactionWithThreadBootstrapLock<T>(
      chatwootContactId: number,
      handler: () => Promise<T>,
    ) {
      const [lockKeyPartOne, lockKeyPartTwo] = createThreadBootstrapLockKey(
        tenantId,
        chatwootContactId,
      )

      return db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${lockKeyPartOne}, ${lockKeyPartTwo})`,
        )

        return handler()
      })
    },

    async findSendLedgerAuthorsByMessageIds({
      messageIds,
      portalChatThreadId,
    }: {
      messageIds: number[]
      portalChatThreadId: number
    }) {
      if (messageIds.length === 0) {
        return new Map<
          number,
          { authorDisplayName: string | null; userId: number }
        >()
      }

      const rows = await db
        .select({
          authorDisplayName: portalChatMessageSends.authorDisplayNameSnapshot,
          chatwootMessageId: portalChatMessageSends.chatwootMessageId,
          userId: portalChatMessageSends.userId,
        })
        .from(portalChatMessageSends)
        .where(
          and(
            eq(portalChatMessageSends.tenantId, tenantId),
            eq(portalChatMessageSends.portalChatThreadId, portalChatThreadId),
            inArray(portalChatMessageSends.chatwootMessageId, messageIds),
          ),
        )

      return new Map(
        rows
          .filter((row) => row.chatwootMessageId !== null)
          .map((row) => [
            row.chatwootMessageId as number,
            {
              authorDisplayName: row.authorDisplayName,
              userId: row.userId,
            },
          ]),
      )
    },

    async findThreadByChatwootConversationId(chatwootConversationId: number) {
      const [thread] = await db
        .select(threadSelection)
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

      return thread ? mapThread(thread) : null
    },

    findThreadById,

    async updateThreadConversation({
      chatwootConversationId,
      chatwootInboxId,
      id,
      now,
    }: {
      chatwootConversationId: number
      chatwootInboxId: number
      id: number
      now: Date
    }) {
      const [thread] = await db
        .update(portalChatThreads)
        .set({
          chatwootConversationId,
          chatwootInboxId,
          updatedAt: now,
        })
        .where(
          and(
            eq(portalChatThreads.tenantId, tenantId),
            eq(portalChatThreads.id, id),
          ),
        )
        .returning(threadSelection)

      return thread ? mapThread(thread) : null
    },

    async upsertCompanyThread({
      chatwootContactId,
      chatwootInboxId,
      now,
    }: {
      chatwootContactId: number
      chatwootInboxId: number
      now: Date
    }) {
      const [createdThread] = await db
        .insert(portalChatThreads)
        .values({
          chatwootContactId,
          chatwootInboxId,
          portalUserId: null,
          tenantId,
          threadType: 'company',
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning(threadSelection)

      if (createdThread) {
        return mapThread(createdThread)
      }

      const [updatedThread] = await db
        .update(portalChatThreads)
        .set({
          chatwootInboxId,
          updatedAt: now,
        })
        .where(
          and(
            eq(portalChatThreads.tenantId, tenantId),
            eq(portalChatThreads.threadType, 'company'),
            eq(portalChatThreads.chatwootContactId, chatwootContactId),
          ),
        )
        .returning(threadSelection)

      if (!updatedThread) {
        throw new Error('Failed to upsert company chat thread.')
      }

      return mapThread(updatedThread)
    },

    async upsertPrivateThread({
      chatwootContactId,
      chatwootInboxId,
      now,
      userId,
    }: {
      chatwootContactId: number
      chatwootInboxId: number
      now: Date
      userId: number
    }) {
      const [createdThread] = await db
        .insert(portalChatThreads)
        .values({
          chatwootContactId,
          chatwootInboxId,
          portalUserId: userId,
          tenantId,
          threadType: 'private',
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning(threadSelection)

      if (createdThread) {
        return mapThread(createdThread)
      }

      const [updatedThread] = await db
        .update(portalChatThreads)
        .set({
          chatwootContactId,
          chatwootInboxId,
          updatedAt: now,
        })
        .where(
          and(
            eq(portalChatThreads.tenantId, tenantId),
            eq(portalChatThreads.threadType, 'private'),
            eq(portalChatThreads.portalUserId, userId),
          ),
        )
        .returning(threadSelection)

      if (!updatedThread) {
        throw new Error('Failed to upsert private chat thread.')
      }

      return mapThread(updatedThread)
    },
  }
}

export type ChatThreadsRepository = ReturnType<
  typeof createChatThreadsRepository
>
