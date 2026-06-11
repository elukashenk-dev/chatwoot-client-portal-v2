import { describe, expect, it, vi } from 'vitest'

import { ChatwootClientRequestError } from './errors.js'
import { createChatwootFetch, requestChatwootWithoutBody } from './request.js'

describe('requestChatwootWithoutBody', () => {
  it('accepts an empty successful Chatwoot response without parsing JSON', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    )
    const fetchChatwoot = createChatwootFetch({
      fetchFn,
      requestTimeoutMs: 15_000,
    })

    await expect(
      requestChatwootWithoutBody({
        apiAccessToken: 'platform-token-secret',
        fetchChatwoot,
        method: 'DELETE',
        requestUrl: new URL(
          'https://chatwoot.example.com/platform/api/v1/accounts/101',
        ),
        unavailableMessage: 'Chatwoot Platform account deletion failed.',
      }),
    ).resolves.toBeUndefined()

    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe('DELETE')
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      Accept: 'application/json',
      api_access_token: 'platform-token-secret',
    })
  })

  it('throws a controlled error for non-2xx responses without exposing upstream body secrets', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: 'user-access-token-secret',
            error: 'Invalid platform-token-secret',
          }),
          {
            headers: {
              'Content-Type': 'application/json',
            },
            status: 401,
          },
        ),
      ),
    )
    const fetchChatwoot = createChatwootFetch({
      fetchFn,
      requestTimeoutMs: 15_000,
    })

    const error = await requestChatwootWithoutBody({
      apiAccessToken: 'platform-token-secret',
      fetchChatwoot,
      method: 'DELETE',
      requestUrl: new URL(
        'https://chatwoot.example.com/platform/api/v1/accounts/101',
      ),
      unavailableMessage: 'Chatwoot Platform account deletion failed.',
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ChatwootClientRequestError)
    expect(String(error)).not.toContain('platform-token-secret')
    expect(String(error)).not.toContain('user-access-token-secret')
  })
})
