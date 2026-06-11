import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useChatTypingSync } from './useChatTypingSync'

type SetTypingInput = {
  threadId: string
  typingStatus: 'off' | 'on'
}

type TypingSyncOptions = {
  canUseBackend: boolean
  selectedThreadId: string | null
  setTyping: (input: SetTypingInput) => Promise<void>
}

function renderTypingSync(overrides: Partial<TypingSyncOptions> = {}) {
  const setTyping = vi
    .fn<TypingSyncOptions['setTyping']>()
    .mockResolvedValue(undefined)
  const initialProps = {
    canUseBackend: true,
    selectedThreadId: 'private:me',
    setTyping,
    ...overrides,
  }
  const hook = renderHook(
    (props: TypingSyncOptions) => useChatTypingSync(props),
    {
      initialProps,
    },
  )

  return {
    setTyping,
    ...hook,
  }
}

describe('useChatTypingSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-04T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends typing on for a non-empty draft and typing off after idle', () => {
    const { result, setTyping } = renderTypingSync()

    act(() => {
      result.current.handleDraftChanged('Привет')
    })

    expect(setTyping).toHaveBeenCalledWith({
      threadId: 'private:me',
      typingStatus: 'on',
    })

    act(() => {
      vi.advanceTimersByTime(2_500)
    })

    expect(setTyping).toHaveBeenLastCalledWith({
      threadId: 'private:me',
      typingStatus: 'off',
    })
  })

  it('throttles repeated typing on and reschedules typing off', () => {
    const { result, setTyping } = renderTypingSync()

    act(() => {
      result.current.handleDraftChanged('П')
      vi.advanceTimersByTime(1_000)
      result.current.handleDraftChanged('Пр')
    })

    expect(setTyping).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(2_499)
    })

    expect(setTyping).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(setTyping).toHaveBeenCalledTimes(2)
    expect(setTyping).toHaveBeenLastCalledWith({
      threadId: 'private:me',
      typingStatus: 'off',
    })
  })

  it('sends typing on again after the resend window', () => {
    const { result, setTyping } = renderTypingSync()

    act(() => {
      result.current.handleDraftChanged('Привет')
      vi.advanceTimersByTime(2_000)
      result.current.handleDraftChanged('Привет еще')
      vi.advanceTimersByTime(1_000)
      result.current.handleDraftChanged('Привет еще раз')
    })

    expect(setTyping).toHaveBeenCalledTimes(2)
    expect(setTyping).toHaveBeenLastCalledWith({
      threadId: 'private:me',
      typingStatus: 'on',
    })
  })

  it('sends typing off when the draft clears', () => {
    const { result, setTyping } = renderTypingSync()

    act(() => {
      result.current.handleDraftChanged('Привет')
      result.current.handleDraftChanged('   ')
    })

    expect(setTyping).toHaveBeenLastCalledWith({
      threadId: 'private:me',
      typingStatus: 'off',
    })
  })

  it('does not call the backend when unavailable or without a selected thread', () => {
    const offline = renderTypingSync({ canUseBackend: false })
    const missingThread = renderTypingSync({ selectedThreadId: null })

    act(() => {
      offline.result.current.handleDraftChanged('Привет')
      missingThread.result.current.handleDraftChanged('Привет')
    })

    expect(offline.setTyping).not.toHaveBeenCalled()
    expect(missingThread.setTyping).not.toHaveBeenCalled()
  })

  it('sends typing off for the previous thread when the selected thread changes', () => {
    const { rerender, result, setTyping } = renderTypingSync()

    act(() => {
      result.current.handleDraftChanged('Привет')
    })

    rerender({
      canUseBackend: true,
      selectedThreadId: 'group:154',
      setTyping,
    })

    expect(setTyping).toHaveBeenLastCalledWith({
      threadId: 'private:me',
      typingStatus: 'off',
    })
  })

  it('swallows typing sync failures', async () => {
    const setTyping = vi
      .fn<TypingSyncOptions['setTyping']>()
      .mockRejectedValue(new Error('network'))
    const { result } = renderTypingSync({ setTyping })

    await act(async () => {
      result.current.handleDraftChanged('Привет')
      await Promise.resolve()
    })

    expect(setTyping).toHaveBeenCalledTimes(1)
  })
})
