import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatMessagesSnapshot } from '../types'
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

vi.mock('../../../pwa/serviceWorkerRuntime', () => ({
  clearChatThreadNotifications: vi.fn(async () => true),
  setAppIconBadgeCount: vi.fn(async () => true),
}))

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
    consumePushStaleMarkersForKnownThreadsMock.mockReset()
    clearChatThreadNotificationsMock.mockClear()
    setAppIconBadgeCountMock.mockClear()
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
})
