import { beforeEach, expect, it } from 'vitest'

import { clearOfflineDatabaseForTests } from './offlineDatabase'
import {
  offlineOutboxStore,
  tryAcquireOutboxDrainLease,
} from './offlineOutboxStore'
import { removeLocalDeviceDataAndBlockCachedOpen } from './offlineStore'
import type { OfflineTextOutboxRecord } from './types'

beforeEach(async () => {
  await clearOfflineDatabaseForTests()
})

function createOutboxRecord(
  overrides: Partial<OfflineTextOutboxRecord> = {},
): OfflineTextOutboxRecord {
  return {
    attemptCount: 0,
    clientMessageKey: 'portal-send:test-outbox',
    content: 'Saved queued text',
    createdAt: '2026-05-27T10:00:00.000Z',
    errorCode: null,
    errorMessage: null,
    lastAttemptAt: null,
    nextAttemptAt: null,
    replyTo: null,
    replyToMessageId: null,
    sendOwnerId: null,
    sendingLeaseExpiresAt: null,
    sendingStartedAt: null,
    status: 'queued',
    tenantSlug: 'buhfirma',
    threadId: 'private:me',
    updatedAt: '2026-05-27T10:00:00.000Z',
    userId: 7,
    ...overrides,
  }
}

it('queues a failed outbox record for explicit retry without changing the client key', async () => {
  const failedRecord = createOutboxRecord({
    clientMessageKey: 'portal-send:failed-retry',
    errorCode: 'thread_access_denied',
    errorMessage: 'Нет доступа.',
    nextAttemptAt: '2026-05-28T10:00:00.000Z',
    status: 'failed',
  })

  await offlineOutboxStore.saveOutboxRecord(failedRecord)

  await expect(
    offlineOutboxStore.retryFailedOutboxRecord({
      clientMessageKey: 'portal-send:failed-retry',
      now: new Date('2026-05-27T10:10:00.000Z'),
      tenantSlug: failedRecord.tenantSlug,
      threadId: failedRecord.threadId,
      userId: failedRecord.userId,
    }),
  ).resolves.toMatchObject({
    clientMessageKey: 'portal-send:failed-retry',
    errorCode: null,
    errorMessage: null,
    nextAttemptAt: null,
    status: 'queued',
  })

  await expect(
    offlineOutboxStore.readOutboxRecord({
      clientMessageKey: 'portal-send:failed-retry',
      tenantSlug: failedRecord.tenantSlug,
      threadId: failedRecord.threadId,
      userId: failedRecord.userId,
    }),
  ).resolves.toMatchObject({
    clientMessageKey: 'portal-send:failed-retry',
    status: 'queued',
  })
})

it('blocks late outbox writes after local device data removal', async () => {
  await removeLocalDeviceDataAndBlockCachedOpen({
    host: 'lk.buhfirma.ru',
    tenantSlug: 'buhfirma',
    userId: 7,
  })
  const record = createOutboxRecord()

  await offlineOutboxStore.saveOutboxRecord(record)

  await expect(
    offlineOutboxStore.readOutboxRecord({
      clientMessageKey: record.clientMessageKey,
      tenantSlug: record.tenantSlug,
      threadId: record.threadId,
      userId: record.userId,
    }),
  ).resolves.toBeNull()
})

it('blocks late outbox drain leases after local device data removal', async () => {
  await removeLocalDeviceDataAndBlockCachedOpen({
    host: 'lk.buhfirma.ru',
    tenantSlug: 'buhfirma',
    userId: 7,
  })

  await expect(
    tryAcquireOutboxDrainLease({
      leaseMs: 30_000,
      now: new Date('2026-05-27T10:00:00.000Z'),
      ownerId: 'late-drain',
      tenantSlug: 'buhfirma',
      userId: 7,
    }),
  ).resolves.toBe(false)
})
