import type {
  AdminBrandingPatch,
  AdminBrandingResponse,
  BrandingAssets,
  BrandingColors,
  BrandingCopy,
} from '../api/adminBrandingClient'

export type BrandingDraft = {
  assets: BrandingAssets
  colors: BrandingColors
  copy: BrandingCopy
  portalName: string
  supportLabel: string
}

export function createBrandingDraft(
  response: AdminBrandingResponse,
): BrandingDraft {
  return {
    assets: response.branding.assets,
    colors: response.branding.colors,
    copy: response.branding.copy,
    portalName: response.branding.portalName,
    supportLabel: response.branding.supportLabel,
  }
}

export function createBrandingPatch(draft: BrandingDraft): AdminBrandingPatch {
  return {
    colors: draft.colors,
    copy: draft.copy,
    portalName: draft.portalName,
    supportLabel: draft.supportLabel,
  }
}
