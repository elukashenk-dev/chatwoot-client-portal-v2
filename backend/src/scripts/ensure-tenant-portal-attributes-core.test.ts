import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseClient } from '../db/client.js'
import { createTenantsRepository } from '../modules/tenants/repository.js'
import {
  decodeTenantSecretKey,
  encryptTenantSecret,
} from '../modules/tenants/secrets.js'
import { createTestDatabase } from '../test/testDatabase.js'
import {
  ensureTenantPortalContactCustomAttributes,
  TenantPortalContactCustomAttributesEnsureError,
} from './ensure-tenant-portal-attributes-core.js'

const tenantSecretKey = Buffer.alloc(32, 9).toString('base64')

describe('ensureTenantPortalContactCustomAttributes', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  it('loads tenant Chatwoot config, decrypts runtime token, and reconciles portal contact attributes', async () => {
    const key = decodeTenantSecretKey(tenantSecretKey)
    const repository = createTenantsRepository(database.db)
    const ensurePortalContactCustomAttributeDefinitions = vi
      .fn()
      .mockResolvedValue({
        created: [
          'portal_enabled',
          'portal_contact_type',
          'portal_client_group_contact_ids',
          'curator_name',
        ],
        unchanged: [],
        updated: [],
      })
    const forTenant = vi.fn().mockReturnValue({
      ensurePortalContactCustomAttributeDefinitions,
    })

    await repository.createTenant({
      chatwootAccountId: 3,
      chatwootApiAccessTokenCiphertext: encryptTenantSecret(
        'tenant-api-token',
        key,
      ),
      chatwootBaseUrl: 'https://chatwoot.shared.example.com',
      chatwootPortalInboxId: 6,
      chatwootWebhookSecretCiphertext: encryptTenantSecret(
        'tenant-webhook-secret',
        key,
      ),
      displayName: 'Buhfirma',
      primaryDomain: 'lk.buhfirma.ru',
      publicBaseUrl: 'https://lk.buhfirma.ru',
      slug: 'buhfirma',
    })

    await expect(
      ensureTenantPortalContactCustomAttributes({
        chatwootClientFactory: {
          forTenant,
        },
        tenantSecretKey,
        tenantsRepository: repository,
        tenantSlug: 'BUHFIRMA',
      }),
    ).resolves.toEqual({
      customAttributes: {
        created: [
          'portal_enabled',
          'portal_contact_type',
          'portal_client_group_contact_ids',
          'curator_name',
        ],
        unchanged: [],
        updated: [],
      },
      result: 'ensured',
      tenant: {
        chatwootAccountId: 3,
        chatwootBaseUrl: 'https://chatwoot.shared.example.com',
        id: 1,
        slug: 'buhfirma',
      },
    })
    expect(forTenant).toHaveBeenCalledWith({
      accountId: 3,
      apiAccessToken: 'tenant-api-token',
      baseUrl: 'https://chatwoot.shared.example.com',
      portalInboxId: 6,
    })
    expect(ensurePortalContactCustomAttributeDefinitions).toHaveBeenCalledTimes(
      1,
    )
  })

  it('fails clearly when tenant slug does not exist', async () => {
    await expect(
      ensureTenantPortalContactCustomAttributes({
        chatwootClientFactory: {
          forTenant: vi.fn(),
        },
        tenantSecretKey,
        tenantsRepository: createTenantsRepository(database.db),
        tenantSlug: 'missing',
      }),
    ).rejects.toThrow(TenantPortalContactCustomAttributesEnsureError)
  })
})
