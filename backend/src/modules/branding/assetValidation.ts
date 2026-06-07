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
const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

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

function hasBytes(data: Buffer, bytes: Buffer | string, offset = 0) {
  const expected = typeof bytes === 'string' ? Buffer.from(bytes) : bytes

  return (
    data.byteLength >= offset + expected.byteLength &&
    data.subarray(offset, offset + expected.byteLength).equals(expected)
  )
}

function detectImageContentType(data: Buffer) {
  if (hasBytes(data, pngSignature)) {
    return 'image/png'
  }

  if (
    data.byteLength >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  ) {
    return 'image/jpeg'
  }

  if (hasBytes(data, 'GIF87a') || hasBytes(data, 'GIF89a')) {
    return 'image/gif'
  }

  if (hasBytes(data, 'RIFF') && hasBytes(data, 'WEBP', 8)) {
    return 'image/webp'
  }

  return null
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
  const data = Buffer.from(upload.data)
  const size = data.byteLength
  const contentType = upload.mimeType.trim().toLowerCase()

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

  if (!allowedImageTypes.has(contentType)) {
    throw new ApiError(
      415,
      'BRANDING_ASSET_TYPE_NOT_ALLOWED',
      'Можно загрузить только изображение PNG, JPG, GIF или WebP.',
    )
  }

  if (detectImageContentType(data) !== contentType) {
    throw new ApiError(
      415,
      'BRANDING_ASSET_TYPE_NOT_ALLOWED',
      'Тип файла брендинга не совпадает с содержимым изображения.',
    )
  }

  return {
    contentType,
    data,
    fileName: normalizeFilename(upload.fileName, contentType, upload.kind),
    kind: upload.kind,
    size,
  }
}
