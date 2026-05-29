import type {
  ChatApiClientError,
  sendChatMessage as defaultSendChatMessage,
} from '../chat/api/chatClient'
import type { ChatSendResult } from '../chat/types'
import {
  offlineOutboxStore,
  releaseOutboxDrainLease,
  tryAcquireOutboxDrainLease,
} from './offlineOutboxStore'
import type { OfflineTextOutboxRecord } from './types'

const SEND_LEASE_MS = 30_000
const DRAIN_LEASE_MS = 30_000
const SEND_IN_PROGRESS_RETRY_MS = 5_000
const GENERIC_SEND_ERROR_MESSAGE = 'Не удалось отправить сообщение.'

type SendChatMessage = typeof defaultSendChatMessage

type DrainResult = 'auth_rejected' | 'drained'

type DrainSendSucceededEvent = {
  record: OfflineTextOutboxRecord
  sendResult: ChatSendResult
}

type ChatSendErrorDetails = {
  code: string | null
  message: string
  retryAfterSeconds: number | null
  statusCode: number | null
}

export type DrainOutcomeCategory =
  | 'access_denied'
  | 'auth_rejected'
  | 'conflict'
  | 'network_retry'
  | 'rate_limited'
  | 'sent'

export type DrainOutcomeEvent = {
  category: DrainOutcomeCategory
  clientMessageKey: string
  errorCode?: string | null
  statusCode?: number | null
  tenantSlug: string
  threadId: string
  userId: number
}

