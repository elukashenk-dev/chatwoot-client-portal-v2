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

function createRepository(settings: unknown = null) {
  return {
    findActiveAssetMetadata: vi.fn().mockResolvedValue({}),
    findSettings: vi.fn().mockResolvedValue(settings),
    upsertSettings: vi.fn().mockImplementation(async (input) => ({
      accentColor: null,
      authBackgroundColor: null,
      authBackgroundImageAssetId: null,
      authFooterImageAssetId: null,
      authHeaderImageAssetId: null,
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
      logoAssetId: null,
      portalName: null,
      primaryColor: null,
      supportLabel: null,
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
        assets: {},
        colors: expect.objectContaining({
          authText: '#0f172a',
          chatHeaderText: '#ffffff',
          chatText: '#334155',
          primary: '#112540',
        }),
        copy: expect.objectContaining({
          authTitle: 'Вход в личный кабинет',
        }),
        portalName: 'Бухфирма',
        supportLabel: 'Команда Бухфирма',
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
          colors: {
            authText: '#223344',
            chatHeaderText: '#f8fafc',
            primary: '#123456',
          },
          copy: {
            authTitle: 'Добро пожаловать',
          },
          portalName: 'Новый портал',
          supportLabel: 'Поддержка',
        },
        requestIp: '127.0.0.1',
        userAgent: 'vitest',
      }),
    ).resolves.toEqual({
      branding: expect.objectContaining({
        colors: expect.objectContaining({
          authText: '#223344',
          chatHeaderText: '#f8fafc',
          primary: '#123456',
        }),
        copy: expect.objectContaining({
          authTitle: 'Добро пожаловать',
        }),
        portalName: 'Новый портал',
        supportLabel: 'Поддержка',
      }),
    })
    expect(repository.upsertSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        authTitle: 'Добро пожаловать',
        authTextColor: '#223344',
        chatHeaderTextColor: '#f8fafc',
        portalName: 'Новый портал',
        primaryColor: '#123456',
        supportLabel: 'Поддержка',
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
      authFooterImageAssetId: null,
      authHeaderImageAssetId: null,
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

  it.each([{}, { colors: {} }, { copy: {} }])(
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
