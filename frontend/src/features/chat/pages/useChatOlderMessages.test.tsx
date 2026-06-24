import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getChatMessages } from '../api/chatClient'
import type { ChatMessagesSnapshot } from '../types'
import type { ChatPageState } from './chatPageState'
import { readOfflineOlderMessagePage } from './offlineChatCache'
import { useChatOlderMessages } from './useChatOlderMessages'

vi.mock('../api/chatClient', () => ({
  getChatMessages: vi.fn(),
}))

vi.mock('./offlineChatCache', () => ({
  readOfflineOlderMessagePage: vi.fn(),
  saveOfflineOlderMessagePage: vi.fn(async () => undefined),
}))

const getChatMessagesMock = vi.mocked(getChatMessages)
const readOfflineOlderMessagePageMock = vi.mocked(readOfflineOlderMessagePage)

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} satisfies NonNullable<ChatMessagesSnapshot['activeThread']>

function createReadySnapshot(
  overrides: Partial<ChatMessagesSnapshot> = {},
): ChatMessagesSnapshot {
  return {
    activeThread: privateThread,
    hasMoreOlder: true,
    messages: [
      {
        attachments: [],
        authorName: 'Ольга Support',
        authorRole: 'agent',
        content: 'Текущая история',
        contentType: 'text',
        createdAt: '2026-04-21T10:00:00.000Z',
        direction: 'incoming',
        id: 205,
        status: 'sent',
      },
    ],
    nextOlderCursor: 205,
    reason: 'none',
    result: 'ready',
    ...overrides,
  }
}

const readyState = {
  cachedSavedAt: null,
  isUsingCachedData: false,
  selectedThreadId: privateThread.id,
  snapshot: createReadySnapshot(),
  status: 'ready',
  threads: [{ ...privateThread, unreadCount: 0 }],
} satisfies ChatPageState

describe('useChatOlderMessages', () => {
  beforeEach(() => {
    getChatMessagesMock.mockReset()
    readOfflineOlderMessagePageMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('times out a hanging older history request and exits loading state', async () => {
    vi.useFakeTimers()

    let olderHistorySignal: AbortSignal | undefined
    getChatMessagesMock.mockImplementationOnce(
      ({ signal }: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          olderHistorySignal = signal
          olderHistorySignal?.addEventListener(
            'abort',
            () => reject(new DOMException('Request timed out.', 'AbortError')),
            { once: true },
          )
        }),
    )
    readOfflineOlderMessagePageMock.mockResolvedValue(null)

    const setHistoryErrorMessage = vi.fn()
    const { result } = renderHook(() =>
      useChatOlderMessages({
        handleConnectionUnavailableError: vi.fn(() => true),
        handleUnauthorizedChatError: vi.fn(async () => false),
        isBrowserOnline: true,
        isMountedRef: { current: true },
        markBrowserOnline: vi.fn(),
        pageState: readyState,
        setHistoryErrorMessage,
        setPageState: vi.fn(),
        tenantSlug: 'buhfirma',
        userId: 7,
      }),
    )

    let loadOlderPromise!: Promise<void>
    act(() => {
      loadOlderPromise = result.current.handleLoadOlderMessages()
    })

    expect(result.current.isLoadingOlder).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
      await loadOlderPromise
    })

    expect(olderHistorySignal?.aborted).toBe(true)
    expect(readOfflineOlderMessagePageMock).toHaveBeenCalledWith({
      pageCursor: 'before:205',
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 7,
    })
    expect(setHistoryErrorMessage).toHaveBeenCalledWith(
      'Более ранние сообщения не сохранены на этом устройстве.',
    )
    expect(result.current.isLoadingOlder).toBe(false)
  })
})
