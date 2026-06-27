import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InitialEntry } from 'react-router-dom'

import { AppRoutes } from '../../../app/AppRoutes'
import { renderWithRouter } from '../../../test/renderWithRouter'
import {
  clearPasswordlessLoginFlow,
  savePasswordlessLoginRequest,
} from '../lib/passwordlessLoginFlow'

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

function createChatThreadsResponse() {
  return createJsonResponse(
    {
      activeThreadId: 'private:me',
      threads: [
        {
          id: 'private:me',
          subtitle: 'Вы и поддержка',
          title: 'Личный чат',
          type: 'private',
        },
      ],
    },
    200,
  )
}

function createChatNotReadyResponse() {
  return createJsonResponse(
    {
      activeThread: null,
      hasMoreOlder: false,
      messages: [],
      nextOlderCursor: null,
      reason: 'contact_link_missing',
      result: 'not_ready',
    },
    200,
  )
}

function createNotificationSettingsResponse() {
  return createJsonResponse(
    {
      effective: {
        newMessagesEnabled: true,
        soundEnabled: true,
      },
      global: {
        newMessagesEnabled: true,
        soundEnabled: true,
      },
      overrides: {
        newMessagesEnabled: null,
        soundEnabled: null,
      },
      threadId: 'private:me',
    },
    200,
  )
}

function createSupportAvailabilityResponse() {
  return createJsonResponse(
    {
      currentStatus: 'online',
      outOfOfficeMessage: null,
      reason: 'none',
      result: 'ready',
      workingHours: {
        enabled: false,
        isWithinWorkingHours: null,
        rows: [],
        timezone: 'UTC',
      },
    },
    200,
  )
}

function savePasswordlessLoginLegalContinuation({
  continuationExpiresInSeconds = 900,
  continuationToken = 'legal-continuation-token',
  email = 'name@company.ru',
}: {
  continuationExpiresInSeconds?: number
  continuationToken?: string
  email?: string
} = {}) {
  window.sessionStorage.setItem(
    'portal.passwordless-login-flow',
    JSON.stringify({
      legalContinuation: {
        continuationExpiresInSeconds,
        continuationToken,
        email,
        verifiedAt: Date.now(),
      },
    }),
  )
}

function renderAuthRoutes(initialEntries: InitialEntry[]) {
  renderWithRouter(<AppRoutes />, { initialEntries })
}

