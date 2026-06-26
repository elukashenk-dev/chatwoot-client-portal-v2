import { openOfflineDatabase } from './offlineDatabase'
import {
  deletePushStaleMarkers,
  listPushStaleMarkers,
  savePushStaleMarker as savePushStaleMarkerRecord,
} from './offlinePushStaleMarkers'
import {
  deleteOfflineRecord,
  isAuthSnapshotRecord,
  isLastActiveIdentityRecord,
  isLocalDeviceSignoutRecord,
  isMessagePageRecord,
  isMessageSnapshotRecord,
  isSameThreadScope,
  isSameUserScope,
  isTenantContextRecord,
  isThreadListRecord,
  putOfflineRecord,
  readOfflineRecord,
  scopedMessagePageKey,
  scopedThreadKey,
  scopedUserKey,
  type OfflineUserScope,
} from './offlineStoreRecords'
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

function isSameAuthSnapshotVersion(
  current: OfflineAuthSnapshotRecord,
  expected: OfflineAuthSnapshotRecord,
) {
  return (
    current.lastClockSeenAt === expected.lastClockSeenAt &&
    current.lastVerifiedAt === expected.lastVerifiedAt &&
    current.savedAt === expected.savedAt &&
    current.sessionExpiresAt === expected.sessionExpiresAt &&
    current.tenantSlug === expected.tenantSlug &&
    current.user.email === expected.user.email &&
    current.user.fullName === expected.user.fullName &&
    current.user.id === expected.user.id &&
    current.userId === expected.userId
  )
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
  async saveAuthSnapshotClockObservation({
    observedFrom,
    snapshot,
  }: {
    observedFrom: OfflineAuthSnapshotRecord
    snapshot: OfflineAuthSnapshotRecord
  }) {
    const key = scopedUserKey(snapshot.tenantSlug, snapshot.userId)
    const database = await openOfflineDatabase()

    try {
      const transaction = database.transaction('auth_snapshots', 'readwrite')
      const store = transaction.objectStore('auth_snapshots')
      const current = await store.get(key)

      if (
        !isAuthSnapshotRecord(current) ||
        !isSameAuthSnapshotVersion(current, observedFrom)
      ) {
        await transaction.done
        return false
      }

      await store.put(snapshot, key)
      await transaction.done
      return true
    } finally {
      database.close()
    }
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
