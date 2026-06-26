import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../../../app/AppRoutes'
import { renderWithRouter } from '../../../test/renderWithRouter'
import {
  clearPasswordResetFlow,
  savePasswordResetRequest,
  savePasswordResetVerification,
} from '../lib/passwordResetFlow'
import {
  clearRegistrationFlow,
  saveRegistrationRequest,
  saveRegistrationVerification,
} from '../lib/registrationFlow'

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

type AuthSurfaceSmokeCase = {
  arrange?: () => void
  heading: string
  path: string
  realFormTestId?: 'otp-verification-form' | 'password-setup-form'
}

type AuthFlowActionSurfaceCase = {
  actionLabel: string
  arrange?: () => void
  expectsCompactSupport: boolean
  heading: string
  path: string
  splitActions?: boolean
}

describe('Auth flow pages surface contract', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    clearRegistrationFlow()
    clearPasswordResetFlow()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it.each<AuthSurfaceSmokeCase>([
    {
      heading: 'Создать аккаунт',
      path: '/auth/register',
    },
    {
      arrange: () => {
        saveRegistrationRequest({
          email: 'name@company.ru',
          expiresInSeconds: 900,
          fullName: 'Portal User',
          personalDataConsentAccepted: true,
          resendAvailableInSeconds: 60,
          termsAccepted: true,
        })
      },
      heading: 'Подтверждение почты',
      path: '/auth/register/verify',
      realFormTestId: 'otp-verification-form',
    },
    {
      arrange: () => {
        saveRegistrationRequest({
          email: 'name@company.ru',
          expiresInSeconds: 900,
          fullName: 'Portal User',
          personalDataConsentAccepted: true,
          resendAvailableInSeconds: 60,
          termsAccepted: true,
        })
        saveRegistrationVerification({
          continuationExpiresInSeconds: 900,
          continuationToken: 'continuation-token',
          email: 'name@company.ru',
        })
      },
      heading: 'Завершение регистрации',
      path: '/auth/register/set-password',
      realFormTestId: 'password-setup-form',
    },
    {
      heading: 'Восстановить пароль',
      path: '/auth/password-reset/request',
    },
    {
      arrange: () => {
        savePasswordResetRequest({
          email: 'name@company.ru',
          expiresInSeconds: 900,
          resendAvailableInSeconds: 60,
        })
      },
      heading: 'Подтверждение почты',
      path: '/auth/password-reset/verify',
      realFormTestId: 'otp-verification-form',
    },
    {
      arrange: () => {
        savePasswordResetRequest({
          email: 'name@company.ru',
          expiresInSeconds: 900,
          resendAvailableInSeconds: 60,
        })
        savePasswordResetVerification({
          continuationExpiresInSeconds: 900,
          continuationToken: 'reset-continuation-token',
          email: 'name@company.ru',
        })
      },
      heading: 'Новый пароль',
      path: '/auth/password-reset/set-password',
      realFormTestId: 'password-setup-form',
    },
  ])(
    'renders the stacked auth shell on $path',
    async ({ arrange, heading, path, realFormTestId }) => {
      arrange?.()
      fetchMock.mockResolvedValueOnce(createUnauthorizedSessionResponse())

      renderAuthRoutes([path])

      const pageHeading = await screen.findByRole('heading', { name: heading })

      expect(pageHeading).toBeInTheDocument()
      expect(pageHeading).toHaveClass('auth-title')
      expect(document.querySelector('.auth-stack')).toBeInTheDocument()
      expect(
        document.querySelector('.auth-brand-mark--in-flow'),
      ).toBeInTheDocument()
      expect(
        document.querySelector('.auth-subtitle--login'),
      ).not.toBeInTheDocument()
      expect(
        document.querySelector('.auth-header-shell'),
      ).not.toBeInTheDocument()
      expect(document.querySelector('.auth-footer-art')).not.toBeInTheDocument()

      if (realFormTestId) {
        expect(screen.getByTestId(realFormTestId)).toBeInTheDocument()
      }
    },
  )

  it.each<AuthFlowActionSurfaceCase>([
    {
      actionLabel: 'Войти',
      expectsCompactSupport: false,
      heading: 'Создать аккаунт',
      path: '/auth/register',
    },
    {
      actionLabel: 'Вернуться ко входу',
      expectsCompactSupport: false,
      heading: 'Восстановить пароль',
      path: '/auth/password-reset/request',
    },
    {
      actionLabel: 'Изменить email',
      arrange: () => {
        saveRegistrationRequest({
          email: 'name@company.ru',
          expiresInSeconds: 900,
          fullName: 'Portal User',
          personalDataConsentAccepted: true,
          resendAvailableInSeconds: 60,
          termsAccepted: true,
        })
      },
      expectsCompactSupport: false,
      heading: 'Подтверждение почты',
      path: '/auth/register/verify',
      splitActions: true,
    },
    {
      actionLabel: 'Изменить email',
      arrange: () => {
        savePasswordResetRequest({
          email: 'name@company.ru',
          expiresInSeconds: 900,
          resendAvailableInSeconds: 60,
        })
      },
      expectsCompactSupport: false,
      heading: 'Подтверждение почты',
      path: '/auth/password-reset/verify',
      splitActions: true,
    },
  ])(
    'uses shared flow footer composition on $path',
    async ({
      actionLabel,
      arrange,
      expectsCompactSupport,
      heading,
      path,
      splitActions = false,
    }) => {
      arrange?.()
      fetchMock.mockResolvedValueOnce(createUnauthorizedSessionResponse())

      renderAuthRoutes([path])

      await screen.findByRole('heading', { name: heading })

      const action = screen.getByRole('link', { name: actionLabel })
      const actionContainer = action.closest('.auth-flow-actions')

      expect(actionContainer).toBeInTheDocument()
      expect(actionContainer).toHaveClass('auth-flow-actions')

      if (splitActions) {
        expect(actionContainer).toHaveClass('auth-flow-actions--split')
      }

      if (expectsCompactSupport) {
        expect(screen.getByText('Нужна помощь?')).toHaveClass(
          'auth-flow-support__question',
        )
        expect(
          screen.getByRole('link', { name: '+7 (800) 000-00-00' }),
        ).toHaveAttribute('href', 'tel:+78000000000')
      } else {
        expect(screen.queryByText('Нужна помощь?')).not.toBeInTheDocument()
      }
    },
  )
})
