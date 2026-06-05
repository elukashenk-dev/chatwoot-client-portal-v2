import { afterEach, describe, expect, it, vi } from 'vitest'

import { getCurrentUserProfile, updateProfileAvatar } from './profileClient'

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

describe('profile API client', () => {
  it('loads the current user profile with the abort signal', async () => {
    const signal = new AbortController().signal
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        avatarUrl: '/api/profile/avatar',
        email: 'ivan@example.com',
        fullName: 'Иван Петров',
        phoneNumber: '+79991234567',
        result: 'ready',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getCurrentUserProfile({ signal })).resolves.toMatchObject({
      avatarUrl: '/api/profile/avatar',
      email: 'ivan@example.com',
      fullName: 'Иван Петров',
      phoneNumber: '+79991234567',
      result: 'ready',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/profile',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
        signal,
      }),
    )
  })

  it('uploads the avatar as multipart form data without exposing Chatwoot', async () => {
    const imageFile = new File(['avatar'], 'avatar.png', {
      type: 'image/png',
    })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        avatarUrl: '/api/profile/avatar',
        result: 'updated',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(updateProfileAvatar(imageFile)).resolves.toEqual({
      avatarUrl: '/api/profile/avatar',
      result: 'updated',
    })

    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/profile/avatar',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(init?.headers).toBeUndefined()
    expect(init?.body).toBeInstanceOf(FormData)
    expect((init?.body as FormData).get('avatar')).toBe(imageFile)
  })
})
