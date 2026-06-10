import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  deleteAdminBrandingAsset,
  getAdminBranding,
  updateAdminBranding,
  uploadAdminBrandingAsset,
} from './adminBrandingClient'

const brandingResponse = {
  branding: {
    assets: {},
    colors: {
      accent: '#4676b4',
      authBackground: '#f3f7fc',
      authContentSurface: '#ffffff',
      authContentSurfaceOpacity: 100,
      authMutedText: '#64748b',
      authText: '#0f172a',
      chatBackground: '#ffffff',
      chatHeaderBackground: '#ffffff',
      chatHeaderText: '#0f172a',
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
    portalName: 'Бухфирма',
    supportLabel: 'Команда Бухфирма',
    version: 1,
  },
}

describe('adminBrandingClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('loads admin branding settings through the admin API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue(brandingResponse),
        ok: true,
        status: 200,
      }),
    )

    await expect(getAdminBranding()).resolves.toMatchObject({
      branding: {
        portalName: 'Бухфирма',
      },
    })
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/branding',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
  })

  it('sends only controlled branding settings on update', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue({
          branding: {
            ...brandingResponse.branding,
            colors: {
              ...brandingResponse.branding.colors,
              primary: '#123456',
            },
            copy: {
              ...brandingResponse.branding.copy,
              authTitle: 'Добро пожаловать',
            },
            portalName: 'Новый портал',
            version: 2,
          },
        }),
        ok: true,
        status: 200,
      }),
    )

    await updateAdminBranding({
      colors: {
        authContentSurface: '#f8fafc',
        authContentSurfaceOpacity: 84,
        primary: '#123456',
      },
      copy: { authTitle: 'Добро пожаловать' },
      portalName: 'Новый портал',
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/branding',
      expect.objectContaining({
        body: JSON.stringify({
          colors: {
            authContentSurface: '#f8fafc',
            authContentSurfaceOpacity: 84,
            primary: '#123456',
          },
          copy: { authTitle: 'Добро пожаловать' },
          portalName: 'Новый портал',
        }),
        credentials: 'include',
        method: 'PATCH',
      }),
    )
    const init = vi.mocked(fetch).mock.calls[0]?.[1]

    expect(JSON.parse(String(init?.body))).toEqual(
      expect.objectContaining({
        colors: expect.objectContaining({
          authContentSurface: '#f8fafc',
          authContentSurfaceOpacity: 84,
        }),
      }),
    )
  })

  it('uploads a branding asset as multipart form data', async () => {
    const imageFile = new File(['logo-bytes'], 'logo.png', {
      type: 'image/png',
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue({
          asset: {
            assetVersion: '42',
            contentType: 'image/png',
            height: null,
            id: 42,
            kind: 'logo',
            publicUrl: '/api/branding/assets/42?v=42',
            width: null,
          },
        }),
        ok: true,
        status: 200,
      }),
    )

    await uploadAdminBrandingAsset('logo', imageFile)

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/branding/assets/logo',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    )
    const init = vi.mocked(fetch).mock.calls[0]?.[1]

    expect(init?.body).toBeInstanceOf(FormData)
    expect((init?.body as FormData).get('asset')).toBe(imageFile)
    expect(JSON.stringify(init)).not.toContain('content-type')
  })

  it('deletes an active branding asset by kind', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue({ deleted: true }),
        ok: true,
        status: 200,
      }),
    )

    await deleteAdminBrandingAsset('pwa_icon')

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/branding/assets/pwa_icon',
      expect.objectContaining({
        credentials: 'include',
        method: 'DELETE',
      }),
    )
  })

  it('surfaces backend error payloads with code, message and status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue({
          error: {
            code: 'BRANDING_SETTINGS_EMPTY',
            message: 'Передайте хотя бы одно изменение настроек брендинга.',
          },
        }),
        ok: false,
        status: 400,
      }),
    )

    await expect(updateAdminBranding({})).rejects.toMatchObject({
      code: 'BRANDING_SETTINGS_EMPTY',
      message: 'Передайте хотя бы одно изменение настроек брендинга.',
      statusCode: 400,
    })
  })

  it('uses a Russian fallback message for non-json API errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        headers: new Headers({ 'content-type': 'text/plain' }),
        ok: false,
        status: 502,
      }),
    )

    await expect(getAdminBranding()).rejects.toMatchObject({
      message: 'Мы не смогли выполнить запрос. Попробуйте еще раз чуть позже.',
      statusCode: 502,
    })
  })

  it('uses a Russian fallback message for network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')))

    await expect(getAdminBranding()).rejects.toMatchObject({
      message: 'Мы не смогли выполнить запрос. Попробуйте еще раз чуть позже.',
      statusCode: 0,
    })
  })
})
