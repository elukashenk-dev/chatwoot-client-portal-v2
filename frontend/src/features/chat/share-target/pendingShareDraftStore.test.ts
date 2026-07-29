import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearOfflineDatabaseForTests,
  openOfflineDatabase,
} from '../../offline/offlineDatabase'
import type {
  OfflinePendingShareDraftRecord,
  OfflinePendingShareFile,
} from '../../offline/types'
import {
  deletePendingShareDraft,
  pruneExpiredPendingShareDrafts,
  PWA_SHARE_DRAFT_PRUNE_LIMIT,
  readPendingShareDraft,
  replacePendingShareDraftFiles,
} from './pendingShareDraftStore'

const NOW = new Date('2026-07-29T12:00:00.000Z')

function createStoredFile(
  fileName = 'screen.png',
): OfflinePendingShareFile {
  return {
    blob: new NodeBlob(['image-bytes'], {
      type: 'image/png',
    }) as unknown as Blob,
    fileName,
    lastModified: 1_753_790_400_000,
    mimeType: 'image/png',
  }
}

function createFile(
  parts: Array<string | Uint8Array<ArrayBuffer>>,
  fileName: string,
  options: FilePropertyBag,
) {
  return new NodeFile(parts, fileName, options) as unknown as File
}

function createRecord(
  overrides: Partial<OfflinePendingShareDraftRecord> = {},
): OfflinePendingShareDraftRecord {
  return {
    createdAt: '2026-07-29T11:50:00.000Z',
    draftId: 'draft-7',
    expiresAt: '2026-07-29T12:05:00.000Z',
    files: [createStoredFile()],
    host: 'lk.provgroup.ru',
    tenantSlug: 'provgroup',
    userId: 7,
    ...overrides,
  }
}

async function putRecord(record: OfflinePendingShareDraftRecord) {
  const database = await openOfflineDatabase()

  try {
    await database.put('pending_share_drafts', record)
  } finally {
    database.close()
  }
}

async function readRawRecord(draftId: string) {
  const database = await openOfflineDatabase()

  try {
    return await database.get('pending_share_drafts', draftId)
  } finally {
    database.close()
  }
}

