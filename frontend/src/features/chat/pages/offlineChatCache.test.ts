import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearOfflineDatabaseForTests } from '../../offline/offlineDatabase'
import { offlineStore } from '../../offline/offlineStore'
import type { ChatMessagesSnapshot } from '../types'
import {
  consumePushStaleMarkersForKnownThreads,
  readOfflineChatFallback,
  saveOfflineMessageSnapshot,
  selectCachedThreadId,
  shouldSaveOfflineMessageSnapshot,
  toBoundedOfflineMessageSnapshot,
} from './offlineChatCache'

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} as const

const groupThread = {
  id: 'group:154',
  subtitle: 'Групповой чат',
  title: 'ООО "Ромашка"',
  type: 'group',
} as const

function createReadySnapshot(
  overrides: Partial<ChatMessagesSnapshot> = {},
): ChatMessagesSnapshot {
  return {
    activeThread: privateThread,
    hasMoreOlder: false,
    messages: [
      {
        attachments: [],
        authorName: 'Ольга Support',
        authorRole: 'agent',
        content: 'Здравствуйте, вижу ваше обращение.',
        contentType: 'text',
        createdAt: '2026-04-21T09:12:00.000Z',
        direction: 'incoming',
        id: 101,
        status: 'sent',
      },
    ],
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
    ...overrides,
  }
}

