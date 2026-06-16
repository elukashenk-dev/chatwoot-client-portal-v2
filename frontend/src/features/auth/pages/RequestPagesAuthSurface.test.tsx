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
          resendAvailableInSeconds: 60,
        })
      },
      heading: 'Подтверждение Email',
      path: '/auth/register/verify',
      realFormTestId: 'otp-verification-form',
    },
    {
      arrange: () => {
        saveRegistrationRequest({
          email: 'name@company.ru',
          expiresInSeconds: 900,
          fullName: 'Portal User',
          resendAvailableInSeconds: 60,
        })
        saveRegistrationVerification({
          continuationExpiresInSeconds: 900,
          continuationToken: 'continuation-token',
          email: 'name@company.ru',
        })
      },
      heading: 'Создание пароля',
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
      heading: 'Подтверждение Email',
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
})
