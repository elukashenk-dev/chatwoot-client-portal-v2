import { afterEach, describe, expect, it, vi } from 'vitest'

import { getPublicBranding, type PublicBranding } from './publicBrandingClient'

const brandingResponse = {
  branding: {
    appearance: {
      authBackgroundOverlay: 'dark',
      authButtonStyle: 'gradient',
      authColorScheme: 'dark',
      authFieldStyle: 'outline',
    },
    assets: {
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
      authBrandPlacement: 'left',
    },
    portalName: 'ProvGroup',
    supportLabel: 'Поддержка ProvGroup',
    version: 3,
  },
} satisfies { branding: PublicBranding }

describe('publicBrandingClient', () => {
  const fetchMock = vi.fn<typeof fetch>()

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('loads tenant public branding through the public API', async () => {
    vi.stubGlobal(
      'fetch',
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(brandingResponse), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      ),
    )

    await expect(getPublicBranding()).resolves.toEqual(
      brandingResponse.branding,
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/branding',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'include',
        method: 'GET',
      }),
    )
  })

  it('returns a controlled error when public branding cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'TENANT_NOT_FOUND',
              message: 'Брендинг для этого домена недоступен.',
            },
          }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 404,
          },
        ),
      ),
    )

    await expect(getPublicBranding()).rejects.toMatchObject({
      code: 'TENANT_NOT_FOUND',
      message: 'Брендинг для этого домена недоступен.',
      statusCode: 404,
    })
  })
})
