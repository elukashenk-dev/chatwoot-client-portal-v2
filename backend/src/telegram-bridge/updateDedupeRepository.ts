import { randomUUID } from 'node:crypto'

import { and, eq, lt, or, sql, type SQL } from 'drizzle-orm'

import type { AppDatabase } from '../db/client.js'
import { telegramBridgeDeliveries } from '../db/schema.js'

export type TelegramBridgeDeliveryStatus =
  | 'failed'
  | 'processed'
  | 'processing'

export type TelegramBridgeDelivery = {
  attemptCount: number
  createdAt: Date
  errorCode: string | null
  errorMessage: string | null
  id: string
  processedAt: Date | null
  status: string
  telegramBridgeConfigId: string
  telegramChatId: string | null
  telegramFromId: string | null
  updateId: number
  updatedAt: Date
}

type StartUpdateProcessingInput = {
  bridgeConfigId: string
  now: Date
  staleProcessingBefore: Date
  telegramChatId: string | null
  telegramFromId: string | null
  updateId: number
}

type MarkUpdateProcessedInput = {
  attemptCount?: number
  bridgeConfigId: string
  now: Date
  updateId: number
}

type MarkUpdateFailedInput = {
  attemptCount?: number
  bridgeConfigId: string
  error: unknown
  now: Date
  sensitiveValues?: string[]
  updateId: number
}

const deliverySelection = {
  attemptCount: telegramBridgeDeliveries.attemptCount,
  createdAt: telegramBridgeDeliveries.createdAt,
  errorCode: telegramBridgeDeliveries.errorCode,
  errorMessage: telegramBridgeDeliveries.errorMessage,
  id: telegramBridgeDeliveries.id,
  processedAt: telegramBridgeDeliveries.processedAt,
  status: telegramBridgeDeliveries.status,
  telegramBridgeConfigId: telegramBridgeDeliveries.telegramBridgeConfigId,
  telegramChatId: telegramBridgeDeliveries.telegramChatId,
  telegramFromId: telegramBridgeDeliveries.telegramFromId,
  updateId: telegramBridgeDeliveries.updateId,
  updatedAt: telegramBridgeDeliveries.updatedAt,
}

function buildScopeWhere({
  bridgeConfigId,
  updateId,
}: Pick<StartUpdateProcessingInput, 'bridgeConfigId' | 'updateId'>) {
  const whereClause = and(
    eq(telegramBridgeDeliveries.telegramBridgeConfigId, bridgeConfigId),
    eq(telegramBridgeDeliveries.updateId, updateId),
  )

  if (!whereClause) {
    throw new Error('Telegram bridge delivery scope is required.')
  }

  return whereClause
}

function buildCurrentProcessingWhere({
  attemptCount,
  ...scope
}: Pick<MarkUpdateProcessedInput, 'attemptCount' | 'bridgeConfigId' | 'updateId'>) {
  const clauses: SQL[] = [
    buildScopeWhere(scope),
    eq(telegramBridgeDeliveries.status, 'processing'),
  ]

  if (attemptCount !== undefined) {
    clauses.push(eq(telegramBridgeDeliveries.attemptCount, attemptCount))
  }

  const whereClause = and(...clauses)

  if (!whereClause) {
    throw new Error('Telegram bridge delivery update scope is required.')
  }

  return whereClause
}

