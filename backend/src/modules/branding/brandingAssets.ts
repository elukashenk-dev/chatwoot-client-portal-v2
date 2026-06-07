import { ApiError } from '../../lib/errors.js'

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

export function createTenantPwaIconVersion({
  contentHash,
  tenantSlug,
}: {
  contentHash: string
  tenantSlug: string
}) {
  return encodeURIComponent(`${tenantSlug}-${contentHash}`)
}

export function parseBrandingAssetKind(input: string): BrandingAssetKind {
  if (brandingAssetKinds.includes(input as BrandingAssetKind)) {
    return input as BrandingAssetKind
  }

  throw new ApiError(
    404,
    'BRANDING_ASSET_KIND_NOT_FOUND',
    'Такой тип файла брендинга не найден.',
  )
}

export function parseBrandingAssetId(input: string): number {
  const assetId = Number(input)

  if (!Number.isSafeInteger(assetId) || assetId <= 0) {
    throw new ApiError(
      404,
      'BRANDING_ASSET_NOT_FOUND',
      'Файл брендинга не найден.',
    )
  }

  return assetId
}
