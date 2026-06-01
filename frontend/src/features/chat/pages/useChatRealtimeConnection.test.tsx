import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatMessagesSnapshot } from '../types'
import { openChatRealtime } from '../api/chatRealtimeClient'
import {
  clearChatThreadNotifications,
  setAppIconBadgeCount,
} from '../../../pwa/serviceWorkerRuntime'
import type { ChatPageState } from './chatPageState'
import { useChatRealtimeConnection } from './useChatRealtimeConnection'

vi.mock('../api/chatRealtimeClient', () => ({
  openChatRealtime: vi.fn(),
}))

vi.mock('../../../pwa/serviceWorkerRuntime', () => ({
  clearChatThreadNotifications: vi.fn(async () => true),
  setAppIconBadgeCount: vi.fn(async () => true),
}))

const openChatRealtimeMock = vi.mocked(openChatRealtime)
const clearChatThreadNotificationsMock = vi.mocked(clearChatThreadNotifications)
const setAppIconBadgeCountMock = vi.mocked(setAppIconBadgeCount)

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
  unreadCount: 4,
} as const

function createReadySnapshot(
  overrides: Partial<ChatMessagesSnapshot> = {},
): ChatMessagesSnapshot {
  return {
    activeThread: privateThread,
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
  selectedThreadId: 'private:me',
  snapshot: createReadySnapshot(),
  status: 'ready',
  threads: [privateThread],
} satisfies ChatPageState

describe('useChatRealtimeConnection', () => {
  beforeEach(() => {
    openChatRealtimeMock.mockReset()
    openChatRealtimeMock.mockReturnValue({
      close: vi.fn(),
    })
    clearChatThreadNotificationsMock.mockClear()
    setAppIconBadgeCountMock.mockClear()
  })

  it('clears system notifications for the opened thread when realtime clears unread', () => {
    const setPageState = vi.fn()

    renderHook(() =>
      useChatRealtimeConnection({
        isMountedRef: { current: true },
        markBrowserOnline: vi.fn(),
        setPageState,
        threadId: 'private:me',
      }),
    )

    const realtimeOptions = openChatRealtimeMock.mock.calls[0]?.[0]
    expect(realtimeOptions).toBeDefined()

    realtimeOptions!.onMessages(
      createReadySnapshot({
        unread: {
          clearedThreadId: 'private:me',
          totalUnreadCount: 2,
        },
      }),
    )

    expect(setAppIconBadgeCountMock).toHaveBeenCalledWith(2)
    expect(clearChatThreadNotificationsMock).toHaveBeenCalledWith('private:me')

    const updatePageState = setPageState.mock.calls[0]?.[0]
    expect(typeof updatePageState).toBe('function')
    expect(updatePageState(readyState)).toMatchObject({
      threads: [expect.objectContaining({ id: 'private:me', unreadCount: 0 })],
    })
  })
})
