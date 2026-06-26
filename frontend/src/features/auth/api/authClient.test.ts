import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  completePasswordSetup,
  completeRegistrationSetPassword,
  getCurrentSession,
  getCurrentUser,
  requestPasswordSetup,
  skipRegistrationPassword,
  verifyPasswordSetupCode,
} from './authClient'

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
          passwordConfigured: true,
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
        passwordConfigured: true,
      },
    })
    fetchMock.mockClear()

    await expect(getCurrentUser({ signal })).resolves.toMatchObject({
      id: 7,
      passwordConfigured: true,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        credentials: 'include',
        headers: {
          'X-Portal-Session-Check': '1',
        },
        method: 'GET',
        signal,
      }),
    )
  })

  it('uses authenticated registration completion contracts', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        nextStep: 'chat',
        purpose: 'registration',
        result: 'registration_completed',
        session: {
          expiresAt: '2026-06-10T10:00:00.000Z',
        },
        user: {
          email: 'name@company.ru',
          fullName: 'Portal User',
          id: 7,
          passwordConfigured: true,
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      completeRegistrationSetPassword({
        continuationToken: 'registration-continuation-token',
        email: 'name@company.ru',
        newPassword: 'PortalPass123',
      }),
    ).resolves.toMatchObject({
      nextStep: 'chat',
      session: {
        expiresAt: '2026-06-10T10:00:00.000Z',
      },
      user: {
        passwordConfigured: true,
      },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/register/set-password',
      expect.objectContaining({
        body: JSON.stringify({
          continuationToken: 'registration-continuation-token',
          email: 'name@company.ru',
          newPassword: 'PortalPass123',
        }),
        credentials: 'include',
        method: 'POST',
      }),
    )
  })

  it('calls registration skip-password endpoint', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        nextStep: 'chat',
        purpose: 'registration',
        result: 'registration_completed',
        session: {
          expiresAt: '2026-06-10T10:00:00.000Z',
        },
        user: {
          email: 'skip@company.ru',
          fullName: 'Skip User',
          id: 8,
          passwordConfigured: false,
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      skipRegistrationPassword({
        continuationToken: 'registration-skip-token',
        email: 'skip@company.ru',
      }),
    ).resolves.toMatchObject({
      nextStep: 'chat',
      user: {
        passwordConfigured: false,
      },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/register/skip-password',
      expect.objectContaining({
        body: JSON.stringify({
          continuationToken: 'registration-skip-token',
          email: 'skip@company.ru',
        }),
        credentials: 'include',
        method: 'POST',
      }),
    )
  })

  it('calls protected password setup endpoints without email or user id', async () => {
    const responses = [
      {
        email: 'name@company.ru',
        expiresInSeconds: 900,
        nextStep: 'verify_code',
        purpose: 'password_setup',
        resendAvailableInSeconds: 60,
        result: 'password_setup_requested',
      },
      {
        continuationExpiresInSeconds: 900,
        continuationToken: 'password-setup-continuation-token',
        email: 'name@company.ru',
        nextStep: 'set_password',
        purpose: 'password_setup',
        result: 'password_setup_verified',
      },
      {
        nextStep: 'chat',
        purpose: 'password_setup',
        result: 'password_setup_completed',
        session: {
          expiresAt: '2026-06-10T10:00:00.000Z',
        },
        user: {
          email: 'name@company.ru',
          fullName: 'Portal User',
          id: 7,
          passwordConfigured: true,
        },
      },
    ]
    const fetchMock = vi.fn(async () => jsonResponse(responses.shift()))
    vi.stubGlobal('fetch', fetchMock)

    await requestPasswordSetup()
    await verifyPasswordSetupCode({ code: '123456' })
    await completePasswordSetup({
      continuationToken: 'password-setup-continuation-token',
      newPassword: 'PortalPass123',
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/auth/password-setup/request',
      expect.objectContaining({
        body: JSON.stringify({}),
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/password-setup/verify',
      expect.objectContaining({
        body: JSON.stringify({
          code: '123456',
        }),
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/auth/password-setup/set',
      expect.objectContaining({
        body: JSON.stringify({
          continuationToken: 'password-setup-continuation-token',
          newPassword: 'PortalPass123',
        }),
        credentials: 'include',
        method: 'POST',
      }),
    )
  })
})
