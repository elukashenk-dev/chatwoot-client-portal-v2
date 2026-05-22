import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getChatSupportAvailability } from '../api/chatClient'
import type { ChatSupportAvailabilityResponse } from '../types'
import { useChatSupportAvailability } from './useChatSupportAvailability'

vi.mock('../api/chatClient', async () => {
  const actual =
    await vi.importActual<typeof import('../api/chatClient')>(
      '../api/chatClient',
    )

  return {
    ...actual,
    getChatSupportAvailability: vi.fn(),
  }
})

const getChatSupportAvailabilityMock = vi.mocked(getChatSupportAvailability)

function createAvailability(
  currentStatus: ChatSupportAvailabilityResponse['currentStatus'] = 'online',
): ChatSupportAvailabilityResponse {
  return {
    currentStatus,
    outOfOfficeMessage: null,
    reason: 'none',
    result: 'ready',
    workingHours: {
      enabled: false,
      isWithinWorkingHours: null,
      rows: [],
      timezone: 'UTC',
    },
  }
}

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

describe('useChatSupportAvailability', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('loads support availability and marks browser online', async () => {
    const markBrowserOnline = vi.fn()
    getChatSupportAvailabilityMock.mockResolvedValueOnce(
      createAvailability('online'),
    )

    const { result } = renderHook(() =>
      useChatSupportAvailability({
        handleConnectionUnavailableError: vi.fn(() => false),
        handleUnauthorizedChatError: vi.fn(async () => false),
        isBrowserOnline: true,
        isMountedRef: { current: true },
        markBrowserOnline,
      }),
    )

    await waitFor(() => {
      expect(result.current.state.availability?.currentStatus).toBe('online')
    })

    expect(result.current.state.isLoading).toBe(false)
    expect(markBrowserOnline).toHaveBeenCalledTimes(1)
  })

  it('ignores stale support availability responses', async () => {
    const firstRequest = createDeferred<ChatSupportAvailabilityResponse>()
    const secondRequest = createDeferred<ChatSupportAvailabilityResponse>()
    getChatSupportAvailabilityMock
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise)

    const { result } = renderHook(() =>
      useChatSupportAvailability({
        handleConnectionUnavailableError: vi.fn(() => false),
        handleUnauthorizedChatError: vi.fn(async () => false),
        isBrowserOnline: false,
        isMountedRef: { current: true },
        markBrowserOnline: vi.fn(),
      }),
    )

    act(() => {
      void result.current.loadSupportAvailability()
      void result.current.loadSupportAvailability()
    })

    await act(async () => {
      firstRequest.resolve(createAvailability('offline'))
      await Promise.resolve()
    })
    expect(result.current.state.availability).toBeNull()

    await act(async () => {
      secondRequest.resolve(createAvailability('outside_hours'))
      await Promise.resolve()
    })
    expect(result.current.state.availability?.currentStatus).toBe(
      'outside_hours',
    )
  })

  it('polls while browser is online', async () => {
    vi.useFakeTimers()
    getChatSupportAvailabilityMock.mockResolvedValue(createAvailability('online'))

    renderHook(() =>
      useChatSupportAvailability({
        handleConnectionUnavailableError: vi.fn(() => false),
        handleUnauthorizedChatError: vi.fn(async () => false),
        isBrowserOnline: true,
        isMountedRef: { current: true },
        markBrowserOnline: vi.fn(),
      }),
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(getChatSupportAvailabilityMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(getChatSupportAvailabilityMock).toHaveBeenCalledTimes(2)
  })
})
