import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AdminSessionProvider } from './AdminSessionProvider'
import { useAdminSession } from './adminSessionContext'

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

function createAdminSessionResponse() {
  return createJsonResponse({
    admin: {
      chatwootAgentId: 11,
      email: 'admin@example.test',
      role: 'administrator',
    },
    session: {
      expiresAt: '2026-06-07T00:00:00.000Z',
    },
  })
}

function Harness() {
  const {
    admin,
    errorMessage,
    refreshSession,
    setVerifiedSession,
    signOut,
    status,
  } = useAdminSession()

  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="admin-email">{admin?.email ?? 'none'}</div>
      <div data-testid="error">{errorMessage ?? 'none'}</div>
      <button onClick={() => void refreshSession()} type="button">
        refresh
      </button>
      <button
        onClick={() =>
          setVerifiedSession({
            admin: {
              chatwootAgentId: 12,
              email: 'verified@example.test',
              role: 'administrator',
            },
            session: {
              expiresAt: '2026-06-07T00:00:00.000Z',
            },
          })
        }
        type="button"
      >
        set verified
      </button>
      <button onClick={() => void signOut()} type="button">
        sign out
      </button>
    </div>
  )
}

function renderAdminSessionProvider() {
  render(
    <AdminSessionProvider>
      <Harness />
    </AdminSessionProvider>,
  )
}

describe('AdminSessionProvider', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('sets authenticated state when the current admin session exists', async () => {
    fetchMock.mockResolvedValueOnce(createAdminSessionResponse())

    renderAdminSessionProvider()

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    })

    expect(screen.getByTestId('admin-email')).toHaveTextContent(
      'admin@example.test',
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/auth/me',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
  })

  it('sets unauthenticated state for missing admin session', async () => {
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

    renderAdminSessionProvider()

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
    })
    expect(screen.getByTestId('admin-email')).toHaveTextContent('none')
  })

  it('sets error state and retries the session check', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(createAdminSessionResponse())

    renderAdminSessionProvider()

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('error')
    })
    expect(screen.getByTestId('error')).toHaveTextContent(
      'Мы не смогли выполнить запрос. Попробуйте еще раз чуть позже.',
    )

    await user.click(screen.getByRole('button', { name: 'refresh' }))

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sets a verified session without local browser storage', async () => {
    const user = userEvent.setup()
    const localStorageSetItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    const indexedDbOpenMock = vi.fn()

    vi.stubGlobal('indexedDB', {
      open: indexedDbOpenMock,
    })
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

    renderAdminSessionProvider()

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
    })

    await user.click(screen.getByRole('button', { name: 'set verified' }))

    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(screen.getByTestId('admin-email')).toHaveTextContent(
      'verified@example.test',
    )
    expect(localStorageSetItemSpy).not.toHaveBeenCalled()
    expect(indexedDbOpenMock).not.toHaveBeenCalled()
  })

  it('signs out through the admin endpoint and clears state', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAdminSessionResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    renderAdminSessionProvider()

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    })

    await user.click(screen.getByRole('button', { name: 'sign out' }))

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
    })
    expect(screen.getByTestId('admin-email')).toHaveTextContent('none')
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/admin/auth/logout',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    )
  })
})
