import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getChatThreadInfo } from '../api/chatClient'
import type { ChatThreadInfoResponse } from '../types'
import { useChatInfoPanel } from './useChatInfoPanel'

vi.mock('../api/chatClient', async () => {
  const actual =
    await vi.importActual<typeof import('../api/chatClient')>(
      '../api/chatClient',
    )

  return {
    ...actual,
    getChatThreadInfo: vi.fn(),
  }
})

const getChatThreadInfoMock = vi.mocked(getChatThreadInfo)

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

function createChatInfoResponse(): ChatThreadInfoResponse {
  return {
    accessLabel: 'Только вы и поддержка',
    activeThread: {
      id: 'private:me',
      subtitle: 'Только вы и поддержка',
      title: 'Личный чат',
      type: 'private',
    },
    curatorName: 'Анна Маттина',
    lastActivityAt: '2026-05-19T10:20:00.000Z',
    participants: [],
    reason: 'none',
    result: 'ready',
    startedAt: '2026-05-18T09:00:00.000Z',
    supportLabel: 'Команда ProvGroup',
    threadTypeLabel: 'Личный',
  }
}

describe('useChatInfoPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('ignores a stale info response after the panel has been closed', async () => {
    const threadInfoRequest = createDeferred<ChatThreadInfoResponse>()
    const markBrowserOnline = vi.fn()

    getChatThreadInfoMock.mockReturnValueOnce(threadInfoRequest.promise)

    const { result } = renderHook(() =>
      useChatInfoPanel({
        handleConnectionUnavailableError: vi.fn(() => false),
        handleUnauthorizedChatError: vi.fn(async () => false),
        isMountedRef: { current: true },
        markBrowserOnline,
        selectedThreadId: 'private:me',
      }),
    )

    act(() => {
      void result.current.loadChatInfo()
    })
    expect(result.current.state.isOpen).toBe(true)

    act(() => {
      result.current.closeChatInfo()
    })
    expect(result.current.state.isOpen).toBe(false)

    await act(async () => {
      threadInfoRequest.resolve(createChatInfoResponse())
      await Promise.resolve()
    })

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.info).toBeNull()
    expect(markBrowserOnline).not.toHaveBeenCalled()
  })
})
