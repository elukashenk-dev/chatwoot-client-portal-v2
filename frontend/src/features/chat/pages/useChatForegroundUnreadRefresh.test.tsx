import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

  afterEach(() => {
    vi.useRealTimers()
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

  it('times out a hanging foreground refresh so later refreshes can run', async () => {
    vi.useFakeTimers()

    let firstRefreshSignal: AbortSignal | undefined

    getChatThreadsMock
      .mockImplementationOnce(
        (options?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            firstRefreshSignal = options?.signal
            firstRefreshSignal?.addEventListener(
              'abort',
              () =>
                reject(new DOMException('Request timed out.', 'AbortError')),
              { once: true },
            )
          }),
      )
      .mockResolvedValueOnce({
        activeThreadId: 'private:me',
        threads: [privateThread, { ...groupThread, unreadCount: 3 }],
        totalUnreadCount: 3,
      })

    const setPageState = vi.fn()

    renderHook(() =>
      useChatForegroundUnreadRefresh({
        handleConnectionUnavailableError: vi.fn(() => true),
        handleUnauthorizedChatError: vi.fn(async () => false),
        isBrowserOnline: true,
        isMountedRef: { current: true },
        markBrowserOnline: vi.fn(),
        setPageState,
      }),
    )

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(getChatThreadsMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(firstRefreshSignal?.aborted).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await act(async () => undefined)

    expect(getChatThreadsMock).toHaveBeenCalledTimes(2)
    expect(setAppIconBadgeCountMock).toHaveBeenCalledWith(3)
    expect(setPageState).toHaveBeenCalledTimes(1)
  })
})
