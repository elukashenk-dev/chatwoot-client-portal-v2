import { afterEach, describe, expect, it, vi } from 'vitest'

import { getCurrentUser } from './authClient'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
    },
    status,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('auth API client', () => {
  it('passes abort signals to current user startup request', async () => {
    const signal = new AbortController().signal
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        user: {
          email: 'name@company.ru',
          fullName: 'Portal User',
          id: 7,
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getCurrentUser({ signal })).resolves.toMatchObject({
      id: 7,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
        signal,
      }),
    )
  })
})
