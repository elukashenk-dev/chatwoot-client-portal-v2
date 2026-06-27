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
  clearPasswordlessLoginFlow,
  savePasswordlessLoginLegalContinuation,
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
    clearPasswordlessLoginFlow()
    clearPasswordResetFlow()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it.each<AuthSurfaceSmokeCase>([
    {
      arrange: () => {
        savePasswordlessLoginRequest({
          email: 'name@company.ru',
          expiresInSeconds: 900,
          resendAvailableInSeconds: 60,
        })
      },
      heading: 'Код из почты',
      path: '/auth/login/verify',
      realFormTestId: 'otp-verification-form',
    },
    {
      arrange: () => {
        savePasswordlessLoginLegalContinuation({
          continuationExpiresInSeconds: 900,
          continuationToken: 'legal-continuation-token',
          email: 'name@company.ru',
        })
      },
      heading: 'Принять условия',
      path: '/auth/login/legal',
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
      expect(document.querySelector('.auth-header-shell')).not.toBeInTheDocument()
      expect(document.querySelector('.auth-footer-art')).not.toBeInTheDocument()

      if (realFormTestId) {
        expect(screen.getByTestId(realFormTestId)).toBeInTheDocument()
      }
    },
  )

  it.each<AuthFlowActionSurfaceCase>([
    {
      actionLabel: 'Вернуться ко входу',
      heading: 'Восстановить пароль',
      path: '/auth/password-reset/request',
    },
    {
      actionLabel: 'Изменить email',
      arrange: () => {
        savePasswordlessLoginRequest({
          email: 'name@company.ru',
          expiresInSeconds: 900,
          resendAvailableInSeconds: 60,
        })
      },
      heading: 'Код из почты',
      path: '/auth/login/verify',
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
      heading: 'Подтверждение почты',
      path: '/auth/password-reset/verify',
      splitActions: true,
    },
  ])(
    'uses shared flow footer composition on $path',
    async ({ actionLabel, arrange, heading, path, splitActions = false }) => {
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
    },
  )
})
