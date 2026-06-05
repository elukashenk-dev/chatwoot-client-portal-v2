import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from './AppRoutes'
import {
  AuthSessionContext,
  type AuthSessionContextValue,
} from '../features/auth/lib/authSessionContext'
import { getCurrentUserProfile } from '../features/profile/api/profileClient'
import { renderWithRouter } from '../test/renderWithRouter'

vi.mock('../features/profile/api/profileClient', async () => {
  const actual = await vi.importActual<
    typeof import('../features/profile/api/profileClient')
  >('../features/profile/api/profileClient')

  return {
    ...actual,
    getCurrentUserProfile: vi.fn(),
  }
})

const getCurrentUserProfileMock = vi.mocked(getCurrentUserProfile)

const authSession: AuthSessionContextValue = {
  errorMessage: null,
  localDeviceDataRemovalAvailable: false,
  refreshSession: vi.fn(),
  removeLocalDeviceData: vi.fn(),
  sessionSource: 'online',
  signIn: vi.fn(),
  signOut: vi.fn(),
  status: 'authenticated',
  user: {
    email: 'name@group.ru',
    fullName: 'Portal User',
    id: 7,
  },
}

function renderProfileRoute() {
  renderWithRouter(
    <AuthSessionContext.Provider value={authSession}>
      <AppRoutes />
    </AuthSessionContext.Provider>,
    { initialEntries: ['/app/profile'] },
  )
}

describe('AppRoutes profile route', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the profile page under the protected app shell', async () => {
    getCurrentUserProfileMock.mockResolvedValueOnce({
      avatarUrl: null,
      email: 'name@group.ru',
      fullName: 'Portal User',
      phoneNumber: '+79991234567',
      result: 'ready',
    })

    renderProfileRoute()

    expect(
      await screen.findByRole('heading', { name: 'Профиль' }),
    ).toBeInTheDocument()
    expect(getCurrentUserProfileMock).toHaveBeenCalled()
  })
})
