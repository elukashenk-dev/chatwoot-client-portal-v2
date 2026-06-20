import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from './AppRoutes'
import { renderWithRouter } from '../test/renderWithRouter'

const chatPageRenderMock = vi.hoisted(() => vi.fn())

vi.mock('../features/chat/pages/ChatPage', () => ({
  ChatPage: () => {
    chatPageRenderMock()

    return <h1>Lazy chat route</h1>
  },
}))

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

function createUnauthorizedResponse() {
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

function renderRoute(initialEntry: string) {
  renderWithRouter(<AppRoutes />, { initialEntries: [initialEntry] })
}

describe('AppRoutes chat route', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    fetchMock.mockReset()
  })

  it('lazy-loads and renders chat for an authenticated app route', async () => {
    fetchMock.mockResolvedValueOnce(createAuthenticatedSessionResponse())

    renderRoute('/app/chat')

    expect(await screen.findByRole('heading', { name: 'Lazy chat route' }))
      .toBeInTheDocument()
    expect(chatPageRenderMock).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
  })

  it('keeps the protected app index redirect pointing at chat', async () => {
    fetchMock.mockResolvedValueOnce(createAuthenticatedSessionResponse())

    renderRoute('/app')

    expect(await screen.findByRole('heading', { name: 'Lazy chat route' }))
      .toBeInTheDocument()
    expect(chatPageRenderMock).toHaveBeenCalled()
  })

  it('redirects unauthenticated chat visits to login without rendering chat', async () => {
    fetchMock.mockResolvedValueOnce(createUnauthorizedResponse())

    renderRoute('/app/chat')

    expect(
      await screen.findByRole('heading', { name: 'ВХОД ДЛЯ КЛИЕНТОВ' }),
    ).toBeInTheDocument()
    expect(chatPageRenderMock).not.toHaveBeenCalled()
  })
})
