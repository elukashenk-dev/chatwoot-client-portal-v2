import { and, eq, lt, or, sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import { portalChatMessageSends } from '../../db/schema.js'

export type ChatSendLedgerStatus = 'confirmed' | 'failed' | 'processing'

export type ChatSendLedgerEntry = {
  attemptsCount: number
  chatwootMessageId: number | null
  clientMessageKey: string
  confirmedAt: Date | null
  createdAt: Date
  failedAt: Date | null
  messageKind: string
  payloadSha256: string
  primaryConversationId: number
  processingToken: string | null
  status: string
  updatedAt: Date
  userId: number
}

type SendLedgerScope = {
  clientMessageKey: string
  primaryConversationId: number
  userId: number
}

type AcquireSendLedgerEntryInput = SendLedgerScope & {
  messageKind: string
  now: Date
  payloadSha256: string
  processingToken: string
  staleProcessingBefore: Date
}

type MarkSendLedgerEntryInput = SendLedgerScope & {
  chatwootMessageId?: number
  now: Date
  processingToken?: string
}

function buildScopeWhere({
  clientMessageKey,
  primaryConversationId,
  userId,
}: SendLedgerScope) {
  return and(
    eq(portalChatMessageSends.userId, userId),
    eq(portalChatMessageSends.primaryConversationId, primaryConversationId),
    eq(portalChatMessageSends.clientMessageKey, clientMessageKey),
  )
}

const ledgerSelection = {
  attemptsCount: portalChatMessageSends.attemptsCount,
  chatwootMessageId: portalChatMessageSends.chatwootMessageId,
  clientMessageKey: portalChatMessageSends.clientMessageKey,
  confirmedAt: portalChatMessageSends.confirmedAt,
  createdAt: portalChatMessageSends.createdAt,
  failedAt: portalChatMessageSends.failedAt,
  messageKind: portalChatMessageSends.messageKind,
  payloadSha256: portalChatMessageSends.payloadSha256,
  primaryConversationId: portalChatMessageSends.primaryConversationId,
  processingToken: portalChatMessageSends.processingToken,
  status: portalChatMessageSends.status,
  updatedAt: portalChatMessageSends.updatedAt,
  userId: portalChatMessageSends.userId,
}

function hasMatchingPayload(
  entry: ChatSendLedgerEntry,
  {
    messageKind,
    payloadSha256,
  }: Pick<AcquireSendLedgerEntryInput, 'messageKind' | 'payloadSha256'>,
) {
  return (
    entry.messageKind === messageKind && entry.payloadSha256 === payloadSha256
  )
}

export function createChatMessagesRepository(db: AppDatabase) {
  async function findSendLedgerEntry(scope: SendLedgerScope) {
    const [entry] = await db
      .select(ledgerSelection)
      .from(portalChatMessageSends)
      .where(buildScopeWhere(scope))
      .limit(1)

    return entry ?? null
  }

  return {
    async acquireSendLedgerEntry(
      input: AcquireSendLedgerEntryInput,
    ): Promise<
      | { entry: ChatSendLedgerEntry; outcome: 'acquired' }
      | { entry: ChatSendLedgerEntry; outcome: 'confirmed' }
      | { entry: ChatSendLedgerEntry; outcome: 'in_progress' }
      | { entry: ChatSendLedgerEntry; outcome: 'payload_mismatch' }
      | { entry: null; outcome: 'missing' }
    > {
      const [createdEntry] = await db
        .insert(portalChatMessageSends)
        .values({
          clientMessageKey: input.clientMessageKey,
          messageKind: input.messageKind,
          payloadSha256: input.payloadSha256,
          primaryConversationId: input.primaryConversationId,
          processingToken: input.processingToken,
          status: 'processing',
          updatedAt: input.now,
          userId: input.userId,
        })
        .onConflictDoNothing()
        .returning(ledgerSelection)

      if (createdEntry) {
        return {
          entry: createdEntry,
          outcome: 'acquired',
        }
      }

      const existingEntry = await findSendLedgerEntry(input)

      if (!existingEntry) {
        return {
          entry: null,
          outcome: 'missing',
        }
      }

      if (!hasMatchingPayload(existingEntry, input)) {
        return {
          entry: existingEntry,
          outcome: 'payload_mismatch',
        }
      }

      if (existingEntry.status === 'confirmed') {
        return {
          entry: existingEntry,
          outcome: 'confirmed',
        }
      }

      const [reacquiredEntry] = await db
        .update(portalChatMessageSends)
        .set({
          attemptsCount: sql`${portalChatMessageSends.attemptsCount} + 1`,
          failedAt: null,
          processingToken: input.processingToken,
          status: 'processing',
          updatedAt: input.now,
        })
        .where(
          and(
            buildScopeWhere(input),
            or(
              eq(portalChatMessageSends.status, 'failed'),
              and(
                eq(portalChatMessageSends.status, 'processing'),
                lt(
                  portalChatMessageSends.updatedAt,
                  input.staleProcessingBefore,
                ),
              ),
            ),
          ),
        )
        .returning(ledgerSelection)

      if (reacquiredEntry) {
        return {
          entry: reacquiredEntry,
          outcome: 'acquired',
        }
      }

      const currentEntry = await findSendLedgerEntry(input)

      if (!currentEntry) {
        return {
          entry: null,
          outcome: 'missing',
        }
      }

      if (!hasMatchingPayload(currentEntry, input)) {
        return {
          entry: currentEntry,
          outcome: 'payload_mismatch',
        }
      }

      if (currentEntry.status === 'confirmed') {
        return {
          entry: currentEntry,
          outcome: 'confirmed',
        }
      }

      return {
        entry: currentEntry,
        outcome: 'in_progress',
      }
    },

    async findSendLedgerEntry(scope: SendLedgerScope) {
      return findSendLedgerEntry(scope)
    },

    async markSendLedgerEntryConfirmed({
      chatwootMessageId,
      now,
      processingToken,
      ...scope
    }: MarkSendLedgerEntryInput & { chatwootMessageId: number }) {
      const whereClauses = [buildScopeWhere(scope)]

      if (processingToken !== undefined) {
        whereClauses.push(
          eq(portalChatMessageSends.processingToken, processingToken),
        )
      }

      const [entry] = await db
        .update(portalChatMessageSends)
        .set({
          chatwootMessageId,
          confirmedAt: now,
          failedAt: null,
          processingToken: null,
          status: 'confirmed',
          updatedAt: now,
        })
        .where(and(...whereClauses))
        .returning(ledgerSelection)

      return entry ?? null
    },

    async markSendLedgerEntryFailed({
      now,
      processingToken,
      ...scope
    }: MarkSendLedgerEntryInput) {
      const whereClauses = [buildScopeWhere(scope)]

      if (processingToken !== undefined) {
        whereClauses.push(
          eq(portalChatMessageSends.processingToken, processingToken),
        )
      }

      const [entry] = await db
        .update(portalChatMessageSends)
        .set({
          failedAt: now,
          processingToken: null,
          status: 'failed',
          updatedAt: now,
        })
        .where(and(...whereClauses))
        .returning(ledgerSelection)

      return entry ?? null
    },
  }
}

export type ChatMessagesRepository = ReturnType<
  typeof createChatMessagesRepository
>
