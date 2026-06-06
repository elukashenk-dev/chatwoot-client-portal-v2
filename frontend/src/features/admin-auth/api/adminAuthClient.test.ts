import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AdminApiClientError,
  getCurrentAdminSession,
  logoutAdmin,
  requestAdminLoginCode,
  verifyAdminLoginCode,
} from './adminAuthClient'

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

describe('adminAuthClient', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('requests an admin login code with credentials', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        delivery: 'sent',
        email: 'admin@example.test',
        expiresInSeconds: 900,
        nextStep: 'verify_code',
        purpose: 'tenant_admin_login',
        resendAvailableInSeconds: 60,
        result: 'admin_login_challenge_requested',
      }),
    )

    const response = await requestAdminLoginCode({
      email: 'Admin@Example.Test',
    })

    expect(response.email).toBe('admin@example.test')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/auth/request',
      expect.objectContaining({
        body: JSON.stringify({ email: 'Admin@Example.Test' }),
        credentials: 'include',
        method: 'POST',
      }),
    )
  })

  it('verifies an admin code and returns admin session', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        admin: {
          chatwootAgentId: 11,
          email: 'admin@example.test',
          role: 'administrator',
        },
        session: {
          expiresAt: '2026-06-07T00:00:00.000Z',
        },
      }),
    )

    const response = await verifyAdminLoginCode({
      code: '123456',
      email: 'admin@example.test',
    })

    expect(response.admin.email).toBe('admin@example.test')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/auth/verify',
      expect.objectContaining({
        body: JSON.stringify({
          code: '123456',
          email: 'admin@example.test',
        }),
        credentials: 'include',
        method: 'POST',
      }),
    )
  })

  it('returns null for missing admin session', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'TENANT_ADMIN_UNAUTHORIZED',
            message: 'Требуется вход администратора.',
          },
        },
        401,
      ),
    )

    await expect(getCurrentAdminSession()).resolves.toBeNull()
  })

  it('logs out through admin logout endpoint', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await logoutAdmin()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/auth/logout',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    )
  })

  it('throws backend controlled messages for errors', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'TENANT_ADMIN_NOT_ELIGIBLE',
            message: 'Нет прав администратора для этого портала.',
          },
        },
        403,
      ),
    )

    await expect(
      requestAdminLoginCode({ email: 'agent@example.test' }),
    ).rejects.toMatchObject({
      code: 'TENANT_ADMIN_NOT_ELIGIBLE',
      message: 'Нет прав администратора для этого портала.',
      statusCode: 403,
    } satisfies Partial<AdminApiClientError>)
  })
})
