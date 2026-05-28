import { openOfflineDatabase } from './offlineDatabase'
import type { OfflineSyncLeaseRecord, OfflineTextOutboxRecord } from './types'

type OutboxRecordKeyInput = Pick<
  OfflineTextOutboxRecord,
  'clientMessageKey' | 'tenantSlug' | 'threadId' | 'userId'
>

function outboxKey(record: OutboxRecordKeyInput) {
  return `${record.tenantSlug}:${record.userId}:${record.threadId}:${record.clientMessageKey}`
}

function userPrefix(tenantSlug: string, userId: number) {
  return `${tenantSlug}:${userId}:`
}

function drainLeaseKey(tenantSlug: string, userId: number) {
  return `portal-outbox:${tenantSlug}:${userId}`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value)
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isReplyPreview(
  value: unknown,
): value is OfflineTextOutboxRecord['replyTo'] {
  if (value === null) {
    return true
  }

  return (
    isObject(value) &&
    isNullableString(value.attachmentName) &&
    isString(value.authorName) &&
    isNullableString(value.content) &&
    (value.direction === 'incoming' || value.direction === 'outgoing') &&
    isNumber(value.messageId)
  )
}

function isOutboxStatus(
  value: unknown,
): value is OfflineTextOutboxRecord['status'] {
  return value === 'failed' || value === 'queued' || value === 'sending'
}

function isOfflineTextOutboxRecord(
  value: unknown,
): value is OfflineTextOutboxRecord {
  return (
    isObject(value) &&
    isNumber(value.attemptCount) &&
    isString(value.clientMessageKey) &&
    isString(value.content) &&
    isString(value.createdAt) &&
    isNullableString(value.errorCode) &&
    isNullableString(value.errorMessage) &&
    isNullableString(value.lastAttemptAt) &&
    isNullableString(value.nextAttemptAt) &&
    isReplyPreview(value.replyTo) &&
    isNullableNumber(value.replyToMessageId) &&
    isNullableString(value.sendOwnerId) &&
    isNullableString(value.sendingLeaseExpiresAt) &&
    isNullableString(value.sendingStartedAt) &&
    isOutboxStatus(value.status) &&
    isString(value.tenantSlug) &&
    isString(value.threadId) &&
    isString(value.updatedAt) &&
    isNumber(value.userId)
  )
}

function isUserOutboxRecord(
  record: OfflineTextOutboxRecord,
  tenantSlug: string,
  userId: number,
) {
  return (
    `${record.tenantSlug}:${record.userId}:` === userPrefix(tenantSlug, userId)
  )
}

async function listOutboxRecords() {
  const database = await openOfflineDatabase()

  try {
    const records = await database.getAll('chat_text_outbox')

    return records.filter(isOfflineTextOutboxRecord)
  } finally {
    database.close()
  }
}

async function putOutboxRecord(record: OfflineTextOutboxRecord) {
  const database = await openOfflineDatabase()

  try {
    await database.put('chat_text_outbox', record, outboxKey(record))
  } finally {
    database.close()
  }
}

