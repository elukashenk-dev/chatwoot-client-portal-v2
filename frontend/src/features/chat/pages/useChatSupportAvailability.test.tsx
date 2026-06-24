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
    getChatSupportAvailabilityMock.mockResolvedValue(
      createAvailability('online'),
    )

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
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(getChatSupportAvailabilityMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(getChatSupportAvailabilityMock).toHaveBeenCalledTimes(2)
  })

  it('times out a hanging support availability poll so later polls can run', async () => {
    vi.useFakeTimers()

    let firstPollSignal: AbortSignal | undefined
    const handleConnectionUnavailableError = vi.fn(() => true)

    getChatSupportAvailabilityMock
      .mockImplementationOnce(
        (options?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            firstPollSignal = options?.signal
            firstPollSignal?.addEventListener(
              'abort',
              () =>
                reject(new DOMException('Request timed out.', 'AbortError')),
              { once: true },
            )
          }),
      )
      .mockResolvedValueOnce(createAvailability('online'))

    const { result } = renderHook(() =>
      useChatSupportAvailability({
        handleConnectionUnavailableError,
        handleUnauthorizedChatError: vi.fn(async () => false),
        isBrowserOnline: true,
        isMountedRef: { current: true },
        markBrowserOnline: vi.fn(),
      }),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(getChatSupportAvailabilityMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(firstPollSignal?.aborted).toBe(true)
    expect(handleConnectionUnavailableError).toHaveBeenCalledTimes(1)
    expect(result.current.state.isLoading).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })

    expect(getChatSupportAvailabilityMock).toHaveBeenCalledTimes(2)
    expect(result.current.state.availability?.currentStatus).toBe('online')
  })
})
