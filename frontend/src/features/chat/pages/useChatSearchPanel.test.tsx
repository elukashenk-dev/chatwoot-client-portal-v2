import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getChatThreadSearch } from '../api/chatClient'
import type { ChatMessagesSnapshot, ChatThreadSearchResponse } from '../types'
import { useChatSearchPanel } from './useChatSearchPanel'

vi.mock('../api/chatClient', async () => {
  const actual =
    await vi.importActual<typeof import('../api/chatClient')>(
      '../api/chatClient',
    )

  return {
    ...actual,
    getChatThreadSearch: vi.fn(),
  }
})

const getChatThreadSearchMock = vi.mocked(getChatThreadSearch)

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })

  return {
    promise,
    resolve,
  }
}

function createSearchResponse(
  overrides: Partial<ChatThreadSearchResponse> = {},
): ChatThreadSearchResponse {
  return {
    activeThread: {
      id: 'private:me',
      subtitle: 'Вы и поддержка',
      title: 'Личный чат',
      type: 'private',
    },
    hasMoreOlder: true,
    items: [
      {
        afterSnippet: null,
        authorName: 'Ольга Support',
        authorRole: 'agent',
        beforeSnippet: null,
        content: 'Договор готов к подписанию.',
        createdAt: '2026-05-20T08:20:00.000Z',
        direction: 'incoming',
        id: 'message:204',
        matchRanges: [{ start: 0, end: 7 }],
        messageId: 204,
      },
    ],
    nextOlderCursor: 204,
    query: 'договор',
    reason: 'none',
    result: 'ready',
    ...overrides,
  }
}

function createCurrentSnapshotWithMatch(): ChatMessagesSnapshot {
  return {
    activeThread: {
      id: 'private:me',
      subtitle: 'Вы и поддержка',
      title: 'Личный чат',
      type: 'private',
    },
    hasMoreOlder: false,
    messages: [
      {
        attachments: [],
        authorName: 'Вы',
        authorRole: 'current_user',
        content: 'Свежий договор из transcript snapshot',
        contentType: 'text',
        createdAt: '2026-05-20T08:30:00.000Z',
        direction: 'outgoing',
        id: 777,
        status: 'sent',
      },
    ],
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
  }
}

function createOptions(
  overrides: Partial<Parameters<typeof useChatSearchPanel>[0]> = {},
) {
  return {
    currentSnapshot: null,
    handleConnectionUnavailableError: vi.fn(() => false),
    handleUnauthorizedChatError: vi.fn(async () => false),
    isMountedRef: { current: true },
    markBrowserOnline: vi.fn(),
    selectedThreadId: 'private:me',
    ...overrides,
  }
}

async function flushDebouncedChatSearch() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300)
  })
}

