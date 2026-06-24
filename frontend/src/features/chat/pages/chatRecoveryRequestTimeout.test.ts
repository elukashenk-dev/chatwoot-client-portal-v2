import { afterEach, describe, expect, it, vi } from 'vitest'

import { withChatRecoveryRequestTimeout } from './chatRecoveryRequestTimeout'

function expectAbortSignal(signal: AbortSignal | null) {
  expect(signal).not.toBeNull()

  return signal as AbortSignal
}

describe('withChatRecoveryRequestTimeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('aborts a hanging recovery operation after the configured timeout', async () => {
    vi.useFakeTimers()

    let capturedSignal: AbortSignal | null = null
    const recovery = withChatRecoveryRequestTimeout(
      (signal) => {
        capturedSignal = signal

        return new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Request timed out.', 'AbortError')),
            { once: true },
          )
        })
      },
      1000,
    )
    const expectation = expect(recovery).rejects.toMatchObject({
      name: 'AbortError',
    })

    await vi.advanceTimersByTimeAsync(1000)

    await expectation
    expect(expectAbortSignal(capturedSignal).aborted).toBe(true)
  })

  it('cancels the timeout after a fast recovery operation succeeds', async () => {
    vi.useFakeTimers()

    let capturedSignal: AbortSignal | null = null
    const recovery = withChatRecoveryRequestTimeout(
      async (signal) => {
        capturedSignal = signal

        return 'ok'
      },
      1000,
    )

    await expect(recovery).resolves.toBe('ok')
    await vi.advanceTimersByTimeAsync(1000)

    expect(expectAbortSignal(capturedSignal).aborted).toBe(false)
  })
})
