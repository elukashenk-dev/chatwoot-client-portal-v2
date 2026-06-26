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
  renderWithRouter(<AppRoutes />, { initialEntries })
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
      await screen.findByRole('heading', { name: 'Создать аккаунт' }),
    ).toBeInTheDocument()
    const nameInput = screen.getByLabelText(/Имя и фамилия/)
    const emailInput = screen.getByLabelText(/Email/)

    expect(nameInput).toBeInTheDocument()
    expect(emailInput).toBeInTheDocument()
    expect(
      screen.getByText(
        'Укажите имя и рабочий email, чтобы получить код подтверждения.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Введите email, указанный при создании вашего профиля.'),
    ).toHaveClass('auth-form-note')
    const submit = screen.getByRole('button', { name: 'Продолжить' })

    expect(submit).toBeDisabled()

    await user.click(
      screen.getByRole('checkbox', {
        name: /Я принимаю условия Пользовательского соглашения\./i,
      }),
    )
    await user.click(
      screen.getByRole('checkbox', {
        name: /Я даю согласие на обработку персональных данных и подтверждаю, что ознакомлен с Политикой обработки персональных данных/i,
      }),
    )
    expect(submit).not.toBeDisabled()
    await user.click(submit)

    expect(screen.queryByText('Введите имя')).not.toBeInTheDocument()
    expect(screen.queryByText('Введите email')).not.toBeInTheDocument()
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
    expect(emailInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute(
      'href',
      '/auth/login',
    )
    expect(
      screen.queryByRole('link', { name: 'У меня уже есть аккаунт' }),
    ).not.toBeInTheDocument()
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

    await user.type(
      await screen.findByLabelText(/Имя и фамилия/),
      'Portal User',
    )
    await user.type(screen.getByLabelText(/Email/), 'name@company.ru')
    const submit = screen.getByRole('button', { name: 'Продолжить' })

    expect(submit).toBeDisabled()
    await user.click(
      screen.getByRole('checkbox', {
        name: /Я принимаю условия Пользовательского соглашения\./i,
      }),
    )
    expect(submit).toBeDisabled()
    await user.click(
      screen.getByRole('checkbox', {
        name: /Я даю согласие на обработку персональных данных и подтверждаю, что ознакомлен с Политикой обработки персональных данных/i,
      }),
    )
    expect(submit).not.toBeDisabled()

    await user.click(submit)

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
      personalDataConsentAccepted: true,
      termsAccepted: true,
    })

    expect(
      await screen.findByRole('heading', { name: 'Подтверждение почты' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Код подтверждения отправлен на'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('otp-verification-form')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Если письма нет, проверьте «Спам» или запросите новый код после таймера.',
      ),
    ).toHaveClass('auth-form-note')
    expect(
      screen.getByRole('button', { name: /Повторить через/ }),
    ).toBeDisabled()
    expect(
      screen.queryByText(/Повторная отправка будет доступна через/),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Мы отправили 6-значный код на/),
    ).not.toBeInTheDocument()
    expect(screen.getByText('name@company.ru')).toBeInTheDocument()
  })

  it('shows a clickable support phone when registration contact is missing', async () => {
    const user = userEvent.setup()

    mockUnauthenticatedSession()
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'REGISTRATION_CONTACT_NOT_FOUND',
            message:
              'Мы не нашли профиль с таким email. Позвоните по тел: +7 (846) 211-11-11.',
          },
        },
        403,
      ),
    )

    renderAuthRoutes(['/auth/register'])

    await user.type(
      await screen.findByLabelText(/Имя и фамилия/),
      'Portal User',
    )
    await user.type(screen.getByLabelText(/Email/), 'missing@company.ru')
    await user.click(
      screen.getByRole('checkbox', {
        name: /Я принимаю условия Пользовательского соглашения\./i,
      }),
    )
    await user.click(
      screen.getByRole('checkbox', {
        name: /Я даю согласие на обработку персональных данных и подтверждаю, что ознакомлен с Политикой обработки персональных данных/i,
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Мы не нашли профиль с таким email. Позвоните по тел: +7 (846) 211-11-11.',
    )
    expect(
      screen.getByRole('link', { name: '+7 (846) 211-11-11' }),
    ).toHaveAttribute('href', 'tel:+78462111111')
  })

  it('renders the password reset request page and validates empty email softly', async () => {
    const user = userEvent.setup()

    mockUnauthenticatedSession()
    renderAuthRoutes(['/auth/password-reset/request'])

    expect(
      await screen.findByRole('heading', { name: 'Восстановить пароль' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Введите email. Если доступ активен, мы отправим код восстановления.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Введите email, указанный при создании вашего профиля.'),
    ).toHaveClass('auth-form-note')

    const emailInput = screen.getByLabelText(/Email/)

    await user.click(screen.getByRole('button', { name: 'Получить код' }))

    expect(screen.queryByText('Введите email')).not.toBeInTheDocument()
    expect(emailInput).toHaveAttribute('aria-invalid', 'true')
    expect(
      screen.getByRole('link', { name: 'Вернуться ко входу' }),
    ).toHaveAttribute('href', '/auth/login')
    expect(
      screen.queryByRole('link', { name: 'Новый аккаунт' }),
    ).not.toBeInTheDocument()
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
      personalDataConsentAccepted: true,
      resendAvailableInSeconds: 60,
      termsAccepted: true,
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

    const submitButton = await screen.findByRole('button', {
      name: 'Продолжить',
    })

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
      await screen.findByRole('heading', { name: 'Завершение регистрации' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Требования к паролю/)).toBeInTheDocument()
    expect(screen.getByTestId('password-rules-card')).toHaveClass(
      'auth-password-rules',
    )
  })

  it('shows the registration invalid-code backend error without opening set-password', async () => {
    const user = userEvent.setup()

    saveRegistrationRequest({
      email: 'name@company.ru',
      expiresInSeconds: 900,
      fullName: 'Portal User',
      personalDataConsentAccepted: true,
      resendAvailableInSeconds: 60,
      termsAccepted: true,
    })

    mockUnauthenticatedSession()
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'REGISTRATION_VERIFICATION_INVALID_CODE',
            message:
              'Неверный код подтверждения. Проверьте код и попробуйте еще раз.',
          },
        },
        400,
      ),
    )

    renderAuthRoutes(['/auth/register/verify'])

    await user.click(await screen.findByLabelText('Код из письма'))
    await user.keyboard('000000')
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    expect(
      await screen.findByText(
        'Неверный код подтверждения. Проверьте код и попробуйте еще раз.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Завершение регистрации' }),
    ).not.toBeInTheDocument()
  })

  it('uses existing-pending copy when registration resend did not send a new email', async () => {
    const user = userEvent.setup()

    saveRegistrationRequest({
      email: 'name@company.ru',
      expiresInSeconds: 900,
      fullName: 'Portal User',
      personalDataConsentAccepted: true,
      resendAvailableInSeconds: 0,
      termsAccepted: true,
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

    expect(getJsonBodyForCall('/api/auth/register/request')).toEqual({
      email: 'name@company.ru',
      fullName: 'Portal User',
      personalDataConsentAccepted: true,
      termsAccepted: true,
    })
    expect(
      await screen.findByText(
        'Используйте ранее отправленный код. Новый код можно будет запросить после таймера.',
      ),
    ).toBeInTheDocument()
  })

  it('completes registration set-password against the backend', async () => {
    const user = userEvent.setup()

    saveRegistrationRequest({
      email: 'name@company.ru',
      expiresInSeconds: 900,
      fullName: 'Portal User',
      personalDataConsentAccepted: true,
      resendAvailableInSeconds: 60,
      termsAccepted: true,
    })
    saveRegistrationVerification({
      continuationToken: 'continuation-token',
      continuationExpiresInSeconds: 900,
      email: 'name@company.ru',
    })

    mockUnauthenticatedSession()
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        nextStep: 'chat',
        purpose: 'registration',
        result: 'registration_completed',
        session: { expiresAt: '2026-06-10T10:00:00.000Z' },
        user: { email: 'name@company.ru', fullName: 'Portal User', id: 7, passwordConfigured: true },
      }, 200),
    )

    renderAuthRoutes(['/auth/register/set-password'])

    expect(
      await screen.findByRole('heading', { name: 'Завершение регистрации' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Создайте пароль сейчас или перейдите к чатам без него.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: 'Продолжить без пароля',
    })).toBeInTheDocument()
    expect(screen.getByTestId('password-setup-form')).toBeInTheDocument()
    expect(screen.getByTestId('password-rules-card')).toHaveClass(
      'auth-password-rules',
    )
    expect(
      screen.queryByRole('link', { name: 'Вернуться назад' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Перейти ко входу' }),
    ).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/Новый пароль/), 'PortalPass123')
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
  })

  it('guards registration set-password when verification state is missing', async () => {
    mockUnauthenticatedSession()
    renderAuthRoutes(['/auth/register/set-password'])

    expect(
      await screen.findByText(
        'Сначала подтвердите email, чтобы завершить регистрацию.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Вернуться к подтверждению' }),
    ).toHaveAttribute('href', '/auth/register/verify')
  })

  it('keeps registration set-password disabled for a space-padded short password', async () => {
    const user = userEvent.setup()

    saveRegistrationRequest({
      email: 'name@company.ru',
      expiresInSeconds: 900,
      fullName: 'Portal User',
      personalDataConsentAccepted: true,
      resendAvailableInSeconds: 60,
      termsAccepted: true,
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
        'Сначала подтвердите email, чтобы завершить регистрацию.',
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
      await screen.findByRole('heading', { name: 'Подтверждение почты' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Если доступ активен, код восстановления отправлен на'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/Мы отправили 6-значный код на/),
    ).not.toBeInTheDocument()
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
    expect(
      window.sessionStorage.getItem('portal.password-reset-flow'),
    ).toBeNull()
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

    const submitButton = await screen.findByRole('button', {
      name: 'Продолжить',
    })

    expect(
      screen.getByText('Если доступ активен, код восстановления отправлен на'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('otp-verification-form')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Если письма нет, проверьте «Спам» или запросите новый код после таймера.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Повторить через/ }),
    ).toBeDisabled()
    expect(
      screen.queryByText(/Повторная отправка будет доступна через/),
    ).not.toBeInTheDocument()
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
      await screen.findByRole('heading', { name: 'Новый пароль' }),
    ).toBeInTheDocument()
  })

  it('shows the password reset invalid-code backend error without opening set-password', async () => {
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
          error: {
            code: 'PASSWORD_RESET_INVALID_CODE',
            message:
              'Неверный код восстановления. Проверьте код и попробуйте еще раз.',
          },
        },
        400,
      ),
    )

    renderAuthRoutes(['/auth/password-reset/verify'])

    await user.click(await screen.findByLabelText('Код из письма'))
    await user.keyboard('000000')
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    expect(
      await screen.findByText(
        'Неверный код восстановления. Проверьте код и попробуйте еще раз.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Новый пароль' }),
    ).not.toBeInTheDocument()
  })

  it('uses enumeration-safe copy when password reset code is resent', async () => {
    const user = userEvent.setup()

    savePasswordResetRequest({
      email: 'name@company.ru',
      expiresInSeconds: 900,
      resendAvailableInSeconds: 0,
    })

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

    renderAuthRoutes(['/auth/password-reset/verify'])

    await user.click(
      await screen.findByRole('button', { name: 'Отправить код повторно' }),
    )

    expect(
      await screen.findByText(
        'Если доступ активен, новый код отправлен на name@company.ru.',
      ),
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

    expect(
      await screen.findByRole('heading', { name: 'Новый пароль' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Создайте новый пароль для входа в Центр поддержки.'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('password-setup-form')).toBeInTheDocument()
    expect(screen.getByTestId('password-rules-card')).toHaveClass(
      'auth-password-rules',
    )
    expect(
      screen.queryByRole('link', { name: 'Вернуться назад' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Перейти ко входу' }),
    ).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/Новый пароль/), 'NewPass123')
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

  it('guards password reset set-password when verification state is missing', async () => {
    mockUnauthenticatedSession()
    renderAuthRoutes(['/auth/password-reset/set-password'])

    expect(
      await screen.findByText(
        'Сначала подтвердите email, чтобы открыть шаг установки пароля.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Вернуться к подтверждению' }),
    ).toHaveAttribute('href', '/auth/password-reset/verify')
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
    expect(
      window.sessionStorage.getItem('portal.password-reset-flow'),
    ).toContain('"verification":null')
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
