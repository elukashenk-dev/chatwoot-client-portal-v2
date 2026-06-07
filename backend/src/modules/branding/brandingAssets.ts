export const brandingAssetKinds = [
  'logo',
  'pwa_icon',
  'auth_header_image',
  'auth_footer_image',
  'auth_background_image',
  'chat_background_image',
  'chat_header_background_image',
] as const

export type BrandingAssetKind = (typeof brandingAssetKinds)[number]

export type PublicBrandingAsset = {
  contentHash: string
  contentType: string
  height: number | null
  id: number
  kind: BrandingAssetKind
  publicUrl: string
  width: number | null
}

export type PublicBrandingAssetMap = Partial<
  Record<BrandingAssetKind, PublicBrandingAsset>
>

export function createPublicBrandingAssetUrl({
  contentHash,
  id,
}: {
  contentHash: string
  id: number
}) {
  return `/api/branding/assets/${id}?v=${encodeURIComponent(contentHash)}`
}
