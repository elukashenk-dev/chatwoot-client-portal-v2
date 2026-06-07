import { describe, expect, it } from 'vitest'

import {
  BRANDING_ASSET_MAX_BYTES,
  normalizeBrandingAssetUpload,
} from './assetValidation.js'

function expectValidationErrorCode(
  callback: () => unknown,
  expectedCode: string,
) {
  try {
    callback()
  } catch (error) {
    expect(error).toMatchObject({ code: expectedCode })
    return
  }

  throw new Error(`Expected ${expectedCode} to be thrown`)
}

describe('normalizeBrandingAssetUpload', () => {
  it('rejects an empty upload', () => {
    expectValidationErrorCode(
      () =>
        normalizeBrandingAssetUpload({
          data: Buffer.alloc(0),
          fileName: 'logo.png',
          kind: 'logo',
          mimeType: 'image/png',
        }),
      'BRANDING_ASSET_EMPTY',
    )
  })

  it('rejects an oversized upload', () => {
    expectValidationErrorCode(
      () =>
        normalizeBrandingAssetUpload({
          data: Buffer.alloc(BRANDING_ASSET_MAX_BYTES + 1),
          fileName: 'logo.png',
          kind: 'logo',
          mimeType: 'image/png',
        }),
      'BRANDING_ASSET_TOO_LARGE',
    )
  })

  it('rejects a disallowed MIME type', () => {
    expectValidationErrorCode(
      () =>
        normalizeBrandingAssetUpload({
          data: Buffer.from('<svg />'),
          fileName: 'logo.svg',
          kind: 'logo',
          mimeType: 'image/svg+xml',
        }),
      'BRANDING_ASSET_TYPE_NOT_ALLOWED',
    )
  })

  it('normalizes unsafe filenames and preserves safe extensions', () => {
    const upload = normalizeBrandingAssetUpload({
      data: Buffer.from('image-bytes'),
      fileName: '../../Tenant Logo.PNG',
      kind: 'logo',
      mimeType: 'image/png',
    })

    expect(upload).toMatchObject({
      contentType: 'image/png',
      fileName: 'tenant-logo.png',
      kind: 'logo',
      size: 11,
    })
  })

  it('uses a content-type extension when filename has no safe extension', () => {
    const upload = normalizeBrandingAssetUpload({
      data: Buffer.from('image-bytes'),
      fileName: 'logo',
      kind: 'pwa_icon',
      mimeType: 'image/webp',
    })

    expect(upload.fileName).toBe('logo.webp')
  })
})
