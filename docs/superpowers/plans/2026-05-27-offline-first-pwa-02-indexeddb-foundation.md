# Offline-first PWA Slice 02: IndexedDB Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the typed `portal-offline` IndexedDB foundation, scoped stores, cleanup helpers, storage diagnostics and retention pruning.

**Architecture:** All browser persistence stays scoped by host, tenant slug and portal user id. Frontend app storage uses the small `idb` Promise wrapper over IndexedDB. Outbox persistence is prepared as a separate offline-domain module and retention preserves unsent local text.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, IndexedDB, `idb`, Service Worker, Fastify, Drizzle/Postgres, Playwright.

---

**Part Of:** [Offline-first PWA Implementation Plan](./2026-05-27-offline-first-pwa-implementation.md)

**Slice:** 02 of 9

**Depends On:** Slice 01 for final auth/push user identifiers; can be started after backend contract is stable.

**Unlocks:** Slices 03-09 because tenant, auth, chat cache, outbox, service worker and e2e all depend on this database schema.

---

## Task 2: Offline IndexedDB Foundation

**Goal:** Add a small typed IndexedDB layer with stable `portal-offline`
database name, schema version `1`, scoped stores, storage health helpers and
retention helpers.

**Files:**

- Modify: `frontend/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `frontend/src/test/setup.ts`
- Create: `frontend/src/features/offline/types.ts`
- Create: `frontend/src/features/offline/offlineDatabase.ts`
- Create: `frontend/src/features/offline/offlineStore.ts`
- Create: `frontend/src/features/offline/offlineStore.test.ts`
- Create: `frontend/src/features/offline/storagePersistence.ts`
- Create: `frontend/src/features/offline/storagePersistence.test.ts`

- [ ] **Step 1: Add IndexedDB wrapper and test dependency**

```bash
pnpm --dir frontend add idb
pnpm --dir frontend add -D fake-indexeddb
```

- [ ] **Step 2: Enable IndexedDB in frontend tests**

In `frontend/src/test/setup.ts`, add before testing-library imports:

```ts
import 'fake-indexeddb/auto'
```

- [ ] **Step 3: Define offline record types**

Create `frontend/src/features/offline/types.ts`:

```ts
import type {
  ChatMessageReplyPreview,
  ChatMessagesSnapshot,
  ChatThreadSummary,
} from '../chat/types'
import type { PublicTenantContext } from '../tenant/api/tenantClient'
import type { AuthenticatedPortalUser } from '../auth/types'

export const OFFLINE_DATABASE_NAME = 'portal-offline'
export const OFFLINE_DATABASE_VERSION = 1
export const OFFLINE_AUTH_GRACE_MS = 24 * 60 * 60 * 1000
export const OFFLINE_LOW_QUOTA_USAGE_RATIO = 0.9
export const OFFLINE_MESSAGE_SNAPSHOT_LIMIT = 50

export type OfflineScopedUserKey = `${string}:${number}`

export type OfflineTenantContextRecord = {
  host: string
  savedAt: string
  tenant: PublicTenantContext
}

export type OfflineLastActiveIdentityRecord = {
  host: string
  savedAt: string
  tenantSlug: string
  userId: number
}

export type OfflineLocalDeviceSignoutRecord = {
  createdAt: string
  host: string
  tenantSlug: string
  userId: number
}

export type OfflineAuthSnapshotRecord = {
  lastVerifiedAt: string
  offlineAccessUntil: string
  savedAt: string
  sessionExpiresAt: string
  tenantSlug: string
  user: AuthenticatedPortalUser
  userId: number
}

export type OfflineChatThreadListRecord = {
  activeThreadId: string
  savedAt: string
  tenantSlug: string
  threads: ChatThreadSummary[]
  userId: number
}

export type OfflineChatMessageSnapshotRecord = {
  savedAt: string
  snapshot: ChatMessagesSnapshot
  tenantSlug: string
  threadId: string
  userId: number
}

export type OfflineTextOutboxStatus = 'failed' | 'queued' | 'sending'

export type OfflineTextOutboxRecord = {
  attemptCount: number
  clientMessageKey: string
  content: string
  createdAt: string
  errorCode: string | null
  errorMessage: string | null
  lastAttemptAt: string | null
  nextAttemptAt: string | null
  replyTo: ChatMessageReplyPreview | null
  replyToMessageId: number | null
  sendOwnerId: string | null
  sendingLeaseExpiresAt: string | null
  sendingStartedAt: string | null
  status: OfflineTextOutboxStatus
  tenantSlug: string
  threadId: string
  updatedAt: string
  userId: number
}

