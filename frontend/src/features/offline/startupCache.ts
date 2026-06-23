import type { AuthenticatedPortalUser } from '../auth/types'
import { isFirstConversationBootstrapReady } from '../chat/lib/chatSnapshot'
import type { ChatMessagesSnapshot, ChatThreadListSummary } from '../chat/types'
import type { PublicTenantContext } from '../tenant/api/tenantClient'
import type {
  OfflineAuthSnapshotRecord,
  OfflineTenantContextRecord,
} from './types'

const STARTUP_CACHE_VERSION = 1
const OFFLINE_CLOCK_ROLLBACK_TOLERANCE_MS = 5 * 60 * 1000

type StartupEnvelope<TRecord> = {
  record: TRecord
  version: typeof STARTUP_CACHE_VERSION
}

type StartupAuthRecord = {
  host: string
  snapshot: OfflineAuthSnapshotRecord
  tenantSlug: string
  userId: number
}

export type StartupAuthSession = {
  scope: {
    host: string
    tenantSlug: string
    userId: number
  }
  snapshot: OfflineAuthSnapshotRecord
}

type StartupChatRecord = {
  cachedSavedAt: string
  host: string
  selectedThreadId: string
  snapshot: ChatMessagesSnapshot
  tenantSlug: string
  threads: ChatThreadListSummary[]
  userId: number
}

type SaveStartupChatFallbackInput = Omit<StartupChatRecord, 'cachedSavedAt'> & {
  cachedSavedAt?: string
}

