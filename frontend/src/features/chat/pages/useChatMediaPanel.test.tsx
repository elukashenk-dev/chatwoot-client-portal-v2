import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getChatThreadMedia } from '../api/chatClient'
import type { ChatMessagesSnapshot, ChatThreadMediaResponse } from '../types'
import { useChatMediaPanel } from './useChatMediaPanel'

vi.mock('../api/chatClient', async () => {
  const actual =
    await vi.importActual<typeof import('../api/chatClient')>(
      '../api/chatClient',
    )

  return {
    ...actual,
    getChatThreadMedia: vi.fn(),
  }
})

const getChatThreadMediaMock = vi.mocked(getChatThreadMedia)

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

function createMediaResponse(
  overrides: Partial<ChatThreadMediaResponse> = {},
): ChatThreadMediaResponse {
  return {
    activeThread: {
      id: 'private:me',
      subtitle: 'Только вы и поддержка',
      title: 'Личный чат',
      type: 'private',
    },
    hasMoreOlder: true,
    items: [
      {
        attachmentId: 91,
        authorName: 'Ольга Support',
        authorRole: 'agent',
        category: 'image',
        createdAt: '2026-05-19T10:20:00.000Z',
        direction: 'incoming',
        fileSize: 2048,
        fileType: 'image',
        id: 'attachment:501:91',
        messageId: 501,
        name: 'receipt.png',
        thumbUrl: '/api/chat/threads/private%3Ame/attachments/501/91/thumb',
        url: '/api/chat/threads/private%3Ame/attachments/501/91',
      },
    ],
    nextOlderCursor: 401,
    reason: 'none',
    result: 'ready',
    ...overrides,
  }
}

function createCurrentSnapshotWithAttachment(): ChatMessagesSnapshot {
  return {
    activeThread: {
      id: 'private:me',
      subtitle: 'Только вы и поддержка',
      title: 'Личный чат',
      type: 'private',
    },
    hasMoreOlder: false,
    messages: [
      {
        attachments: [
          {
            fileSize: 68,
            fileType: 'image',
            id: 77,
            name: 'fresh-photo.png',
            thumbUrl: '/api/chat/threads/private%3Ame/attachments/601/77/thumb',
            url: '/api/chat/threads/private%3Ame/attachments/601/77',
          },
        ],
        authorName: 'Вы',
        authorRole: 'current_user',
        content: null,
        contentType: 'text',
        createdAt: '2026-05-19T12:00:00.000Z',
        direction: 'outgoing',
        id: 601,
        status: 'sent',
      },
    ],
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
  }
}

describe('useChatMediaPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('ignores a stale media response after the panel has been closed', async () => {
    const mediaRequest = createDeferred<ChatThreadMediaResponse>()
    const markBrowserOnline = vi.fn()

    getChatThreadMediaMock.mockReturnValueOnce(mediaRequest.promise)

    const { result } = renderHook(() =>
      useChatMediaPanel({
        currentSnapshot: null,
        handleConnectionUnavailableError: vi.fn(() => false),
        handleUnauthorizedChatError: vi.fn(async () => false),
        isMountedRef: { current: true },
        markBrowserOnline,
        selectedThreadId: 'private:me',
      }),
    )

    act(() => {
      void result.current.loadChatMedia()
    })
    expect(result.current.state.isOpen).toBe(true)

    act(() => {
      result.current.closeChatMedia()
    })
    expect(result.current.state.isOpen).toBe(false)

    await act(async () => {
      mediaRequest.resolve(createMediaResponse())
      await Promise.resolve()
    })

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.media).toBeNull()
    expect(markBrowserOnline).not.toHaveBeenCalled()
  })

  it('loads older media and appends it to the open panel', async () => {
    getChatThreadMediaMock
      .mockResolvedValueOnce(createMediaResponse())
      .mockResolvedValueOnce(
        createMediaResponse({
          hasMoreOlder: false,
          items: [
            {
              attachmentId: 92,
              authorName: 'Вы',
              authorRole: 'current_user',
              category: 'file',
              createdAt: '2026-05-18T10:20:00.000Z',
              direction: 'outgoing',
              fileSize: null,
              fileType: 'application/pdf',
              id: 'attachment:401:92',
              messageId: 401,
              name: 'contract.pdf',
              thumbUrl: '',
              url: '/api/chat/threads/private%3Ame/attachments/401/92',
            },
          ],
          nextOlderCursor: null,
        }),
      )

    const { result } = renderHook(() =>
      useChatMediaPanel({
        currentSnapshot: null,
        handleConnectionUnavailableError: vi.fn(() => false),
        handleUnauthorizedChatError: vi.fn(async () => false),
        isMountedRef: { current: true },
        markBrowserOnline: vi.fn(),
        selectedThreadId: 'private:me',
      }),
    )

    await act(async () => {
      await result.current.loadChatMedia()
    })
    await act(async () => {
      await result.current.loadOlderChatMedia()
    })

    expect(getChatThreadMediaMock).toHaveBeenNthCalledWith(2, {
      beforeMessageId: 401,
      threadId: 'private:me',
    })
    expect(result.current.state.media?.items.map((item) => item.name)).toEqual([
      'receipt.png',
      'contract.pdf',
    ])
    expect(result.current.state.media?.hasMoreOlder).toBe(false)
  })

  it('keeps freshly sent transcript attachments visible while Chatwoot media history catches up', async () => {
    getChatThreadMediaMock.mockResolvedValueOnce(
      createMediaResponse({
        hasMoreOlder: false,
        items: [],
        nextOlderCursor: null,
      }),
    )

    const { result } = renderHook(() =>
      useChatMediaPanel({
        currentSnapshot: createCurrentSnapshotWithAttachment(),
        handleConnectionUnavailableError: vi.fn(() => false),
        handleUnauthorizedChatError: vi.fn(async () => false),
        isMountedRef: { current: true },
        markBrowserOnline: vi.fn(),
        selectedThreadId: 'private:me',
      }),
    )

    await act(async () => {
      await result.current.loadChatMedia()
    })

    expect(result.current.state.media?.items).toEqual([
      expect.objectContaining({
        category: 'image',
        id: 'attachment:601:77',
        name: 'fresh-photo.png',
        url: '/api/chat/threads/private%3Ame/attachments/601/77',
      }),
    ])
  })
})
