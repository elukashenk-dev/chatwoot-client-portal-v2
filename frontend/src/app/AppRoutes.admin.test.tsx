import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from './AppRoutes'
import { renderWithRouter } from '../test/renderWithRouter'

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

function createAdminUnauthorizedResponse() {
  return createJsonResponse(
    {
      error: {
        code: 'TENANT_ADMIN_UNAUTHORIZED',
        message: 'Требуется вход администратора.',
      },
    },
    401,
  )
}

function createAdminSessionResponse() {
  return createJsonResponse({
    admin: {
      chatwootAgentId: 11,
      email: 'admin@example.test',
      role: 'administrator',
    },
    session: {
      expiresAt: '2026-06-07T00:00:00.000Z',
    },
  })
}

function createAdminBrandingResponse() {
  return createJsonResponse({
    branding: {
      appearance: {
        authBackgroundOverlay: 'none',
        authButtonStyle: 'solid',
        authColorScheme: 'light',
        authFieldStyle: 'solid',
      },
      assets: {},
      colors: {
        accent: '#4676b4',
        authBackground: '#f3f7fc',
        authMutedText: '#64748b',
        authText: '#15486b',
        chatBackground: '#ffffff',
        chatHeaderBackground: '#112540',
        chatHeaderText: '#ffffff',
        chatMutedText: '#64748b',
        chatText: '#334155',
        primary: '#112540',
      },
      copy: {
        authSubtitle: 'Введите email и пароль, чтобы продолжить.',
        authTitle: 'Вход в личный кабинет',
        chatEmptyBody: 'Напишите нам, когда будет удобно.',
        chatEmptyTitle: 'Мы на связи',
        chatInfoTitle: 'Информация о чате',
      },
      layout: {
        authBrandPlacement: 'left',
      },
      portalName: 'Бухфирма',
      supportContact: {
        phoneDisplay: '+7 (846) 211-11-11',
        phoneHref: 'tel:+78462111111',
      },
      supportLabel: 'Команда Бухфирма',
      version: 1,
    },
  })
}

function createAdminLegalDocumentsResponse() {
  return createJsonResponse({
    documents: {
      privacy: null,
      terms: null,
    },
  })
}

function createCustomerUnauthorizedResponse() {
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

describe('AppRoutes admin route separation', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('redirects unauthenticated admin root visits to admin login', async () => {
    fetchMock.mockResolvedValueOnce(createAdminUnauthorizedResponse())

    renderRoute('/admin')

    expect(
      await screen.findByRole('heading', { name: 'Вход в админ-консоль' }),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/auth/me',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
  })

  it('renders branding for an authenticated admin session', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/admin/auth/me') {
        return createAdminSessionResponse()
      }

      if (url === '/api/admin/branding') {
        return createAdminBrandingResponse()
      }

      if (url === '/api/admin/legal-documents') {
        return createAdminLegalDocumentsResponse()
      }

      return createJsonResponse({}, 404)
    })

    renderRoute('/admin/branding')

    expect(
      await screen.findByRole('heading', { name: 'Брендинг' }),
    ).toBeInTheDocument()
    expect(await screen.findByLabelText('Название портала')).toHaveValue(
      'Бухфирма',
    )
  })

  it('renders Telegram bridge setup for an authenticated admin session', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/admin/auth/me') {
        return createAdminSessionResponse()
      }

      if (url === '/api/auth/me') {
        return createCustomerUnauthorizedResponse()
      }

      return createJsonResponse({}, 404)
    })

    renderRoute('/admin/integrations/telegram-bridge')

    expect(
      await screen.findByRole('heading', { name: 'Telegram bridge' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Chatwoot inbox URL')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/auth/me',
      expect.anything(),
    )
  })

  it('redirects unauthenticated Telegram bridge admin visits to admin login', async () => {
    fetchMock.mockResolvedValueOnce(createAdminUnauthorizedResponse())

    renderRoute('/admin/integrations/telegram-bridge')

    expect(
      await screen.findByRole('heading', { name: 'Вход в админ-консоль' }),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/auth/me',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/auth/me',
      expect.anything(),
    )
  })

  it('redirects authenticated admin login visits to branding', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/admin/auth/me') {
        return createAdminSessionResponse()
      }

      if (url === '/api/admin/branding') {
        return createAdminBrandingResponse()
      }

      if (url === '/api/admin/legal-documents') {
        return createAdminLegalDocumentsResponse()
      }

      return createJsonResponse({}, 404)
    })

    renderRoute('/admin/login')

    expect(
      await screen.findByRole('heading', { name: 'Брендинг' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Вход в админ-консоль' }),
    ).not.toBeInTheDocument()
  })

  it('does not call the customer session endpoint for admin routes', async () => {
    fetchMock.mockResolvedValueOnce(createAdminUnauthorizedResponse())

    renderRoute('/admin')

    expect(
      await screen.findByRole('heading', { name: 'Вход в админ-консоль' }),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/auth/me',
      expect.anything(),
    )
  })

  it('keeps unknown admin paths on the admin session boundary when unauthenticated', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/admin/auth/me') {
        return createAdminUnauthorizedResponse()
      }

      if (url === '/api/auth/me') {
        return createCustomerUnauthorizedResponse()
      }

      return createJsonResponse({}, 404)
    })

    renderRoute('/admin/unknown')

    expect(
      await screen.findByRole('heading', { name: 'Вход в админ-консоль' }),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/auth/me',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/auth/me',
      expect.anything(),
    )
  })

  it('redirects unknown authenticated admin paths to branding without customer auth', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/admin/auth/me') {
        return createAdminSessionResponse()
      }

      if (url === '/api/admin/branding') {
        return createAdminBrandingResponse()
      }

      if (url === '/api/admin/legal-documents') {
        return createAdminLegalDocumentsResponse()
      }

      if (url === '/api/auth/me') {
        return createCustomerUnauthorizedResponse()
      }

      return createJsonResponse({}, 404)
    })

    renderRoute('/admin/unknown')

    expect(
      await screen.findByRole('heading', { name: 'Брендинг' }),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/auth/me',
      expect.anything(),
    )
  })

  it('does not let admin session open customer app routes', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/admin/auth/me') {
        return createAdminSessionResponse()
      }

      if (url === '/api/auth/me') {
        return createCustomerUnauthorizedResponse()
      }

      return createJsonResponse({}, 404)
    })

    renderRoute('/app/chat')

    expect(
      await screen.findByRole('heading', { name: 'ВХОД ДЛЯ КЛИЕНТОВ' }),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/admin/auth/me',
      expect.anything(),
    )
  })

  it('keeps public customer auth routes on the customer session boundary', async () => {
    fetchMock.mockResolvedValueOnce(createCustomerUnauthorizedResponse())

    renderRoute('/auth/login')

    expect(
      await screen.findByRole('heading', { name: 'ВХОД ДЛЯ КЛИЕНТОВ' }),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/admin/auth/me',
      expect.anything(),
    )
  })
})
