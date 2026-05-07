import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseClient } from '../db/client.js'
import type { ChatwootClientConfig } from '../integrations/chatwoot/client.js'
import { createTenantsRepository } from '../modules/tenants/repository.js'
import {
  decodeTenantSecretKey,
  decryptTenantSecret,
  encryptTenantSecret,
} from '../modules/tenants/secrets.js'
import { createTestDatabase } from '../test/testDatabase.js'
import {
  configureTenantChatwootWebhook,
  createSafeTenantWebhookReport,
} from './configure-tenant-chatwoot-webhook-core.js'

const tenantSecretKey = Buffer.alloc(32, 9).toString('base64')

describe('configureTenantChatwootWebhook', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  async function seedTenant() {
    const key = decodeTenantSecretKey(tenantSecretKey)
    const repository = createTenantsRepository(database.db)

    await repository.createTenant({
      chatwootAccountId: 3,
      chatwootApiAccessTokenCiphertext: encryptTenantSecret(
        'tenant-api-token',
        key,
      ),
      chatwootBaseUrl: 'https://chatwoot.tenant.test',
      chatwootPortalInboxId: 9,
      chatwootWebhookSecretCiphertext: encryptTenantSecret(
        'old-webhook-secret',
        key,
      ),
      displayName: 'Buhfirma',
      primaryDomain: 'lk.buhfirma.test',
      publicBaseUrl: 'https://lk.buhfirma.test',
      slug: 'buhfirma',
    })

    return {
      key,
      repository,
    }
  }

  it('configures the tenant API channel webhook and stores the returned signing secret encrypted', async () => {
    const { key, repository } = await seedTenant()
    const chatwootClient = {
      configurePortalInboxWebhook: vi.fn().mockResolvedValue({
        id: 9,
        secret: 'new-webhook-secret',
        url: 'https://lk.buhfirma.test/api/integrations/chatwoot/webhooks/account',
      }),
    }
    const createChatwootClient = vi
      .fn<(config: ChatwootClientConfig) => typeof chatwootClient>()
      .mockReturnValue(chatwootClient)

    const result = await configureTenantChatwootWebhook({
      createChatwootClient,
      tenantSecretKey,
      tenantsRepository: repository,
      tenantSlug: 'BUHFIRMA',
    })

    expect(createChatwootClient).toHaveBeenCalledWith({
      accountId: 3,
      apiAccessToken: 'tenant-api-token',
      baseUrl: 'https://chatwoot.tenant.test',
      portalInboxId: 9,
    })
    expect(chatwootClient.configurePortalInboxWebhook).toHaveBeenCalledWith({
      url: 'https://lk.buhfirma.test/api/integrations/chatwoot/webhooks/account',
    })
    expect(result).toMatchObject({
      action: 'updated',
      secretSource: 'api-channel-inbox',
      secretStored: true,
      tenant: {
        chatwootAccountId: 3,
        slug: 'buhfirma',
      },
      webhook: {
        hasSecret: true,
        id: 9,
      },
    })

    const updatedTenant = await repository.findBySlug('buhfirma')

    expect(
      decryptTenantSecret(
        updatedTenant?.chatwootWebhookSecretCiphertext ?? '',
        key,
      ),
    ).toBe('new-webhook-secret')
    expect(JSON.stringify(createSafeTenantWebhookReport(result))).not.toContain(
      'new-webhook-secret',
    )
  })

  it('does not overwrite the stored tenant secret when Chatwoot omits the API channel webhook secret', async () => {
    const { key, repository } = await seedTenant()
    const createChatwootClient = vi.fn().mockReturnValue({
      configurePortalInboxWebhook: vi.fn().mockResolvedValue({
        id: 9,
        secret: null,
        url: 'https://lk.buhfirma.test/api/integrations/chatwoot/webhooks/account',
      }),
    })

    await expect(
      configureTenantChatwootWebhook({
        createChatwootClient,
        tenantSecretKey,
        tenantsRepository: repository,
        tenantSlug: 'buhfirma',
      }),
    ).rejects.toThrow(
      'Chatwoot did not return an API Channel webhook secret for tenant "buhfirma".',
    )

    const unchangedTenant = await repository.findBySlug('buhfirma')

    expect(
      decryptTenantSecret(
        unchangedTenant?.chatwootWebhookSecretCiphertext ?? '',
        key,
      ),
    ).toBe('old-webhook-secret')
  })
})