export type OfflineSyncLeaseRecord = {
  expiresAt: string
  ownerId: string
}

export type OfflinePushStaleMarkerRecord = {
  chatwootMessageId: number
  createdAt: string
  tenantSlug: string
  threadId: string
  userId: number
}

export type OfflineStorageEstimate = {
  isLowQuota: boolean
  quota: number | null
  usage: number | null
  usageRatio: number | null
}
```

- [ ] **Step 4: Write failing database schema tests**

Create `frontend/src/features/offline/offlineStore.test.ts` with first tests:

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { OFFLINE_DATABASE_NAME, OFFLINE_DATABASE_VERSION } from './types'
import {
  clearOfflineDatabaseForTests,
  openOfflineDatabase,
} from './offlineDatabase'

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
})
```

- [ ] **Step 5: Run test and verify failure**

```bash
pnpm --dir frontend test -- src/features/offline/offlineStore.test.ts --run
```

Expected: FAIL because offline database module does not exist.

- [ ] **Step 6: Implement `offlineDatabase.ts`**

Create `frontend/src/features/offline/offlineDatabase.ts`:

```ts
import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type {
  OfflineAuthSnapshotRecord,
  OfflineChatMessageSnapshotRecord,
  OfflineChatThreadListRecord,
  OfflineLastActiveIdentityRecord,
  OfflineLocalDeviceSignoutRecord,
  OfflinePushStaleMarkerRecord,
  OfflineSyncLeaseRecord,
  OfflineTenantContextRecord,
  OfflineTextOutboxRecord,
} from './types'
import { OFFLINE_DATABASE_NAME, OFFLINE_DATABASE_VERSION } from './types'

export const OFFLINE_STORES = [
  'tenant_contexts',
  'last_active_identities',
  'local_device_signouts',
  'auth_snapshots',
  'chat_thread_lists',
  'chat_message_snapshots',
  'chat_text_outbox',
  'sync_leases',
  'push_stale_markers',
] as const

export type OfflineStoreName = (typeof OFFLINE_STORES)[number]

export interface PortalOfflineDatabase extends DBSchema {
  auth_snapshots: {
    key: string
    value: OfflineAuthSnapshotRecord
  }
  chat_message_snapshots: {
    key: string
    value: OfflineChatMessageSnapshotRecord
  }
  chat_text_outbox: {
    key: string
    value: OfflineTextOutboxRecord
  }
  chat_thread_lists: {
    key: string
    value: OfflineChatThreadListRecord
  }
  last_active_identities: {
    key: string
    value: OfflineLastActiveIdentityRecord
  }
  local_device_signouts: {
    key: string
    value: OfflineLocalDeviceSignoutRecord
  }
  push_stale_markers: {
    key: string
    value: OfflinePushStaleMarkerRecord
  }
  sync_leases: {
    key: string
    value: OfflineSyncLeaseRecord
  }
  tenant_contexts: {
    key: string
    value: OfflineTenantContextRecord
  }
}

export type OfflineDatabase = IDBPDatabase<PortalOfflineDatabase>

export function openOfflineDatabase(): Promise<OfflineDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable.'))
  }

  return openDB<PortalOfflineDatabase>(
    OFFLINE_DATABASE_NAME,
    OFFLINE_DATABASE_VERSION,
    {
      upgrade(database) {
        for (const storeName of OFFLINE_STORES) {
          if (!database.objectStoreNames.contains(storeName)) {
            database.createObjectStore(storeName)
          }
        }
      },
      blocking() {
        // Let newer app versions upgrade instead of pinning an old connection.
        // Callers reopen on demand.
      },
      terminated() {
        // Later reads will reopen the database and map failures to controlled UI.
      },
    },
  )
}

export function assertOfflineDatabaseStores(database: OfflineDatabase) {
  for (const storeName of OFFLINE_STORES) {
    if (!database.objectStoreNames.contains(storeName)) {
      throw new Error(`Offline database is missing store: ${storeName}`)
    }
  }
}

export async function clearOfflineDatabaseForTests(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return
  }

  await deleteDB(OFFLINE_DATABASE_NAME)
}
```

