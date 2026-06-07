import { afterEach, describe, expect, it, vi } from 'vitest'

import { getAdminBranding, updateAdminBranding } from './adminBrandingClient'

const brandingResponse = {
  branding: {
    assets: {},
    colors: {
      accent: '#4676b4',
      authBackground: '#f3f7fc',
      chatBackground: '#ffffff',
      chatHeaderBackground: '#112540',
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
      colors: { primary: '#123456' },
      copy: { authTitle: 'Добро пожаловать' },
      portalName: 'Новый портал',
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/branding',
      expect.objectContaining({
        body: JSON.stringify({
          colors: { primary: '#123456' },
          copy: { authTitle: 'Добро пожаловать' },
          portalName: 'Новый портал',
        }),
        credentials: 'include',
        method: 'PATCH',
      }),
    )
  })
})
