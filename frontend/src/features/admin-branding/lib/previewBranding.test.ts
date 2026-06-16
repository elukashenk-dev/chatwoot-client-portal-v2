import { describe, expect, it } from 'vitest'

import type { BrandingDraft } from './brandingState'
import {
  createPreviewPublicBranding,
  createPreviewTenantIdentity,
} from './previewBranding'

const draft = {
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
  layout: {
    authBrandPlacement: 'right',
  },
  portalName: 'ProvGroup',
  supportLabel: 'Поддержка ProvGroup',
} satisfies BrandingDraft

describe('previewBranding', () => {
  it('creates public branding from an unsaved admin draft', () => {
    expect(createPreviewPublicBranding(draft)).toEqual({
      appearance: draft.appearance,
      assets: draft.assets,
      colors: draft.colors,
      copy: draft.copy,
      layout: draft.layout,
      portalName: 'ProvGroup',
      supportLabel: 'Поддержка ProvGroup',
      version: 1,
    })
  })

  it('creates a deterministic tenant identity for admin preview', () => {
    expect(createPreviewTenantIdentity(draft)).toEqual({
      errorMessage: null,
      isUsingCachedData: false,
      status: 'ready',
      tenant: {
        displayName: 'ProvGroup',
        primaryDomain: 'preview.local',
        publicBaseUrl: 'https://preview.local',
        slug: 'preview',
      },
    })
  })
})