export type StartupChatFallback = {
  cachedSavedAt: string
  selectedThreadId: string
  snapshot: ChatMessagesSnapshot
  threads: ChatThreadListSummary[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseFiniteTime(value: string) {
  const time = new Date(value).getTime()

  return Number.isFinite(time) ? time : null
}

function isPublicTenantContext(value: unknown): value is PublicTenantContext {
  return (
    isObject(value) &&
    isString(value.displayName) &&
    isString(value.primaryDomain) &&
    isString(value.publicBaseUrl) &&
    isString(value.slug)
  )
}

function isTenantContextRecord(
  value: unknown,
): value is OfflineTenantContextRecord {
  return (
    isObject(value) &&
    isString(value.host) &&
    isString(value.savedAt) &&
    isPublicTenantContext(value.tenant)
  )
}

function isAuthenticatedPortalUser(
  value: unknown,
): value is AuthenticatedPortalUser {
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
    isString(value.savedAt) &&
    isString(value.sessionExpiresAt) &&
    isString(value.tenantSlug) &&
    isAuthenticatedPortalUser(value.user) &&
    isNumber(value.userId)
  )
}

function isStartupAuthRecord(value: unknown): value is StartupAuthRecord {
  return (
    isObject(value) &&
    isString(value.host) &&
    isAuthSnapshotRecord(value.snapshot) &&
    isString(value.tenantSlug) &&
    isNumber(value.userId)
  )
}

function isChatThreadListSummary(
  value: unknown,
): value is ChatThreadListSummary {
  return (
    isObject(value) &&
    isString(value.id) &&
    isString(value.subtitle) &&
    isString(value.title) &&
    (value.type === 'private' || value.type === 'group') &&
    isNumber(value.unreadCount)
  )
}

function isChatMessagesSnapshot(value: unknown): value is ChatMessagesSnapshot {
  return (
    isObject(value) && isString(value.result) && Array.isArray(value.messages)
  )
}

function isStartupChatRecord(value: unknown): value is StartupChatRecord {
  return (
    isObject(value) &&
    isString(value.cachedSavedAt) &&
    isString(value.host) &&
    isString(value.selectedThreadId) &&
    isChatMessagesSnapshot(value.snapshot) &&
    isString(value.tenantSlug) &&
    Array.isArray(value.threads) &&
    value.threads.every(isChatThreadListSummary) &&
    isNumber(value.userId)
  )
}

function isDeviceClockTrustedForStartupSnapshot(
  snapshot: Pick<OfflineAuthSnapshotRecord, 'lastVerifiedAt' | 'savedAt'>,
  nowMs = Date.now(),
) {
  const lastVerifiedAtMs = parseFiniteTime(snapshot.lastVerifiedAt)
  const savedAtMs = parseFiniteTime(snapshot.savedAt)

  if (lastVerifiedAtMs === null || savedAtMs === null) {
    return false
  }

  return (
    lastVerifiedAtMs <= nowMs + OFFLINE_CLOCK_ROLLBACK_TOLERANCE_MS &&
    savedAtMs <= nowMs + OFFLINE_CLOCK_ROLLBACK_TOLERANCE_MS
  )
}

function getStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function readStartupRecord<TRecord>(
  key: string,
  guard: (value: unknown) => value is TRecord,
) {
  const storage = getStorage()

  if (!storage) {
    return null
  }

  try {
    const envelope = JSON.parse(storage.getItem(key) ?? 'null') as unknown

    if (
      !isObject(envelope) ||
      envelope.version !== STARTUP_CACHE_VERSION ||
      !guard(envelope.record)
    ) {
      return null
    }

    return envelope.record
  } catch {
    return null
  }
}

function writeStartupRecord<TRecord>(key: string, record: TRecord) {
  const storage = getStorage()

  if (!storage) {
    return
  }

  try {
    const envelope = {
      record,
      version: STARTUP_CACHE_VERSION,
    } satisfies StartupEnvelope<TRecord>

    storage.setItem(key, JSON.stringify(envelope))
  } catch {
    // The IndexedDB cache remains the source of truth when localStorage is full or blocked.
  }
}

function deleteStartupRecord(key: string) {
  const storage = getStorage()

  if (!storage) {
    return
  }

  try {
    storage.removeItem(key)
  } catch {
    // Best effort cleanup.
  }
}

function tenantKey(host: string) {
  return `portal.startup.tenant:${host}`
}

function authKey(host: string) {
  return `portal.startup.auth:${host}`
}

function chatKey(host: string, tenantSlug: string, userId: number) {
  return `portal.startup.chat:${host}:${tenantSlug}:${userId}`
}

function chatKeyPrefix(host: string) {
  return `portal.startup.chat:${host}:`
}

export function readStartupTenantContext(host: string) {
  const record = readStartupRecord(tenantKey(host), isTenantContextRecord)

  return record?.host === host ? record : null
}

export function saveStartupTenantContext(record: OfflineTenantContextRecord) {
  writeStartupRecord(tenantKey(record.host), record)
}

export function deleteStartupTenantContext(host: string) {
  deleteStartupRecord(tenantKey(host))
}

export function readStartupAuthSession({
  host,
  tenantSlug,
}: {
  host: string
  tenantSlug: string | null
}): StartupAuthSession | null {
  if (!tenantSlug) {
    return null
  }

  const record = readStartupRecord(authKey(host), isStartupAuthRecord)
  const sessionExpiresAtMs = record
    ? parseFiniteTime(record.snapshot.sessionExpiresAt)
    : null
  const nowMs = Date.now()

  if (
    !record ||
    record.host !== host ||
    record.tenantSlug !== tenantSlug ||
    record.snapshot.tenantSlug !== tenantSlug ||
    record.snapshot.userId !== record.userId ||
    record.snapshot.user.id !== record.userId ||
    sessionExpiresAtMs === null ||
    !isDeviceClockTrustedForStartupSnapshot(record.snapshot, nowMs) ||
    sessionExpiresAtMs <= nowMs
  ) {
    return null
  }

  return {
    scope: {
      host,
      tenantSlug,
      userId: record.userId,
    },
    snapshot: record.snapshot,
  }
}

export function saveStartupAuthSession({
  host,
  snapshot,
}: {
  host: string
  snapshot: OfflineAuthSnapshotRecord
}) {
  writeStartupRecord(authKey(host), {
    host,
    snapshot,
    tenantSlug: snapshot.tenantSlug,
    userId: snapshot.userId,
  } satisfies StartupAuthRecord)
}

export function deleteStartupAuthSession(host: string) {
  deleteStartupRecord(authKey(host))
}

export function readStartupChatFallback({
  host,
  preferredThreadId,
  tenantSlug,
  userId,
}: {
  host: string
  preferredThreadId: string | null
  tenantSlug: string
  userId: number
}): StartupChatFallback | null {
  const record = readStartupRecord(
    chatKey(host, tenantSlug, userId),
    isStartupChatRecord,
  )

  if (
    !record ||
    record.host !== host ||
    record.tenantSlug !== tenantSlug ||
    record.userId !== userId
  ) {
    return null
  }

  const threadIds = new Set<string>(record.threads.map((thread) => thread.id))
  const selectedThreadId =
    preferredThreadId && threadIds.has(preferredThreadId)
      ? preferredThreadId
      : threadIds.has(record.selectedThreadId)
        ? record.selectedThreadId
        : (record.threads[0]?.id ?? null)

  if (!selectedThreadId) {
    return null
  }

  if (
    record.snapshot.result !== 'ready' &&
    !isFirstConversationBootstrapReady(record.snapshot)
  ) {
    return null
  }

  if (record.snapshot.result === 'ready' && !record.snapshot.activeThread) {
    return null
  }

  if (
    record.snapshot.activeThread &&
    record.snapshot.activeThread.id !== selectedThreadId
  ) {
    return null
  }

  return {
    cachedSavedAt: record.cachedSavedAt,
    selectedThreadId,
    snapshot: record.snapshot,
    threads: record.threads,
  }
}

export function saveStartupChatFallback({
  cachedSavedAt = new Date().toISOString(),
  host,
  selectedThreadId,
  snapshot,
  tenantSlug,
  threads,
  userId,
}: SaveStartupChatFallbackInput) {
  writeStartupRecord(chatKey(host, tenantSlug, userId), {
    cachedSavedAt,
    host,
    selectedThreadId,
    snapshot,
    tenantSlug,
    threads,
    userId,
  } satisfies StartupChatRecord)
}

export function deleteStartupChatFallback({
  host,
  tenantSlug,
  userId,
}: {
  host: string
  tenantSlug: string
  userId: number
}) {
  deleteStartupRecord(chatKey(host, tenantSlug, userId))
}

export function deleteStartupChatFallbacksForHost(host: string) {
  const storage = getStorage()

  if (!storage) {
    return
  }

  try {
    const prefix = chatKeyPrefix(host)
    const keysToDelete: string[] = []

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)

      if (key?.startsWith(prefix)) {
        keysToDelete.push(key)
      }
    }

    for (const key of keysToDelete) {
      storage.removeItem(key)
    }
  } catch {
    // Best effort cleanup.
  }
}
