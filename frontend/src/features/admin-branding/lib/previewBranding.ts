import type { PublicBranding } from '../../branding/api/publicBrandingClient'
import type { TenantIdentityContextValue } from '../../tenant/lib/tenantIdentityContext'
import type { BrandingDraft } from './brandingState'

function createSupportContact(phoneDisplay: string) {
  const display = phoneDisplay.trim()

  if (!display) {
    return {
      phoneDisplay: null,
      phoneHref: null,
    }
  }

  const digits = display.replace(/\D/gu, '')
  const normalized = display.startsWith('+') ? `+${digits}` : digits

  if (!/^\+\d{7,15}$/u.test(normalized)) {
    return {
      phoneDisplay: null,
      phoneHref: null,
    }
  }

  return {
    phoneDisplay: display,
    phoneHref: `tel:${normalized}`,
  }
}

export function createPreviewPublicBranding(
  draft: BrandingDraft,
): PublicBranding {
  return {
    appearance: draft.appearance,
    assets: draft.assets,
    colors: draft.colors,
    copy: draft.copy,
    layout: draft.layout,
    portalName: draft.portalName,
    supportContact: createSupportContact(draft.supportPhoneDisplay),
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
