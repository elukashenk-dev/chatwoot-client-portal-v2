import { act, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Navigate, Route, Routes, type InitialEntry } from 'react-router-dom'

import { renderWithRouter } from '../../../test/renderWithRouter'
import {
  AdminSessionContext,
  type AdminSessionContextValue,
} from '../lib/adminSessionContext'
import { AdminLoginPage } from './AdminLoginPage'

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

function createAdminLoginRequestResponse({
  delivery = 'sent',
  resendAvailableInSeconds = 60,
}: {
  delivery?: 'sent' | 'existing_pending'
  resendAvailableInSeconds?: number
} = {}) {
  return createJsonResponse({
    delivery,
    email: 'admin@example.test',
    expiresInSeconds: 900,
    nextStep: 'verify_code',
    purpose: 'tenant_admin_login',
    resendAvailableInSeconds,
    result: 'admin_login_challenge_requested',
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

function renderAdminLoginRoute({
  initialEntries = ['/admin/login'],
}: {
  initialEntries?: InitialEntry[]
} = {}) {
  const adminSession = {
    admin: null,
    errorMessage: null,
    refreshSession: vi.fn(),
    setVerifiedSession: vi.fn(),
    signOut: vi.fn(),
    status: 'unauthenticated',
  } satisfies AdminSessionContextValue

  renderWithRouter(
    <AdminSessionContext.Provider value={adminSession}>
      <Routes>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/branding" element={<h1>Брендинг</h1>} />
        <Route path="/admin/unknown" element={<Navigate replace to="/" />} />
      </Routes>
    </AdminSessionContext.Provider>,
    { initialEntries },
  )

  return adminSession
}

async function fillOtpCode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText('Код из письма'))
  await user.keyboard('123456')
}

describe('AdminLoginPage', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('requests a login code and verifies it into the admin console', async () => {
    const user = userEvent.setup()
    const adminSession = renderAdminLoginRoute()

    fetchMock
      .mockResolvedValueOnce(createAdminLoginRequestResponse())
      .mockResolvedValueOnce(createAdminSessionResponse())

    expect(
      screen.getByRole('heading', { name: 'Вход в админ-консоль' }),
    ).toBeInTheDocument()
    expect(document.body.querySelector('.auth-stack')).toBeInTheDocument()
    expect(
      document.body.querySelector('.auth-subtitle--login'),
    ).not.toBeInTheDocument()
    expect(
      document.body.querySelector('.auth-header-shell'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Мы отправим 6-значный код на email администратора поддержки.',
      ),
    ).toBeInTheDocument()

    await user.type(
      screen.getByLabelText('Email администратора'),
      'admin@example.test',
    )
    await user.click(screen.getByRole('button', { name: 'Получить код' }))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/auth/request',
      expect.objectContaining({
        body: JSON.stringify({ email: 'admin@example.test' }),
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(
      await screen.findByRole('heading', { name: 'Подтвердите вход' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Код отправлен на admin@example.test.'),
    ).toBeInTheDocument()

    await fillOtpCode(user)
    await user.click(
      screen.getByRole('button', { name: 'Войти в админ-консоль' }),
    )

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
    expect(adminSession.setVerifiedSession).toHaveBeenCalled()
    expect(
      await screen.findByRole('heading', { name: 'Брендинг' }),
    ).toBeInTheDocument()
  })

  it('enables resend after the backend cooldown and requests another code', async () => {
    vi.useFakeTimers()

    fetchMock
      .mockResolvedValueOnce(
        createAdminLoginRequestResponse({ resendAvailableInSeconds: 60 }),
      )
      .mockResolvedValueOnce(
        createAdminLoginRequestResponse({ resendAvailableInSeconds: 30 }),
      )

    renderAdminLoginRoute()

    fireEvent.change(screen.getByLabelText('Email администратора'), {
      target: { value: 'admin@example.test' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Получить код' }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(
      screen.getByRole('button', { name: /Повторить через/ }),
    ).toBeDisabled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(
      screen.getByRole('button', { name: 'Отправить код повторно' }),
    ).toBeEnabled()

    fireEvent.click(
      screen.getByRole('button', { name: 'Отправить код повторно' }),
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/admin/auth/request',
      expect.objectContaining({
        body: JSON.stringify({ email: 'admin@example.test' }),
        credentials: 'include',
        method: 'POST',
      }),
    )
  })

  it('uses existing pending copy as the code step', async () => {
    const user = userEvent.setup()

    fetchMock.mockResolvedValueOnce(
      createAdminLoginRequestResponse({ delivery: 'existing_pending' }),
    )

    renderAdminLoginRoute()

    await user.type(
      screen.getByLabelText('Email администратора'),
      'admin@example.test',
    )
    await user.click(screen.getByRole('button', { name: 'Получить код' }))

    expect(
      await screen.findByRole('heading', { name: 'Подтвердите вход' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Код уже отправлен. Проверьте почту или дождитесь повторной отправки.',
      ),
    ).toBeInTheDocument()
  })

  it('returns from the code step to the email step without leaving admin login', async () => {
    const user = userEvent.setup()

    fetchMock.mockResolvedValueOnce(
      createAdminLoginRequestResponse({ resendAvailableInSeconds: 0 }),
    )

    renderAdminLoginRoute()

    await user.type(
      screen.getByLabelText('Email администратора'),
      'admin@example.test',
    )
    await user.click(screen.getByRole('button', { name: 'Получить код' }))

    expect(
      await screen.findByRole('heading', { name: 'Подтвердите вход' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Изменить email' }))

    expect(
      screen.getByRole('heading', { name: 'Вход в админ-консоль' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Брендинг' }),
    ).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Email администратора')).toHaveValue(
      'admin@example.test',
    )
  })

  it('sanitizes unknown admin return paths to branding after verification', async () => {
    const user = userEvent.setup()
    const adminSession = renderAdminLoginRoute({
      initialEntries: [
        {
          pathname: '/admin/login',
          state: {
            from: {
              pathname: '/admin/unknown',
            },
          },
        },
      ],
    })

    fetchMock
      .mockResolvedValueOnce(createAdminLoginRequestResponse())
      .mockResolvedValueOnce(createAdminSessionResponse())

    await user.type(
      screen.getByLabelText('Email администратора'),
      'admin@example.test',
    )
    await user.click(screen.getByRole('button', { name: 'Получить код' }))
    await screen.findByRole('heading', { name: 'Подтвердите вход' })
    await fillOtpCode(user)
    await user.click(
      screen.getByRole('button', { name: 'Войти в админ-консоль' }),
    )

    expect(adminSession.setVerifiedSession).toHaveBeenCalled()
    expect(
      await screen.findByRole('heading', { name: 'Брендинг' }),
    ).toBeInTheDocument()
  })

  it('keeps the email step for delivery-in-progress errors', async () => {
    const user = userEvent.setup()

    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'TENANT_ADMIN_DELIVERY_IN_PROGRESS',
            message:
              'Код уже отправляется. Подождите немного и повторите попытку.',
          },
        },
        429,
      ),
    )

    renderAdminLoginRoute()

    await user.type(
      screen.getByLabelText('Email администратора'),
      'admin@example.test',
    )
    await user.click(screen.getByRole('button', { name: 'Получить код' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Код уже отправляется. Подождите немного и повторите попытку.',
    )
    expect(
      screen.getByRole('heading', { name: 'Вход в админ-консоль' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Подтвердите вход' }),
    ).not.toBeInTheDocument()
  })
})
