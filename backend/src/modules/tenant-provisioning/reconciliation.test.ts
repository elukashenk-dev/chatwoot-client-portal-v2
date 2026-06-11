import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import { ChatwootClientRequestError } from '../../integrations/chatwoot/errors.js'
import type { ChatwootPlatformClient } from '../../integrations/chatwoot/platformClient.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import {
  createTenantsRepository,
  type TenantStatus,
} from '../tenants/repository.js'
import {
  createTenantProvisioningRepository,
  type TenantProvisioningRepository,
} from './repository.js'
import { reconcileTenantChatwootAccounts } from './reconciliation.js'

const secret = 'encrypted-secret-placeholder'

function createPlatformClient(
  getAccount: ChatwootPlatformClient['getAccount'],
): ChatwootPlatformClient {
  return {
    addAccountUser: vi.fn<ChatwootPlatformClient['addAccountUser']>(),
    createAccount: vi.fn<ChatwootPlatformClient['createAccount']>(),
    createUser: vi.fn<ChatwootPlatformClient['createUser']>(),
    deleteAccount: vi.fn<ChatwootPlatformClient['deleteAccount']>(),
    getAccount,
    getUserToken: vi.fn<ChatwootPlatformClient['getUserToken']>(),
    listAccounts: vi.fn<ChatwootPlatformClient['listAccounts']>(),
  }
}

