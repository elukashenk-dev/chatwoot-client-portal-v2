import { describe, expect, it, vi } from 'vitest'

import type { PublicTenantAdmin } from '../tenant-admin/adminAuthService.js'
import { createBrandingService } from './service.js'

const tenant = {
  displayName: 'Бухфирма',
  id: 3,
  primaryDomain: 'buhfirma.example.test',
  publicBaseUrl: 'https://buhfirma.example.test',
  slug: 'buhfirma',
}

const admin = {
  chatwootAgentId: 42,
  email: 'admin@example.test',
  role: 'administrator',
} satisfies PublicTenantAdmin

const defaultAppearance = {
  authBackgroundOverlay: 'none',
  authButtonStyle: 'solid',
  authColorScheme: 'light',
  authFieldStyle: 'solid',
}

function createRepository(settings: unknown = null) {
  return {
    findActiveAssetMetadata: vi.fn().mockResolvedValue({}),
    findSettings: vi.fn().mockResolvedValue(settings),
    upsertSettings: vi.fn().mockImplementation(async (input) => ({
      accentColor: null,
      authBackgroundColor: null,
      authBackgroundImageAssetId: null,
      authMutedTextColor: null,
      authSubtitle: null,
      authTextColor: null,
      authTitle: null,
      chatBackgroundColor: null,
      chatBackgroundImageAssetId: null,
      chatEmptyBody: null,
      chatEmptyTitle: null,
      chatHeaderBackgroundColor: null,
      chatHeaderBackgroundImageAssetId: null,
      chatHeaderTextColor: null,
      chatInfoTitle: null,
      chatMutedTextColor: null,
      chatTextColor: null,
      authBrandPlacement: null,
      logoAssetId: null,
      portalName: null,
      primaryColor: null,
      supportLabel: null,
      supportPhoneDisplay: null,
      updatedAt: new Date('2026-06-07T00:00:00Z'),
      version: 2,
      ...input,
    })),
  }
}

