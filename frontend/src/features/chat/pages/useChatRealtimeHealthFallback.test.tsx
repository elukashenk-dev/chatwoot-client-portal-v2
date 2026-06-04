import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useChatRealtimeHealthFallback } from './useChatRealtimeHealthFallback'

function setDocumentVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  })
}

async function advanceTimers(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
    await Promise.resolve()
  })
}

describe('useChatRealtimeHealthFallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-04T00:00:00.000Z'))
    setDocumentVisibility('visible')
  })

  afterEach(() => {
    setDocumentVisibility('visible')
    vi.useRealTimers()
  })

  it('refreshes the active snapshot when visible realtime is stale', async () => {
    const refreshChatSnapshot = vi.fn().mockResolvedValue(undefined)

    renderHook(() =>
      useChatRealtimeHealthFallback({
        canUseBackend: true,
        isRealtimeSupported: true,
        realtimeThreadId: 'private:me',
        refreshChatSnapshot,
        snapshotExists: true,
      }),
    )

    await advanceTimers(31_000)

    expect(refreshChatSnapshot).toHaveBeenCalledTimes(1)
  })

  it('does not refresh while realtime activity remains fresh', async () => {
    const refreshChatSnapshot = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useChatRealtimeHealthFallback({
        canUseBackend: true,
        isRealtimeSupported: true,
        realtimeThreadId: 'private:me',
        refreshChatSnapshot,
        snapshotExists: true,
      }),
    )

    await advanceTimers(25_000)
    act(() => {
      result.current.reportRealtimeActivity()
    })
    await advanceTimers(10_000)

    expect(refreshChatSnapshot).not.toHaveBeenCalled()
  })

  it('caps fallback refresh while realtime stays stale', async () => {
    const refreshChatSnapshot = vi.fn().mockResolvedValue(undefined)

    renderHook(() =>
      useChatRealtimeHealthFallback({
        canUseBackend: true,
        isRealtimeSupported: true,
        realtimeThreadId: 'private:me',
        refreshChatSnapshot,
        snapshotExists: true,
      }),
    )

    await advanceTimers(31_000)
    await advanceTimers(10_000)
    expect(refreshChatSnapshot).toHaveBeenCalledTimes(1)

    await advanceTimers(10_000)
    expect(refreshChatSnapshot).toHaveBeenCalledTimes(2)
  })

  it('does not refresh while the document is hidden', async () => {
    const refreshChatSnapshot = vi.fn().mockResolvedValue(undefined)
    setDocumentVisibility('hidden')

    renderHook(() =>
      useChatRealtimeHealthFallback({
        canUseBackend: true,
        isRealtimeSupported: true,
        realtimeThreadId: 'private:me',
        refreshChatSnapshot,
        snapshotExists: true,
      }),
    )

    await advanceTimers(60_000)

    expect(refreshChatSnapshot).not.toHaveBeenCalled()
  })

  it('does not refresh when backend access is unavailable', async () => {
    const refreshChatSnapshot = vi.fn().mockResolvedValue(undefined)

    renderHook(() =>
      useChatRealtimeHealthFallback({
        canUseBackend: false,
        isRealtimeSupported: true,
        realtimeThreadId: 'private:me',
        refreshChatSnapshot,
        snapshotExists: true,
      }),
    )

    await advanceTimers(60_000)

    expect(refreshChatSnapshot).not.toHaveBeenCalled()
  })

  it('resets realtime activity when the active realtime thread changes', async () => {
    const refreshChatSnapshot = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(
      ({ realtimeThreadId }: { realtimeThreadId: string }) =>
        useChatRealtimeHealthFallback({
          canUseBackend: true,
          isRealtimeSupported: true,
          realtimeThreadId,
          refreshChatSnapshot,
          snapshotExists: true,
        }),
      { initialProps: { realtimeThreadId: 'private:me' } },
    )

    await advanceTimers(25_000)
    rerender({ realtimeThreadId: 'group:42' })
    await advanceTimers(10_000)

    expect(refreshChatSnapshot).not.toHaveBeenCalled()
  })
})
