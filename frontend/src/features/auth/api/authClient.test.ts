import { afterEach, describe, expect, it, vi } from 'vitest'

import { getCurrentSession, getCurrentUser } from './authClient'

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
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        session: {
          expiresAt: '2026-06-10T10:00:00.000Z',
        },
        user: {
          email: 'name@company.ru',
          fullName: 'Portal User',
          id: 7,
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getCurrentSession({ signal })).resolves.toMatchObject({
      session: {
        expiresAt: '2026-06-10T10:00:00.000Z',
      },
      user: {
        id: 7,
      },
    })
    fetchMock.mockClear()

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
