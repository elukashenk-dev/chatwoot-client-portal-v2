import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from './AppRoutes'
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

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

function createAuthenticatedSessionResponse() {
  return createJsonResponse({
    session: {
      expiresAt: '2026-06-10T10:00:00.000Z',
    },
    user: {
      email: 'name@group.ru',
      fullName: 'Portal User',
      id: 7,
    },
  })
}

function renderProfileRoute() {
  renderWithRouter(<AppRoutes />, { initialEntries: ['/app/profile'] })
}

describe('AppRoutes profile route', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    fetchMock.mockReset()
  })

  it('renders the profile page under the protected app shell', async () => {
    fetchMock.mockResolvedValueOnce(createAuthenticatedSessionResponse())
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
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
    expect(getCurrentUserProfileMock).toHaveBeenCalled()
  })
})
