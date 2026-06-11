import { describe, expect, it, vi } from 'vitest'

import type { ChatwootPlatformClient } from '../../integrations/chatwoot/platformClient.js'
import type { Tenant, TenantStatus } from '../tenants/repository.js'
import { deprovisionTenant } from './deprovision.js'

function createTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    chatwootAccountId: 101,
    chatwootAdminVerificationTokenCiphertext: 'admin-token-ciphertext',
    chatwootApiAccessTokenCiphertext: 'runtime-token-ciphertext',
    chatwootBaseUrl: 'https://example.ru',
    chatwootPortalInboxId: 301,
    chatwootPortalInboxIdentifier: 'api-source-id',
    chatwootWebhookSecretCiphertext: 'webhook-secret-ciphertext',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    displayName: 'Buhfirma',
    id: 7,
    primaryDomain: 'buhfirma.portal.example.com',
    publicBaseUrl: 'https://buhfirma.portal.example.com',
    slug: 'buhfirma',
    status: 'active',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

function createPlatformClient(): ChatwootPlatformClient {
  return {
    addAccountUser: vi.fn<ChatwootPlatformClient['addAccountUser']>(),
    createAccount: vi.fn<ChatwootPlatformClient['createAccount']>(),
    createUser: vi.fn<ChatwootPlatformClient['createUser']>(),
    deleteAccount: vi.fn<ChatwootPlatformClient['deleteAccount']>(),
    getAccount: vi.fn<ChatwootPlatformClient['getAccount']>(),
    getUserToken: vi.fn<ChatwootPlatformClient['getUserToken']>(),
    listAccounts: vi.fn<ChatwootPlatformClient['listAccounts']>(),
  }
}

function createTenantsRepository(tenant: Tenant | null) {
  return {
    findBySlug: vi.fn(async () => tenant),
    updateTenantStatus: vi.fn(
      async ({ status }: { status: TenantStatus; tenantId: number }) => {
        if (!tenant) {
          throw new Error('missing tenant')
        }

        tenant = {
          ...tenant,
          status,
        }

        return tenant
      },
    ),
  }
}

describe('deprovisionTenant', () => {
  it('archives a tenant without deleting the Chatwoot account', async () => {
    const platformClient = createPlatformClient()
    const tenantsRepository = createTenantsRepository(createTenant())

    await expect(
      deprovisionTenant({
        confirmSlug: 'buhfirma',
        deleteChatwootAccount: false,
        platformClient,
        tenantSlug: 'buhfirma',
        tenantsRepository,
      }),
    ).resolves.toEqual({
      chatwootDeleteRequested: false,
      finalStatus: 'archived',
      previousStatus: 'active',
      tenantId: 7,
      tenantSlug: 'buhfirma',
    })
    expect(platformClient.deleteAccount).not.toHaveBeenCalled()
    expect(tenantsRepository.updateTenantStatus).toHaveBeenCalledTimes(1)
    expect(tenantsRepository.updateTenantStatus).toHaveBeenCalledWith({
      status: 'archived',
      tenantId: 7,
    })
  })

  it('suspends, deletes the Chatwoot account, then archives the tenant', async () => {
    const platformClient = createPlatformClient()
    const tenantsRepository = createTenantsRepository(createTenant())

    await expect(
      deprovisionTenant({
        confirmSlug: 'buhfirma',
        deleteChatwootAccount: true,
        platformClient,
        tenantSlug: 'buhfirma',
        tenantsRepository,
      }),
    ).resolves.toEqual({
      chatwootDeleteRequested: true,
      finalStatus: 'archived',
      previousStatus: 'active',
      tenantId: 7,
      tenantSlug: 'buhfirma',
    })
    expect(tenantsRepository.updateTenantStatus).toHaveBeenNthCalledWith(1, {
      status: 'suspended',
      tenantId: 7,
    })
    expect(platformClient.deleteAccount).toHaveBeenCalledWith(101)
    expect(tenantsRepository.updateTenantStatus).toHaveBeenNthCalledWith(2, {
      status: 'archived',
      tenantId: 7,
    })
  })

  it('requires confirmation to match the tenant slug', async () => {
    await expect(
      deprovisionTenant({
        confirmSlug: 'other',
        deleteChatwootAccount: false,
        platformClient: createPlatformClient(),
        tenantSlug: 'buhfirma',
        tenantsRepository: createTenantsRepository(createTenant()),
      }),
    ).rejects.toThrow('Confirmation slug must match tenant slug.')
  })

  it('fails clearly when the tenant is missing', async () => {
    await expect(
      deprovisionTenant({
        confirmSlug: 'buhfirma',
        deleteChatwootAccount: false,
        platformClient: createPlatformClient(),
        tenantSlug: 'buhfirma',
        tenantsRepository: createTenantsRepository(null),
      }),
    ).rejects.toThrow('Tenant was not found.')
  })

  it('uses only lookup and status update repository methods', async () => {
    const tenantsRepository = createTenantsRepository(createTenant())

    await deprovisionTenant({
      confirmSlug: 'buhfirma',
      deleteChatwootAccount: false,
      platformClient: createPlatformClient(),
      tenantSlug: 'buhfirma',
      tenantsRepository,
    })

    expect(Object.keys(tenantsRepository).sort()).toEqual([
      'findBySlug',
      'updateTenantStatus',
    ])
  })
})
