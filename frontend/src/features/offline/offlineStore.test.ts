import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearOfflineDatabaseForTests,
  openOfflineDatabase,
  type OfflineStoreName,
} from './offlineDatabase'
import {
  clearCurrentUserOfflineData,
  clearRejectedAuthSnapshot,
  offlineStore,
  pruneOfflineData,
  removeLocalDeviceDataAndBlockCachedOpen,
} from './offlineStore'
import {
  OFFLINE_DATABASE_NAME,
  OFFLINE_DATABASE_VERSION,
  type OfflineTextOutboxRecord,
} from './types'

async function putRawRecord(
  storeName: OfflineStoreName,
  key: IDBValidKey,
  value: unknown,
) {
  const database = await openOfflineDatabase()
  const transaction = database.transaction(storeName, 'readwrite')

  try {
    await transaction.objectStore(storeName).put(value as never, key as never)
    await transaction.done
  } finally {
    database.close()
  }
}

async function readRawRecord<T>(storeName: OfflineStoreName, key: IDBValidKey) {
  const database = await openOfflineDatabase()

  try {
    const value = await database.get(storeName, key as never)

    return value as T | undefined
  } finally {
    database.close()
  }
}

function createQueuedOutboxRecord(
  overrides: Partial<OfflineTextOutboxRecord> = {},
): OfflineTextOutboxRecord {
  return {
    attemptCount: 0,
    clientMessageKey: 'portal-send:test',
    content: 'offline text',
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

describe('offline store database', () => {
  beforeEach(async () => {
    await clearOfflineDatabaseForTests()
  })

  it('opens stable portal-offline database with schema version 1', async () => {
    const database = await openOfflineDatabase()

    expect(database.name).toBe(OFFLINE_DATABASE_NAME)
    expect(database.version).toBe(OFFLINE_DATABASE_VERSION)
    expect(Array.from(database.objectStoreNames).sort()).toEqual([
      'auth_snapshots',
      'chat_message_snapshots',
      'chat_text_outbox',
      'chat_thread_lists',
      'last_active_identities',
      'local_device_signouts',
      'push_stale_markers',
      'sync_leases',
      'tenant_contexts',
    ])

    database.close()
  })

  it('stores tenant and auth records under host and tenant/user scopes', async () => {
    await offlineStore.saveTenantContext({
      host: 'lk.buhfirma.ru',
      savedAt: '2026-05-27T10:00:00.000Z',
      tenant: {
        displayName: 'Buhfirma',
        primaryDomain: 'lk.buhfirma.ru',
        publicBaseUrl: 'https://lk.buhfirma.ru',
        slug: 'buhfirma',
      },
    })
    await offlineStore.saveAuthSnapshot({
      lastVerifiedAt: '2026-05-27T10:00:00.000Z',
      offlineAccessUntil: '2026-05-28T10:00:00.000Z',
      savedAt: '2026-05-27T10:00:00.000Z',
      sessionExpiresAt: '2026-06-10T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      user: {
        email: 'name@company.ru',
        fullName: 'Portal User',
        id: 7,
      },
      userId: 7,
    })

    await expect(
      offlineStore.readTenantContext('lk.buhfirma.ru'),
    ).resolves.toMatchObject({
      tenant: { slug: 'buhfirma' },
    })
    await expect(
      offlineStore.readAuthSnapshot('buhfirma', 7),
    ).resolves.toMatchObject({
      user: { id: 7 },
    })
    await expect(
      offlineStore.readAuthSnapshot('buhfirma', 8),
    ).resolves.toBeNull()
  })

  it('returns null for corrupted records instead of trusting IndexedDB data', async () => {
    await putRawRecord('tenant_contexts', 'lk.buhfirma.ru', {
      host: 'lk.buhfirma.ru',
      savedAt: '2026-05-27T10:00:00.000Z',
      tenant: null,
    })
    await putRawRecord('auth_snapshots', 'buhfirma:7', {
      offlineAccessUntil: '2026-05-28T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      user: {
        email: 'name@company.ru',
        id: '7',
      },
      userId: 7,
    })

    await expect(
      offlineStore.readTenantContext('lk.buhfirma.ru'),
    ).resolves.toBeNull()
    await expect(
      offlineStore.readAuthSnapshot('buhfirma', 7),
    ).resolves.toBeNull()
  })

  it('returns null when a valid record is stored under the wrong scope key', async () => {
    await putRawRecord('tenant_contexts', 'lk.buhfirma.ru', {
      host: 'lk.stroyfirma.ru',
      savedAt: '2026-05-27T10:00:00.000Z',
      tenant: {
        displayName: 'Stroyfirma',
        primaryDomain: 'lk.stroyfirma.ru',
        publicBaseUrl: 'https://lk.stroyfirma.ru',
        slug: 'stroyfirma',
      },
    })
    await putRawRecord('auth_snapshots', 'buhfirma:7', {
      lastVerifiedAt: '2026-05-27T10:00:00.000Z',
      offlineAccessUntil: '2026-05-28T10:00:00.000Z',
      savedAt: '2026-05-27T10:00:00.000Z',
      sessionExpiresAt: '2026-06-10T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      user: {
        email: 'other@company.ru',
        fullName: 'Other User',
        id: 8,
      },
      userId: 8,
    })
    await putRawRecord('chat_message_snapshots', 'buhfirma:7:private:me', {
      savedAt: '2026-05-27T10:00:00.000Z',
      snapshot: { messages: [] },
      tenantSlug: 'buhfirma',
      threadId: 'group:99',
      userId: 7,
    })

    await expect(
      offlineStore.readTenantContext('lk.buhfirma.ru'),
    ).resolves.toBeNull()
    await expect(
      offlineStore.readAuthSnapshot('buhfirma', 7),
    ).resolves.toBeNull()
    await expect(
      offlineStore.readMessageSnapshot('buhfirma', 7, 'private:me'),
    ).resolves.toBeNull()
  })

  it('removes only current user data and clears scoped outbox lease', async () => {
    await offlineStore.saveLastActiveIdentity({
      host: 'lk.buhfirma.ru',
      savedAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      userId: 7,
    })
    await offlineStore.saveAuthSnapshot({
      lastVerifiedAt: '2026-05-27T10:00:00.000Z',
      offlineAccessUntil: '2026-05-28T10:00:00.000Z',
      savedAt: '2026-05-27T10:00:00.000Z',
      sessionExpiresAt: '2026-06-10T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      user: {
        email: 'name@company.ru',
        fullName: 'Portal User',
        id: 7,
      },
      userId: 7,
    })
    await offlineStore.saveAuthSnapshot({
      lastVerifiedAt: '2026-05-27T10:00:00.000Z',
      offlineAccessUntil: '2026-05-28T10:00:00.000Z',
      savedAt: '2026-05-27T10:00:00.000Z',
      sessionExpiresAt: '2026-06-10T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      user: {
        email: 'other@company.ru',
        fullName: 'Other User',
        id: 8,
      },
      userId: 8,
    })
    await offlineStore.saveThreadList({
      activeThreadId: 'private:me',
      savedAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threads: [],
      userId: 7,
    })
    await putRawRecord('chat_message_snapshots', 'buhfirma:7:private:me', {
      savedAt: '2026-05-27T10:00:00.000Z',
      snapshot: { messages: [] },
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 7,
    })
    await putRawRecord(
      'chat_text_outbox',
      'buhfirma:7:private:me:portal-send:test',
      createQueuedOutboxRecord(),
    )
    await putRawRecord('push_stale_markers', 'buhfirma:7:private:me:9001', {
      chatwootMessageId: 9001,
      createdAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 7,
    })
    await putRawRecord('sync_leases', 'portal-outbox:buhfirma:7', {
      expiresAt: '2026-05-27T10:05:00.000Z',
      ownerId: 'tab-a',
    })

    await removeLocalDeviceDataAndBlockCachedOpen({
      host: 'lk.buhfirma.ru',
      tenantSlug: 'buhfirma',
      userId: 7,
    })

    await expect(
      offlineStore.readAuthSnapshot('buhfirma', 7),
    ).resolves.toBeNull()
    await expect(
      offlineStore.readAuthSnapshot('buhfirma', 8),
    ).resolves.toMatchObject({ user: { id: 8 } })
    await expect(
      readRawRecord('chat_message_snapshots', 'buhfirma:7:private:me'),
    ).resolves.toBeUndefined()
    await expect(
      readRawRecord(
        'chat_text_outbox',
        'buhfirma:7:private:me:portal-send:test',
      ),
    ).resolves.toBeUndefined()
    await expect(
      readRawRecord('push_stale_markers', 'buhfirma:7:private:me:9001'),
    ).resolves.toBeUndefined()
    await expect(
      readRawRecord('sync_leases', 'portal-outbox:buhfirma:7'),
    ).resolves.toBeUndefined()
    await expect(
      offlineStore.readLocalDeviceSignout('lk.buhfirma.ru', 'buhfirma', 7),
    ).resolves.toMatchObject({ tenantSlug: 'buhfirma', userId: 7 })
  })

  it('clears rejected auth cache without removing unsent outbox', async () => {
    await offlineStore.saveLastActiveIdentity({
      host: 'lk.buhfirma.ru',
      savedAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      userId: 7,
    })
    await offlineStore.saveAuthSnapshot({
      lastVerifiedAt: '2026-05-27T10:00:00.000Z',
      offlineAccessUntil: '2026-05-28T10:00:00.000Z',
      savedAt: '2026-05-27T10:00:00.000Z',
      sessionExpiresAt: '2026-06-10T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      user: {
        email: 'name@company.ru',
        fullName: 'Portal User',
        id: 7,
      },
      userId: 7,
    })
    await putRawRecord(
      'chat_text_outbox',
      'buhfirma:7:private:me:portal-send:keep',
      createQueuedOutboxRecord({
        clientMessageKey: 'portal-send:keep',
      }),
    )

    await clearRejectedAuthSnapshot({
      host: 'lk.buhfirma.ru',
      tenantSlug: 'buhfirma',
      userId: 7,
    })

    await expect(
      offlineStore.readAuthSnapshot('buhfirma', 7),
    ).resolves.toBeNull()
    await expect(
      offlineStore.readLastActiveIdentity('lk.buhfirma.ru'),
    ).resolves.toBeNull()
    await expect(
      readRawRecord(
        'chat_text_outbox',
        'buhfirma:7:private:me:portal-send:keep',
      ),
    ).resolves.toMatchObject({
      status: 'queued',
    })
  })

  it('does not remove last active identity when it belongs to another user', async () => {
    await offlineStore.saveLastActiveIdentity({
      host: 'lk.buhfirma.ru',
      savedAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      userId: 8,
    })

    await clearCurrentUserOfflineData({
      host: 'lk.buhfirma.ru',
      tenantSlug: 'buhfirma',
      userId: 7,
    })

    await expect(
      offlineStore.readLastActiveIdentity('lk.buhfirma.ru'),
    ).resolves.toMatchObject({ tenantSlug: 'buhfirma', userId: 8 })
  })

  it('filters local device signout reads by every provided scope field', async () => {
    await offlineStore.saveLocalDeviceSignout({
      createdAt: '2026-05-27T10:00:00.000Z',
      host: 'lk.buhfirma.ru',
      tenantSlug: 'buhfirma',
      userId: 7,
    })

    await expect(
      offlineStore.readLocalDeviceSignout('lk.buhfirma.ru', 'stroyfirma'),
    ).resolves.toBeNull()
    await expect(
      offlineStore.readLocalDeviceSignout('lk.buhfirma.ru', undefined, 8),
    ).resolves.toBeNull()
    await expect(
      offlineStore.readLocalDeviceSignout('lk.buhfirma.ru', 'buhfirma'),
    ).resolves.toMatchObject({ tenantSlug: 'buhfirma', userId: 7 })
  })

  it('prunes expired markers and inactive snapshots but keeps unsent outbox users', async () => {
    await putRawRecord('push_stale_markers', 'buhfirma:7:private:me:9001', {
      chatwootMessageId: 9001,
      createdAt: '2026-05-01T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 7,
    })
    await offlineStore.saveThreadList({
      activeThreadId: 'private:me',
      savedAt: '2026-04-01T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threads: [],
      userId: 8,
    })
    await offlineStore.saveThreadList({
      activeThreadId: 'private:me',
      savedAt: '2026-04-01T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threads: [],
      userId: 9,
    })
    await putRawRecord(
      'chat_text_outbox',
      'buhfirma:9:private:me:portal-send:keep',
      createQueuedOutboxRecord({
        clientMessageKey: 'portal-send:keep',
        userId: 9,
      }),
    )

    await pruneOfflineData({
      lastActiveIdentity: {
        host: 'lk.buhfirma.ru',
        savedAt: '2026-05-27T10:00:00.000Z',
        tenantSlug: 'buhfirma',
        userId: 7,
      },
      now: new Date('2026-05-27T10:00:00.000Z'),
    })

    await expect(
      readRawRecord('push_stale_markers', 'buhfirma:7:private:me:9001'),
    ).resolves.toBeUndefined()
    await expect(offlineStore.readThreadList('buhfirma', 8)).resolves.toBeNull()
    await expect(
      offlineStore.readThreadList('buhfirma', 9),
    ).resolves.toMatchObject({ userId: 9 })
  })
})
