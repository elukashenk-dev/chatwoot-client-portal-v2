import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatMessagesSnapshot } from '../types'
import { getChatMessages } from '../api/chatClient'
import {
  clearChatThreadNotifications,
  setAppIconBadgeCount,
} from '../../../pwa/serviceWorkerRuntime'
import type { ChatPageState } from './chatPageState'
import { consumePushStaleMarkersForKnownThreads } from './offlineChatCache'
import { useChatPushStaleMarkerRefresh } from './useChatPushStaleMarkerRefresh'

vi.mock('./offlineChatCache', () => ({
  consumePushStaleMarkersForKnownThreads: vi.fn(),
}))

vi.mock('../api/chatClient', () => ({
  getChatMessages: vi.fn(),
}))

vi.mock('../../../pwa/serviceWorkerRuntime', () => ({
  clearChatThreadNotifications: vi.fn(async () => true),
  setAppIconBadgeCount: vi.fn(async () => true),
}))

const getChatMessagesMock = vi.mocked(getChatMessages)
const consumePushStaleMarkersForKnownThreadsMock = vi.mocked(
  consumePushStaleMarkersForKnownThreads,
)
const clearChatThreadNotificationsMock = vi.mocked(clearChatThreadNotifications)
const setAppIconBadgeCountMock = vi.mocked(setAppIconBadgeCount)

const groupThread = {
  id: 'group:154',
  subtitle: 'Групповой чат',
  title: 'ООО "Ромашка"',
  type: 'group',
  unreadCount: 3,
} as const

function createReadySnapshot(
  overrides: Partial<ChatMessagesSnapshot> = {},
): ChatMessagesSnapshot {
  return {
    activeThread: groupThread,
    hasMoreOlder: false,
    messages: [],
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
    ...overrides,
  }
}

const readyState = {
  cachedSavedAt: null,
  isUsingCachedData: false,
  selectedThreadId: 'group:154',
  snapshot: createReadySnapshot(),
  status: 'ready',
  threads: [groupThread],
} satisfies ChatPageState

describe('useChatPushStaleMarkerRefresh', () => {
  beforeEach(() => {
    getChatMessagesMock.mockReset()
    consumePushStaleMarkersForKnownThreadsMock.mockReset()
    clearChatThreadNotificationsMock.mockClear()
    setAppIconBadgeCountMock.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears system notifications for the opened thread when stale marker refresh clears unread', async () => {
    consumePushStaleMarkersForKnownThreadsMock.mockResolvedValue([
      {
        snapshot: createReadySnapshot({
          unread: {
            clearedThreadId: 'group:154',
            totalUnreadCount: 2,
          },
        }),
        threadId: 'group:154',
      },
    ])
    const setPageState = vi.fn()

    renderHook(() =>
      useChatPushStaleMarkerRefresh({
        isBrowserOnline: true,
        pageState: readyState,
        setPageState,
        tenantSlug: 'default',
        userId: 7,
      }),
    )

    await waitFor(() => {
      expect(clearChatThreadNotificationsMock).toHaveBeenCalledWith('group:154')
    })

    expect(setAppIconBadgeCountMock).toHaveBeenCalledWith(2)
    const updatePageState = setPageState.mock.calls[0]?.[0]
    expect(typeof updatePageState).toBe('function')
    expect(updatePageState(readyState)).toMatchObject({
      threads: [expect.objectContaining({ id: 'group:154', unreadCount: 0 })],
    })
  })

  it('times out a hanging selected-thread stale marker refresh so it can retry later', async () => {
    vi.useFakeTimers()

    let firstRefreshSignal: AbortSignal | undefined

    getChatMessagesMock
      .mockImplementationOnce(
        (options: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            firstRefreshSignal = options.signal
            firstRefreshSignal?.addEventListener(
              'abort',
              () =>
                reject(new DOMException('Request timed out.', 'AbortError')),
              { once: true },
            )
          }),
      )
      .mockResolvedValueOnce(
        createReadySnapshot({
          unread: {
            clearedThreadId: 'group:154',
            totalUnreadCount: 1,
          },
        }),
      )

    consumePushStaleMarkersForKnownThreadsMock
      .mockImplementationOnce(async ({ refreshThread }) => {
        await refreshThread('group:154')

        return []
      })
      .mockImplementationOnce(async ({ refreshThread }) => [
        {
          snapshot: await refreshThread('group:154'),
          threadId: 'group:154',
        },
      ])

    const setPageState = vi.fn()
    const { rerender } = renderHook(
      ({ pageState }) =>
        useChatPushStaleMarkerRefresh({
          isBrowserOnline: true,
          pageState,
          setPageState,
          tenantSlug: 'default',
          userId: 7,
        }),
      { initialProps: { pageState: readyState } },
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(firstRefreshSignal?.aborted).toBe(true)
    expect(setPageState).not.toHaveBeenCalled()

    rerender({
      pageState: {
        ...readyState,
        threads: [{ ...groupThread, unreadCount: 3 }],
      },
    })

    await act(async () => undefined)

    expect(setPageState).toHaveBeenCalledTimes(1)
    expect(getChatMessagesMock).toHaveBeenCalledTimes(2)
    expect(setAppIconBadgeCountMock).toHaveBeenCalledWith(1)
  })
})