describe('pending share draft store', () => {
  beforeEach(async () => {
    await clearOfflineDatabaseForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads one draft through the exact host tenant and user identity index', async () => {
    const record = createRecord()

    await putRecord(record)

    const indexGet = vi.spyOn(IDBIndex.prototype, 'get')
    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(() => {
      throw new Error('pending share reads must not use getAll')
    })
    vi.spyOn(IDBObjectStore.prototype, 'openCursor').mockImplementation(() => {
      throw new Error('pending share reads must not scan the primary store')
    })

    await expect(
      readPendingShareDraft({
        draftId: record.draftId,
        host: record.host,
        now: NOW,
        tenantSlug: record.tenantSlug,
        userId: record.userId,
      }),
    ).resolves.toEqual(record)
    expect(indexGet).toHaveBeenCalledWith([
      record.host,
      record.tenantSlug,
      record.userId,
    ])
  })

  it('rejects and deletes an expired exact-identity draft', async () => {
    const record = createRecord({
      expiresAt: '2026-07-29T11:59:59.999Z',
    })

    await putRecord(record)

    await expect(
      readPendingShareDraft({
        draftId: record.draftId,
        host: record.host,
        now: NOW,
        tenantSlug: record.tenantSlug,
        userId: record.userId,
      }),
    ).resolves.toBeNull()
    await expect(readRawRecord(record.draftId)).resolves.toBeUndefined()
  })

  it('replaces only the exact draft file list', async () => {
    const record = createRecord()
    const replacement = createFile(['replacement'], 'replacement.webp', {
      lastModified: 1_753_790_500_000,
      type: 'image/webp',
    })

    await putRecord(record)
    await replacePendingShareDraftFiles({
      draftId: record.draftId,
      files: [replacement],
      host: record.host,
      now: NOW,
      tenantSlug: record.tenantSlug,
      userId: record.userId,
    })

    await expect(readRawRecord(record.draftId)).resolves.toMatchObject({
      ...record,
      files: [
        {
          blob: expect.objectContaining({
            size: 11,
            type: 'image/webp',
          }),
          fileName: 'replacement.webp',
          lastModified: 1_753_790_500_000,
          mimeType: 'image/webp',
        },
      ],
    })
  })

  it.each([
    ['host', 'lk.other.test'],
    ['tenantSlug', 'other'],
    ['userId', 8],
  ] as const)(
    'deletes a previously readable draft instead of replacing it after %s changes',
    async (field, changedValue) => {
      const record = createRecord()

      await putRecord(record)
      await expect(
        readPendingShareDraft({
          draftId: record.draftId,
          host: record.host,
          now: NOW,
          tenantSlug: record.tenantSlug,
          userId: record.userId,
        }),
      ).resolves.toEqual(record)

      await replacePendingShareDraftFiles({
        draftId: record.draftId,
        files: [
          createFile(['other'], 'other.png', {
            type: 'image/png',
          }),
        ],
        host: field === 'host' ? String(changedValue) : record.host,
        now: NOW,
        tenantSlug:
          field === 'tenantSlug' ? String(changedValue) : record.tenantSlug,
        userId: field === 'userId' ? Number(changedValue) : record.userId,
      })

      await expect(readRawRecord(record.draftId)).resolves.toBeUndefined()
    },
  )

  it.each([
    ['host', 'lk.other.test'],
    ['tenantSlug', 'other'],
    ['userId', 8],
  ] as const)(
    'deletes a previously readable draft when deletion runs after %s changes',
    async (field, changedValue) => {
      const record = createRecord()

      await putRecord(record)
      await expect(
        readPendingShareDraft({
          draftId: record.draftId,
          host: record.host,
          now: NOW,
          tenantSlug: record.tenantSlug,
          userId: record.userId,
        }),
      ).resolves.toEqual(record)

      await deletePendingShareDraft({
        draftId: record.draftId,
        host: field === 'host' ? String(changedValue) : record.host,
        now: NOW,
        tenantSlug:
          field === 'tenantSlug' ? String(changedValue) : record.tenantSlug,
        userId: field === 'userId' ? Number(changedValue) : record.userId,
      })

      await expect(readRawRecord(record.draftId)).resolves.toBeUndefined()
    },
  )

  it('deletes an exact unexpired draft explicitly', async () => {
    const record = createRecord()

    await putRecord(record)
    await deletePendingShareDraft({
      draftId: record.draftId,
      host: record.host,
      now: NOW,
      tenantSlug: record.tenantSlug,
      userId: record.userId,
    })

    await expect(readRawRecord(record.draftId)).resolves.toBeUndefined()
  })

  it('prunes at most 25 expired keys without loading blob values', async () => {
    for (let index = 0; index < PWA_SHARE_DRAFT_PRUNE_LIMIT + 1; index += 1) {
      await putRecord(
        createRecord({
          draftId: `expired-${index}`,
          expiresAt: '2026-07-29T11:59:59.999Z',
          userId: index + 1,
        }),
      )
    }
    await putRecord(
      createRecord({
        draftId: 'future',
        expiresAt: '2026-07-29T12:05:00.000Z',
        userId: 100,
      }),
    )

    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(() => {
      throw new Error('expiry pruning must not load all records')
    })
    vi.spyOn(IDBObjectStore.prototype, 'openCursor').mockImplementation(() => {
      throw new Error('expiry pruning must not scan the primary store')
    })

    await expect(pruneExpiredPendingShareDrafts(NOW)).resolves.toBe(
      PWA_SHARE_DRAFT_PRUNE_LIMIT,
    )
    await expect(pruneExpiredPendingShareDrafts(NOW)).resolves.toBe(1)

    vi.restoreAllMocks()

    const database = await openOfflineDatabase()

    try {
      await expect(
        database.getAllKeys('pending_share_drafts'),
      ).resolves.toEqual(['future'])
    } finally {
      database.close()
    }
  })
})