describe('createBrandingService', () => {
  it('returns default public branding without leaking asset object keys', async () => {
    const repository = createRepository()
    const service = createBrandingService({
      audit: vi.fn(),
      repository,
      tenant,
    })

    await expect(service.getPublicBranding()).resolves.toEqual({
      branding: expect.objectContaining({
        appearance: defaultAppearance,
        assets: {},
        colors: expect.objectContaining({
          authBackground: '#f3f7fc',
          authText: '#15486b',
          chatHeaderBackground: '#ffffff',
          chatHeaderText: '#0f172a',
          chatText: '#334155',
          primary: '#112540',
        }),
        copy: expect.objectContaining({
          authTitle: 'ВХОД ДЛЯ КЛИЕНТОВ',
        }),
        layout: {
          authBrandPlacement: 'center',
        },
        portalName: 'Бухфирма',
        supportContact: {
          phoneDisplay: null,
          phoneHref: null,
        },
        supportLabel: 'Команда Бухфирма',
      }),
    })
  })

  it('returns default admin branding appearance', async () => {
    const repository = createRepository()
    const service = createBrandingService({
      audit: vi.fn(),
      repository,
      tenant,
    })

    await expect(service.getAdminBranding()).resolves.toEqual({
      branding: expect.objectContaining({
        appearance: defaultAppearance,
      }),
    })
  })

  it('validates and saves admin branding updates with audit event', async () => {
    const audit = vi.fn()
    const repository = createRepository()
    const service = createBrandingService({
      audit,
      repository,
      tenant,
    })

    await expect(
      service.updateAdminBranding({
        admin,
        input: {
          appearance: {
            authBackgroundOverlay: 'dark',
            authButtonStyle: 'gradient',
            authColorScheme: 'dark',
            authFieldStyle: 'outline',
          },
          colors: {
            authText: '#223344',
            chatHeaderText: '#f8fafc',
            primary: '#123456',
          },
          copy: {
            authTitle: 'Добро пожаловать',
          },
          layout: {
            authBrandPlacement: 'right',
          },
          portalName: 'Новый портал',
          supportLabel: 'Поддержка',
          supportPhoneDisplay: '+7 (846) 211-11-11',
        },
        requestIp: '127.0.0.1',
        userAgent: 'vitest',
      }),
    ).resolves.toEqual({
      branding: expect.objectContaining({
        appearance: {
          authBackgroundOverlay: 'dark',
          authButtonStyle: 'gradient',
          authColorScheme: 'dark',
          authFieldStyle: 'outline',
        },
        colors: expect.objectContaining({
          authText: '#223344',
          chatHeaderText: '#f8fafc',
          primary: '#123456',
        }),
        copy: expect.objectContaining({
          authTitle: 'Добро пожаловать',
        }),
        layout: {
          authBrandPlacement: 'right',
        },
        portalName: 'Новый портал',
        supportContact: {
          phoneDisplay: '+7 (846) 211-11-11',
          phoneHref: 'tel:+78462111111',
        },
        supportLabel: 'Поддержка',
      }),
    })
    expect(repository.upsertSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        authBackgroundOverlay: 'dark',
        authButtonStyle: 'gradient',
        authColorScheme: 'dark',
        authFieldStyle: 'outline',
        authBrandPlacement: 'right',
        authTitle: 'Добро пожаловать',
        authTextColor: '#223344',
        chatHeaderTextColor: '#f8fafc',
        portalName: 'Новый портал',
        primaryColor: '#123456',
        supportLabel: 'Поддержка',
        supportPhoneDisplay: '+7 (846) 211-11-11',
      }),
    )
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'branding_settings_updated',
        actor: admin,
        outcome: 'success',
        subjectEmail: 'admin@example.test',
      }),
    )
  })

  it('uses readable chat header text fallback for existing header backgrounds', async () => {
    const repository = createRepository({
      accentColor: null,
      authBackgroundColor: null,
      authBackgroundImageAssetId: null,
      authMutedTextColor: null,
      authSubtitle: null,
      authTextColor: null,
      authTitle: null,
      chatBackgroundColor: null,
      chatBackgroundImageAssetId: null,
      chatEmptyBody: null,
      chatEmptyTitle: null,
      chatHeaderBackgroundColor: '#f8fafc',
      chatHeaderBackgroundImageAssetId: null,
      chatHeaderTextColor: null,
      chatInfoTitle: null,
      chatMutedTextColor: null,
      chatTextColor: null,
      authBrandPlacement: null,
      logoAssetId: null,
      portalName: null,
      primaryColor: null,
      supportLabel: null,
      updatedAt: new Date('2026-06-07T00:00:00Z'),
      version: 2,
    })
    const service = createBrandingService({
      audit: vi.fn(),
      repository,
      tenant,
    })

    await expect(service.getPublicBranding()).resolves.toEqual({
      branding: expect.objectContaining({
        colors: expect.objectContaining({
          chatHeaderBackground: '#f8fafc',
          chatHeaderText: '#0f172a',
        }),
      }),
    })
  })

  it('rejects unsafe colors before repository write', async () => {
    const repository = createRepository()
    const service = createBrandingService({
      audit: vi.fn(),
      repository,
      tenant,
    })

    await expect(
      service.updateAdminBranding({
        admin,
        input: {
          colors: {
            primary: 'javascript:alert(1)',
          },
        },
        requestIp: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({
      code: 'BRANDING_SETTINGS_INVALID',
      statusCode: 400,
    })
    expect(repository.upsertSettings).not.toHaveBeenCalled()
  })

  it('rejects invalid support phone before repository write', async () => {
    const repository = createRepository()
    const service = createBrandingService({
      audit: vi.fn(),
      repository,
      tenant,
    })

    await expect(
      service.updateAdminBranding({
        admin,
        input: {
          supportPhoneDisplay: '846 211',
        },
        requestIp: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({
      code: 'BRANDING_SETTINGS_INVALID',
      statusCode: 400,
    })
    expect(repository.upsertSettings).not.toHaveBeenCalled()
  })

  it.each([
    { authContentSurface: '#ffffff' },
    { authContentSurfaceOpacity: 100 },
  ])('rejects removed auth surface branding color %#', async (colors) => {
    const repository = createRepository()
    const service = createBrandingService({
      audit: vi.fn(),
      repository,
      tenant,
    })

    await expect(
      service.updateAdminBranding({
        admin,
        input: {
          colors,
        },
        requestIp: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({
      code: 'BRANDING_SETTINGS_INVALID',
      statusCode: 400,
    })
    expect(repository.upsertSettings).not.toHaveBeenCalled()
  })

  it.each(['top', 'bottom', '', null, 42])(
    'rejects invalid auth brand placement %#',
    async (authBrandPlacement) => {
      const repository = createRepository()
      const service = createBrandingService({
        audit: vi.fn(),
        repository,
        tenant,
      })

      await expect(
        service.updateAdminBranding({
          admin,
          input: {
            layout: {
              authBrandPlacement,
            },
          },
          requestIp: null,
          userAgent: null,
        }),
      ).rejects.toMatchObject({
        code: 'BRANDING_SETTINGS_INVALID',
        statusCode: 400,
      })
      expect(repository.upsertSettings).not.toHaveBeenCalled()
    },
  )

  it.each([
    [{ authColorScheme: 'auto' }],
    [{ authBackgroundOverlay: 'heavy' }],
    [{ authFieldStyle: 'glassmorphism' }],
    [{ authButtonStyle: 'image' }],
  ])('rejects invalid auth appearance %#', async (appearance) => {
    const repository = createRepository()
    const service = createBrandingService({
      audit: vi.fn(),
      repository,
      tenant,
    })

    await expect(
      service.updateAdminBranding({
        admin,
        input: { appearance },
        requestIp: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({
      code: 'BRANDING_SETTINGS_INVALID',
      statusCode: 400,
    })
    expect(repository.upsertSettings).not.toHaveBeenCalled()
  })

  it.each([{}, { colors: {} }, { copy: {} }, { layout: {} }])(
    'rejects empty admin branding updates without repository write %#',
    async (input) => {
      const repository = createRepository()
      const service = createBrandingService({
        audit: vi.fn(),
        repository,
        tenant,
      })

      await expect(
        service.updateAdminBranding({
          admin,
          input,
          requestIp: null,
          userAgent: null,
        }),
      ).rejects.toMatchObject({
        code: 'BRANDING_SETTINGS_EMPTY',
        statusCode: 400,
      })
      expect(repository.upsertSettings).not.toHaveBeenCalled()
    },
  )
})