function findDelivery(
  db: AppDatabase,
  scope: Pick<StartUpdateProcessingInput, 'bridgeConfigId' | 'updateId'>,
) {
  return db
    .select(deliverySelection)
    .from(telegramBridgeDeliveries)
    .where(buildScopeWhere(scope))
    .limit(1)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export function sanitizeTelegramBridgeErrorMessage(
  error: unknown,
  sensitiveValues: string[] = [],
) {
  let message = stringifyError(error).replace(/\s+/g, ' ').trim()

  for (const sensitiveValue of sensitiveValues) {
    const normalizedValue = sensitiveValue.trim()

    if (normalizedValue) {
      message = message.replace(
        new RegExp(escapeRegExp(normalizedValue), 'g'),
        '[redacted]',
      )
    }
  }

  message = message
    .replace(/\bbot\d{6,}:[A-Za-z0-9_-]{20,}\b/g, 'bot[redacted]')
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '[redacted]')
    .replace(
      /\/telegram-bridge\/[^/\s]+\/[^/\s?#]+/g,
      '/telegram-bridge/[redacted]',
    )
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[redacted-phone]')

  return (message || 'Telegram bridge delivery failed.').slice(0, 1000)
}

export function createTelegramBridgeUpdateDedupeRepository(db: AppDatabase) {
  return {
    async startUpdateProcessing(
      input: StartUpdateProcessingInput,
    ): Promise<
      | { delivery: TelegramBridgeDelivery; outcome: 'acquired' }
      | { delivery: TelegramBridgeDelivery; outcome: 'in_progress' }
      | { delivery: TelegramBridgeDelivery; outcome: 'processed' }
      | { delivery: null; outcome: 'missing' }
    > {
      const [createdDelivery] = await db
        .insert(telegramBridgeDeliveries)
        .values({
          id: randomUUID(),
          status: 'processing',
          telegramBridgeConfigId: input.bridgeConfigId,
          telegramChatId: input.telegramChatId,
          telegramFromId: input.telegramFromId,
          updateId: input.updateId,
          updatedAt: input.now,
        })
        .onConflictDoNothing()
        .returning(deliverySelection)

      if (createdDelivery) {
        return {
          delivery: createdDelivery,
          outcome: 'acquired',
        }
      }

      const [existingDelivery] = await findDelivery(db, input)

      if (!existingDelivery) {
        return {
          delivery: null,
          outcome: 'missing',
        }
      }

      if (existingDelivery.status === 'processed') {
        return {
          delivery: existingDelivery,
          outcome: 'processed',
        }
      }

      const [reacquiredDelivery] = await db
        .update(telegramBridgeDeliveries)
        .set({
          attemptCount: sql`${telegramBridgeDeliveries.attemptCount} + 1`,
          errorCode: null,
          errorMessage: null,
          processedAt: null,
          status: 'processing',
          telegramChatId: input.telegramChatId,
          telegramFromId: input.telegramFromId,
          updatedAt: input.now,
        })
        .where(
          and(
            buildScopeWhere(input),
            or(
              eq(telegramBridgeDeliveries.status, 'failed'),
              and(
                eq(telegramBridgeDeliveries.status, 'processing'),
                lt(
                  telegramBridgeDeliveries.updatedAt,
                  input.staleProcessingBefore,
                ),
              ),
            ),
          ),
        )
        .returning(deliverySelection)

      if (reacquiredDelivery) {
        return {
          delivery: reacquiredDelivery,
          outcome: 'acquired',
        }
      }

      const [currentDelivery] = await findDelivery(db, input)

      if (!currentDelivery) {
        return {
          delivery: null,
          outcome: 'missing',
        }
      }

      if (currentDelivery.status === 'processed') {
        return {
          delivery: currentDelivery,
          outcome: 'processed',
        }
      }

      return {
        delivery: currentDelivery,
        outcome: 'in_progress',
      }
    },

    async markUpdateFailed({
      error,
      now,
      sensitiveValues,
      ...scope
    }: MarkUpdateFailedInput) {
      const [delivery] = await db
        .update(telegramBridgeDeliveries)
        .set({
          errorCode: error instanceof Error ? error.name : 'Error',
          errorMessage: sanitizeTelegramBridgeErrorMessage(
            error,
            sensitiveValues,
          ),
          processedAt: null,
          status: 'failed',
          updatedAt: now,
        })
        .where(buildCurrentProcessingWhere(scope))
        .returning(deliverySelection)

      return delivery ?? null
    },

    async markUpdateProcessed({
      now,
      ...scope
    }: MarkUpdateProcessedInput) {
      const [delivery] = await db
        .update(telegramBridgeDeliveries)
        .set({
          errorCode: null,
          errorMessage: null,
          processedAt: now,
          status: 'processed',
          updatedAt: now,
        })
        .where(buildCurrentProcessingWhere(scope))
        .returning(deliverySelection)

      return delivery ?? null
    },
  }
}
