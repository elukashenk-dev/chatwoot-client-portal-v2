import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useChatReadSync } from './useChatReadSync'

type ReadSyncOptions = {
  canUseBackend: boolean
  historyFragmentIsOpen: boolean
  markRead: (threadId: string) => Promise<void>
  selectedThreadId: string | null
}

function renderReadSync(overrides: Partial<ReadSyncOptions> = {}) {
  const markRead = vi.fn<ReadSyncOptions['markRead']>().mockResolvedValue()
  const initialProps = {
    canUseBackend: true,
    historyFragmentIsOpen: false,
    markRead,
    selectedThreadId: 'private:me',
    ...overrides,
  }
  const hook = renderHook(
    (props: ReadSyncOptions) => useChatReadSync(props),
    {
      initialProps,
    },
  )

  return {
    markRead,
    ...hook,
  }
}

describe('useChatReadSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-04T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks the selected thread read when the latest agent message is visible', () => {
    const { markRead, result } = renderReadSync()

    act(() => {
      result.current({ latestVisibleAgentMessageId: 101 })
    })

    expect(markRead).toHaveBeenCalledWith('private:me')
  })

  it('does not mark read when backend access or latest-thread view is unavailable', () => {
    const offline = renderReadSync({ canUseBackend: false })
    const history = renderReadSync({ historyFragmentIsOpen: true })
    const missingThread = renderReadSync({ selectedThreadId: null })

    act(() => {
      offline.result.current({ latestVisibleAgentMessageId: 101 })
      history.result.current({ latestVisibleAgentMessageId: 101 })
      missingThread.result.current({ latestVisibleAgentMessageId: 101 })
    })

    expect(offline.markRead).not.toHaveBeenCalled()
    expect(history.markRead).not.toHaveBeenCalled()
    expect(missingThread.markRead).not.toHaveBeenCalled()
  })

  it('does not mark read when no agent message is visible', () => {
    const { markRead, result } = renderReadSync()

    act(() => {
      result.current({ latestVisibleAgentMessageId: null })
    })

    expect(markRead).not.toHaveBeenCalled()
  })

  it('debounces repeated visible events for the same message boundary', () => {
    const { markRead, result } = renderReadSync()

    act(() => {
      result.current({ latestVisibleAgentMessageId: 101 })
      result.current({ latestVisibleAgentMessageId: 101 })
    })

    expect(markRead).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(5_000)
      result.current({ latestVisibleAgentMessageId: 101 })
    })

    expect(markRead).toHaveBeenCalledTimes(2)
  })

  it('syncs again immediately when a later agent message becomes visible', () => {
    const { markRead, result } = renderReadSync()

    act(() => {
      result.current({ latestVisibleAgentMessageId: 101 })
      result.current({ latestVisibleAgentMessageId: 102 })
    })

    expect(markRead).toHaveBeenCalledTimes(2)
  })

  it('allows retry for the same boundary after a sync failure', async () => {
    const markRead = vi
      .fn<ReadSyncOptions['markRead']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce()
    const { result } = renderReadSync({ markRead })

    act(() => {
      result.current({ latestVisibleAgentMessageId: 101 })
    })
    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      result.current({ latestVisibleAgentMessageId: 101 })
    })

    expect(markRead).toHaveBeenCalledTimes(2)
  })
})
