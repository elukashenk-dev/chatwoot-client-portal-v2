import { openOfflineDatabase, type OfflineStoreName } from './offlineDatabase'
import {
  deletePushStaleMarkers,
  listPushStaleMarkers,
  savePushStaleMarker as savePushStaleMarkerRecord,
} from './offlinePushStaleMarkers'
import {
  deleteStartupAuthSession,
  deleteStartupChatFallback,
} from './startupCache'
import type {
  OfflineAuthSnapshotRecord,
  OfflineChatMessagePageRecord,
  OfflineChatMessageSnapshotRecord,
  OfflineChatThreadListRecord,
  OfflineLastActiveIdentityRecord,
  OfflineLocalDeviceSignoutRecord,
  OfflinePushStaleMarkerRecord,
  OfflineTenantContextRecord,
} from './types'

export { clearRejectedAuthSnapshot } from './offlineAuthCleanup'

type RecordGuard<TRecord> = (candidate: unknown) => candidate is TRecord

type OfflineUserScope = {
  host: string
  tenantSlug: string
  userId: number
}

function scopedUserKey(tenantSlug: string, userId: number) {
  return `${tenantSlug}:${userId}`
}

function scopedThreadKey(tenantSlug: string, userId: number, threadId: string) {
  return `${tenantSlug}:${userId}:${threadId}`
}