Implementation notes:

- Use `idb` only in frontend app modules under `frontend/src/features/offline/`.
- Keep service worker persistence in `frontend/public/sw.js` native unless the
  service worker becomes bundled later.
- Do not create indexes in MVP unless a slice needs indexed queries. All MVP
  records use explicit scoped string keys and bounded cursor scans.
- Always close long-lived database handles after one-off test helpers and
  maintenance scans. App helpers that open a database handle should close it in
  `finally` after the awaited `idb` operation finishes.
- If schema version changes later, update both this app-side schema and the
  service-worker native open path in Slice 08.

- [ ] **Step 7: Implement scoped store helpers**

Create `frontend/src/features/offline/offlineStore.ts` with transaction helpers:

```ts
import { openOfflineDatabase, type OfflineStoreName } from './offlineDatabase'
import type {
  OfflineAuthSnapshotRecord,
  OfflineChatMessageSnapshotRecord,
  OfflineChatThreadListRecord,
  OfflineLastActiveIdentityRecord,
  OfflineLocalDeviceSignoutRecord,
  OfflinePushStaleMarkerRecord,
  OfflineTenantContextRecord,
} from './types'

function scopedUserKey(tenantSlug: string, userId: number) {
  return `${tenantSlug}:${userId}`
}

function scopedThreadKey(tenantSlug: string, userId: number, threadId: string) {
  return `${tenantSlug}:${userId}:${threadId}`
}

function pushMarkerKey(record: OfflinePushStaleMarkerRecord) {
  return `${record.tenantSlug}:${record.userId}:${record.threadId}:${record.chatwootMessageId}`
}
```

Add minimal runtime guards before exported operations. IndexedDB can contain
old, missing, or manually corrupted records; reads must return `null` instead
of trusting TypeScript casts:

```ts
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function readRecord<T>(
  value: unknown,
  guard: (candidate: unknown) => candidate is T,
) {
  return guard(value) ? value : null
}

function isTenantContextRecord(
  value: unknown,
): value is OfflineTenantContextRecord {
  if (!isObject(value) || !isObject(value.tenant)) {
    return false
  }

  return (
    isString(value.host) &&
    isString(value.savedAt) &&
    isString(value.tenant.displayName) &&
    isString(value.tenant.primaryDomain) &&
    isString(value.tenant.publicBaseUrl) &&
    isString(value.tenant.slug)
  )
}

function isLastActiveIdentityRecord(
  value: unknown,
): value is OfflineLastActiveIdentityRecord {
  return (
    isObject(value) &&
    isString(value.host) &&
    isString(value.savedAt) &&
    isString(value.tenantSlug) &&
    isNumber(value.userId)
  )
}

function isLocalDeviceSignoutRecord(
  value: unknown,
): value is OfflineLocalDeviceSignoutRecord {
  return (
    isObject(value) &&
    isString(value.createdAt) &&
    isString(value.host) &&
    isString(value.tenantSlug) &&
    isNumber(value.userId)
  )
}

function isAuthenticatedPortalUser(
  value: unknown,
): value is OfflineAuthSnapshotRecord['user'] {
  return (
    isObject(value) &&
    isString(value.email) &&
    (isString(value.fullName) || value.fullName === null) &&
    isNumber(value.id)
  )
}

function isAuthSnapshotRecord(
  value: unknown,
): value is OfflineAuthSnapshotRecord {
  return (
    isObject(value) &&
    isString(value.lastVerifiedAt) &&
    isString(value.offlineAccessUntil) &&
    isString(value.savedAt) &&
    isString(value.sessionExpiresAt) &&
    isString(value.tenantSlug) &&
    isAuthenticatedPortalUser(value.user) &&
    isNumber(value.userId)
  )
}

function isThreadListRecord(
  value: unknown,
): value is OfflineChatThreadListRecord {
  return (
    isObject(value) &&
    isString(value.activeThreadId) &&
    isString(value.savedAt) &&
    isString(value.tenantSlug) &&
    Array.isArray(value.threads) &&
    isNumber(value.userId)
  )
}

function isMessageSnapshotRecord(
  value: unknown,
): value is OfflineChatMessageSnapshotRecord {
  return (
    isObject(value) &&
    isString(value.savedAt) &&
    isObject(value.snapshot) &&
    Array.isArray(value.snapshot.messages) &&
    isString(value.tenantSlug) &&
    isString(value.threadId) &&
    isNumber(value.userId)
  )
}
```