function createOwnerId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `portal-outbox-owner:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function addBackoff(now: Date, attemptCount: number) {
  const delayMs = Math.min(60_000, 1000 * 2 ** Math.max(0, attemptCount - 1))

  return new Date(now.getTime() + delayMs).toISOString()
}

function addRetryAfter(
  now: Date,
  retryAfterSeconds: number | null | undefined,
) {
  if (
    typeof retryAfterSeconds === 'number' &&
    Number.isFinite(retryAfterSeconds) &&
    retryAfterSeconds > 0
  ) {
    return new Date(now.getTime() + retryAfterSeconds * 1000).toISOString()
  }

  return null
}

function getSendErrorDetails(error: unknown): ChatSendErrorDetails {
  const apiError = error as Partial<ChatApiClientError>

  return {
    code: typeof apiError.code === 'string' ? apiError.code : null,
    message:
      typeof apiError.message === 'string'
        ? apiError.message
        : GENERIC_SEND_ERROR_MESSAGE,
    retryAfterSeconds:
      typeof apiError.retryAfterSeconds === 'number'
        ? apiError.retryAfterSeconds
        : null,
    statusCode:
      typeof apiError.statusCode === 'number' ? apiError.statusCode : null,
  }
}

async function emitSendSucceeded(
  onSendSucceeded:
    | ((event: DrainSendSucceededEvent) => void | Promise<void>)
    | undefined,
  event: DrainSendSucceededEvent,
) {
  try {
    await onSendSucceeded?.(event)
  } catch {
    // Reconciliation callbacks are best-effort and must not requeue sent text.
  }
}

async function emitDrainOutcome(
  onDrainOutcome:
    | ((event: DrainOutcomeEvent) => void | Promise<void>)
    | undefined,
  event: DrainOutcomeEvent,
) {
  try {
    await onDrainOutcome?.(event)
  } catch {
    // Diagnostics are best-effort and must not change outbox state.
  }
}

function isSendResultForOutboxRecord(
  result: ChatSendResult,
  record: OfflineTextOutboxRecord,
) {
  return (
    result.result === 'ready' &&
    result.sentMessage?.clientMessageKey === record.clientMessageKey &&
    result.activeThread?.id === record.threadId
  )
}

export async function drainOfflineTextOutbox({
  now = () => new Date(),
  onDrainOutcome,
  onSendSucceeded,
  sendChatMessage,
  tenantSlug,
  userId,
}: {
  now?: () => Date
  onDrainOutcome?: (event: DrainOutcomeEvent) => void | Promise<void>
  onSendSucceeded?: (event: DrainSendSucceededEvent) => void | Promise<void>
  sendChatMessage: SendChatMessage
  tenantSlug: string
  userId: number
}): Promise<DrainResult> {
  const dueRecords = await offlineOutboxStore.listDueOutboxRecords({
    now: now(),
    tenantSlug,
    userId,
  })

  for (const record of dueRecords) {
    const attemptAt = now()
    const ownerId = createOwnerId()
    const sendingRecord = await offlineOutboxStore.markOutboxSending(
      record,
      ownerId,
      attemptAt,
      SEND_LEASE_MS,
    )

    try {
      const result = await sendChatMessage({
        clientMessageKey: record.clientMessageKey,
        content: record.content,
        replyToMessageId: record.replyToMessageId,
        threadId: record.threadId,
      })

      if (isSendResultForOutboxRecord(result, sendingRecord)) {
        try {
          await offlineOutboxStore.deleteOutboxRecord(sendingRecord)
        } catch {
          // A sent backend message must not be requeued because local deletion failed.
        }
        await emitSendSucceeded(onSendSucceeded, {
          record: sendingRecord,
          sendResult: result,
        })
        await emitDrainOutcome(onDrainOutcome, {
          category: 'sent',
          clientMessageKey: sendingRecord.clientMessageKey,
          tenantSlug,
          threadId: sendingRecord.threadId,
          userId,
        })
        continue
      }

      await offlineOutboxStore.markOutboxQueued(
        sendingRecord,
        null,
        GENERIC_SEND_ERROR_MESSAGE,
        now(),
      )
      await emitDrainOutcome(onDrainOutcome, {
        category: 'network_retry',
        clientMessageKey: sendingRecord.clientMessageKey,
        tenantSlug,
        threadId: sendingRecord.threadId,
        userId,
      })
    } catch (error) {
      const apiError = getSendErrorDetails(error)

      if (apiError.statusCode === 401) {
        await offlineOutboxStore.markOutboxQueued(
          sendingRecord,
          null,
          apiError.message,
          now(),
        )
        await emitDrainOutcome(onDrainOutcome, {
          category: 'auth_rejected',
          clientMessageKey: sendingRecord.clientMessageKey,
          errorCode: apiError.code,
          statusCode: apiError.statusCode,
          tenantSlug,
          threadId: sendingRecord.threadId,
          userId,
        })
        return 'auth_rejected'
      }

      if (
        apiError.statusCode === 403 ||
        apiError.code === 'thread_access_denied'
      ) {
        await offlineOutboxStore.markOutboxFailed(
          sendingRecord,
          apiError.code,
          apiError.message,
          now(),
        )
        await emitDrainOutcome(onDrainOutcome, {
          category: 'access_denied',
          clientMessageKey: sendingRecord.clientMessageKey,
          errorCode: apiError.code,
          statusCode: apiError.statusCode,
          tenantSlug,
          threadId: sendingRecord.threadId,
          userId,
        })
        continue
      }

      if (apiError.statusCode === 409) {
        if (apiError.code === 'chat_send_in_progress') {
          const retryAt = new Date(
            now().getTime() + SEND_IN_PROGRESS_RETRY_MS,
          ).toISOString()

          await offlineOutboxStore.markOutboxQueued(
            sendingRecord,
            retryAt,
            apiError.message,
            now(),
          )
          await emitDrainOutcome(onDrainOutcome, {
            category: 'network_retry',
            clientMessageKey: sendingRecord.clientMessageKey,
            errorCode: apiError.code,
            statusCode: apiError.statusCode,
            tenantSlug,
            threadId: sendingRecord.threadId,
            userId,
          })
          continue
        }

        if (apiError.code === 'client_message_key_conflict') {
          await offlineOutboxStore.markOutboxFailed(
            sendingRecord,
            apiError.code,
            apiError.message,
            now(),
          )
          await emitDrainOutcome(onDrainOutcome, {
            category: 'conflict',
            clientMessageKey: sendingRecord.clientMessageKey,
            errorCode: apiError.code,
            statusCode: apiError.statusCode,
            tenantSlug,
            threadId: sendingRecord.threadId,
            userId,
          })
          continue
        }
      }

      if (apiError.statusCode === 429) {
        await offlineOutboxStore.markOutboxQueued(
          sendingRecord,
          addRetryAfter(now(), apiError.retryAfterSeconds) ??
            addBackoff(now(), sendingRecord.attemptCount),
          apiError.message,
          now(),
        )
        await emitDrainOutcome(onDrainOutcome, {
          category: 'rate_limited',
          clientMessageKey: sendingRecord.clientMessageKey,
          errorCode: apiError.code,
          statusCode: apiError.statusCode,
          tenantSlug,
          threadId: sendingRecord.threadId,
          userId,
        })
        continue
      }

      await offlineOutboxStore.markOutboxQueued(
        sendingRecord,
        addBackoff(now(), sendingRecord.attemptCount),
        apiError.message,
        now(),
      )
      await emitDrainOutcome(onDrainOutcome, {
        category: 'network_retry',
        clientMessageKey: sendingRecord.clientMessageKey,
        errorCode: apiError.code,
        statusCode: apiError.statusCode,
        tenantSlug,
        threadId: sendingRecord.threadId,
        userId,
      })
    }
  }

  return 'drained'
}

export async function withOutboxDrainLock<T>(
  tenantSlug: string,
  userId: number,
  operation: () => Promise<T>,
) {
  const lockName = `portal-outbox:${tenantSlug}:${userId}`
  const ownerId = createOwnerId()
  const now = new Date()
  const navigatorWithLocks =
    typeof navigator === 'undefined'
      ? null
      : (navigator as Navigator & {
          locks?: {
            request<TValue>(
              name: string,
              callback: () => Promise<TValue>,
            ): Promise<TValue>
          }
        })

  if (navigatorWithLocks?.locks) {
    return navigatorWithLocks.locks.request(lockName, operation)
  }

  const acquired = await tryAcquireOutboxDrainLease({
    leaseMs: DRAIN_LEASE_MS,
    now,
    ownerId,
    tenantSlug,
    userId,
  })

  if (!acquired) {
    return null
  }

  try {
    return await operation()
  } finally {
    await releaseOutboxDrainLease({
      ownerId,
      tenantSlug,
      userId,
    })
  }
}
