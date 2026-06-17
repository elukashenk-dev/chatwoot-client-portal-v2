import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { renderWithRouter } from '../test/renderWithRouter'
import { AppRoutes } from './AppRoutes'

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

describe('legal routes', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
    fetchMock.mockReset()
  })

  it('renders public legal pages from the full app without tenant bootstrap', async () => {
    window.history.pushState(null, '', '/legal/terms')
    fetchMock.mockResolvedValue(
      createJsonResponse(
        {
          error: {
            code: 'TENANT_NOT_FOUND',
            message: 'Tenant not found.',
          },
        },
        404,
      ),
    )

    render(<App />)

    expect(
      await screen.findByRole('heading', {
        name: 'Пользовательское соглашение',
      }),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/tenant',
      expect.anything(),
    )
  })

  it.each([
    ['/legal/terms', 'Пользовательское соглашение'],
    ['/legal/privacy', 'Политика обработки персональных данных'],
  ])('renders %s without an authenticated session', async (path, heading) => {
    renderWithRouter(<AppRoutes />, { initialEntries: [path] })

    expect(
      await screen.findByRole('heading', { name: heading }),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/auth/me',
      expect.anything(),
    )
  })

  it('renders legal documents as an auth legal reader', async () => {
    renderWithRouter(<AppRoutes />, { initialEntries: ['/legal/privacy'] })

    expect(
      await screen.findByRole('heading', {
        name: 'Политика обработки персональных данных',
      }),
    ).toHaveClass('legal-document-title')
    expect(document.querySelector('.legal-document-canvas')).toHaveClass(
      'auth-canvas-background',
    )
    expect(document.querySelector('.legal-document-reader')).toBeInTheDocument()
    expect(document.querySelector('.legal-document-brand')).toHaveClass(
      'auth-brand-mark',
    )
    expect(
      screen.getByRole('link', { name: 'Вернуться ко входу' }),
    ).toHaveClass('legal-document-back-link')
    expect(screen.getByText(/Версия документа:/)).toHaveClass(
      'legal-document-version',
    )
    expect(screen.getByLabelText('Помощь со входом')).toHaveClass(
      'auth-flow-support',
    )
  })

  it('keeps legal pages reachable when a customer session exists', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(
        {
          tenant: { id: 'tenant-demo', name: 'Demo' },
          user: { email: 'user@example.com', id: 'user-demo', name: 'User' },
        },
        200,
      ),
    )

    renderWithRouter(<AppRoutes />, {
      initialEntries: ['/legal/privacy'],
    })

    expect(
      await screen.findByRole('heading', {
        name: 'Политика обработки персональных данных',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Чат поддержки')).not.toBeInTheDocument()
  })
})
