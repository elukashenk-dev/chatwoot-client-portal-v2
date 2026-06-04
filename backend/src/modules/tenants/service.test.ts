import { describe, expect, it, vi } from 'vitest'

import {
  createTenantsService,
  normalizeTenantHost,
  TenantHostValidationError,
} from './service.js'
import {
  decodeTenantSecretKey,
  encryptTenantSecret,
} from './secrets.js'

const tenantSecretKey = Buffer.alloc(32, 7).toString('base64')

describe('normalizeTenantHost', () => {
  it('normalizes host casing, ports and trailing dots', () => {
    expect(normalizeTenantHost(' LK.BUHFIRMA.RU:443. ')).toBe('lk.buhfirma.ru')
    expect(normalizeTenantHost('clinic.127.0.0.1.nip.io:5173')).toBe(
      'clinic.127.0.0.1.nip.io',
    )
    expect(normalizeTenantHost('LOCALHOST:3301')).toBe('localhost')
  })

  it('rejects host values that include protocol, path or unsupported syntax', () => {
    expect(() => normalizeTenantHost('https://lk.example.com')).toThrow(
      TenantHostValidationError,
    )
    expect(() => normalizeTenantHost('lk.example.com/path')).toThrow(
      TenantHostValidationError,
    )
    expect(() => normalizeTenantHost('[::1]:3301')).toThrow(
      TenantHostValidationError,
    )
  })
})

describe('createTenantsService', () => {
  it('exposes the stored Chatwoot portal inbox identifier only in backend runtime context', async () => {
    const key = decodeTenantSecretKey(tenantSecretKey)
    const service = createTenantsService({
      tenantSecretKey,
      tenantsRepository: {
        findByPrimaryDomain: vi.fn().mockResolvedValue({
          chatwootAccountId: 3,
          chatwootApiAccessTokenCiphertext: encryptTenantSecret(
            'tenant-api-token',
            key,
          ),
          chatwootBaseUrl: 'https://chatwoot.shared.example.com',
          chatwootPortalInboxId: 6,
          chatwootPortalInboxIdentifier: 'api-channel-public-identifier',
          chatwootWebhookSecretCiphertext: encryptTenantSecret(
            'tenant-webhook-secret',
            key,
          ),
          displayName: 'Buhfirma',
          id: 1,
          primaryDomain: 'lk.buhfirma.ru',
          publicBaseUrl: 'https://lk.buhfirma.ru',
          slug: 'buhfirma',
          status: 'active',
        }),
        findBySlug: vi.fn(),
      },
    })

    const tenantContext = await service.resolveTenantByHost({
      host: 'lk.buhfirma.ru',
    })

    expect(tenantContext.chatwoot.portalInboxIdentifier).toBe(
      'api-channel-public-identifier',
    )
    expect(service.getPublicTenantContext(tenantContext)).not.toHaveProperty(
      'chatwoot',
    )
  })
})
