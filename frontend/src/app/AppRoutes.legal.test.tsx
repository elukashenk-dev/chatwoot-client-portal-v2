import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import App from './App'
import { renderWithRouter } from '../test/renderWithRouter'
import { AppRoutes } from './AppRoutes'
import { LegalDocumentPage } from '../features/legal/pages/LegalDocumentPage'

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

describe('legal routes', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const brandingResponse = {
    branding: {
      appearance: {
        authBackgroundOverlay: 'none',
        authButtonStyle: 'solid',
        authColorScheme: 'light',
        authFieldStyle: 'solid',
      },
      assets: {
        logo: {
          assetVersion: '11',
          contentType: 'image/png',
          height: 48,
          id: 11,
          kind: 'logo',
          publicUrl: '/api/branding/assets/11?v=11',
          width: 120,
        },
      },
      colors: {
        accent: '#14b8a6',
        authBackground: '#ecfeff',
        authMutedText: '#456179',
        authText: '#15486b',
        chatBackground: '#f8fafc',
        chatHeaderBackground: '#0f766e',
        chatHeaderText: '#f8fafc',
        chatMutedText: '#52637a',
        chatText: '#1f2937',
        primary: '#134e4a',
      },
      copy: {
        authSubtitle: 'Войдите в кабинет ProvGroup.',
        authTitle: 'Кабинет ProvGroup',
        chatEmptyBody: 'Напишите вопрос, мы ответим здесь.',
        chatEmptyTitle: 'Начните диалог',
        chatInfoTitle: 'О диалоге',
      },
      layout: {
        authBrandPlacement: 'center',
      },
      portalName: 'ProvGroup',
      supportContact: {
        phoneDisplay: '+7 (846) 211-11-11',
        phoneHref: 'tel:+78462111111',
      },
      supportLabel: 'Поддержка ProvGroup',
      version: 3,
    },
  }

  function createLegalDocumentResponse(documentType: 'privacy' | 'terms') {
    const isTerms = documentType === 'terms'

    return {
      document: {
        bodyText: isTerms
          ? 'Текст пользовательского соглашения.\n\nВторой пункт соглашения.'
          : 'Текст политики обработки персональных данных.\n\nВторой пункт политики.',
        documentType,
        title: isTerms
          ? 'Пользовательское соглашение'
          : 'Политика обработки персональных данных',
        version: isTerms ? 'terms-upload-v7' : 'privacy-upload-v9',
      },
    }
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/branding') {
        return createJsonResponse(brandingResponse, 200)
      }

      if (url === '/api/legal-documents/terms') {
        return createJsonResponse(createLegalDocumentResponse('terms'), 200)
      }

      if (url === '/api/legal-documents/privacy') {
        return createJsonResponse(createLegalDocumentResponse('privacy'), 200)
      }

      return createJsonResponse({}, 404)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
    fetchMock.mockReset()
  })

  it('renders public legal pages from the full app without tenant bootstrap', async () => {
    window.history.pushState(null, '', '/legal/terms')
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/branding') {
        return createJsonResponse(brandingResponse, 200)
      }

      if (url === '/api/legal-documents/terms') {
        return createJsonResponse(createLegalDocumentResponse('terms'), 200)
      }

      if (url === '/api/tenant') {
        return createJsonResponse(
          {
            error: {
              code: 'TENANT_NOT_FOUND',
              message: 'Tenant not found.',
            },
          },
          404,
        )
      }

      return createJsonResponse({}, 404)
    })

    render(<App />)

    expect(
      await screen.findByRole('heading', {
        name: 'Пользовательское соглашение',
      }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('Текст пользовательского соглашения.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Версия документа: terms-upload-v7')).toHaveClass(
      'legal-document-version',
    )
    expect(fetchMock).not.toHaveBeenCalledWith('/api/tenant', expect.anything())
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/branding',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(
      await screen.findByRole('img', { name: 'Логотип ProvGroup' }),
    ).toHaveAttribute('src', '/api/branding/assets/11?v=11')
  })

  it.each([
    ['/legal/terms', 'Пользовательское соглашение'],
    ['/legal/privacy', 'Политика обработки персональных данных'],
  ])('renders %s without an authenticated session', async (path, heading) => {
    renderWithRouter(<AppRoutes />, { initialEntries: [path] })

    expect(
      await screen.findByRole('heading', { name: heading }),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/legal-documents/${path.endsWith('terms') ? 'terms' : 'privacy'}`,
      expect.objectContaining({ method: 'GET' }),
    )
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
    expect(
      screen.getByText('Текст политики обработки персональных данных.'),
    ).toBeInTheDocument()
    expect(document.querySelector('.legal-document-canvas')).toHaveClass(
      'auth-canvas-background',
    )
    expect(document.querySelector('.legal-document-reader')).toBeInTheDocument()
    expect(document.querySelector('.legal-document-brand')).toHaveClass(
      'auth-brand-mark',
    )
    expect(screen.getByRole('link', { name: 'Назад' })).toHaveClass(
      'legal-document-back-link',
    )
    expect(screen.getByText(/Версия документа:/)).toHaveClass(
      'legal-document-version',
    )
    expect(screen.queryByLabelText('Помощь со входом')).not.toBeInTheDocument()
  })

  it('keeps long legal document pages scrollable in the auth viewport', async () => {
    renderWithRouter(<AppRoutes />, { initialEntries: ['/legal/privacy'] })

    expect(
      await screen.findByRole('heading', {
        name: 'Политика обработки персональных данных',
      }),
    ).toBeInTheDocument()

    const canvas = document.querySelector('.legal-document-canvas')

    expect(canvas).toHaveClass('shrink-0')
    expect(canvas).not.toHaveClass('overflow-hidden')
  })

  it('returns to the previous page from the legal reader back link', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter
        initialEntries={[
          '/auth/register',
          {
            pathname: '/legal/privacy',
            state: { legalBackMode: 'history' },
          },
        ]}
        initialIndex={1}
      >
        <Routes>
          <Route
            element={<LegalDocumentPage document="privacy" />}
            path="/legal/privacy"
          />
          <Route element={<p>register page</p>} path="/auth/register" />
          <Route element={<p>login page</p>} path="/auth/login" />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('link', { name: 'Назад' }))

    expect(screen.getByText('register page')).toBeInTheDocument()
    expect(screen.queryByText('login page')).not.toBeInTheDocument()
  })

  it('uses the login fallback when the legal reader is opened directly', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/legal/privacy']}>
        <Routes>
          <Route
            element={<LegalDocumentPage document="privacy" />}
            path="/legal/privacy"
          />
          <Route element={<p>login page</p>} path="/auth/login" />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('link', { name: 'Назад' }))

    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('keeps legal pages reachable when a customer session exists', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/legal-documents/privacy') {
        return createJsonResponse(createLegalDocumentResponse('privacy'), 200)
      }

      if (url === '/api/branding') {
        return createJsonResponse(brandingResponse, 200)
      }

      return createJsonResponse(
        {
          tenant: { id: 'tenant-demo', name: 'Demo' },
          user: { email: 'user@example.com', id: 'user-demo', name: 'User' },
        },
        200,
      )
    })

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