describe('offlineChatCache', () => {
  beforeEach(async () => {
    await clearOfflineDatabaseForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('selects only a cached thread id from the cached thread list', () => {
    const cachedThreads = {
      activeThreadId: privateThread.id,
      savedAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threads: [privateThread, groupThread],
      userId: 7,
    }

    expect(
      selectCachedThreadId({
        cachedThreads,
        preferredThreadId: groupThread.id,
      }),
    ).toBe(groupThread.id)
    expect(
      selectCachedThreadId({
        cachedThreads,
        preferredThreadId: 'group:999',
      }),
    ).toBe(privateThread.id)
  })

  it('falls back to the first cached thread when activeThreadId is stale', () => {
    expect(
      selectCachedThreadId({
        cachedThreads: {
          activeThreadId: 'group:999',
          savedAt: '2026-05-27T10:00:00.000Z',
          tenantSlug: 'buhfirma',
          threads: [privateThread],
          userId: 7,
        },
        preferredThreadId: null,
      }),
    ).toBe(privateThread.id)
  })

  it('ignores unavailable snapshots and saves bounded ready snapshots', async () => {
    const readySnapshot = createReadySnapshot({
      messages: Array.from({ length: 55 }, (_, index) => ({
        attachments: [],
        authorName: 'Ольга Support',
        authorRole: 'agent' as const,
        content: `Сообщение ${index}`,
        contentType: 'text',
        createdAt: `2026-04-21T09:${String(index).padStart(2, '0')}:00.000Z`,
        direction: 'incoming' as const,
        id: index + 1,
        status: 'sent',
      })),
    })

    expect(shouldSaveOfflineMessageSnapshot(readySnapshot)).toBe(true)
    expect(
      toBoundedOfflineMessageSnapshot(readySnapshot).messages,
    ).toHaveLength(50)

    await saveOfflineMessageSnapshot({
      savedAt: '2026-05-27T10:00:00.000Z',
      snapshot: readySnapshot,
      tenantSlug: 'buhfirma',
      threadId: privateThread.id,
      userId: 7,
    })

    await expect(
      offlineStore.readMessageSnapshot('buhfirma', 7, privateThread.id),
    ).resolves.toMatchObject({
      snapshot: {
        hasMoreOlder: true,
        messages: expect.arrayContaining([
          expect.objectContaining({ id: 6 }),
          expect.objectContaining({ id: 55 }),
        ]),
      },
    })

    await saveOfflineMessageSnapshot({
      snapshot: createReadySnapshot({
        activeThread: null,
        messages: [],
        reason: 'chatwoot_unavailable',
        result: 'unavailable',
      }),
      tenantSlug: 'buhfirma',
      threadId: groupThread.id,
      userId: 7,
    })

    await expect(
      offlineStore.readMessageSnapshot('buhfirma', 7, groupThread.id),
    ).resolves.toBeNull()
  })

  it('returns null when the cached selected snapshot does not match cached threads', async () => {
    await offlineStore.saveThreadList({
      activeThreadId: privateThread.id,
      savedAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threads: [privateThread],
      userId: 7,
    })
    await offlineStore.saveMessageSnapshot({
      savedAt: '2026-05-27T10:00:00.000Z',
      snapshot: createReadySnapshot({
        activeThread: groupThread,
      }),
      tenantSlug: 'buhfirma',
      threadId: privateThread.id,
      userId: 7,
    })

    await expect(
      readOfflineChatFallback({
        preferredThreadId: 'group:999',
        tenantSlug: 'buhfirma',
        userId: 7,
      }),
    ).resolves.toBeNull()
  })

  it('returns null when the cached fallback read fails', async () => {
    vi.spyOn(offlineStore, 'readThreadList').mockRejectedValueOnce(
      new Error('IndexedDB read failed'),
    )

    await expect(
      readOfflineChatFallback({
        preferredThreadId: privateThread.id,
        tenantSlug: 'buhfirma',
        userId: 7,
      }),
    ).resolves.toBeNull()
  })

  it('refreshes known current-user stale marker threads and leaves other user markers untouched', async () => {
    const refreshedSnapshot = createReadySnapshot({
      messages: [
        {
          attachments: [],
          authorName: 'Ольга Support',
          authorRole: 'agent',
          content: 'Fresh from push marker',
          contentType: 'text',
          createdAt: '2026-05-27T10:05:00.000Z',
          direction: 'incoming',
          id: 9010,
          status: 'sent',
        },
      ],
    })
    const refreshThread = vi.fn(async () => refreshedSnapshot)

    await offlineStore.savePushStaleMarker({
      chatwootMessageId: 9001,
      createdAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 7,
    })
    await offlineStore.savePushStaleMarker({
      chatwootMessageId: 9002,
      createdAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 8,
    })

    await expect(
      consumePushStaleMarkersForKnownThreads({
        refreshThread,
        tenantSlug: 'buhfirma',
        threads: [privateThread],
        userId: 7,
      }),
    ).resolves.toEqual([
      {
        snapshot: refreshedSnapshot,
        threadId: 'private:me',
      },
    ])

    expect(refreshThread).toHaveBeenCalledWith('private:me')
    await expect(
      offlineStore.readMessageSnapshot('buhfirma', 7, 'private:me'),
    ).resolves.toMatchObject({
      snapshot: refreshedSnapshot,
    })
    await expect(
      offlineStore.listPushStaleMarkers('buhfirma', 7),
    ).resolves.toEqual([])
    await expect(
      offlineStore.listPushStaleMarkers('buhfirma', 8),
    ).resolves.toHaveLength(1)
  })

  it('keeps push stale markers when the refresh fails', async () => {
    const refreshThread = vi.fn(async () => {
      throw new Error('network unavailable')
    })

    await offlineStore.savePushStaleMarker({
      chatwootMessageId: 9003,
      createdAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 7,
    })

    await expect(
      consumePushStaleMarkersForKnownThreads({
        refreshThread,
        tenantSlug: 'buhfirma',
        threads: [privateThread],
        userId: 7,
      }),
    ).rejects.toThrow('network unavailable')

    await expect(
      offlineStore.listPushStaleMarkers('buhfirma', 7),
    ).resolves.toHaveLength(1)
  })

  it('keeps push stale markers when the refresh result is not for the marker thread', async () => {
    const refreshedSnapshot = createReadySnapshot({
      activeThread: groupThread,
    })
    const refreshThread = vi.fn(async () => refreshedSnapshot)

    await offlineStore.savePushStaleMarker({
      chatwootMessageId: 9004,
      createdAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 7,
    })

    await expect(
      consumePushStaleMarkersForKnownThreads({
        refreshThread,
        tenantSlug: 'buhfirma',
        threads: [privateThread],
        userId: 7,
      }),
    ).resolves.toEqual([])

    await expect(
      offlineStore.listPushStaleMarkers('buhfirma', 7),
    ).resolves.toHaveLength(1)
  })
})