describe('reconcileTenantChatwootAccounts', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  async function createHarness() {
    const tenantsRepository = createTenantsRepository(database.db)
    const provisioningRepository = createTenantProvisioningRepository(
      database.db,
    )

    return {
      provisioningRepository,
      tenantsRepository,
    }
  }

  async function createTenant({
    slug,
    status = 'active',
    tenantsRepository,
  }: {
    provisioningRepository: TenantProvisioningRepository
    slug: string
    status?: TenantStatus
    tenantsRepository: ReturnType<typeof createTenantsRepository>
  }) {
    const tenant = await tenantsRepository.createTenant({
      chatwootAccountId: slug === 'buhfirma' ? 101 : 202,
      chatwootAdminVerificationTokenCiphertext: secret,
      chatwootApiAccessTokenCiphertext: secret,
      chatwootBaseUrl: 'https://example.ru',
      chatwootPortalInboxId: 301,
      chatwootWebhookSecretCiphertext: secret,
      displayName: slug,
      primaryDomain: `${slug}.portal.example.com`,
      publicBaseUrl: `https://${slug}.portal.example.com`,
      slug,
      status,
    })

    return tenant
  }

  async function createCompletedRun({
    provisioningRepository,
    slug,
  }: {
    provisioningRepository: TenantProvisioningRepository
    slug: string
  }) {
    const run = await provisioningRepository.createOrResumeRun({
      chatwootBaseUrl: 'https://example.ru',
      clientAdminEmail: `admin+${slug}@client.example`,
      clientAdminName: 'Client Admin',
      displayName: slug,
      domainMode: 'provider_subdomain',
      primaryDomain: `${slug}.portal.example.com`,
      providerSubdomain: slug,
      providerTenantDomainSuffix: 'portal.example.com',
      publicBaseUrl: `https://${slug}.portal.example.com`,
      slug,
    })

    await provisioningRepository.markCompleted({ id: run.id })
  }

  it('keeps an active operator-provisioned tenant active when the Chatwoot account is reachable', async () => {
    const harness = await createHarness()
    await createTenant({ ...harness, slug: 'buhfirma' })
    await createCompletedRun({
      provisioningRepository: harness.provisioningRepository,
      slug: 'buhfirma',
    })
    const getAccount = vi
      .fn<ChatwootPlatformClient['getAccount']>()
      .mockResolvedValue({
        customAttributes: {},
        id: 101,
        name: 'Buhfirma',
      })

    await expect(
      reconcileTenantChatwootAccounts({
        dryRun: false,
        platformClientFactory: () => createPlatformClient(getAccount),
        provisioningRepository: harness.provisioningRepository,
        tenantsRepository: harness.tenantsRepository,
      }),
    ).resolves.toEqual({
      checked: 1,
      dryRun: false,
      suspended: 0,
      tenants: [
        {
          action: 'kept_active',
          reason: 'chatwoot_account_reachable',
          slug: 'buhfirma',
        },
      ],
    })
    await expect(
      harness.tenantsRepository.findBySlug('buhfirma'),
    ).resolves.toMatchObject({
      status: 'active',
    })
  })

  it('suspends an active operator-provisioned tenant when Chatwoot returns a confident account missing response', async () => {
    const harness = await createHarness()
    await createTenant({ ...harness, slug: 'buhfirma' })
    await createCompletedRun({
      provisioningRepository: harness.provisioningRepository,
      slug: 'buhfirma',
    })

    const result = await reconcileTenantChatwootAccounts({
      dryRun: false,
      platformClientFactory: () =>
        createPlatformClient(
          vi
            .fn<ChatwootPlatformClient['getAccount']>()
            .mockRejectedValue(
              new ChatwootClientRequestError(
                'Chatwoot Platform account lookup failed. Status: 404.',
              ),
            ),
        ),
      provisioningRepository: harness.provisioningRepository,
      tenantsRepository: harness.tenantsRepository,
    })

    expect(result).toEqual({
      checked: 1,
      dryRun: false,
      suspended: 1,
      tenants: [
        {
          action: 'suspended',
          reason: 'chatwoot_account_missing',
          slug: 'buhfirma',
        },
      ],
    })
    await expect(
      harness.tenantsRepository.findBySlug('buhfirma'),
    ).resolves.toMatchObject({
      status: 'suspended',
    })
  })

  it('reports Platform API auth failure without changing tenant status', async () => {
    const harness = await createHarness()
    await createTenant({ ...harness, slug: 'buhfirma' })
    await createCompletedRun({
      provisioningRepository: harness.provisioningRepository,
      slug: 'buhfirma',
    })

    const result = await reconcileTenantChatwootAccounts({
      dryRun: false,
      platformClientFactory: () =>
        createPlatformClient(
          vi
            .fn<ChatwootPlatformClient['getAccount']>()
            .mockRejectedValue(
              new ChatwootClientRequestError(
                'Chatwoot Platform account lookup failed. Status: 401.',
              ),
            ),
        ),
      provisioningRepository: harness.provisioningRepository,
      tenantsRepository: harness.tenantsRepository,
    })

    expect(result).toEqual({
      checked: 1,
      dryRun: false,
      suspended: 0,
      tenants: [
        {
          action: 'skipped',
          reason: 'platform_auth_failed',
          slug: 'buhfirma',
        },
      ],
    })
    await expect(
      harness.tenantsRepository.findBySlug('buhfirma'),
    ).resolves.toMatchObject({
      status: 'active',
    })
  })

  it('skips unmanaged and non-active tenants without calling the Platform API', async () => {
    const harness = await createHarness()
    await createTenant({ ...harness, slug: 'unmanaged' })
    await createTenant({ ...harness, slug: 'pending', status: 'provisioning' })
    await createTenant({ ...harness, slug: 'archived', status: 'archived' })
    await createCompletedRun({
      provisioningRepository: harness.provisioningRepository,
      slug: 'pending',
    })
    await createCompletedRun({
      provisioningRepository: harness.provisioningRepository,
      slug: 'archived',
    })
    const platformClientFactory = vi.fn(() =>
      createPlatformClient(vi.fn<ChatwootPlatformClient['getAccount']>()),
    )

    await expect(
      reconcileTenantChatwootAccounts({
        dryRun: false,
        platformClientFactory,
        provisioningRepository: harness.provisioningRepository,
        tenantsRepository: harness.tenantsRepository,
      }),
    ).resolves.toEqual({
      checked: 3,
      dryRun: false,
      suspended: 0,
      tenants: [
        {
          action: 'skipped',
          reason: 'archived',
          slug: 'archived',
        },
        {
          action: 'skipped',
          reason: 'provisioning',
          slug: 'pending',
        },
        {
          action: 'skipped',
          reason: 'not_operator_provisioned',
          slug: 'unmanaged',
        },
      ],
    })
    expect(platformClientFactory).not.toHaveBeenCalled()
  })

  it('reports intended suspension in dry-run without writing tenant status', async () => {
    const harness = await createHarness()
    await createTenant({ ...harness, slug: 'buhfirma' })
    await createCompletedRun({
      provisioningRepository: harness.provisioningRepository,
      slug: 'buhfirma',
    })

    await expect(
      reconcileTenantChatwootAccounts({
        dryRun: true,
        platformClientFactory: () =>
          createPlatformClient(
            vi
              .fn<ChatwootPlatformClient['getAccount']>()
              .mockRejectedValue(
                new ChatwootClientRequestError(
                  'Chatwoot Platform account lookup failed. Status: 404.',
                ),
              ),
          ),
        provisioningRepository: harness.provisioningRepository,
        tenantsRepository: harness.tenantsRepository,
      }),
    ).resolves.toEqual({
      checked: 1,
      dryRun: true,
      suspended: 0,
      tenants: [
        {
          action: 'would_suspend',
          reason: 'chatwoot_account_missing',
          slug: 'buhfirma',
        },
      ],
    })
    await expect(
      harness.tenantsRepository.findBySlug('buhfirma'),
    ).resolves.toMatchObject({
      status: 'active',
    })
  })

  it('returns a safe report without tenant secrets', async () => {
    const harness = await createHarness()
    await createTenant({ ...harness, slug: 'buhfirma' })
    await createCompletedRun({
      provisioningRepository: harness.provisioningRepository,
      slug: 'buhfirma',
    })

    const report = await reconcileTenantChatwootAccounts({
      dryRun: false,
      platformClientFactory: () =>
        createPlatformClient(
          vi.fn<ChatwootPlatformClient['getAccount']>().mockResolvedValue({
            customAttributes: {},
            id: 101,
            name: 'Buhfirma',
          }),
        ),
      provisioningRepository: harness.provisioningRepository,
      tenantsRepository: harness.tenantsRepository,
    })

    expect(JSON.stringify(report)).not.toContain(secret)
    expect(JSON.stringify(report)).not.toContain('ciphertext')
  })
})
