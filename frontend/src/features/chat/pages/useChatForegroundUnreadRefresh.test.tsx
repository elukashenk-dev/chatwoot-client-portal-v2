import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setAppIconBadgeCount } from '../../../pwa/serviceWorkerRuntime'
import { getChatThreads } from '../api/chatClient'
import type { ChatPageState } from './chatPageState'
import { useChatForegroundUnreadRefresh } from './useChatForegroundUnreadRefresh'

vi.mock('../api/chatClient', () => ({
  getChatThreads: vi.fn(),
}))

vi.mock('../../../pwa/serviceWorkerRuntime', () => ({
  setAppIconBadgeCount: vi.fn(async () => true),
}))

const getChatThreadsMock = vi.mocked(getChatThreads)
const setAppIconBadgeCountMock = vi.mocked(setAppIconBadgeCount)

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
  unreadCount: 0,
} as const

const groupThread = {
  id: 'group:154',
  subtitle: 'Групповой чат',
  title: 'ООО "Ромашка"',
  type: 'group',
  unreadCount: 0,
} as const

const readyState = {
  cachedSavedAt: null,
  isUsingCachedData: false,
  selectedThreadId: 'private:me',
  snapshot: {
    activeThread: {
      id: 'private:me',
      subtitle: 'Вы и поддержка',
      title: 'Личный чат',
      type: 'private',
    },
    hasMoreOlder: false,
    messages: [],
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
  },
  status: 'ready',
  threads: [privateThread, groupThread],
} satisfies ChatPageState

describe('useChatForegroundUnreadRefresh', () => {
  beforeEach(() => {
    getChatThreadsMock.mockReset()
    setAppIconBadgeCountMock.mockClear()
  })

  it('refreshes visible thread unread counts from the backend when the app returns to foreground', async () => {
    getChatThreadsMock.mockResolvedValue({
      activeThreadId: 'private:me',
      threads: [
        privateThread,
        {
          ...groupThread,
          unreadCount: 2,
        },
      ],
      totalUnreadCount: 2,
    })

    const markBrowserOnline = vi.fn()
    const setPageState = vi.fn()

    renderHook(() =>
      useChatForegroundUnreadRefresh({
        handleConnectionUnavailableError: vi.fn(() => false),
        handleUnauthorizedChatError: vi.fn(async () => false),
        isBrowserOnline: true,
        isMountedRef: { current: true },
        markBrowserOnline,
        setPageState,
      }),
    )

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(getChatThreadsMock).toHaveBeenCalledTimes(1)
    })

    expect(markBrowserOnline).toHaveBeenCalledTimes(1)
    expect(setAppIconBadgeCountMock).toHaveBeenCalledWith(2)

    const updatePageState = setPageState.mock.calls[0]?.[0]
    expect(typeof updatePageState).toBe('function')
    expect(updatePageState(readyState)).toMatchObject({
      selectedThreadId: 'private:me',
      threads: [
        expect.objectContaining({ id: 'private:me', unreadCount: 0 }),
        expect.objectContaining({ id: 'group:154', unreadCount: 2 }),
      ],
    })
  })
})
