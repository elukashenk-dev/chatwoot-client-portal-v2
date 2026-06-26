import { act, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../../../app/AppRoutes'
import { renderWithRouter } from '../../../test/renderWithRouter'
import {
  BrandingContext,
  type BrandingContextValue,
} from '../../branding/lib/brandingContext'
import { disableCurrentBrowserPushBestEffort } from '../../chat/pages/notificationBrowserPush'
import { TenantIdentityContext } from '../../tenant/lib/tenantIdentityContext'
import {
  AuthSessionContext,
  type AuthSessionContextValue,
} from '../lib/authSessionContext'
import { LoginPage } from './LoginPage'

vi.mock('../../chat/pages/notificationBrowserPush', async () => {
  const actual = await vi.importActual<
    typeof import('../../chat/pages/notificationBrowserPush')
  >('../../chat/pages/notificationBrowserPush')

  return {
    ...actual,
    disableCurrentBrowserPushBestEffort: vi.fn(async () => undefined),
  }
})

const disableCurrentBrowserPushBestEffortMock = vi.mocked(
  disableCurrentBrowserPushBestEffort,
)

const tenantContextValue = {
  errorMessage: null,
  isUsingCachedData: false,
  status: 'ready' as const,
  tenant: {
    displayName: 'Бухфирма',
    primaryDomain: 'lk.buhfirma.ru',
    publicBaseUrl: 'https://lk.buhfirma.ru',
    slug: 'buhfirma',
  },
}

const brandingContextValue: BrandingContextValue = {
  branding: {
    appearance: {
      authBackgroundOverlay: 'none',
      authButtonStyle: 'solid',
      authColorScheme: 'light',
      authFieldStyle: 'solid',
    },
    assets: {},
    colors: {
      accent: '#14b8a6',
      authBackground: '#ecfeff',
      authMutedText: '#456179',
      authText: '#15486b',
      chatBackground: '#f8fafc',
      chatHeaderBackground: '#0f766e',
      chatHeaderText: '#f8fafc',
      chatMutedText: '#52637a',
      chatText: '#1f2937',
      primary: '#134e4a',
    },
    copy: {
      authSubtitle: 'Войдите в кабинет ProvGroup.',
      authTitle: 'Кабинет ProvGroup',
      chatEmptyBody: 'Напишите вопрос, мы ответим здесь.',
      chatEmptyTitle: 'Начните диалог',
      chatInfoTitle: 'О диалоге',
    },
    layout: {
      authBrandPlacement: 'left',
    },
    portalName: 'ProvGroup',
    supportContact: {
      phoneDisplay: '+7 (846) 211-11-11',
      phoneHref: 'tel:+78462111111',
    },
    supportLabel: 'Поддержка ProvGroup',
    version: 3,
  },
  errorMessage: null,
  status: 'ready',
}

const unauthenticatedAuthSession: AuthSessionContextValue = {
  completeAuthenticatedSession: vi.fn(async () => undefined),
  errorMessage: null,
  localDeviceDataRemovalAvailable: false,
  refreshSession: vi.fn(async () => undefined),
  removeLocalDeviceData: vi.fn(async () => undefined),
  sessionSource: null,
  signIn: vi.fn(),
  signOut: vi.fn(async () => undefined),
  status: 'unauthenticated',
  user: null,
}

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

function createAuthenticatedSessionResponse() {
  return createJsonResponse(
    {
      session: {
        expiresAt: '2026-06-10T10:00:00.000Z',
      },
      user: {
        email: 'user@example.com',
        fullName: 'Portal User',
        id: 42,
        passwordConfigured: true,
      },
    },
    200,
  )
}

function createChatNotReadyResponse() {
  return createJsonResponse(
    {
      hasMoreOlder: false,
      activeThread: null,
      messages: [],
      nextOlderCursor: null,
      reason: 'contact_link_missing',
      result: 'not_ready',
    },
    200,
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

function renderAuthRoutes(initialEntries: string[]) {
  renderWithRouter(<AppRoutes />, { initialEntries })
}

describe('LoginPage', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    fetchMock.mockReset()
  })

  it('renders tenant auth copy from public branding on the login screen', () => {
    renderWithRouter(
      <TenantIdentityContext.Provider value={tenantContextValue}>
        <BrandingContext.Provider value={brandingContextValue}>
          <AuthSessionContext.Provider value={unauthenticatedAuthSession}>
            <LoginPage />
          </AuthSessionContext.Provider>
        </BrandingContext.Provider>
      </TenantIdentityContext.Provider>,
    )

    expect(
      screen.getByRole('heading', { name: 'Кабинет ProvGroup' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Войдите в кабинет ProvGroup.')).toBeInTheDocument()
    expect(document.querySelector('.auth-subtitle--login')).toHaveTextContent(
      'Войдите в кабинет ProvGroup.',
    )
    expect(
      document.querySelector('.auth-canvas-background'),
    ).toBeInTheDocument()
    expect(document.querySelector('.auth-stack')).toBeInTheDocument()
    expect(
      document.querySelector('.auth-brand-mark--in-flow'),
    ).toBeInTheDocument()
    expect(document.querySelector('.auth-header-shell')).not.toBeInTheDocument()
    expect(document.querySelector('.auth-footer-art')).not.toBeInTheDocument()
    expect(document.querySelector('.auth-form-slot')).toBeInTheDocument()
    expect(document.querySelector('.auth-input')).toBeInTheDocument()
    expect(screen.getByText('+7 (846) 211-11-11')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '+7 (846) 211-11-11' }),
    ).toHaveAttribute('href', 'tel:+78462111111')
    const supportIcon = document.querySelector('.auth-support-icon')
    expect(supportIcon?.tagName).toBe('IMG')
    expect(supportIcon).toHaveAttribute(
      'src',
      expect.stringContaining('image/svg'),
    )
    expect(
      screen.getByText(/Используя сервис, вы принимаете/i),
    ).toBeInTheDocument()
    expect(document.querySelector('.auth-legal-text')).toHaveTextContent(
      /Используя сервис, вы принимаете Пользовательское соглашение и подтверждаете, что ознакомлены с Политикой обработки персональных данных\./i,
    )
    expect(
      screen.getByRole('link', { name: 'Пользовательское соглашение' }),
    ).toHaveAttribute('href', '/legal/terms')
    expect(
      screen.getByRole('link', {
        name: 'Политикой обработки персональных данных',
      }),
    ).toHaveAttribute('href', '/legal/privacy')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText('Центр поддержки')).not.toBeInTheDocument()
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
      screen.getByRole('heading', { name: 'ВХОД ДЛЯ КЛИЕНТОВ' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Войдите, чтобы продолжить общение с поддержкой.'),
    ).toBeInTheDocument()
    expect(document.querySelector('.auth-subtitle--login')).toHaveTextContent(
      'Войдите, чтобы продолжить общение с поддержкой.',
    )
    expect(
      screen.getByRole('link', { name: 'Забыли пароль?' }),
    ).toHaveAttribute('href', '/auth/password-reset/request')
    expect(
      screen.getByRole('link', { name: 'Создать аккаунт' }),
    ).toHaveAttribute('href', '/auth/register')
    expect(screen.queryByText('Нет доступа к чату?')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: '+7 (846) 211-11-11' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Используйте рабочий email/),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Сайт' })).not.toBeInTheDocument()
    expect(screen.queryByText('Поддержка')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Позвонить' }),
    ).not.toBeInTheDocument()
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
      .mockResolvedValueOnce(createAuthenticatedSessionResponse())
      .mockResolvedValueOnce(createChatThreadsResponse())
      .mockResolvedValueOnce(createChatNotReadyResponse())
      .mockResolvedValueOnce(createNotificationSettingsResponse())
      .mockResolvedValueOnce(createSupportAvailabilityResponse())

    renderAuthRoutes(['/auth/login'])

    const emailInput = await screen.findByLabelText(/Email/)
    const passwordInput = screen.getByLabelText(/Пароль/)
    expect(passwordInput).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Показать пароль' }))
    expect(passwordInput).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(screen.queryByText('Введите email')).not.toBeInTheDocument()
    expect(screen.queryByText('Введите пароль')).not.toBeInTheDocument()
    expect(emailInput).toHaveAttribute('aria-invalid', 'true')
    expect(passwordInput).toHaveAttribute('aria-invalid', 'true')

    fireEvent.focus(emailInput)
    fireEvent.change(emailInput, { target: { value: 'bad-email' } })
    expect(screen.queryByText('Проверьте формат email')).not.toBeInTheDocument()
    expect(emailInput).not.toHaveAttribute('aria-invalid', 'true')

    fireEvent.blur(emailInput)
    expect(screen.getByText('Проверьте формат email')).toBeInTheDocument()
    expect(emailInput).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(passwordInput, { target: { value: 'Secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))

    expect(screen.getByText('Проверьте формат email')).toBeInTheDocument()
    expect(emailInput).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(emailInput, { target: { value: 'name@company.ru' } })

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
      await screen.findByRole('heading', { name: 'Личный чат' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Чат не подключен')).toBeInTheDocument()
  })

  it('loads existing session into the app shell and returns to login after logout', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedSessionResponse()
      }

      if (url === '/api/chat/threads') {
        return createChatThreadsResponse()
      }

      if (url === '/api/chat/messages?threadId=private%3Ame') {
        return createChatNotReadyResponse()
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      if (url === '/api/chat/threads/private%3Ame/notification-settings') {
        return createNotificationSettingsResponse()
      }

      if (url === '/api/auth/logout') {
        return new Response(null, { status: 204 })
      }

      return createJsonResponse({}, 404)
    })

    renderAuthRoutes(['/auth/login'])

    expect(
      await screen.findByRole('heading', { name: 'Личный чат' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Открыть меню чата' }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'Завершить диалог' }),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(disableCurrentBrowserPushBestEffortMock).not.toHaveBeenCalled()
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
      await screen.findByRole('heading', { name: 'ВХОД ДЛЯ КЛИЕНТОВ' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Личный чат')).not.toBeInTheDocument()
  })

  it('does not render a legacy startup screen while protected session is checking', () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValueOnce(new Promise(() => {}))

    renderAuthRoutes(['/app/chat'])

    expect(
      screen.queryByRole('heading', { name: 'Открываем кабинет' }),
    ).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(450)
    })

    expect(
      screen.queryByRole('heading', { name: 'Открываем кабинет' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Проверяем сессию')).not.toBeInTheDocument()
  })

  it('does not render a legacy startup screen while public auth session is checking', () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValueOnce(new Promise(() => {}))

    renderAuthRoutes(['/auth/login'])

    expect(
      screen.queryByRole('heading', { name: 'Открываем кабинет' }),
    ).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(450)
    })

    expect(
      screen.queryByRole('heading', { name: 'Открываем кабинет' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Проверяем сессию')).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        'Проверяем, нужно ли открыть форму входа или защищенную клиентскую зону.',
      ),
    ).not.toBeInTheDocument()
  })

  it('keeps public auth route blank while checking public auth session', () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValueOnce(new Promise(() => {}))

    renderAuthRoutes(['/auth/login'])

    act(() => {
      vi.advanceTimersByTime(450)
    })

    expect(
      screen.queryByRole('heading', { name: 'Открываем кабинет' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Проверяем сессию')).not.toBeInTheDocument()
  })

  it('keeps the auth startup canvas mounted while checking public auth session', () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValueOnce(new Promise(() => {}))

    renderAuthRoutes(['/auth/login'])

    expect(document.querySelector('.auth-frame-background')).toBeInTheDocument()
    expect(document.querySelector('.auth-canvas-background')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Email/)).not.toBeInTheDocument()
  })

  it.each([
    ['/auth/register', 'Создать аккаунт'],
    ['/auth/password-reset/request', 'Восстановление пароля'],
  ])(
    'redirects authenticated public auth route %s to the app shell',
    async (initialEntry, publicPageHeading) => {
      fetchMock
        .mockResolvedValueOnce(createAuthenticatedSessionResponse())
        .mockResolvedValueOnce(createChatThreadsResponse())
        .mockResolvedValueOnce(createChatNotReadyResponse())
        .mockResolvedValueOnce(createNotificationSettingsResponse())
        .mockResolvedValueOnce(createSupportAvailabilityResponse())

      renderAuthRoutes([initialEntry])

      expect(
        await screen.findByRole('heading', { name: 'Личный чат' }),
      ).toBeInTheDocument()
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
        name: 'Нужно проверить сессию.',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeEnabled()
  })
})
