import { basename, extname } from 'node:path'

import { ApiError } from '../../lib/errors.js'
import type { BrandingAssetKind } from './brandingAssets.js'

export const BRANDING_ASSET_MAX_BYTES = 5 * 1024 * 1024

const extensionByType: Record<string, string> = {
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

const allowedImageTypes = new Set(Object.keys(extensionByType))

export type BrandingAssetUpload = {
  data: Buffer
  fileName: string
  kind: BrandingAssetKind
  mimeType: string
}

export type NormalizedBrandingAssetUpload = {
  contentType: string
  data: Buffer
  fileName: string
  kind: BrandingAssetKind
  size: number
}

function normalizeFilename(
  input: string,
  contentType: string,
  fallback: string,
) {
  const extension = extensionByType[contentType] ?? '.bin'
  const sourceName = basename(input || fallback)
  const sourceExtension = extname(sourceName)
  const sourceBase = sourceExtension
    ? sourceName.slice(0, -sourceExtension.length)
    : sourceName
  const normalizedBase =
    sourceBase
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-') || fallback

  return `${normalizedBase}${extension}`
}

export function normalizeBrandingAssetUpload(
  upload: BrandingAssetUpload,
): NormalizedBrandingAssetUpload {
  const size = upload.data.byteLength

  if (size === 0) {
    throw new ApiError(400, 'BRANDING_ASSET_EMPTY', 'Файл брендинга пустой.')
  }

  if (size > BRANDING_ASSET_MAX_BYTES) {
    throw new ApiError(
      413,
      'BRANDING_ASSET_TOO_LARGE',
      'Файл брендинга должен быть не больше 5 МБ.',
    )
  }

  if (!allowedImageTypes.has(upload.mimeType)) {
    throw new ApiError(
      415,
      'BRANDING_ASSET_TYPE_NOT_ALLOWED',
      'Можно загрузить только изображение PNG, JPG, GIF или WebP.',
    )
  }

  return {
    contentType: upload.mimeType,
    data: upload.data,
    fileName: normalizeFilename(upload.fileName, upload.mimeType, upload.kind),
    kind: upload.kind,
    size,
  }
}