describe('Passwordless login pages', () => {
  const fetchMock = vi.fn<typeof fetch>()

  function mockUnauthenticatedSession() {
    fetchMock.mockResolvedValueOnce(createUnauthorizedSessionResponse())
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    clearPasswordlessLoginFlow()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('submits the primary email-code login request and opens the verify step', async () => {
    const user = userEvent.setup()

    mockUnauthenticatedSession()
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          accepted: true,
          email: 'name@company.ru',
          expiresInSeconds: 900,
          nextStep: 'verify_code',
          purpose: 'passwordless_login',
          resendAvailableInSeconds: 60,
          result: 'passwordless_login_requested',
        },
        200,
      ),
    )

    renderAuthRoutes(['/auth/login'])

    expect(
      await screen.findByRole('heading', { name: 'ВХОД ДЛЯ КЛИЕНТОВ' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Войдите, чтобы продолжить общение с поддержкой.'),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText(/Email/), 'name@company.ru')
    await user.click(screen.getByRole('button', { name: 'Получить код' }))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/code-login/request',
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
      await screen.findByRole('heading', { name: 'Код из почты' }),
    ).toBeInTheDocument()
    expect(screen.getByText('name@company.ru')).toBeInTheDocument()
    expect(screen.getByTestId('otp-verification-form')).toBeInTheDocument()
  })

  it('preserves protected redirect through primary email-code login', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createUnauthorizedSessionResponse()
      }

      if (url === '/api/auth/code-login/request') {
        return createJsonResponse(
          {
            accepted: true,
            email: 'name@company.ru',
            expiresInSeconds: 900,
            nextStep: 'verify_code',
            purpose: 'passwordless_login',
            resendAvailableInSeconds: 0,
            result: 'passwordless_login_requested',
          },
          200,
        )
      }

      if (url === '/api/auth/code-login/verify') {
        return createJsonResponse(
          {
            nextStep: 'chat',
            purpose: 'passwordless_login',
            result: 'passwordless_login_completed',
            session: { expiresAt: '2026-06-10T10:00:00.000Z' },
            user: {
              email: 'name@company.ru',
              fullName: 'Portal User',
              id: 7,
              passwordConfigured: false,
            },
          },
          200,
        )
      }

      return createJsonResponse({}, 404)
    })

    renderAuthRoutes([
      {
        pathname: '/auth/login',
        state: {
          from: {
            hash: '',
            pathname: '/app/settings',
            search: '',
          },
        },
      },
    ])

    await user.type(await screen.findByLabelText(/Email/), 'name@company.ru')
    await user.click(screen.getByRole('button', { name: 'Получить код' }))

    expect(
      await screen.findByRole('heading', { name: 'Код из почты' }),
    ).toBeInTheDocument()

    await user.click(await screen.findByLabelText('Код из письма'))
    await user.keyboard('123456')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(
      await screen.findByRole('heading', { name: 'Настройки' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Личный чат' }),
    ).not.toBeInTheDocument()
  })

  it('verifies passwordless login code, stores authenticated session, and opens chat', async () => {
    const user = userEvent.setup()

    savePasswordlessLoginRequest({
      email: 'name@company.ru',
      expiresInSeconds: 900,
      resendAvailableInSeconds: 0,
    })

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createUnauthorizedSessionResponse()
      }

      if (url === '/api/auth/code-login/verify') {
        return createJsonResponse(
          {
            nextStep: 'chat',
            purpose: 'passwordless_login',
            result: 'passwordless_login_completed',
            session: { expiresAt: '2026-06-10T10:00:00.000Z' },
            user: {
              email: 'name@company.ru',
              fullName: 'Portal User',
              id: 7,
              passwordConfigured: false,
            },
          },
          200,
        )
      }

      if (url === '/api/chat/threads') {
        return createChatThreadsResponse()
      }

      if (url === '/api/chat/messages?threadId=private%3Ame') {
        return createChatNotReadyResponse()
      }

      if (url === '/api/chat/threads/private%3Ame/notification-settings') {
        return createNotificationSettingsResponse()
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      return createJsonResponse({}, 404)
    })

    renderAuthRoutes(['/auth/login/verify'])

    await user.click(await screen.findByLabelText('Код из письма'))
    await user.keyboard('123456')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/code-login/verify',
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
      await screen.findByRole('heading', { name: 'Личный чат' }),
    ).toBeInTheDocument()
  })

  it('routes verified first-access code login to legal consent', async () => {
    const user = userEvent.setup()

    savePasswordlessLoginRequest({
      email: 'name@company.ru',
      expiresInSeconds: 900,
      resendAvailableInSeconds: 0,
    })

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createUnauthorizedSessionResponse()
      }

      if (url === '/api/auth/code-login/verify') {
        return createJsonResponse(
          {
            continuationExpiresInSeconds: 900,
            continuationToken: 'legal-continuation-token',
            email: 'name@company.ru',
            nextStep: 'accept_legal',
            purpose: 'passwordless_login',
            result: 'legal_acceptance_required',
          },
          200,
        )
      }

      return createJsonResponse({}, 404)
    })

    renderAuthRoutes(['/auth/login/verify'])

    await user.click(await screen.findByLabelText('Код из письма'))
    await user.keyboard('123456')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(
      await screen.findByRole('heading', { name: 'Принять условия' }),
    ).toBeInTheDocument()
    expect(screen.getByText('name@company.ru')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Личный чат' }),
    ).not.toBeInTheDocument()
  })

  it('requires both legal checkboxes before continuing to chat', async () => {
    const user = userEvent.setup()

    savePasswordlessLoginLegalContinuation()

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createUnauthorizedSessionResponse()
      }

      if (url === '/api/auth/code-login/accept-legal') {
        return createJsonResponse(
          {
            nextStep: 'chat',
            purpose: 'passwordless_login',
            result: 'passwordless_login_completed',
            session: { expiresAt: '2026-06-10T10:00:00.000Z' },
            user: {
              email: 'name@company.ru',
              fullName: 'Portal User',
              id: 7,
              passwordConfigured: false,
            },
          },
          200,
        )
      }

      if (url === '/api/chat/threads') {
        return createChatThreadsResponse()
      }

      if (url === '/api/chat/messages?threadId=private%3Ame') {
        return createChatNotReadyResponse()
      }

      if (url === '/api/chat/threads/private%3Ame/notification-settings') {
        return createNotificationSettingsResponse()
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      return createJsonResponse({}, 404)
    })

    renderAuthRoutes(['/auth/login/legal'])

    const submitButton = await screen.findByRole('button', {
      name: 'Продолжить',
    })
    expect(submitButton).toBeDisabled()

    await user.click(
      screen.getByRole('checkbox', {
        name: /Я принимаю условия Пользовательского соглашения/i,
      }),
    )
    expect(submitButton).toBeDisabled()

    await user.click(
      screen.getByRole('checkbox', {
        name: /Я даю согласие на обработку персональных данных/i,
      }),
    )
    expect(submitButton).toBeEnabled()

    await user.click(submitButton)

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
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    )
    expect(
      await screen.findByRole('heading', { name: 'Личный чат' }),
    ).toBeInTheDocument()
  })

  it('shows a controlled retry error when passwordless login code is expired', async () => {
    const user = userEvent.setup()

    savePasswordlessLoginRequest({
      email: 'name@company.ru',
      expiresInSeconds: 900,
      resendAvailableInSeconds: 0,
    })

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createUnauthorizedSessionResponse()
      }

      if (url === '/api/auth/code-login/verify') {
        return createJsonResponse(
          {
            error: {
              code: 'PASSWORDLESS_LOGIN_CODE_EXPIRED',
              message: 'Срок действия кода входа истек. Запросите новый код.',
            },
          },
          410,
        )
      }

      return createJsonResponse({}, 404)
    })

    renderAuthRoutes(['/auth/login/verify'])

    await user.click(await screen.findByLabelText('Код из письма'))
    await user.keyboard('123456')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Срок действия кода входа истек. Запросите новый код.',
    )
    expect(
      screen.queryByRole('heading', { name: 'Личный чат' }),
    ).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/chat/threads',
      expect.anything(),
    )
  })

  it('shows a controlled retry error when passwordless login code is invalid', async () => {
    const user = userEvent.setup()

    savePasswordlessLoginRequest({
      email: 'name@company.ru',
      expiresInSeconds: 900,
      resendAvailableInSeconds: 0,
    })

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createUnauthorizedSessionResponse()
      }

      if (url === '/api/auth/code-login/verify') {
        return createJsonResponse(
          {
            error: {
              code: 'PASSWORDLESS_LOGIN_INVALID_CODE',
              message:
                'Неверный код входа. Проверьте код и попробуйте еще раз.',
            },
          },
          400,
        )
      }

      return createJsonResponse({}, 404)
    })

    renderAuthRoutes(['/auth/login/verify'])

    await user.click(await screen.findByLabelText('Код из письма'))
    await user.keyboard('000000')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Неверный код входа. Проверьте код и попробуйте еще раз.',
    )
    expect(
      screen.queryByRole('heading', { name: 'Личный чат' }),
    ).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/chat/threads',
      expect.anything(),
    )
  })

  it('guards passwordless code-login verify when request state is missing', async () => {
    mockUnauthenticatedSession()
    renderAuthRoutes(['/auth/login/verify'])

    expect(
      await screen.findByText(
        'Сначала запросите код входа для уже созданного аккаунта.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Запросить код входа' }),
    ).toHaveAttribute('href', '/auth/login')
  })
})
