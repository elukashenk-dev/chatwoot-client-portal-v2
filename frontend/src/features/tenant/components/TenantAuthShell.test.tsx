import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  BrandingContext,
  type BrandingContextValue,
} from '../../branding/lib/brandingContext'
import { TenantIdentityContext } from '../lib/tenantIdentityContext'
import { TenantAuthShell } from './TenantAuthShell'

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

const brandingContextValue: BrandingContextValue = {
  branding: {
    assets: {
      auth_footer_image: {
        assetVersion: '13',
        contentType: 'image/png',
        height: null,
        id: 13,
        kind: 'auth_footer_image',
        publicUrl: '/api/branding/assets/13?v=13',
        width: null,
      },
      auth_header_image: {
        assetVersion: '12',
        contentType: 'image/png',
        height: null,
        id: 12,
        kind: 'auth_header_image',
        publicUrl: '/api/branding/assets/12?v=12',
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
      authContentSurface: '#ffffff',
      authContentSurfaceOpacity: 100,
      authMutedText: '#456179',
      authText: '#0f172a',
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
    portalName: 'ProvGroup',
    supportLabel: 'Поддержка ProvGroup',
    version: 3,
  },
  errorMessage: null,
  status: 'ready',
}

describe('TenantAuthShell', () => {
  it('falls back to the tenant name before public branding is ready', () => {
    render(
      <TenantIdentityContext.Provider value={tenantContextValue}>
        <TenantAuthShell description="Описание страницы" title="Вход">
          <div>Форма</div>
        </TenantAuthShell>
      </TenantIdentityContext.Provider>,
    )

    expect(screen.getByText('Бухфирма')).toBeInTheDocument()
    expect(screen.getByText('БУ')).toBeInTheDocument()
    expect(screen.queryByText('Клиентский портал')).not.toBeInTheDocument()
  })

  it('uses public branding logo and auth images while keeping page copy explicit', () => {
    const { container } = render(
      <TenantIdentityContext.Provider value={tenantContextValue}>
        <BrandingContext.Provider value={brandingContextValue}>
          <TenantAuthShell description="Описание страницы" title="Вход">
            <div>Форма</div>
          </TenantAuthShell>
        </BrandingContext.Provider>
      </TenantIdentityContext.Provider>,
    )

    expect(screen.getByText('ProvGroup')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Логотип ProvGroup' }),
    ).toHaveAttribute('src', '/api/branding/assets/11?v=11')
    expect(screen.getByRole('heading', { name: 'Вход' })).toBeInTheDocument()
    expect(screen.getByText('Описание страницы')).toBeInTheDocument()
    expect(
      container.querySelector('.auth-header-art')?.getAttribute('style'),
    ).toContain('url("/api/branding/assets/12?v=12")')
    expect(
      container.querySelector('.auth-footer-art')?.getAttribute('style'),
    ).toContain('url("/api/branding/assets/13?v=13")')
  })
})
