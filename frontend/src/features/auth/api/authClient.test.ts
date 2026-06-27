import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  acceptCodeLoginLegal,
  confirmPasswordlessLoginCode,
  completePasswordSetup,
  getCurrentSession,
  getCurrentUser,
  requestPasswordlessLoginCode,
  requestPasswordSetup,
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

  it('calls passwordless code-login endpoints and returns authenticated session', async () => {
    const responses = [
      {
        accepted: true,
        email: 'name@company.ru',
        expiresInSeconds: 900,
        nextStep: 'verify_code',
        purpose: 'passwordless_login',
        resendAvailableInSeconds: 60,
        result: 'passwordless_login_requested',
      },
      {
        nextStep: 'chat',
        purpose: 'passwordless_login',
        result: 'passwordless_login_completed',
        session: {
          expiresAt: '2026-06-10T10:00:00.000Z',
        },
        user: {
          email: 'name@company.ru',
          fullName: 'Portal User',
          id: 7,
          passwordConfigured: false,
        },
      },
    ]
    const fetchMock = vi.fn(async () => jsonResponse(responses.shift()))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      requestPasswordlessLoginCode({ email: 'name@company.ru' }),
    ).resolves.toMatchObject({
      accepted: true,
      nextStep: 'verify_code',
      purpose: 'passwordless_login',
    })
    await expect(
      confirmPasswordlessLoginCode({
        code: '123456',
        email: 'name@company.ru',
      }),
    ).resolves.toMatchObject({
      nextStep: 'chat',
      user: {
        passwordConfigured: false,
      },
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/auth/code-login/request',
      expect.objectContaining({
        body: JSON.stringify({
          email: 'name@company.ru',
        }),
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/code-login/verify',
      expect.objectContaining({
        body: JSON.stringify({
          code: '123456',
          email: 'name@company.ru',
        }),
        credentials: 'include',
        method: 'POST',
      }),
    )
  })

  it('calls passwordless legal-accept endpoint and returns authenticated session', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        nextStep: 'chat',
        purpose: 'passwordless_login',
        result: 'passwordless_login_completed',
        session: {
          expiresAt: '2026-06-10T10:00:00.000Z',
        },
        user: {
          email: 'name@company.ru',
          fullName: 'Portal User',
          id: 7,
          passwordConfigured: false,
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      acceptCodeLoginLegal({
        continuationToken: 'legal-continuation-token',
        email: 'name@company.ru',
        personalDataConsentAccepted: true,
        termsAccepted: true,
      }),
    ).resolves.toMatchObject({
      nextStep: 'chat',
      user: {
        passwordConfigured: false,
      },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/code-login/accept-legal',
      expect.objectContaining({
        body: JSON.stringify({
          continuationToken: 'legal-continuation-token',
          email: 'name@company.ru',
          personalDataConsentAccepted: true,
          termsAccepted: true,
        }),
        credentials: 'include',
        method: 'POST',
      }),
    )
  })
})
