import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BOOT_LOCAL_CACHE_READ_DEADLINE_MS,
  BOOT_ONLINE_REQUIRED_MS,
  BOOT_REQUEST_TIMEOUT_MS,
  createRequestTimeout,
  isNetworkOrTimeoutError,
  withBootReadDeadline,
} from './bootCoordinator'

afterEach(() => {
  vi.useRealTimers()
})

describe('boot coordinator', () => {
  it('keeps distinct local cache, online-required and request deadlines', () => {
    expect(BOOT_LOCAL_CACHE_READ_DEADLINE_MS).toBeLessThan(
      BOOT_ONLINE_REQUIRED_MS,
    )
    expect(BOOT_ONLINE_REQUIRED_MS).toBeLessThan(BOOT_REQUEST_TIMEOUT_MS)
  })

  it('bounds local cache reads with a short deadline', async () => {
    vi.useFakeTimers()
    const boundedRead = withBootReadDeadline(
      new Promise<string>(() => undefined),
      'cache_read_timeout',
      BOOT_LOCAL_CACHE_READ_DEADLINE_MS,
    )

    vi.advanceTimersByTime(BOOT_LOCAL_CACHE_READ_DEADLINE_MS)

    await expect(boundedRead).resolves.toBe('cache_read_timeout')
  })

  it('creates a timeout handle that aborts after request timeout', () => {
    vi.useFakeTimers()
    const timeout = createRequestTimeout()

    expect(timeout.signal.aborted).toBe(false)
    vi.advanceTimersByTime(BOOT_REQUEST_TIMEOUT_MS)
    expect(timeout.signal.aborted).toBe(true)
  })

  it('can cancel fallback timeout handles', () => {
    vi.useFakeTimers()
    const timeout = createRequestTimeout()

    timeout.cancel()
    vi.advanceTimersByTime(BOOT_REQUEST_TIMEOUT_MS)

    expect(timeout.signal.aborted).toBe(false)
  })

  it('recognizes abort and timeout errors by browser error name', () => {
    expect(new DOMException('Aborted', 'AbortError')).toSatisfy(
      isNetworkOrTimeoutError,
    )
    expect(new DOMException('Timed out', 'TimeoutError')).toSatisfy(
      isNetworkOrTimeoutError,
    )
    expect(new Error('boom')).not.toSatisfy(isNetworkOrTimeoutError)
  })
})
