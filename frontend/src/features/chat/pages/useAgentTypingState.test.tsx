import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAgentTypingState } from './useAgentTypingState'

describe('useAgentTypingState', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps matching agent typing events visible during long continuous agent composition and clears after the stale fallback timeout', () => {
    const { result } = renderHook(() =>
      useAgentTypingState({
        realtimeThreadId: 'private:me',
        selectedThreadId: 'private:me',
      }),
    )

    act(() => {
      result.current.handleAgentTyping({
        actor: 'agent',
        isTyping: true,
        threadId: 'private:me',
      })
    })

    expect(result.current.isAgentTypingVisible).toBe(true)

    act(() => {
      vi.advanceTimersByTime(59_000)
    })

    expect(result.current.isAgentTypingVisible).toBe(true)

    act(() => {
      vi.advanceTimersByTime(1_000)
    })

    expect(result.current.isAgentTypingVisible).toBe(false)
  })

  it('clears typing state on typing off and ignores stale thread events', () => {
    const { result } = renderHook(() =>
      useAgentTypingState({
        realtimeThreadId: 'private:me',
        selectedThreadId: 'private:me',
      }),
    )

    act(() => {
      result.current.handleAgentTyping({
        actor: 'agent',
        isTyping: true,
        threadId: 'group:154',
      })
    })

    expect(result.current.isAgentTypingVisible).toBe(false)

    act(() => {
      result.current.handleAgentTyping({
        actor: 'agent',
        isTyping: true,
        threadId: 'private:me',
      })
      result.current.handleAgentTyping({
        actor: 'agent',
        isTyping: false,
        threadId: 'private:me',
      })
    })

    expect(result.current.isAgentTypingVisible).toBe(false)
  })

  it('clears typing state when the selected or realtime thread changes', () => {
    const { rerender, result } = renderHook(
      ({
        realtimeThreadId,
        selectedThreadId,
      }: {
        realtimeThreadId: string | null
        selectedThreadId: string | null
      }) =>
        useAgentTypingState({
          realtimeThreadId,
          selectedThreadId,
        }),
      {
        initialProps: {
          realtimeThreadId: 'private:me',
          selectedThreadId: 'private:me',
        },
      },
    )

    act(() => {
      result.current.handleAgentTyping({
        actor: 'agent',
        isTyping: true,
        threadId: 'private:me',
      })
    })

    expect(result.current.isAgentTypingVisible).toBe(true)

    rerender({
      realtimeThreadId: 'group:154',
      selectedThreadId: 'group:154',
    })

    expect(result.current.isAgentTypingVisible).toBe(false)

    rerender({
      realtimeThreadId: 'private:me',
      selectedThreadId: 'private:me',
    })

    expect(result.current.isAgentTypingVisible).toBe(false)
  })
})
