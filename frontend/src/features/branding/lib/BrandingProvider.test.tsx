import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TenantIdentityContext } from '../../tenant/lib/tenantIdentityContext'
import { BrandingProvider } from './BrandingProvider'
import { useBranding } from './useBranding'

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

const tenantContextValue = {
  errorMessage: null,
  isUsingCachedData: false,
  status: 'ready' as const,
  tenant: {
    displayName: 'Бухфирма',
    primaryDomain: 'lk.buhfirma.ru',
    publicBaseUrl: 'https://lk.buhfirma.ru',
    slug: 'buhfirma',
  },
}

const publicBrandingResponse = {
  branding: {
    assets: {
      auth_background_image: {
        assetVersion: '12',
        contentType: 'image/png',
        height: null,
        id: 12,
        kind: 'auth_background_image',
        publicUrl: '/api/branding/assets/12?v=12',
        width: null,
      },
      chat_background_image: {
        assetVersion: '13',
        contentType: 'image/png',
        height: null,
        id: 13,
        kind: 'chat_background_image',
        publicUrl: '/api/branding/assets/13?v=13',
        width: null,
      },
      logo: {
        assetVersion: '11',
        contentType: 'image/png',
        height: null,
        id: 11,
        kind: 'logo',
        publicUrl: '/api/branding/assets/11?v=11',
        width: null,
      },
    },
    colors: {
      accent: '#14b8a6',
      authBackground: '#ecfeff',
      chatBackground: '#f8fafc',
      chatHeaderBackground: '#0f766e',
      primary: '#134e4a',
    },
    copy: {
      authSubtitle: 'Войдите в кабинет ProvGroup.',
      authTitle: 'Кабинет ProvGroup',
      chatEmptyBody: 'Напишите вопрос, мы ответим здесь.',
      chatEmptyTitle: 'Начните диалог',
      chatInfoTitle: 'О диалоге',
    },
    portalName: 'ProvGroup',
    supportLabel: 'Поддержка ProvGroup',
    version: 3,
  },
}

function BrandingProbe() {
  const { branding, status } = useBranding()

  return (
    <div>
      <span>{status}</span>
      <span>{branding.portalName}</span>
      <span>{branding.copy.authTitle}</span>
    </div>
  )
}

describe('BrandingProvider', () => {
  const fetchMock = vi.fn<typeof fetch>()

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    fetchMock.mockReset()
    document.title = ''
    document.head.innerHTML = ''
  })

  it('loads public branding and exposes runtime CSS variables', async () => {
    document.head.innerHTML = '<meta name="theme-color" content="#112540">'
    vi.stubGlobal(
      'fetch',
      fetchMock.mockResolvedValueOnce(
        createJsonResponse(publicBrandingResponse),
      ),
    )

    const { container } = render(
      <TenantIdentityContext.Provider value={tenantContextValue}>
        <BrandingProvider>
          <BrandingProbe />
        </BrandingProvider>
      </TenantIdentityContext.Provider>,
    )

    expect(await screen.findByText('ProvGroup')).toBeInTheDocument()
    expect(screen.getByText('ready')).toBeInTheDocument()
    expect(screen.getByText('Кабинет ProvGroup')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/branding',
      expect.objectContaining({ method: 'GET' }),
    )

    const scope = container.querySelector('.portal-branding-scope')
    expect(scope).not.toBeNull()
    expect(scope).toHaveStyle({
      '--portal-auth-background-color': '#ecfeff',
      '--portal-chat-background-color': '#f8fafc',
      '--portal-chat-header-background-color': '#0f766e',
    })
    expect(scope?.getAttribute('style')).toContain(
      '--portal-auth-background-image: url("/api/branding/assets/12?v=12")',
    )
    expect(scope?.getAttribute('style')).toContain(
      '--portal-chat-background-image: url("/api/branding/assets/13?v=13")',
    )
    expect(
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content'),
    ).toBe('#134e4a')
  })

  it('keeps tenant-derived fallback branding when public branding fails', async () => {
    vi.stubGlobal(
      'fetch',
      fetchMock.mockRejectedValueOnce(new Error('offline')),
    )

    render(
      <TenantIdentityContext.Provider value={tenantContextValue}>
        <BrandingProvider>
          <BrandingProbe />
        </BrandingProvider>
      </TenantIdentityContext.Provider>,
    )

    expect(await screen.findByText('fallback')).toBeInTheDocument()
    expect(screen.getByText('Бухфирма')).toBeInTheDocument()
  })
})
