import { openOfflineDatabase } from '../../offline/offlineDatabase'
import {
  PWA_SHARE_DRAFT_EXPIRY_INDEX,
  PWA_SHARE_DRAFT_IDENTITY_INDEX,
  PWA_SHARE_DRAFT_PRUNE_LIMIT,
  type OfflinePendingShareDraftRecord,
  type OfflinePendingShareFile,
  type PendingShareDraftScope,
} from '../../offline/types'
import {
  CHAT_ATTACHMENT_FILE_NAME_MAX_LENGTH,
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_FILES,
} from '../lib/attachmentDraft'

export { PWA_SHARE_DRAFT_PRUNE_LIMIT } from '../../offline/types'

export const PWA_SHARE_DRAFT_TTL_MS = 15 * 60 * 1000

const PWA_SHARE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isValidIsoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  )
}

function isBlob(value: unknown): value is Blob {
  return (
    value instanceof Blob ||
    (Boolean(value) &&
      typeof value === 'object' &&
      typeof (value as Blob).size === 'number' &&
      typeof (value as Blob).slice === 'function' &&
      typeof (value as Blob).type === 'string')
  )
}

function isPendingShareFile(value: unknown): value is OfflinePendingShareFile {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<OfflinePendingShareFile>

  return (
    isBlob(candidate.blob) &&
    candidate.blob.size > 0 &&
    isNonEmptyString(candidate.fileName) &&
    candidate.fileName.length <= CHAT_ATTACHMENT_FILE_NAME_MAX_LENGTH &&
    typeof candidate.lastModified === 'number' &&
    Number.isFinite(candidate.lastModified) &&
    candidate.lastModified >= 0 &&
    isNonEmptyString(candidate.mimeType) &&
    PWA_SHARE_MIME_TYPES.has(candidate.mimeType)
  )
}

function isPendingShareDraftRecord(
  value: unknown,
): value is OfflinePendingShareDraftRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<OfflinePendingShareDraftRecord>

  if (
    !isNonEmptyString(candidate.draftId) ||
    !isNonEmptyString(candidate.host) ||
    !isNonEmptyString(candidate.tenantSlug) ||
    !Number.isSafeInteger(candidate.userId) ||
    Number(candidate.userId) <= 0 ||
    !isValidIsoDate(candidate.createdAt) ||
    !isValidIsoDate(candidate.expiresAt) ||
    !Array.isArray(candidate.files) ||
    candidate.files.length === 0 ||
    candidate.files.length > CHAT_ATTACHMENT_MAX_FILES ||
    !candidate.files.every(isPendingShareFile)
  ) {
    return false
  }

  const totalBytes = candidate.files.reduce(
    (total, file) => total + file.blob.size,
    0,
  )

  return (
    totalBytes <= CHAT_ATTACHMENT_MAX_BYTES &&
    Date.parse(candidate.expiresAt) > Date.parse(candidate.createdAt)
  )
}

function hasExactScope(
  record: OfflinePendingShareDraftRecord,
  scope: PendingShareDraftScope,
) {
  return (
    record.draftId === scope.draftId &&
    record.host === scope.host &&
    record.tenantSlug === scope.tenantSlug &&
    record.userId === scope.userId
  )
}

function isExpired(record: OfflinePendingShareDraftRecord, now: Date) {
  return Date.parse(record.expiresAt) <= now.getTime()
}

function toStoredFile(file: File): OfflinePendingShareFile {
  return {
    blob: file.slice(0, file.size, file.type),
    fileName: file.name,
    lastModified: file.lastModified,
    mimeType: file.type,
  }
}

export async function readPendingShareDraft(input: {
  draftId: string
  host: string
  now?: Date
  tenantSlug: string
  userId: number
}): Promise<OfflinePendingShareDraftRecord | null> {
  const now = input.now ?? new Date()
  const database = await openOfflineDatabase()

  try {
    const transaction = database.transaction(
      'pending_share_drafts',
      'readwrite',
    )
    const store = transaction.objectStore('pending_share_drafts')
    const record = await store
      .index(PWA_SHARE_DRAFT_IDENTITY_INDEX)
      .get([input.host, input.tenantSlug, input.userId])

    if (!isPendingShareDraftRecord(record)) {
      const malformedDraftId = (
        record as { draftId?: unknown } | null | undefined
      )?.draftId

      if (typeof malformedDraftId === 'string') {
        await store.delete(malformedDraftId)
      }

      await transaction.done
      return null
    }

    if (record.draftId !== input.draftId) {
      await transaction.done
      return null
    }

    if (isExpired(record, now)) {
      await store.delete(record.draftId)
      await transaction.done
      return null
    }

    await transaction.done
    return record
  } finally {
    database.close()
  }
}

export async function replacePendingShareDraftFiles(
  input: PendingShareDraftScope & {
    files: readonly File[]
    now?: Date
  },
): Promise<void> {
  const now = input.now ?? new Date()
  const database = await openOfflineDatabase()

  try {
    const transaction = database.transaction(
      'pending_share_drafts',
      'readwrite',
    )
    const store = transaction.objectStore('pending_share_drafts')
    const record = await store.get(input.draftId)

    if (
      !isPendingShareDraftRecord(record) ||
      !hasExactScope(record, input) ||
      isExpired(record, now)
    ) {
      if (record !== undefined) {
        await store.delete(input.draftId)
      }

      await transaction.done
      return
    }

    await store.put({
      ...record,
      files: input.files.map(toStoredFile),
    })
    await transaction.done
  } finally {
    database.close()
  }
}

export async function deletePendingShareDraft(
  input: PendingShareDraftScope & { now?: Date },
): Promise<void> {
  const database = await openOfflineDatabase()

  try {
    const transaction = database.transaction(
      'pending_share_drafts',
      'readwrite',
    )
    const store = transaction.objectStore('pending_share_drafts')
    const record = await store.get(input.draftId)

    if (record !== undefined) {
      await store.delete(input.draftId)
    }

    await transaction.done
  } finally {
    database.close()
  }
}

export async function pruneExpiredPendingShareDrafts(
  now = new Date(),
): Promise<number> {
  const database = await openOfflineDatabase()
  let deletedCount = 0

  try {
    const transaction = database.transaction(
      'pending_share_drafts',
      'readwrite',
    )
    const store = transaction.objectStore('pending_share_drafts')
    let cursor = await store
      .index(PWA_SHARE_DRAFT_EXPIRY_INDEX)
      .openKeyCursor(IDBKeyRange.upperBound(now.toISOString()))

    while (cursor && deletedCount < PWA_SHARE_DRAFT_PRUNE_LIMIT) {
      await store.delete(cursor.primaryKey)
      deletedCount += 1
      cursor = await cursor.continue()
    }

    await transaction.done
    return deletedCount
  } finally {
    database.close()
  }
}
