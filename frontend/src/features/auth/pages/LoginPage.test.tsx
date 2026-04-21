import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../../../app/AppRoutes'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { AuthSessionProvider } from '../lib/AuthSessionProvider'

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

function renderAuthRoutes(initialEntries: string[]) {
  renderWithRouter(
    <AuthSessionProvider>
      <AppRoutes />
    </AuthSessionProvider>,
    { initialEntries },
  )
}

describe('LoginPage', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('redirects to the login route and renders working auth links', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Требуется вход.',
          },
        },
        401,
      ),
    )

    renderAuthRoutes(['/'])

    expect(await screen.findByLabelText(/Email/)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Клиентский портал' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Забыли пароль?' })).toHaveAttribute(
      'href',
      '/auth/password-reset/request',
    )
    expect(screen.getByRole('link', { name: 'Новый аккаунт' })).toHaveAttribute(
      'href',
      '/auth/register',
    )
  })

  it('toggles password visibility, validates fields, and authenticates against backend auth routes', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            error: {
              code: 'UNAUTHORIZED',
              message: 'Требуется вход.',
            },
          },
          401,
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            user: {
              email: 'name@company.ru',
              fullName: 'Portal User',
              id: 7,
            },
          },
          200,
        ),
      )

    renderAuthRoutes(['/auth/login'])

    const emailInput = await screen.findByLabelText(/Email/)
    const passwordInput = screen.getByLabelText(/Пароль/)
    expect(passwordInput).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Показать пароль' }))
    expect(passwordInput).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(screen.getByText('Введите email')).toBeInTheDocument()
    expect(screen.getByText('Введите пароль')).toBeInTheDocument()

    fireEvent.change(emailInput, { target: { value: 'name@company.ru' } })
    fireEvent.change(passwordInput, { target: { value: 'Secret123' } })

    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))

    expect(screen.getByRole('button', { name: 'Вход...' })).toBeDisabled()
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/login',
      expect.objectContaining({
        body: JSON.stringify({
          email: 'name@company.ru',
          password: 'Secret123',
        }),
        credentials: 'include',
        method: 'POST',
      }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Клиентский чат' }),
    ).toBeInTheDocument()
    expect(screen.getByText('name@company.ru')).toBeInTheDocument()
    expect(screen.getByText('Чат пока готовится')).toBeInTheDocument()
  })

  it('loads existing session into the app shell and returns to login after logout', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            user: {
              email: 'name@company.ru',
              fullName: 'Portal User',
              id: 7,
            },
          },
          200,
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    renderAuthRoutes(['/auth/login'])

    expect(
      await screen.findByRole('heading', { name: 'Клиентский чат' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Выйти' }))

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/logout',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(await screen.findByLabelText(/Email/)).toBeInTheDocument()
  })

  it('redirects an unauthorized protected route visit back to login', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Требуется вход.',
          },
        },
        401,
      ),
    )

    renderAuthRoutes(['/app/chat'])

    expect(
      await screen.findByRole('heading', { name: 'Клиентский портал' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Клиентский чат')).not.toBeInTheDocument()
  })

  it.each([
    ['/auth/register', 'Новый аккаунт'],
    ['/auth/password-reset/request', 'Восстановление пароля'],
  ])(
    'redirects authenticated public auth route %s to the app shell',
    async (initialEntry, publicPageHeading) => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse(
          {
            user: {
              email: 'name@company.ru',
              fullName: 'Portal User',
              id: 7,
            },
          },
          200,
        ),
      )

      renderAuthRoutes([initialEntry])

      expect(
        await screen.findByRole('heading', { name: 'Клиентский чат' }),
      ).toBeInTheDocument()
      expect(screen.getByText('name@company.ru')).toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: publicPageHeading }),
      ).not.toBeInTheDocument()
    },
  )

  it('shows a retryable protected-session error when bootstrap cannot reach the backend', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network failed'))

    renderAuthRoutes(['/app/chat'])

    expect(
      await screen.findByRole('heading', {
        name: 'Сессию не удалось проверить',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeEnabled()
  })
})