function scopedMessagePageKey(
  tenantSlug: string,
  userId: number,
  threadId: string,
  pageCursor: string,
) {
  return `${tenantSlug}:${userId}:${threadId}:${pageCursor}`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
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

function isMessagePageRecord(
  value: unknown,
): value is OfflineChatMessagePageRecord {
  const record = value as Partial<OfflineChatMessagePageRecord>

  return (
    isMessageSnapshotRecord(value) &&
    isString(record.pageCursor) &&
    (record.pageCursor === 'latest' || record.pageCursor.startsWith('before:'))
  )
}

function isSameUserScope(
  record: { tenantSlug: string; userId: number },
  tenantSlug: string,
  userId: number,
) {
  return record.tenantSlug === tenantSlug && record.userId === userId
}

function isSameThreadScope(
  record: { tenantSlug: string; threadId: string; userId: number },
  tenantSlug: string,
  userId: number,
  threadId: string,
) {
  return (
    isSameUserScope(record, tenantSlug, userId) && record.threadId === threadId
  )
}

async function readOfflineRecord<TRecord>(
  storeName: OfflineStoreName,
  key: string,
  guard: RecordGuard<TRecord>,
) {
  const database = await openOfflineDatabase()

  try {
    const value = await database.get(storeName, key as never)

    return guard(value) ? value : null
  } finally {
    database.close()
  }
}

async function putOfflineRecord<TRecord>(
  storeName: OfflineStoreName,
  key: string,
  value: TRecord,
) {
  const database = await openOfflineDatabase()

  try {
    await database.put(storeName, value as never, key as never)
  } finally {
    database.close()
  }
}

async function deleteOfflineRecord(storeName: OfflineStoreName, key: string) {
  const database = await openOfflineDatabase()

  try {
    await database.delete(storeName, key as never)
  } finally {
    database.close()
  }
}

export async function isUserScopedOfflineWriteBlocked(
  tenantSlug: string,
  userId: number,
) {
  const database = await openOfflineDatabase()

  try {
    const records = await database.getAll('local_device_signouts')

    return records.some(
      (record) =>
        isLocalDeviceSignoutRecord(record) &&
        isSameUserScope(record, tenantSlug, userId),
    )
  } finally {
    database.close()
  }
}

async function shouldSkipUserScopedCacheWrite(record: {
  tenantSlug: string
  userId: number
}) {
  return isUserScopedOfflineWriteBlocked(record.tenantSlug, record.userId)
}

export const offlineStore = {
  deleteLocalDeviceSignout(host: string) {
    return deleteOfflineRecord('local_device_signouts', host)
  },
  deleteTenantContext(host: string) {
    return deleteOfflineRecord('tenant_contexts', host)
  },
  async readAuthSnapshot(tenantSlug: string, userId: number) {
    const record = await readOfflineRecord(
      'auth_snapshots',
      scopedUserKey(tenantSlug, userId),
      isAuthSnapshotRecord,
    )

    if (
      !record ||
      !isSameUserScope(record, tenantSlug, userId) ||
      record.user.id !== userId
    ) {
      return null
    }

    return record
  },
  async readLastActiveIdentity(host: string) {
    const record = await readOfflineRecord(
      'last_active_identities',
      host,
      isLastActiveIdentityRecord,
    )

    return record?.host === host ? record : null
  },
  async readLocalDeviceSignout(
    host: string,
    tenantSlug?: string,
    userId?: number,
  ) {
    const record = await readOfflineRecord(
      'local_device_signouts',
      host,
      isLocalDeviceSignoutRecord,
    )

    if (!record) {
      return null
    }

    if (record.host !== host) {
      return null
    }

    if (tenantSlug !== undefined && record.tenantSlug !== tenantSlug) {
      return null
    }

    if (userId !== undefined && record.userId !== userId) {
      return null
    }

    return record
  },
  async readMessageSnapshot(
    tenantSlug: string,
    userId: number,
    threadId: string,
  ) {
    const record = await readOfflineRecord(
      'chat_message_snapshots',
      scopedThreadKey(tenantSlug, userId, threadId),
      isMessageSnapshotRecord,
    )

    return record && isSameThreadScope(record, tenantSlug, userId, threadId)
      ? record
      : null
  },
  async readMessagePage(
    tenantSlug: string,
    userId: number,
    threadId: string,
    pageCursor: string,
  ) {
    const record = await readOfflineRecord(
      'chat_message_pages',
      scopedMessagePageKey(tenantSlug, userId, threadId, pageCursor),
      isMessagePageRecord,
    )

    return record &&
      isSameThreadScope(record, tenantSlug, userId, threadId) &&
      record.pageCursor === pageCursor
      ? record
      : null
  },
  async readTenantContext(host: string) {
    const record = await readOfflineRecord(
      'tenant_contexts',
      host,
      isTenantContextRecord,
    )

    return record?.host === host ? record : null
  },
  async readThreadList(tenantSlug: string, userId: number) {
    const record = await readOfflineRecord(
      'chat_thread_lists',
      scopedUserKey(tenantSlug, userId),
      isThreadListRecord,
    )

    return record && isSameUserScope(record, tenantSlug, userId) ? record : null
  },
  saveAuthSnapshot(record: OfflineAuthSnapshotRecord) {
    return putOfflineRecord(
      'auth_snapshots',
      scopedUserKey(record.tenantSlug, record.userId),
      record,
    )
  },
  saveLastActiveIdentity(record: OfflineLastActiveIdentityRecord) {
    return putOfflineRecord('last_active_identities', record.host, record)
  },
  saveLocalDeviceSignout(record: OfflineLocalDeviceSignoutRecord) {
    return putOfflineRecord('local_device_signouts', record.host, record)
  },
  deletePushStaleMarkers,
  listPushStaleMarkers,
  async saveMessageSnapshot(record: OfflineChatMessageSnapshotRecord) {
    if (await shouldSkipUserScopedCacheWrite(record)) {
      return
    }

    return putOfflineRecord(
      'chat_message_snapshots',
      scopedThreadKey(record.tenantSlug, record.userId, record.threadId),
      record,
    )
  },
  async saveMessagePage(record: OfflineChatMessagePageRecord) {
    if (await shouldSkipUserScopedCacheWrite(record)) {
      return
    }

    return putOfflineRecord(
      'chat_message_pages',
      scopedMessagePageKey(
        record.tenantSlug,
        record.userId,
        record.threadId,
        record.pageCursor,
      ),
      record,
    )
  },
  async savePushStaleMarker(record: OfflinePushStaleMarkerRecord) {
    if (await shouldSkipUserScopedCacheWrite(record)) {
      return
    }

    await savePushStaleMarkerRecord(record)
  },
  saveTenantContext(record: OfflineTenantContextRecord) {
    return putOfflineRecord('tenant_contexts', record.host, record)
  },
  async saveThreadList(record: OfflineChatThreadListRecord) {
    if (await shouldSkipUserScopedCacheWrite(record)) {
      return
    }

    return putOfflineRecord(
      'chat_thread_lists',
      scopedUserKey(record.tenantSlug, record.userId),
      record,
    )
  },
}

export async function clearCurrentUserOfflineData({
  host,
  tenantSlug,
  userId,
}: OfflineUserScope) {
  return clearCurrentUserOfflineDataWithOptions(
    { host, tenantSlug, userId },
    { preserveLocalDeviceSignout: false },
  )
}

async function clearCurrentUserOfflineDataWithOptions(
  { host, tenantSlug, userId }: OfflineUserScope,
  {
    preserveLocalDeviceSignout,
  }: {
    preserveLocalDeviceSignout: boolean
  },
) {
  const userKey = scopedUserKey(tenantSlug, userId)
  const userPrefix = `${userKey}:`
  let database: Awaited<ReturnType<typeof openOfflineDatabase>> | null = null

  try {
    database = await openOfflineDatabase()
    const transaction = database.transaction(
      [
        'last_active_identities',
        'local_device_signouts',
        'auth_snapshots',
        'chat_thread_lists',
        'chat_message_snapshots',
        'chat_message_pages',
        'chat_text_outbox',
        'push_stale_markers',
        'sync_leases',
      ],
      'readwrite',
    )
    const identities = transaction.objectStore('last_active_identities')
    const signouts = transaction.objectStore('local_device_signouts')
    const identity = await identities.get(host)
    const signout = await signouts.get(host)

    if (
      isLastActiveIdentityRecord(identity) &&
      identity.tenantSlug === tenantSlug &&
      identity.userId === userId
    ) {
      await identities.delete(host)
    }

    if (
      !preserveLocalDeviceSignout &&
      isLocalDeviceSignoutRecord(signout) &&
      signout.tenantSlug === tenantSlug &&
      signout.userId === userId
    ) {
      await signouts.delete(host)
    }

    await transaction.objectStore('auth_snapshots').delete(userKey)
    await transaction.objectStore('chat_thread_lists').delete(userKey)
    await transaction
      .objectStore('sync_leases')
      .delete(`portal-outbox:${userKey}`)

    for (const storeName of [
      'chat_message_snapshots',
      'chat_message_pages',
      'chat_text_outbox',
      'push_stale_markers',
    ] as const) {
      let cursor = await transaction.objectStore(storeName).openCursor()

      while (cursor) {
        if (String(cursor.key).startsWith(userPrefix)) {
          await cursor.delete()
        }

        cursor = await cursor.continue()
      }
    }

    await transaction.done
  } finally {
    database?.close()
    deleteStartupAuthSession(host)
    deleteStartupChatFallback({
      host,
      tenantSlug,
      userId,
    })
  }
}

export async function removeLocalDeviceDataAndBlockCachedOpen(
  input: OfflineUserScope,
) {
  const signout = {
    createdAt: new Date().toISOString(),
    host: input.host,
    tenantSlug: input.tenantSlug,
    userId: input.userId,
  }

  await offlineStore.saveLocalDeviceSignout(signout)
  await clearCurrentUserOfflineDataWithOptions(input, {
    preserveLocalDeviceSignout: true,
  })
}

async function listUserKeysWithUnsentOutboxRecords() {
  const database = await openOfflineDatabase()
  const userKeys = new Set<string>()

  try {
    const transaction = database.transaction('chat_text_outbox', 'readonly')
    let cursor = await transaction.objectStore('chat_text_outbox').openCursor()

    while (cursor) {
      const record = cursor.value

      if (record.status === 'queued' || record.status === 'sending') {
        userKeys.add(scopedUserKey(record.tenantSlug, record.userId))
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
    ? scopedUserKey(lastActiveIdentity.tenantSlug, lastActiveIdentity.userId)
    : null
  const usersWithUnsentOutbox = await listUserKeysWithUnsentOutboxRecords()
  const database = await openOfflineDatabase()

  try {
    const transaction = database.transaction(
      [
        'push_stale_markers',
        'chat_thread_lists',
        'chat_message_snapshots',
        'chat_message_pages',
      ],
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
      'chat_message_pages',
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
