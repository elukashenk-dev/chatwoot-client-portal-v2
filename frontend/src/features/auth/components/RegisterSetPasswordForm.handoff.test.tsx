import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AuthSessionContextValue } from '../lib/authSessionContext'
import { AuthSessionContext } from '../lib/authSessionContext'
import {
  clearRegistrationFlow,
  getStoredRegistrationRequest,
  getStoredRegistrationVerification,
  saveRegistrationRequest,
  saveRegistrationVerification,
} from '../lib/registrationFlow'
import { RegisterSetPasswordForm } from './RegisterSetPasswordForm'

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  return {
    promise,
    resolve,
  }
}

describe('RegisterSetPasswordForm auth handoff', () => {
  const completeAuthenticatedSession = vi.fn(async () => undefined)
  const fetchMock = vi.fn<typeof fetch>()
  const authSession = {
    completeAuthenticatedSession,
    errorMessage: null,
    localDeviceDataRemovalAvailable: false,
    refreshSession: vi.fn(async () => undefined),
    removeLocalDeviceData: vi.fn(async () => undefined),
    sessionSource: null,
    signIn: vi.fn(),
    signOut: vi.fn(async () => undefined),
    status: 'unauthenticated',
    user: null,
  } satisfies AuthSessionContextValue

  function LocationProbe() {
    const location = useLocation()

    return <span data-testid="location">{location.pathname}</span>
  }

  function saveRegistrationCompletionFlow() {
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
  }

  function renderForm() {
    render(
      <MemoryRouter initialEntries={['/auth/register/set-password']}>
        <AuthSessionContext.Provider value={authSession}>
          <RegisterSetPasswordForm />
          <LocationProbe />
        </AuthSessionContext.Provider>
      </MemoryRouter>,
    )
  }

  afterEach(() => {
    clearRegistrationFlow()
    completeAuthenticatedSession.mockClear()
    fetchMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('hydrates auth context and opens chats after password registration completion', async () => {
    const user = userEvent.setup()
    const authenticatedSession = {
      session: {
        expiresAt: '2026-06-10T10:00:00.000Z',
      },
      user: {
        email: 'name@company.ru',
        fullName: 'Portal User',
        id: 7,
        passwordConfigured: true,
      },
    }

    saveRegistrationCompletionFlow()
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        nextStep: 'chat',
        purpose: 'registration',
        result: 'registration_completed',
        ...authenticatedSession,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderForm()

    await user.type(screen.getByLabelText(/Новый пароль/), 'PortalPass123')
    await user.type(
      screen.getByLabelText(/Подтвердите пароль/),
      'PortalPass123',
    )
    await user.click(screen.getByRole('button', { name: 'Сохранить пароль' }))

    expect(completeAuthenticatedSession).toHaveBeenCalledWith(
      authenticatedSession,
    )
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/app/chat')
    })
    expect(getStoredRegistrationRequest()).toBeNull()
    expect(getStoredRegistrationVerification()).toBeNull()
  })

  it('continues without password and opens chats', async () => {
    const user = userEvent.setup()
    const authenticatedSession = {
      session: {
        expiresAt: '2026-06-10T10:00:00.000Z',
      },
      user: {
        email: 'name@company.ru',
        fullName: 'Portal User',
        id: 7,
        passwordConfigured: false,
      },
    }

    saveRegistrationCompletionFlow()
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        nextStep: 'chat',
        purpose: 'registration',
        result: 'registration_completed',
        ...authenticatedSession,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderForm()

    await user.click(screen.getByRole('button', {
      name: 'Продолжить без пароля',
    }))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/register/skip-password',
      expect.objectContaining({
        body: JSON.stringify({
          continuationToken: 'continuation-token',
          email: 'name@company.ru',
        }),
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(completeAuthenticatedSession).toHaveBeenCalledWith(
      authenticatedSession,
    )
    expect(screen.getByTestId('location')).toHaveTextContent('/app/chat')
    expect(getStoredRegistrationRequest()).toBeNull()
    expect(getStoredRegistrationVerification()).toBeNull()
  })

  it('shows loading state while continuing without password', async () => {
    const user = userEvent.setup()
    const response = createDeferred<Response>()

    saveRegistrationCompletionFlow()
    fetchMock.mockReturnValueOnce(response.promise)
    vi.stubGlobal('fetch', fetchMock)

    renderForm()

    await user.click(screen.getByRole('button', {
      name: 'Продолжить без пароля',
    }))

    expect(screen.getByRole('button', {
      name: 'Переходим...',
    })).toBeDisabled()
    expect(screen.getByRole('button', {
      name: 'Сохранить пароль',
    })).toBeDisabled()

    response.resolve(createJsonResponse({
      nextStep: 'chat',
      purpose: 'registration',
      result: 'registration_completed',
      session: {
        expiresAt: '2026-06-10T10:00:00.000Z',
      },
      user: {
        email: 'name@company.ru',
        fullName: 'Portal User',
        id: 7,
        passwordConfigured: false,
      },
    }))

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/app/chat')
    })
  })

  it('clears verification state when skip continuation is invalid', async () => {
    saveRegistrationCompletionFlow()
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        error: {
          code: 'REGISTRATION_VERIFICATION_CONTINUATION_INVALID',
          message: 'Код больше недействителен.',
        },
      }, 400),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderForm()

    fireEvent.click(screen.getByRole('button', {
      name: 'Продолжить без пароля',
    }))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/register/skip-password',
      expect.any(Object),
    )
    expect(await screen.findByText(/Подтверждение регистрации больше недействительно/, {}, {
      timeout: 500,
    }))
      .toBeInTheDocument()
    expect(screen.getByRole('link', {
      name: 'Вернуться к подтверждению',
    })).toHaveAttribute('href', '/auth/register/verify')
    expect(getStoredRegistrationVerification()).toBeNull()
    expect(completeAuthenticatedSession).not.toHaveBeenCalled()
  })
})
