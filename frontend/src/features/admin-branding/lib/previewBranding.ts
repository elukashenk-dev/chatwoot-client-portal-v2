import type { PublicBranding } from '../../branding/api/publicBrandingClient'
import type { TenantIdentityContextValue } from '../../tenant/lib/tenantIdentityContext'
import type { BrandingDraft } from './brandingState'

export function createPreviewPublicBranding(
  draft: BrandingDraft,
): PublicBranding {
  return {
    assets: draft.assets,
    colors: draft.colors,
    copy: draft.copy,
    layout: draft.layout,
    portalName: draft.portalName,
    supportLabel: draft.supportLabel,
    version: 1,
  }
}

export function createPreviewTenantIdentity(
  draft: BrandingDraft,
): TenantIdentityContextValue {
  return {
    errorMessage: null,
    isUsingCachedData: false,
    status: 'ready',
    tenant: {
      displayName: draft.portalName,
      primaryDomain: 'preview.local',
      publicBaseUrl: 'https://preview.local',
      slug: 'preview',
    },
  }
}