Export typed operations:

```ts
type RecordGuard<TRecord> = (candidate: unknown) => candidate is TRecord

async function readOfflineRecord<TRecord>(
  storeName: OfflineStoreName,
  key: IDBValidKey,
  guard: RecordGuard<TRecord>,
) {
  const database = await openOfflineDatabase()

  try {
    const value = await database.get(storeName, key as never)

    return readRecord(value, guard)
  } finally {
    database.close()
  }
}

async function putOfflineRecord<TRecord>(
  storeName: OfflineStoreName,
  key: IDBValidKey,
  value: TRecord,
) {
  const database = await openOfflineDatabase()

  try {
    await database.put(storeName, value as never, key as never)
  } finally {
    database.close()
  }
}

async function deleteOfflineRecord(
  storeName: OfflineStoreName,
  key: IDBValidKey,
) {
  const database = await openOfflineDatabase()

  try {
    await database.delete(storeName, key as never)
  } finally {
    database.close()
  }
}

export const offlineStore = {
  readTenantContext(host: string) {
    return readOfflineRecord('tenant_contexts', host, isTenantContextRecord)
  },
  saveTenantContext(record: OfflineTenantContextRecord) {
    return putOfflineRecord('tenant_contexts', record.host, record)
  },
  deleteTenantContext(host: string) {
    return deleteOfflineRecord('tenant_contexts', host)
  },
  readLastActiveIdentity(host: string) {
    return readOfflineRecord(
      'last_active_identities',
      host,
      isLastActiveIdentityRecord,
    )
  },
  saveLastActiveIdentity(record: OfflineLastActiveIdentityRecord) {
    return putOfflineRecord('last_active_identities', record.host, record)
  },
  readLocalDeviceSignout(host: string, tenantSlug?: string, userId?: number) {
    return readOfflineRecord(
      'local_device_signouts',
      host,
      isLocalDeviceSignoutRecord,
    ).then((record) => {
      if (!record) {
        return null
      }

      if (
        tenantSlug !== undefined &&
        userId !== undefined &&
        (record.tenantSlug !== tenantSlug || record.userId !== userId)
      ) {
        return null
      }

      return record
    })
  },
  saveLocalDeviceSignout(record: OfflineLocalDeviceSignoutRecord) {
    return putOfflineRecord('local_device_signouts', record.host, record)
  },
  deleteLocalDeviceSignout(host: string) {
    return deleteOfflineRecord('local_device_signouts', host)
  },
  readAuthSnapshot(tenantSlug: string, userId: number) {
    return readOfflineRecord(
      'auth_snapshots',
      scopedUserKey(tenantSlug, userId),
      isAuthSnapshotRecord,
    )
  },
  saveAuthSnapshot(record: OfflineAuthSnapshotRecord) {
    return putOfflineRecord(
      'auth_snapshots',
      scopedUserKey(record.tenantSlug, record.userId),
      record,
    )
  },
  readThreadList(tenantSlug: string, userId: number) {
    return readOfflineRecord(
      'chat_thread_lists',
      scopedUserKey(tenantSlug, userId),
      isThreadListRecord,
    )
  },
  saveThreadList(record: OfflineChatThreadListRecord) {
    return putOfflineRecord(
      'chat_thread_lists',
      scopedUserKey(record.tenantSlug, record.userId),
      record,
    )
  },
  readMessageSnapshot(tenantSlug: string, userId: number, threadId: string) {
    return readOfflineRecord(
      'chat_message_snapshots',
      scopedThreadKey(tenantSlug, userId, threadId),
      isMessageSnapshotRecord,
    )
  },
  saveMessageSnapshot(record: OfflineChatMessageSnapshotRecord) {
    return putOfflineRecord(
      'chat_message_snapshots',
      scopedThreadKey(record.tenantSlug, record.userId, record.threadId),
      record,
    )
  },
  savePushStaleMarker(record: OfflinePushStaleMarkerRecord) {
    return putOfflineRecord('push_stale_markers', pushMarkerKey(record), record)
  },
}
```

