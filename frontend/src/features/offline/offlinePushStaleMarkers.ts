import { openOfflineDatabase } from './offlineDatabase'
import type { OfflinePushStaleMarkerRecord } from './types'

function pushMarkerKey(record: OfflinePushStaleMarkerRecord) {
  return `${record.tenantSlug}:${record.userId}:${record.threadId}:${record.chatwootMessageId}`
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

function isPushStaleMarkerRecord(
  value: unknown,
): value is OfflinePushStaleMarkerRecord {
  return (
    isObject(value) &&
    isNumber(value.chatwootMessageId) &&
    isString(value.createdAt) &&
    isString(value.tenantSlug) &&
    isString(value.threadId) &&
    isNumber(value.userId)
  )
}

function isSameUserScope(
  record: { tenantSlug: string; userId: number },
  tenantSlug: string,
  userId: number,
) {
  return record.tenantSlug === tenantSlug && record.userId === userId
}

export async function savePushStaleMarker(
  record: OfflinePushStaleMarkerRecord,
) {
  const database = await openOfflineDatabase()

  try {
    await database.put('push_stale_markers', record, pushMarkerKey(record))
  } finally {
    database.close()
  }
}

export async function listPushStaleMarkers(
  tenantSlug: string,
  userId: number,
): Promise<OfflinePushStaleMarkerRecord[]> {
  const database = await openOfflineDatabase()

  try {
    const records = await database.getAll('push_stale_markers')

    return records
      .filter(isPushStaleMarkerRecord)
      .filter((record) => isSameUserScope(record, tenantSlug, userId))
  } finally {
    database.close()
  }
}

export async function deletePushStaleMarkers(
  records: OfflinePushStaleMarkerRecord[],
) {
  if (records.length === 0) {
    return
  }

  const database = await openOfflineDatabase()

  try {
    const transaction = database.transaction('push_stale_markers', 'readwrite')
    const store = transaction.objectStore('push_stale_markers')

    for (const record of records) {
      await store.delete(pushMarkerKey(record))
    }

    await transaction.done
  } finally {
    database.close()
  }
}
