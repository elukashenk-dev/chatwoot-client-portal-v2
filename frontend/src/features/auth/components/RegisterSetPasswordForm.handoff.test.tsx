import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AuthSessionContextValue } from '../lib/authSessionContext'
import { AuthSessionContext } from '../lib/authSessionContext'
import {
  clearRegistrationFlow,
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

  afterEach(() => {
    clearRegistrationFlow()
    completeAuthenticatedSession.mockClear()
    fetchMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('hydrates auth context after password registration completion', async () => {
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
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        nextStep: 'chat',
        purpose: 'registration',
        result: 'registration_completed',
        ...authenticatedSession,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <AuthSessionContext.Provider value={authSession}>
          <RegisterSetPasswordForm />
        </AuthSessionContext.Provider>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/Новый пароль/), 'PortalPass123')
    await user.type(
      screen.getByLabelText(/Подтвердите пароль/),
      'PortalPass123',
    )
    await user.click(screen.getByRole('button', { name: 'Сохранить пароль' }))

    expect(completeAuthenticatedSession).toHaveBeenCalledWith(
      authenticatedSession,
    )
    expect(await screen.findByText(/Пароль сохранен для name@company.ru/))
      .toBeInTheDocument()
  })
})