describe('useChatSearchPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('opens without request and loads when the query has at least two characters', async () => {
    vi.useFakeTimers()
    getChatThreadSearchMock.mockResolvedValueOnce(createSearchResponse())

    const { result } = renderHook(() =>
      useChatSearchPanel(createOptions({ selectedThreadId: 'private:me' })),
    )

    act(() => {
      result.current.openChatSearch()
    })
    expect(result.current.state.isOpen).toBe(true)
    expect(getChatThreadSearchMock).not.toHaveBeenCalled()

    act(() => {
      result.current.updateChatSearchQuery('д')
    })
    expect(getChatThreadSearchMock).not.toHaveBeenCalled()

    act(() => {
      result.current.updateChatSearchQuery('договор')
    })
    await flushDebouncedChatSearch()

    expect(getChatThreadSearchMock).toHaveBeenCalledWith({
      beforeMessageId: null,
      query: 'договор',
      threadId: 'private:me',
    })
    expect(result.current.state.search?.items).toHaveLength(1)
  })

  it('debounces rapid query updates and searches only the final query', async () => {
    vi.useFakeTimers()
    getChatThreadSearchMock.mockResolvedValueOnce(
      createSearchResponse({ query: 'договор' }),
    )

    const { result } = renderHook(() =>
      useChatSearchPanel(createOptions({ selectedThreadId: 'private:me' })),
    )

    act(() => {
      result.current.openChatSearch()
    })
    act(() => {
      void result.current.updateChatSearchQuery('до')
      void result.current.updateChatSearchQuery('дог')
      void result.current.updateChatSearchQuery('договор')
    })

    expect(getChatThreadSearchMock).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299)
    })
    expect(getChatThreadSearchMock).not.toHaveBeenCalled()

    await flushDebouncedChatSearch()

    expect(getChatThreadSearchMock).toHaveBeenCalledTimes(1)
    expect(getChatThreadSearchMock).toHaveBeenCalledWith({
      beforeMessageId: null,
      query: 'договор',
      threadId: 'private:me',
    })
  })

  it('keeps trailing spaces in the input while searching with the trimmed query', async () => {
    vi.useFakeTimers()
    getChatThreadSearchMock.mockResolvedValueOnce(
      createSearchResponse({ query: 'договор' }),
    )

    const { result } = renderHook(() =>
      useChatSearchPanel(createOptions({ selectedThreadId: 'private:me' })),
    )

    act(() => {
      result.current.openChatSearch()
    })
    act(() => {
      result.current.updateChatSearchQuery('договор ')
    })

    expect(result.current.state.query).toBe('договор ')

    await flushDebouncedChatSearch()

    expect(result.current.state.query).toBe('договор ')
    expect(getChatThreadSearchMock).toHaveBeenCalledWith({
      beforeMessageId: null,
      query: 'договор',
      threadId: 'private:me',
    })
  })

  it('cancels a pending delayed search when the query is cleared', async () => {
    vi.useFakeTimers()

    const { result } = renderHook(() =>
      useChatSearchPanel(createOptions({ selectedThreadId: 'private:me' })),
    )

    act(() => {
      result.current.openChatSearch()
    })
    act(() => {
      void result.current.updateChatSearchQuery('договор')
      void result.current.updateChatSearchQuery('')
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(getChatThreadSearchMock).not.toHaveBeenCalled()
    expect(result.current.state.query).toBe('')
    expect(result.current.state.search).toBeNull()
  })

  it('cancels a pending delayed search when the selected thread changes', async () => {
    vi.useFakeTimers()

    const { result, rerender } = renderHook(
      ({ selectedThreadId }: { selectedThreadId: string }) =>
        useChatSearchPanel(createOptions({ selectedThreadId })),
      {
        initialProps: { selectedThreadId: 'private:me' },
      },
    )

    act(() => {
      result.current.openChatSearch()
    })
    act(() => {
      result.current.updateChatSearchQuery('договор')
    })
    rerender({ selectedThreadId: 'group:204' })

    await flushDebouncedChatSearch()

    expect(getChatThreadSearchMock).not.toHaveBeenCalled()
  })

  it('ignores a stale search response after the panel has been closed', async () => {
    vi.useFakeTimers()
    const searchRequest = createDeferred<ChatThreadSearchResponse>()
    const markBrowserOnline = vi.fn()

    getChatThreadSearchMock.mockReturnValueOnce(searchRequest.promise)

    const { result } = renderHook(() =>
      useChatSearchPanel(
        createOptions({
          markBrowserOnline,
          selectedThreadId: 'private:me',
        }),
      ),
    )

    act(() => {
      result.current.openChatSearch()
    })
    act(() => {
      void result.current.updateChatSearchQuery('договор')
    })
    await flushDebouncedChatSearch()
    expect(getChatThreadSearchMock).toHaveBeenCalledTimes(1)
    expect(result.current.state.isOpen).toBe(true)

    act(() => {
      result.current.closeChatSearch()
    })
    expect(result.current.state.isOpen).toBe(false)

    await act(async () => {
      searchRequest.resolve(createSearchResponse())
      await Promise.resolve()
    })

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.search).toBeNull()
    expect(markBrowserOnline).not.toHaveBeenCalled()
  })

  it('loads older search results and appends them to the open panel', async () => {
    vi.useFakeTimers()
    const olderResult = {
      ...createSearchResponse().items[0],
      content: 'Старый договор.',
      id: 'message:120' as const,
      messageId: 120,
    }

    getChatThreadSearchMock
      .mockResolvedValueOnce(createSearchResponse())
      .mockResolvedValueOnce(
        createSearchResponse({
          hasMoreOlder: false,
          items: [olderResult],
          nextOlderCursor: null,
        }),
      )

    const { result } = renderHook(() =>
      useChatSearchPanel(createOptions({ selectedThreadId: 'private:me' })),
    )

    act(() => {
      result.current.openChatSearch()
    })
    act(() => {
      result.current.updateChatSearchQuery('договор')
    })
    await flushDebouncedChatSearch()
    await act(async () => {
      await result.current.loadOlderChatSearch()
    })

    expect(getChatThreadSearchMock).toHaveBeenNthCalledWith(2, {
      beforeMessageId: 204,
      query: 'договор',
      threadId: 'private:me',
    })
    expect(
      result.current.state.search?.items.map((item) => item.messageId),
    ).toEqual([204, 120])
  })

  it('merges current snapshot matches when backend returns empty results', async () => {
    vi.useFakeTimers()
    getChatThreadSearchMock.mockResolvedValueOnce(
      createSearchResponse({
        hasMoreOlder: false,
        items: [],
        nextOlderCursor: null,
      }),
    )

    const { result } = renderHook(() =>
      useChatSearchPanel(
        createOptions({
          currentSnapshot: createCurrentSnapshotWithMatch(),
          selectedThreadId: 'private:me',
        }),
      ),
    )

    act(() => {
      result.current.openChatSearch()
    })
    act(() => {
      result.current.updateChatSearchQuery('договор')
    })
    await flushDebouncedChatSearch()

    expect(result.current.state.search?.items).toEqual([
      expect.objectContaining({ messageId: 777 }),
    ])
  })

  it('merges the latest current snapshot when it changes before the delayed search starts', async () => {
    vi.useFakeTimers()
    getChatThreadSearchMock.mockResolvedValueOnce(
      createSearchResponse({
        hasMoreOlder: false,
        items: [],
        nextOlderCursor: null,
      }),
    )

    const { result, rerender } = renderHook(
      ({ currentSnapshot }: { currentSnapshot: ChatMessagesSnapshot | null }) =>
        useChatSearchPanel(
          createOptions({
            currentSnapshot,
            selectedThreadId: 'private:me',
          }),
        ),
      {
        initialProps: {
          currentSnapshot: null as ChatMessagesSnapshot | null,
        },
      },
    )

    act(() => {
      result.current.openChatSearch()
    })
    act(() => {
      result.current.updateChatSearchQuery('договор')
    })
    rerender({ currentSnapshot: createCurrentSnapshotWithMatch() })
    await flushDebouncedChatSearch()

    expect(result.current.state.search?.items).toEqual([
      expect.objectContaining({ messageId: 777 }),
    ])
  })
})
