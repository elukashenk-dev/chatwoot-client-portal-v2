import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TenantAuthShell } from '../components/TenantAuthShell'
import { TenantProvider } from './TenantProvider'
import { createTenantMonogram } from './tenantIdentityMetadata'
import { useTenantIdentity } from './useTenantIdentity'

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

function TenantProbe() {
  const { status, tenant } = useTenantIdentity()

  return (
    <div>
      <span>{status}</span>
      <span>{tenant?.displayName ?? 'no tenant'}</span>
    </div>
  )
}

function appendMetadata(name: string, content = '') {
  const meta = document.createElement('meta')

  meta.setAttribute('name', name)
  meta.setAttribute('content', content)
  document.head.append(meta)
}

describe('TenantProvider', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    document.head.innerHTML = ''
    document.title = 'Клиентский портал'
    appendMetadata('application-name')
    appendMetadata('apple-mobile-web-app-title')
    appendMetadata('description')
    appendMetadata('theme-color')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('loads public tenant context and applies document metadata', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        tenant: {
          displayName: 'Бухфирма',
          primaryDomain: 'lk.buhfirma.ru',
          publicBaseUrl: 'https://lk.buhfirma.ru',
          slug: 'buhfirma',
        },
      }),
    )

    render(
      <TenantProvider>
        <TenantProbe />
        <TenantAuthShell description="Описание" title="Клиентский портал">
          <div />
        </TenantAuthShell>
      </TenantProvider>,
    )

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tenant',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'include',
        method: 'GET',
      }),
    )
    expect(await screen.findAllByText('Бухфирма')).toHaveLength(2)
    expect(screen.getByText('БУ')).toBeInTheDocument()
    expect(document.title).toBe('Бухфирма Личный кабинет')
    expect(
      document
        .querySelector('meta[name="application-name"]')
        ?.getAttribute('content'),
    ).toBe('Бухфирма Личный кабинет')
    expect(
      document
        .querySelector('meta[name="apple-mobile-web-app-title"]')
        ?.getAttribute('content'),
    ).toBe('Бухфирма')
    expect(
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content'),
    ).toBe('#112540')
  })

  it('keeps fallback branding when tenant context is unavailable', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'TENANT_NOT_FOUND',
            message: 'Личный кабинет для этого домена не найден.',
          },
        },
        404,
      ),
    )

    render(
      <TenantProvider>
        <TenantProbe />
        <TenantAuthShell description="Описание" title="Клиентский портал">
          <div />
        </TenantAuthShell>
      </TenantProvider>,
    )

    expect(await screen.findByText('error')).toBeInTheDocument()
    expect(screen.getAllByText('Клиентский портал')).not.toHaveLength(0)
    expect(screen.getByText('ЛК')).toBeInTheDocument()
    expect(document.title).toBe('Клиентский портал')
  })

  it('creates readable monograms from tenant names', () => {
    expect(createTenantMonogram('Бухгалтерская Фирма')).toBe('БФ')
    expect(createTenantMonogram('Zubi')).toBe('ZU')
    expect(createTenantMonogram('')).toBe('ЛК')
  })
})
