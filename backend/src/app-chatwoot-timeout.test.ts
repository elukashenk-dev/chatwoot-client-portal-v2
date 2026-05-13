import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRuntimeChatwootClientFactory } from './app.js'

describe('runtime Chatwoot timeout config', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses configured Chatwoot request timeout for runtime clients', async () => {
    vi.useFakeTimers()

    const fetchFn = vi.fn<typeof fetch>((_url, options) => {
      const signal = options?.signal

      return new Promise<Response>((_resolve, reject) => {
        if (signal instanceof AbortSignal) {
          signal.addEventListener(
            'abort',
            () => reject(signal.reason ?? new Error('Request aborted.')),
            { once: true },
          )
        }
      })
    })
    const factory = createRuntimeChatwootClientFactory({
      chatwootFetchFn: fetchFn,
      env: {
        CHATWOOT_REQUEST_TIMEOUT_MS: 5,
      },
    })

    const lookup = factory
      .forTenant({
        accountId: 3,
        apiAccessToken: 'tenant-token',
        baseUrl: 'https://chatwoot.example.test',
        portalInboxId: 7,
      })
      .findContactByEmail('name@company.ru')
    const lookupExpectation = expect(lookup).rejects.toMatchObject({
      message: 'Chatwoot contact search is unavailable.',
      name: 'ChatwootClientRequestError',
    })

    await vi.advanceTimersByTimeAsync(5)
    await lookupExpectation

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0]?.[1]?.signal).toMatchObject({
      aborted: true,
    })
  })
})