export const offlineOutboxStore = {
  async deleteOutboxRecord(record: OutboxRecordKeyInput) {
    const database = await openOfflineDatabase()

    try {
      await database.delete('chat_text_outbox', outboxKey(record))
    } finally {
      database.close()
    }
  },
  async readOutboxRecord(record: OutboxRecordKeyInput) {
    const database = await openOfflineDatabase()

    try {
      return (await database.get('chat_text_outbox', outboxKey(record))) ?? null
    } finally {
      database.close()
    }
  },
  async listThreadOutboxRecords({
    tenantSlug,
    threadId,
    userId,
  }: {
    tenantSlug: string
    threadId: string
    userId: number
  }) {
    const records = await listOutboxRecords()

    return records
      .filter(
        (record) =>
          record.tenantSlug === tenantSlug &&
          record.userId === userId &&
          record.threadId === threadId,
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  },
  async listUserOutboxRecords({
    tenantSlug,
    userId,
  }: {
    tenantSlug: string
    userId: number
  }) {
    const records = await listOutboxRecords()

    return records
      .filter((record) => isUserOutboxRecord(record, tenantSlug, userId))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  },
  async listDueOutboxRecords({
    now,
    tenantSlug,
    userId,
  }: {
    now: Date
    tenantSlug: string
    userId: number
  }) {
    const records = await listOutboxRecords()
    const nowMs = now.getTime()

    return records
      .filter(
        (record) =>
          isUserOutboxRecord(record, tenantSlug, userId) &&
          (record.status === 'queued' || record.status === 'sending'),
      )
      .filter((record) => {
        if (record.status === 'queued') {
          return (
            !record.nextAttemptAt ||
            new Date(record.nextAttemptAt).getTime() <= nowMs
          )
        }

        return (
          record.sendingLeaseExpiresAt !== null &&
          new Date(record.sendingLeaseExpiresAt).getTime() <= nowMs
        )
      })
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  },
  markOutboxFailed(
    record: OfflineTextOutboxRecord,
    errorCode: string | null,
    errorMessage: string,
    now: Date,
  ) {
    return putOutboxRecord({
      ...record,
      errorCode,
      errorMessage,
      nextAttemptAt: null,
      sendOwnerId: null,
      sendingLeaseExpiresAt: null,
      sendingStartedAt: null,
      status: 'failed',
      updatedAt: now.toISOString(),
    })
  },
  markOutboxQueued(
    record: OfflineTextOutboxRecord,
    nextAttemptAt: string | null,
    errorMessage: string | null,
    now: Date,
  ) {
    return putOutboxRecord({
      ...record,
      errorCode: null,
      errorMessage,
      nextAttemptAt,
      sendOwnerId: null,
      sendingLeaseExpiresAt: null,
      sendingStartedAt: null,
      status: 'queued',
      updatedAt: now.toISOString(),
    })
  },
  markOutboxSending(
    record: OfflineTextOutboxRecord,
    ownerId: string,
    now: Date,
    leaseMs: number,
  ) {
    const nextRecord = {
      ...record,
      attemptCount: record.attemptCount + 1,
      errorCode: null,
      errorMessage: null,
      lastAttemptAt: now.toISOString(),
      nextAttemptAt: null,
      sendOwnerId: ownerId,
      sendingLeaseExpiresAt: new Date(now.getTime() + leaseMs).toISOString(),
      sendingStartedAt: now.toISOString(),
      status: 'sending',
      updatedAt: now.toISOString(),
    } satisfies OfflineTextOutboxRecord

    return putOutboxRecord(nextRecord).then(() => nextRecord)
  },
  saveOutboxRecord: putOutboxRecord,
}

export async function tryAcquireOutboxDrainLease({
  leaseMs,
  now,
  ownerId,
  tenantSlug,
  userId,
}: {
  leaseMs: number
  now: Date
  ownerId: string
  tenantSlug: string
  userId: number
}) {
  const database = await openOfflineDatabase()
  const key = drainLeaseKey(tenantSlug, userId)

  try {
    const transaction = database.transaction('sync_leases', 'readwrite')
    const store = transaction.objectStore('sync_leases')
    const current = await store.get(key)
    const currentExpiresAt = current ? new Date(current.expiresAt).getTime() : 0
    const currentExpired =
      !Number.isFinite(currentExpiresAt) || currentExpiresAt <= now.getTime()
    let acquired = false

    if (!current || currentExpired) {
      acquired = true
      await store.put(
        {
          expiresAt: new Date(now.getTime() + leaseMs).toISOString(),
          ownerId,
        } satisfies OfflineSyncLeaseRecord,
        key,
      )
    }

    await transaction.done

    return acquired
  } finally {
    database.close()
  }
}

export async function releaseOutboxDrainLease({
  ownerId,
  tenantSlug,
  userId,
}: {
  ownerId: string
  tenantSlug: string
  userId: number
}) {
  const database = await openOfflineDatabase()
  const key = drainLeaseKey(tenantSlug, userId)

  try {
    const transaction = database.transaction('sync_leases', 'readwrite')
    const store = transaction.objectStore('sync_leases')
    const current = await store.get(key)

    if (current?.ownerId === ownerId) {
      await store.delete(key)
    }

    await transaction.done
  } finally {
    database.close()
  }
}
