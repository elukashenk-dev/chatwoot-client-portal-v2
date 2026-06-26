import { openOfflineDatabase, type OfflineStoreName } from './offlineDatabase'
import type {
  OfflineAuthSnapshotRecord,
  OfflineChatMessagePageRecord,
  OfflineChatMessageSnapshotRecord,
  OfflineChatThreadListRecord,
  OfflineLastActiveIdentityRecord,
  OfflineLocalDeviceSignoutRecord,
  OfflineTenantContextRecord,
} from './types'

type RecordGuard<TRecord> = (candidate: unknown) => candidate is TRecord

export type OfflineUserScope = {
  host: string
  tenantSlug: string
  userId: number
}

export function scopedUserKey(tenantSlug: string, userId: number) {
  return `${tenantSlug}:${userId}`
}

export function scopedThreadKey(
  tenantSlug: string,
  userId: number,
  threadId: string,
) {
  return `${tenantSlug}:${userId}:${threadId}`
}

export function scopedMessagePageKey(
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

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

export function isTenantContextRecord(
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

export function isLastActiveIdentityRecord(
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

export function isLocalDeviceSignoutRecord(
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
    isNumber(value.id) &&
    isBoolean(value.passwordConfigured)
  )
}

export function isAuthSnapshotRecord(
  value: unknown,
): value is OfflineAuthSnapshotRecord {
  return (
    isObject(value) &&
    isString(value.lastClockSeenAt) &&
    isString(value.lastVerifiedAt) &&
    isString(value.savedAt) &&
    isString(value.sessionExpiresAt) &&
    isString(value.tenantSlug) &&
    isAuthenticatedPortalUser(value.user) &&
    isNumber(value.userId)
  )
}

export function isThreadListRecord(
  value: unknown,
): value is OfflineChatThreadListRecord {
  return (
    isObject(value) &&
    isString(value.activeThreadId) &&
    isString(value.savedAt) &&
    isString(value.tenantSlug) &&
    Array.isArray(value.threads) &&
    value.threads.every(isChatThreadListSummary) &&
    isNumber(value.userId)
  )
}

function isChatThreadListSummary(value: unknown) {
  return (
    isObject(value) &&
    isString(value.id) &&
    isString(value.subtitle) &&
    isString(value.title) &&
    (value.type === 'private' || value.type === 'group') &&
    isNumber(value.unreadCount)
  )
}

export function isMessageSnapshotRecord(
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

export function isMessagePageRecord(
  value: unknown,
): value is OfflineChatMessagePageRecord {
  const record = value as Partial<OfflineChatMessagePageRecord>

  return (
    isMessageSnapshotRecord(value) &&
    isString(record.pageCursor) &&
    (record.pageCursor === 'latest' || record.pageCursor.startsWith('before:'))
  )
}

export function isSameUserScope(
  record: { tenantSlug: string; userId: number },
  tenantSlug: string,
  userId: number,
) {
  return record.tenantSlug === tenantSlug && record.userId === userId
}

export function isSameThreadScope(
  record: { tenantSlug: string; threadId: string; userId: number },
  tenantSlug: string,
  userId: number,
  threadId: string,
) {
  return (
    isSameUserScope(record, tenantSlug, userId) && record.threadId === threadId
  )
}

export async function readOfflineRecord<TRecord>(
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

export async function putOfflineRecord<TRecord>(
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

export async function deleteOfflineRecord(
  storeName: OfflineStoreName,
  key: string,
) {
  const database = await openOfflineDatabase()

  try {
    await database.delete(storeName, key as never)
  } finally {
    database.close()
  }
}
