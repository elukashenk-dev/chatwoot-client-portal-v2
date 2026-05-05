import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseClient } from '../db/client.js'
import { createTenantsRepository } from '../modules/tenants/repository.js'
import {
  decodeTenantSecretKey,
  encryptTenantSecret,
} from '../modules/tenants/secrets.js'
import { createTestDatabase } from '../test/testDatabase.js'
import {
  TenantChatwootVerificationError,
  verifyTenantChatwootConnection,
} from './verify-tenant-chatwoot-connection-core.js'

const tenantSecretKey = Buffer.alloc(32, 8).toString('base64')

describe('verifyTenantChatwootConnection', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  it('loads tenant Chatwoot config, decrypts runtime token, and verifies the portal inbox', async () => {
    const key = decodeTenantSecretKey(tenantSecretKey)
    const repository = createTenantsRepository(database.db)
    const verifyPortalInboxConnection = vi.fn().mockResolvedValue({
      channelType: 'Channel::Api',
      id: 6,
      lockToSingleConversation: true,
    })
    const forTenant = vi.fn().mockReturnValue({
      verifyPortalInboxConnection,
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
      verifyTenantChatwootConnection({
        chatwootClientFactory: {
          forTenant,
        },
        tenantSecretKey,
        tenantsRepository: repository,
        tenantSlug: 'BUHFIRMA',
      }),
    ).resolves.toEqual({
      result: 'verified',
      tenant: {
        chatwootAccountId: 3,
        chatwootBaseUrl: 'https://chatwoot.shared.example.com',
        chatwootPortalInboxId: 6,
        id: 1,
        slug: 'buhfirma',
      },
      verifiedInbox: {
        channelType: 'Channel::Api',
        id: 6,
        lockToSingleConversation: true,
      },
    })
    expect(forTenant).toHaveBeenCalledWith({
      accountId: 3,
      apiAccessToken: 'tenant-api-token',
      baseUrl: 'https://chatwoot.shared.example.com',
      portalInboxId: 6,
    })
    expect(verifyPortalInboxConnection).toHaveBeenCalledTimes(1)
  })

  it('fails clearly when tenant slug does not exist', async () => {
    await expect(
      verifyTenantChatwootConnection({
        chatwootClientFactory: {
          forTenant: vi.fn(),
        },
        tenantSecretKey,
        tenantsRepository: createTenantsRepository(database.db),
        tenantSlug: 'missing',
      }),
    ).rejects.toThrow(TenantChatwootVerificationError)
  })
})
