import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BOOT_CACHE_FALLBACK_MS,
  BOOT_ONLINE_REQUIRED_MS,
  BOOT_REQUEST_TIMEOUT_MS,
  BOOT_SLOW_NOTICE_MS,
  createRequestTimeout,
  getBootStatusForElapsedMs,
  isNetworkOrTimeoutError,
} from './bootCoordinator'

afterEach(() => {
  vi.useRealTimers()
})

describe('boot coordinator', () => {
  it('moves through slow and fallback deadlines', () => {
    expect(getBootStatusForElapsedMs(0, false)).toBe('checking_online')
    expect(getBootStatusForElapsedMs(BOOT_SLOW_NOTICE_MS, false)).toBe(
      'slow_connection',
    )
    expect(getBootStatusForElapsedMs(BOOT_CACHE_FALLBACK_MS, true)).toBe(
      'opening_saved_data',
    )
    expect(getBootStatusForElapsedMs(BOOT_ONLINE_REQUIRED_MS, false)).toBe(
      'online_required',
    )
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