Keep this file under the code-health line limit. Do not create
`offlineOutboxStore.ts` in this slice; Slice 06 owns dedicated outbox operations.
This slice only creates the shared `chat_text_outbox` store and base record type.

- [ ] **Step 8: Add scoped read/write tests**

In `offlineStore.test.ts`, add:

```ts
import { openOfflineDatabase, type OfflineStoreName } from './offlineDatabase'
import {
  clearCurrentUserOfflineData,
  offlineStore,
  pruneOfflineData,
  removeLocalDeviceDataAndBlockCachedOpen,
} from './offlineStore'
import type { OfflineTextOutboxRecord } from './types'

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

it('stores tenant and auth records under host and tenant/user scopes', async () => {
  await offlineStore.saveTenantContext({
    host: 'lk.buhfirma.ru',
    savedAt: '2026-05-27T10:00:00.000Z',
    tenant: {
      displayName: 'Бухфирма',
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
  await expect(offlineStore.readAuthSnapshot('buhfirma', 8)).resolves.toBeNull()
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
  await expect(offlineStore.readAuthSnapshot('buhfirma', 7)).resolves.toBeNull()
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

  await expect(offlineStore.readAuthSnapshot('buhfirma', 7)).resolves.toBeNull()
  await expect(
    offlineStore.readAuthSnapshot('buhfirma', 8),
  ).resolves.toMatchObject({ user: { id: 8 } })
  await expect(
    readRawRecord('chat_message_snapshots', 'buhfirma:7:private:me'),
  ).resolves.toBeUndefined()
  await expect(
    readRawRecord('chat_text_outbox', 'buhfirma:7:private:me:portal-send:test'),
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
```

- [ ] **Step 9: Add storage persistence and quota helpers**

Create `frontend/src/features/offline/storagePersistence.ts`:

```ts
import {
  OFFLINE_LOW_QUOTA_USAGE_RATIO,
  type OfflineStorageEstimate,
} from './types'

type NavigatorWithStorage = Navigator & {
  storage?: {
    estimate?: () => Promise<StorageEstimate>
    persist?: () => Promise<boolean>
  }
}

const emptyEstimate: OfflineStorageEstimate = {
  isLowQuota: false,
  quota: null,
  usage: null,
  usageRatio: null,
}

export async function requestOfflineStoragePersistence() {
  const storage = (navigator as NavigatorWithStorage).storage

  if (!storage || typeof storage.persist !== 'function') {
    return false
  }

  try {
    return await storage.persist()
  } catch {
    return false
  }
}

export function isOfflineStorageQuotaError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const domError = error as { code?: unknown; name?: unknown }

  return (
    domError.name === 'QuotaExceededError' ||
    domError.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    domError.code === 22 ||
    domError.code === 1014
  )
}

export function isOfflineStorageUnavailableError(error: unknown) {
  if (isOfflineStorageQuotaError(error)) {
    return true
  }

  if (typeof error !== 'object' || error === null) {
    return false
  }

  const domError = error as { name?: unknown }

  return (
    domError.name === 'InvalidStateError' ||
    domError.name === 'NotFoundError' ||
    domError.name === 'UnknownError' ||
    domError.name === 'VersionError'
  )
}

export async function estimateOfflineStorage(): Promise<OfflineStorageEstimate> {
  const storage = (navigator as NavigatorWithStorage).storage

  if (!storage || typeof storage.estimate !== 'function') {
    return emptyEstimate
  }

  try {
    const estimate = await storage.estimate()
    const quota = typeof estimate.quota === 'number' ? estimate.quota : null
    const usage = typeof estimate.usage === 'number' ? estimate.usage : null
    const usageRatio =
      quota !== null && quota > 0 && usage !== null ? usage / quota : null

    return {
      isLowQuota:
        usageRatio !== null && usageRatio >= OFFLINE_LOW_QUOTA_USAGE_RATIO,
      quota,
      usage,
      usageRatio,
    }
  } catch {
    return emptyEstimate
  }
}
```

