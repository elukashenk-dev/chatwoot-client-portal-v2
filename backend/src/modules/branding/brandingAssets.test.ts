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
        contentHash: 'hash/value',
        tenantSlug: 'buhfirma',
      }),
    ).toBe('buhfirma-hash%2Fvalue')
  })

  it('parses supported branding asset kinds', () => {
    expect(parseBrandingAssetKind('pwa_icon')).toBe('pwa_icon')
  })

  it('rejects unsupported branding asset kinds with a controlled not-found code', () => {
    expect(() => parseBrandingAssetKind('favicon')).toThrow(
      expect.objectContaining({
        code: 'BRANDING_ASSET_KIND_NOT_FOUND',
        statusCode: 404,
      }),
    )
  })

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
