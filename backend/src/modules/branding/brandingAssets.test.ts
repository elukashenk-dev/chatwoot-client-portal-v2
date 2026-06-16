import { describe, expect, it } from 'vitest'

import {
  createTenantPwaIconVersion,
  parseBrandingAssetId,
  parseBrandingAssetKind,
} from './brandingAssets.js'

describe('branding asset helpers', () => {
  it('creates a tenant-scoped pwa icon version', () => {
    expect(
      createTenantPwaIconVersion({
        assetId: 42,
        tenantSlug: 'buhfirma',
      }),
    ).toBe('buhfirma-asset-42')
  })

  it('parses supported branding asset kinds', () => {
    expect(parseBrandingAssetKind('pwa_icon')).toBe('pwa_icon')
    expect(parseBrandingAssetKind('auth_background_image')).toBe(
      'auth_background_image',
    )
  })

  it('rejects unsupported branding asset kinds with a controlled not-found code', () => {
    expect(() => parseBrandingAssetKind('favicon')).toThrow(
      expect.objectContaining({
        code: 'BRANDING_ASSET_KIND_NOT_FOUND',
        statusCode: 404,
      }),
    )
  })

  it.each(['auth_header_image', 'auth_footer_image'])(
    'rejects removed auth artwork kind %s',
    (kind) => {
      expect(() => parseBrandingAssetKind(kind)).toThrow(
        expect.objectContaining({
          code: 'BRANDING_ASSET_KIND_NOT_FOUND',
          statusCode: 404,
        }),
      )
    },
  )

  it('parses positive asset ids', () => {
    expect(parseBrandingAssetId('42')).toBe(42)
  })

  it('rejects invalid asset ids with a controlled not-found code', () => {
    expect(() => parseBrandingAssetId('not-a-number')).toThrow(
      expect.objectContaining({
        code: 'BRANDING_ASSET_NOT_FOUND',
        statusCode: 404,
      }),
    )
  })
})
