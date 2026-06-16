import { ApiError } from '../../lib/errors.js'

export const brandingAssetKinds = [
  'logo',
  'pwa_icon',
  'auth_background_image',
  'chat_background_image',
  'chat_header_background_image',
] as const

export type BrandingAssetKind = (typeof brandingAssetKinds)[number]

export type PublicBrandingAsset = {
  assetVersion: string
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
  assetVersion,
  id,
}: {
  assetVersion: string
  id: number
}) {
  return `/api/branding/assets/${id}?v=${encodeURIComponent(assetVersion)}`
}

export function createBrandingObjectKey({
  contentHash,
  filename,
  instanceId,
  kind,
  tenantId,
}: {
  contentHash: string
  filename: string
  instanceId: string
  kind: BrandingAssetKind
  tenantId: number
}) {
  return `tenants/${tenantId}/branding/${kind}/${contentHash}/${instanceId}/${filename}`
}

export function createTenantPwaIconVersion({
  assetId,
  tenantSlug,
}: {
  assetId: number
  tenantSlug: string
}) {
  return encodeURIComponent(`${tenantSlug}-asset-${assetId}`)
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