Create `frontend/src/features/offline/storagePersistence.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  estimateOfflineStorage,
  isOfflineStorageUnavailableError,
  isOfflineStorageQuotaError,
  requestOfflineStoragePersistence,
} from './storagePersistence'

const originalStorage = navigator.storage

function setNavigatorStorage(storage: unknown) {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: storage,
  })
}

describe('offline storage persistence', () => {
  afterEach(() => {
    setNavigatorStorage(originalStorage)
  })

  it('requests persistent storage when the browser supports it', async () => {
    const persist = vi.fn(async () => true)

    setNavigatorStorage({
      persist,
    })

    await expect(requestOfflineStoragePersistence()).resolves.toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('returns false when persistence is unsupported or rejected', async () => {
    setNavigatorStorage({})

    await expect(requestOfflineStoragePersistence()).resolves.toBe(false)

    setNavigatorStorage({
      persist: vi.fn(async () => {
        throw new Error('denied')
      }),
    })

    await expect(requestOfflineStoragePersistence()).resolves.toBe(false)
  })

  it('detects browser quota errors separately from generic failures', () => {
    expect(
      isOfflineStorageQuotaError(
        new DOMException('Storage is full', 'QuotaExceededError'),
      ),
    ).toBe(true)
    expect(isOfflineStorageQuotaError(new Error('boom'))).toBe(false)
  })

  it('classifies IndexedDB unavailable and version errors as storage failures', () => {
    expect(
      isOfflineStorageUnavailableError(
        new DOMException('Database is blocked', 'InvalidStateError'),
      ),
    ).toBe(true)
    expect(
      isOfflineStorageUnavailableError(
        new DOMException(
          'Old service worker opened a newer DB',
          'VersionError',
        ),
      ),
    ).toBe(true)
    expect(isOfflineStorageUnavailableError(new Error('boom'))).toBe(false)
  })

  it('reports low quota from storage estimate', async () => {
    setNavigatorStorage({
      estimate: vi.fn(async () => ({
        quota: 100,
        usage: 95,
      })),
    })

    await expect(estimateOfflineStorage()).resolves.toEqual({
      isLowQuota: true,
      quota: 100,
      usage: 95,
      usageRatio: 0.95,
    })
  })

  it('returns an empty estimate when storage estimate is unavailable', async () => {
    setNavigatorStorage({})

    await expect(estimateOfflineStorage()).resolves.toEqual({
      isLowQuota: false,
      quota: null,
      usage: null,
      usageRatio: null,
    })
  })
})
```

Later slices must call `requestOfflineStoragePersistence()` after trusted login
and `estimateOfflineStorage()` before enabling offline text queueing. Outbox and
cache write callers must catch `isOfflineStorageQuotaError()` to show a
low-storage state, avoid marking local text as sent, and keep the user in a
controlled empty/error state instead of hanging on startup. Startup/auth callers
must treat `isOfflineStorageUnavailableError()` as missing local data and show
online-required or session-check-required copy. Non-storage write errors remain
regular technical failures.

- [ ] **Step 10: Add local data removal and retention helpers**

Add these operations to `offlineStore.ts`:

```ts
type OfflineUserScope = {
  host: string
  tenantSlug: string
  userId: number
}

async function deleteHostRecordWhenScoped(
  store: {
    delete: (key: string) => Promise<unknown>
    get: (
      key: string,
    ) => Promise<
      | OfflineLastActiveIdentityRecord
      | OfflineLocalDeviceSignoutRecord
      | undefined
    >
  },
  host: string,
  tenantSlug: string,
  userId: number,
) {
  const record = await store.get(host)

  if (record?.tenantSlug === tenantSlug && record.userId === userId) {
    await store.delete(host)
  }
}

export async function clearCurrentUserOfflineData({
  host,
  tenantSlug,
  userId,
}: OfflineUserScope) {
  const database = await openOfflineDatabase()
  const userPrefix = `${tenantSlug}:${userId}`

  try {
    const transaction = database.transaction(
      [
        'last_active_identities',
        'local_device_signouts',
        'auth_snapshots',
        'chat_thread_lists',
        'chat_message_snapshots',
        'chat_text_outbox',
        'push_stale_markers',
        'sync_leases',
      ],
      'readwrite',
    )

    await deleteHostRecordWhenScoped(
      transaction.objectStore('last_active_identities'),
      host,
      tenantSlug,
      userId,
    )
    await deleteHostRecordWhenScoped(
      transaction.objectStore('local_device_signouts'),
      host,
      tenantSlug,
      userId,
    )
    await transaction.objectStore('auth_snapshots').delete(userPrefix)
    await transaction.objectStore('chat_thread_lists').delete(userPrefix)
    await transaction
      .objectStore('sync_leases')
      .delete(`portal-outbox:${tenantSlug}:${userId}`)

    for (const storeName of [
      'chat_message_snapshots',
      'chat_text_outbox',
      'push_stale_markers',
    ] as const) {
      let cursor = await transaction.objectStore(storeName).openCursor()

      while (cursor) {
        if (String(cursor.key).startsWith(`${userPrefix}:`)) {
          await cursor.delete()
        }

        cursor = await cursor.continue()
      }
    }

    await transaction.done
  } finally {
    database.close()
  }
}

export async function removeLocalDeviceDataAndBlockCachedOpen(
  input: OfflineUserScope,
) {
  await clearCurrentUserOfflineData(input)
  await offlineStore.saveLocalDeviceSignout({
    createdAt: new Date().toISOString(),
    host: input.host,
    tenantSlug: input.tenantSlug,
    userId: input.userId,
  })
}
```

