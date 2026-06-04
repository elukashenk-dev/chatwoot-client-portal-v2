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
    const ensurePortalInboxSingleConversationRouting = vi
      .fn()
      .mockResolvedValue({
        channelType: 'Channel::Api',
        id: 6,
        inboxIdentifier: 'api-channel-public-identifier',
        lockToSingleConversation: true,
        updated: false,
      })
    const forTenant = vi.fn().mockReturnValue({
      ensurePortalInboxSingleConversationRouting,
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
        inboxIdentifier: 'api-channel-public-identifier',
        lockToSingleConversation: true,
        updated: false,
      },
    })
    expect(forTenant).toHaveBeenCalledWith({
      accountId: 3,
      apiAccessToken: 'tenant-api-token',
      baseUrl: 'https://chatwoot.shared.example.com',
      portalInboxId: 6,
    })
    expect(ensurePortalInboxSingleConversationRouting).toHaveBeenCalledTimes(1)
    await expect(repository.findBySlug('buhfirma')).resolves.toMatchObject({
      chatwootPortalInboxIdentifier: 'api-channel-public-identifier',
    })
  })

  it('repairs tenant portal inbox single-conversation routing during verification', async () => {
    const key = decodeTenantSecretKey(tenantSecretKey)
    const repository = createTenantsRepository(database.db)
    const ensurePortalInboxSingleConversationRouting = vi
      .fn()
      .mockResolvedValue({
        channelType: 'Channel::Api',
        id: 6,
        inboxIdentifier: 'api-channel-public-identifier',
        lockToSingleConversation: true,
        updated: true,
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
          forTenant: vi.fn().mockReturnValue({
            ensurePortalInboxSingleConversationRouting,
          }),
        },
        tenantSecretKey,
        tenantsRepository: repository,
        tenantSlug: 'buhfirma',
      }),
    ).resolves.toMatchObject({
      verifiedInbox: {
        lockToSingleConversation: true,
        updated: true,
      },
    })
    expect(ensurePortalInboxSingleConversationRouting).toHaveBeenCalledTimes(1)
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
