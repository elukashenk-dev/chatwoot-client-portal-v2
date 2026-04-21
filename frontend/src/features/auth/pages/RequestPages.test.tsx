import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../../../app/AppRoutes'
import {
  clearRegistrationFlow,
  saveRegistrationRequest,
  saveRegistrationVerification,
} from '../lib/registrationFlow'
import {
  clearPasswordResetFlow,
  savePasswordResetRequest,
  savePasswordResetVerification,
} from '../lib/passwordResetFlow'
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

function createUnauthorizedSessionResponse() {
  return createJsonResponse(
    {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Требуется вход.',
      },
    },
    401,
  )
}

function renderAuthRoutes(initialEntries: string[]) {
  renderWithRouter(
    <AuthSessionProvider>
      <AppRoutes />
    </AuthSessionProvider>,
    { initialEntries },
  )
}

describe('Auth flow pages', () => {
  const fetchMock = vi.fn<typeof fetch>()

  function mockUnauthenticatedSession() {
    fetchMock.mockResolvedValueOnce(createUnauthorizedSessionResponse())
  }

  function getJsonBodyForCall(path: string) {
    const call = fetchMock.mock.calls.find(([url]) => url === path)

    expect(call).toBeDefined()

    return JSON.parse(call?.[1]?.body as string) as unknown
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    clearRegistrationFlow()
    clearPasswordResetFlow()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('renders the registration request page and validates required fields', async () => {
    const user = userEvent.setup()

    mockUnauthenticatedSession()
    renderAuthRoutes(['/auth/register'])

    expect(
      await screen.findByRole('heading', { name: 'Новый аккаунт' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/Имя и фамилия/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    expect(screen.getByText('Введите имя')).toBeInTheDocument()
    expect(screen.getByText('Введите email')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Вернуться ко входу' }),
    ).toHaveAttribute('href', '/auth/login')
  })

  it('submits the registration request page against the backend and navigates to verify', async () => {
    const user = userEvent.setup()

    mockUnauthenticatedSession()
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          delivery: 'sent',
          email: 'name@company.ru',
          expiresInSeconds: 900,
          nextStep: 'verify_code',
          purpose: 'registration',
          resendAvailableInSeconds: 60,
          result: 'verification_requested',
        },
        200,
      ),
    )

    renderAuthRoutes(['/auth/register'])

    await user.type(await screen.findByLabelText(/Имя и фамилия/), 'Portal User')
    await user.type(screen.getByLabelText(/Email/), 'name@company.ru')
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/register/request',
      expect.objectContaining({
        body: expect.any(String),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    )
    expect(getJsonBodyForCall('/api/auth/register/request')).toEqual({
      email: 'name@company.ru',
      fullName: 'Portal User',
    })

    expect(
      await screen.findByRole('heading', { name: 'Подтверждение Email' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Мы отправили 6-значный код на/),
    ).toBeInTheDocument()
    expect(screen.getByText('name@company.ru')).toBeInTheDocument()
  })

  it('guards the registration verify page when the request step was skipped', async () => {
    mockUnauthenticatedSession()
    renderAuthRoutes(['/auth/register/verify'])

    expect(
      await screen.findByText(
        'Сначала начните регистрацию и запросите код подтверждения.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Перейти к регистрации' }),
    ).toHaveAttribute('href', '/auth/register')
  })

  it('submits the verification code and opens the set-password step route', async () => {
    const user = userEvent.setup()

    saveRegistrationRequest({
      email: 'name@company.ru',
      expiresInSeconds: 900,
      fullName: 'Portal User',
      resendAvailableInSeconds: 60,
    })

    mockUnauthenticatedSession()
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          continuationToken: 'continuation-token',
          continuationExpiresInSeconds: 900,
          email: 'name@company.ru',
          nextStep: 'set_password',
          purpose: 'registration',
          result: 'verification_confirmed',
        },
        200,
      ),
    )

    renderAuthRoutes(['/auth/register/verify'])

    const submitButton = await screen.findByRole('button', { name: 'Продолжить' })

    expect(submitButton).toBeDisabled()
    expect(
      screen.getByRole('link', { name: 'Изменить email' }),
    ).toHaveAttribute('href', '/auth/register')

    await user.click(screen.getByLabelText('Код из письма'))
    await user.keyboard('123456')

    expect(submitButton).toBeEnabled()

    await user.click(submitButton)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/register/verify',
      expect.objectContaining({
        body: JSON.stringify({
          code: '123456',
          email: 'name@company.ru',
        }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Создание пароля' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Требования к паролю/)).toBeInTheDocument()
  })

  it('uses existing-pending copy when registration resend did not send a new email', async () => {
    const user = userEvent.setup()

    saveRegistrationRequest({
      email: 'name@company.ru',
      expiresInSeconds: 900,
      fullName: 'Portal User',
      resendAvailableInSeconds: 0,
    })

    mockUnauthenticatedSession()
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          delivery: 'existing_pending',
          email: 'name@company.ru',
          expiresInSeconds: 840,
          nextStep: 'verify_code',
          purpose: 'registration',
          resendAvailableInSeconds: 30,
          result: 'verification_requested',
        },
        200,
      ),
    )

    renderAuthRoutes(['/auth/register/verify'])

    await user.click(
      await screen.findByRole('button', { name: 'Отправить код повторно' }),
    )

    expect(
      await screen.findByText(
        'Используйте ранее отправленный код. Новый код можно будет запросить после таймера.',
      ),
    ).toBeInTheDocument()
  })

  it('completes registration set-password and shows success feedback', async () => {
    const user = userEvent.setup()

    saveRegistrationRequest({
      email: 'name@company.ru',
      expiresInSeconds: 900,
      fullName: 'Portal User',
      resendAvailableInSeconds: 60,
    })
    saveRegistrationVerification({
      continuationToken: 'continuation-token',
      continuationExpiresInSeconds: 900,
      email: 'name@company.ru',
    })

    mockUnauthenticatedSession()
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          email: 'name@company.ru',
          nextStep: 'login',
          purpose: 'registration',
          result: 'registration_completed',
        },
        200,
      ),
    )

    renderAuthRoutes(['/auth/register/set-password'])

    await user.type(await screen.findByLabelText(/Новый пароль/), 'PortalPass123')
    await user.type(
      screen.getByLabelText(/Подтвердите пароль/),
      'PortalPass123',
    )
    await user.click(screen.getByRole('button', { name: 'Сохранить пароль' }))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/register/set-password',
      expect.objectContaining({
        body: JSON.stringify({
          continuationToken: 'continuation-token',
          email: 'name@company.ru',
          newPassword: 'PortalPass123',
        }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    )

    expect(
      await screen.findByText(/Пароль сохранен для name@company.ru/),
    ).toBeInTheDocument()
  })

  it('keeps registration set-password disabled for a space-padded short password', async () => {
    const user = userEvent.setup()

    saveRegistrationRequest({
      email: 'name@company.ru',
      expiresInSeconds: 900,
      fullName: 'Portal User',
      resendAvailableInSeconds: 60,
    })
    saveRegistrationVerification({
      continuationToken: 'continuation-token',
      continuationExpiresInSeconds: 900,
      email: 'name@company.ru',
    })

    mockUnauthenticatedSession()
    renderAuthRoutes(['/auth/register/set-password'])

    await user.type(await screen.findByLabelText(/Новый пароль/), ' Pass12 ')
    await user.type(screen.getByLabelText(/Подтвердите пароль/), ' Pass12 ')

    expect(
      screen.getByRole('button', { name: 'Сохранить пароль' }),
    ).toBeDisabled()
    expect(
      fetchMock.mock.calls.some(
        ([url]) => url === '/api/auth/register/set-password',
      ),
    ).toBe(false)
  })

  it('clears expired registration request state before verify step render', async () => {
    mockUnauthenticatedSession()
    window.sessionStorage.setItem(
      'portal.registration-flow',
      JSON.stringify({
        request: {
          email: 'name@company.ru',
          expiresInSeconds: 1,
          fullName: 'Portal User',
          requestedAt: Date.now() - 2000,
          resendAvailableInSeconds: 0,
        },
        verification: null,
      }),
    )

    renderAuthRoutes(['/auth/register/verify'])

    expect(
      await screen.findByText(
        'Сначала начните регистрацию и запросите код подтверждения.',
      ),
    ).toBeInTheDocument()
    expect(window.sessionStorage.getItem('portal.registration-flow')).toBeNull()
  })

  it('clears expired registration verification state before set-password step render', async () => {
    mockUnauthenticatedSession()
    window.sessionStorage.setItem(
      'portal.registration-flow',
      JSON.stringify({
        request: {
          email: 'name@company.ru',
          expiresInSeconds: 900,
          fullName: 'Portal User',
          requestedAt: Date.now(),
          resendAvailableInSeconds: 0,
        },
        verification: {
          continuationExpiresInSeconds: 1,
          continuationToken: 'continuation-token',
          email: 'name@company.ru',
          verifiedAt: Date.now() - 2000,
        },
      }),
    )

    renderAuthRoutes(['/auth/register/set-password'])

    expect(
      await screen.findByText(
        'Сначала подтвердите email, чтобы открыть шаг установки пароля.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Вернуться к подтверждению' }),
    ).toHaveAttribute('href', '/auth/register/verify')
  })

  it('submits the password reset request page and navigates to verify', async () => {
    const user = userEvent.setup()

    mockUnauthenticatedSession()
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          accepted: true,
          email: 'name@company.ru',
          expiresInSeconds: 900,
          nextStep: 'verify_code',
          purpose: 'password_reset',
          resendAvailableInSeconds: 60,
          result: 'password_reset_requested',
        },
        200,
      ),
    )

    renderAuthRoutes(['/auth/password-reset/request'])

    await user.type(await screen.findByLabelText(/Email/), 'name@company.ru')
    await user.click(screen.getByRole('button', { name: 'Получить код' }))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/password-reset/request',
      expect.objectContaining({
        body: JSON.stringify({
          email: 'name@company.ru',
        }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Подтверждение Email' }),
    ).toBeInTheDocument()
    expect(screen.getByText('name@company.ru')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Изменить email' }),
    ).toHaveAttribute('href', '/auth/password-reset/request')
  })

  it('guards password reset verify when the request step was skipped', async () => {
    mockUnauthenticatedSession()
    renderAuthRoutes(['/auth/password-reset/verify'])

    expect(
      await screen.findByText('Сначала запросите код восстановления пароля.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Перейти к восстановлению' }),
    ).toHaveAttribute('href', '/auth/password-reset/request')
  })

  it('clears expired password reset request state before verify step render', async () => {
    mockUnauthenticatedSession()
    window.sessionStorage.setItem(
      'portal.password-reset-flow',
      JSON.stringify({
        request: {
          email: 'name@company.ru',
          expiresInSeconds: 1,
          requestedAt: Date.now() - 2000,
          resendAvailableInSeconds: 0,
        },
        verification: null,
      }),
    )

    renderAuthRoutes(['/auth/password-reset/verify'])

    expect(
      await screen.findByText('Сначала запросите код восстановления пароля.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Перейти к восстановлению' }),
    ).toHaveAttribute('href', '/auth/password-reset/request')
    expect(window.sessionStorage.getItem('portal.password-reset-flow')).toBeNull()
  })

  it('submits the password reset code and opens the set-password step route', async () => {
    const user = userEvent.setup()

    savePasswordResetRequest({
      email: 'name@company.ru',
      expiresInSeconds: 900,
      resendAvailableInSeconds: 60,
    })

    mockUnauthenticatedSession()
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          continuationToken: 'reset-continuation-token',
          continuationExpiresInSeconds: 900,
          email: 'name@company.ru',
          nextStep: 'set_password',
          purpose: 'password_reset',
          result: 'password_reset_verified',
        },
        200,
      ),
    )

    renderAuthRoutes(['/auth/password-reset/verify'])

    const submitButton = await screen.findByRole('button', { name: 'Продолжить' })

    expect(submitButton).toBeDisabled()

    await user.click(screen.getByLabelText('Код из письма'))
    await user.keyboard('123456')
    await user.click(submitButton)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/password-reset/verify',
      expect.objectContaining({
        body: JSON.stringify({
          code: '123456',
          email: 'name@company.ru',
        }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Создание пароля' }),
    ).toBeInTheDocument()
  })

  it('completes password reset set-password and shows success feedback', async () => {
    const user = userEvent.setup()

    savePasswordResetRequest({
      email: 'name@company.ru',
      expiresInSeconds: 900,
      resendAvailableInSeconds: 60,
    })
    savePasswordResetVerification({
      continuationToken: 'reset-continuation-token',
      continuationExpiresInSeconds: 900,
      email: 'name@company.ru',
    })

    mockUnauthenticatedSession()
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          email: 'name@company.ru',
          nextStep: 'login',
          purpose: 'password_reset',
          result: 'password_reset_completed',
        },
        200,
      ),
    )

    renderAuthRoutes(['/auth/password-reset/set-password'])

    await user.type(await screen.findByLabelText(/Новый пароль/), 'NewPass123')
    await user.type(screen.getByLabelText(/Подтвердите пароль/), 'NewPass123')
    await user.click(screen.getByRole('button', { name: 'Сохранить пароль' }))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/password-reset/set-password',
      expect.objectContaining({
        body: JSON.stringify({
          continuationToken: 'reset-continuation-token',
          email: 'name@company.ru',
          newPassword: 'NewPass123',
        }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    )

    expect(
      await screen.findByText(/Пароль обновлен для name@company.ru/),
    ).toBeInTheDocument()
  })

  it('clears expired password reset verification state before set-password step render', async () => {
    mockUnauthenticatedSession()
    window.sessionStorage.setItem(
      'portal.password-reset-flow',
      JSON.stringify({
        request: {
          email: 'name@company.ru',
          expiresInSeconds: 900,
          requestedAt: Date.now(),
          resendAvailableInSeconds: 0,
        },
        verification: {
          continuationExpiresInSeconds: 1,
          continuationToken: 'reset-continuation-token',
          email: 'name@company.ru',
          verifiedAt: Date.now() - 2000,
        },
      }),
    )

    renderAuthRoutes(['/auth/password-reset/set-password'])

    expect(
      await screen.findByText(
        'Сначала подтвердите email, чтобы открыть шаг установки пароля.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Вернуться к подтверждению' }),
    ).toHaveAttribute('href', '/auth/password-reset/verify')
    expect(window.sessionStorage.getItem('portal.password-reset-flow')).toContain(
      '"verification":null',
    )
  })

  it('keeps password reset set-password disabled for a space-padded short password', async () => {
    const user = userEvent.setup()

    savePasswordResetRequest({
      email: 'name@company.ru',
      expiresInSeconds: 900,
      resendAvailableInSeconds: 60,
    })
    savePasswordResetVerification({
      continuationToken: 'reset-continuation-token',
      continuationExpiresInSeconds: 900,
      email: 'name@company.ru',
    })

    mockUnauthenticatedSession()
    renderAuthRoutes(['/auth/password-reset/set-password'])

    await user.type(await screen.findByLabelText(/Новый пароль/), ' Pass12 ')
    await user.type(screen.getByLabelText(/Подтвердите пароль/), ' Pass12 ')

    expect(
      screen.getByRole('button', { name: 'Сохранить пароль' }),
    ).toBeDisabled()
    expect(
      fetchMock.mock.calls.some(
        ([url]) => url === '/api/auth/password-reset/set-password',
      ),
    ).toBe(false)
  })
})