Add retention pruning in `offlineStore.ts` after local data removal. This must
delete old push stale markers and inactive cached snapshots, while preserving
every unsent outbox record:

```ts
async function listUserKeysWithUnsentOutboxRecords() {
  const database = await openOfflineDatabase()
  const userKeys = new Set<string>()

  try {
    const transaction = database.transaction('chat_text_outbox', 'readonly')
    let cursor = await transaction.objectStore('chat_text_outbox').openCursor()

    while (cursor) {
      const record = cursor.value

      if (record.status === 'queued' || record.status === 'sending') {
        userKeys.add(`${record.tenantSlug}:${record.userId}`)
      }

      cursor = await cursor.continue()
    }

    await transaction.done
  } finally {
    database.close()
  }

  return userKeys
}

export async function pruneOfflineData({
  lastActiveIdentity,
  now,
}: {
  lastActiveIdentity: OfflineLastActiveIdentityRecord | null
  now: Date
}) {
  const markerCutoffMs = now.getTime() - 7 * 24 * 60 * 60 * 1000
  const inactiveSnapshotCutoffMs = now.getTime() - 30 * 24 * 60 * 60 * 1000
  const activeUserKey = lastActiveIdentity
    ? `${lastActiveIdentity.tenantSlug}:${lastActiveIdentity.userId}`
    : null
  const usersWithUnsentOutbox = await listUserKeysWithUnsentOutboxRecords()
  const database = await openOfflineDatabase()

  try {
    const transaction = database.transaction(
      ['push_stale_markers', 'chat_thread_lists', 'chat_message_snapshots'],
      'readwrite',
    )
    let markerCursor = await transaction
      .objectStore('push_stale_markers')
      .openCursor()

    while (markerCursor) {
      if (new Date(markerCursor.value.createdAt).getTime() < markerCutoffMs) {
        await markerCursor.delete()
      }

      markerCursor = await markerCursor.continue()
    }

    for (const storeName of [
      'chat_thread_lists',
      'chat_message_snapshots',
    ] as const) {
      let cursor = await transaction.objectStore(storeName).openCursor()

      while (cursor) {
        const record = cursor.value as { savedAt: string }
        const recordUserKey = String(cursor.key)
          .split(':')
          .slice(0, 2)
          .join(':')

        if (
          recordUserKey !== activeUserKey &&
          !usersWithUnsentOutbox.has(recordUserKey) &&
          new Date(record.savedAt).getTime() < inactiveSnapshotCutoffMs
        ) {
          await cursor.delete()
        }

        cursor = await cursor.continue()
      }
    }

    await transaction.done
  } finally {
    database.close()
  }
}
```

Do not prune `chat_text_outbox` in this function. Unsent local text is removed
only after send success, explicit user deletion, confirmed logout, or local
device data removal.

- [ ] **Step 11: Run offline foundation tests**

```bash
pnpm --dir frontend test -- src/features/offline/offlineStore.test.ts src/features/offline/storagePersistence.test.ts --run
pnpm --dir frontend typecheck
```

Expected: PASS.

Additional acceptance for this slice:

- the `portal-offline` store list is treated as the source contract for app code
  and must be kept in sync with the service worker open path in Slice 08;
- missing, corrupt or unavailable IndexedDB records return controlled null/error
  results that later startup slices can map to user-facing online-required
  states;
- storage helpers distinguish low quota from broader storage/database
  unavailability without exposing technical browser error names to UI copy.
