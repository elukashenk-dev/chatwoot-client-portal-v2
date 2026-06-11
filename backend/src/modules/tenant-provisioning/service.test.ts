import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import type {
  ChatwootCreatedApiInbox,
  ChatwootInboxSummary,
  ChatwootPortalInboxRouting,
  ChatwootPortalInboxWebhook,
  ChatwootClientConfig,
} from '../../integrations/chatwoot/client.js'
import type { ChatwootPlatformClient } from '../../integrations/chatwoot/platformClient.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { createTenantsRepository } from '../tenants/repository.js'
import { decryptTenantSecret, encryptTenantSecret } from '../tenants/secrets.js'
import {
  createTenantProvisioningRepository,
  TenantProvisioningConflictError,
  type TenantProvisioningInput as RepositoryProvisioningInput,
} from './repository.js'
import {
  provisionTenant,
  type TenantProvisioningChatwootAccountClient,
} from './service.js'
import { createDefaultPassword } from './serviceHelpers.js'
import type { TenantProvisioningInput } from './input.js'

type CustomDomainInput = Extract<
  TenantProvisioningInput,
  { mode: 'custom_domain' }
>
type ProviderSubdomainInput = Extract<
  TenantProvisioningInput,
  { mode: 'provider_subdomain' }
>

const tenantSecretKey = Buffer.alloc(32, 7).toString('base64')
const decodedTenantSecretKey = Buffer.alloc(32, 7)

function createOperatorInput(
  overrides: Partial<CustomDomainInput> = {},
): CustomDomainInput {
  return {
    chatwootBaseUrl: 'https://example.ru',
    clientAdminEmail: 'admin@client.example',
    clientAdminName: 'Client Admin',
    displayName: 'Бухфирма',
    mode: 'custom_domain',
    primaryDomain: 'lk.buhfirma.ru',
    publicBaseUrl: 'https://lk.buhfirma.ru',
    serviceEmailDomain: 'portal-service.example.com',
    slug: 'buhfirma',
    ...overrides,
  }
}

function createProviderOperatorInput(
  overrides: Partial<ProviderSubdomainInput> = {},
): ProviderSubdomainInput {
  return {
    chatwootBaseUrl: 'https://example.ru',
    clientAdminEmail: 'admin@client.example',
    clientAdminName: 'Client Admin',
    displayName: 'Бухфирма',
    mode: 'provider_subdomain',
    providerSubdomain: 'buhfirma',
    providerTenantDomainSuffix: 'portal.example.com',
    serviceEmailDomain: 'portal-service.example.com',
    slug: 'buhfirma',
    ...overrides,
  }
}

function createRepositoryInput(
  overrides: Partial<RepositoryProvisioningInput> = {},
): RepositoryProvisioningInput {
  return {
    chatwootBaseUrl: 'https://example.ru',
    clientAdminEmail: 'admin@client.example',
    clientAdminName: 'Client Admin',
    displayName: 'Бухфирма',
    domainMode: 'custom_domain',
    primaryDomain: 'lk.buhfirma.ru',
    publicBaseUrl: 'https://lk.buhfirma.ru',
    slug: 'buhfirma',
    ...overrides,
  }
}

function createPlatformClient() {
  const createUser = vi
    .fn<ChatwootPlatformClient['createUser']>()
    .mockResolvedValueOnce({
      accessToken: null,
      email: 'admin@client.example',
      id: 201,
      name: 'Client Admin',
    })
    .mockResolvedValueOnce({
      accessToken: null,
      email: 'portal-runtime+buhfirma@portal-service.example.com',
      id: 202,
      name: 'Portal runtime buhfirma',
    })
    .mockResolvedValueOnce({
      accessToken: null,
      email: 'portal-admin-verify+buhfirma@portal-service.example.com',
      id: 203,
      name: 'Portal admin verification buhfirma',
    })

  return {
    addAccountUser: vi.fn<ChatwootPlatformClient['addAccountUser']>(),
    createAccount: vi
      .fn<ChatwootPlatformClient['createAccount']>()
      .mockResolvedValue({
        customAttributes: {
          portal_managed: true,
          portal_tenant_slug: 'buhfirma',
        },
        id: 101,
        name: 'Бухфирма',
      }),
    createUser,
    deleteAccount: vi.fn<ChatwootPlatformClient['deleteAccount']>(),
    getAccount: vi
      .fn<ChatwootPlatformClient['getAccount']>()
      .mockResolvedValue({
        customAttributes: {
          portal_managed: true,
          portal_tenant_slug: 'buhfirma',
        },
        id: 101,
        name: 'Бухфирма',
      }),
    getUserToken: vi.fn<ChatwootPlatformClient['getUserToken']>(
      async (userId) => {
        if (userId === 202) {
          return 'runtime-token-secret'
        }

        if (userId === 203) {
          return 'admin-verification-token-secret'
        }

        return `token-for-${userId}`
      },
    ),
    listAccounts: vi
      .fn<ChatwootPlatformClient['listAccounts']>()
      .mockResolvedValue([]),
  } satisfies ChatwootPlatformClient
}

function createChatwootAccountClient() {
  return {
    configurePortalInboxWebhook: vi
      .fn<(input: { url: string }) => Promise<ChatwootPortalInboxWebhook>>()
      .mockImplementation(async ({ url }) => ({
        id: 301,
        inboxIdentifier: 'api-source-id',
        secret: 'webhook-secret',
        url,
      })),
    createPortalApiInbox: vi
      .fn<(input: { name: string }) => Promise<ChatwootCreatedApiInbox>>()
      .mockResolvedValue({
        channelType: 'Channel::Api',
        id: 301,
        inboxIdentifier: 'api-source-id',
        lockToSingleConversation: true,
        name: 'Portal buhfirma',
        webhookSecret: null,
        webhookUrl: null,
      }),
    ensurePortalInboxSingleConversationRouting: vi
      .fn<() => Promise<ChatwootPortalInboxRouting & { updated: boolean }>>()
      .mockResolvedValue({
        channelType: 'Channel::Api',
        id: 301,
        inboxIdentifier: 'api-source-id',
        lockToSingleConversation: true,
        updated: false,
        webhookSecret: 'webhook-secret',
        webhookUrl: 'https://lk.buhfirma.ru/api/chatwoot/webhooks',
      }),
    findPortalApiInboxByName: vi
      .fn<(input: { name: string }) => Promise<ChatwootInboxSummary | null>>()
      .mockResolvedValue(null),
  } satisfies TenantProvisioningChatwootAccountClient
}

describe('provisionTenant', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  async function createHarness() {
    const platformClient = createPlatformClient()
    const chatwootAccountClient = createChatwootAccountClient()
    const chatwootAccountClientConfigs: ChatwootClientConfig[] = []
    const chatwootAccountClientFactory = vi.fn(
      (config: ChatwootClientConfig) => {
        chatwootAccountClientConfigs.push(config)
        return chatwootAccountClient
      },
    )

    return {
      chatwootAccountClient,
      chatwootAccountClientConfigs,
      chatwootAccountClientFactory,
      platformClient,
      provisioningRepository: createTenantProvisioningRepository(database.db),
      tenantsRepository: createTenantsRepository(database.db),
    }
  }

  it('generates default service passwords accepted by Chatwoot password policy', () => {
    const password = createDefaultPassword()

    expect(password).toMatch(/[A-Z]/)
    expect(password).toMatch(/[a-z]/)
    expect(password).toMatch(/[0-9]/)
    expect(password).toMatch(/[!@#$%^&*()_+\-=[\]{}|"/\\.,`<>:;?~']/)
  })

  it('creates all Chatwoot resources and an active portal tenant', async () => {
    const harness = await createHarness()

    const result = await provisionTenant({
      ...harness,
      input: createOperatorInput(),
      passwordGenerator: () => 'GeneratedPassword1!',
      tenantSecretKey,
    })

    expect(result).toMatchObject({
      action: 'created',
      tenant: {
        chatwootAccountId: 101,
        chatwootPortalInboxId: 301,
        primaryDomain: 'lk.buhfirma.ru',
        publicBaseUrl: 'https://lk.buhfirma.ru',
        slug: 'buhfirma',
        status: 'active',
      },
    })
    expect(harness.platformClient.createAccount).toHaveBeenCalledWith({
      customAttributes: {
        portal_managed: true,
        portal_tenant_slug: 'buhfirma',
      },
      name: 'Бухфирма',
    })
    expect(harness.platformClient.createUser).toHaveBeenCalledTimes(3)
    expect(harness.platformClient.addAccountUser).toHaveBeenCalledTimes(3)
    expect(
      harness.chatwootAccountClient.findPortalApiInboxByName,
    ).toHaveBeenCalledWith({
      name: 'Portal buhfirma',
    })
    expect(
      harness.chatwootAccountClient.createPortalApiInbox,
    ).toHaveBeenCalledWith({
      name: 'Portal buhfirma',
    })
    expect(
      harness.chatwootAccountClient.configurePortalInboxWebhook,
    ).toHaveBeenCalledWith({
      url: 'https://lk.buhfirma.ru/api/chatwoot/webhooks',
    })
    expect(harness.chatwootAccountClientConfigs[0]).not.toHaveProperty(
      'portalInboxId',
    )
    expect(harness.chatwootAccountClientConfigs.at(-1)).toMatchObject({
      portalInboxId: 301,
    })

    const tenant = await harness.tenantsRepository.findBySlug('buhfirma')

    expect(tenant).toMatchObject({
      chatwootPortalInboxIdentifier: 'api-source-id',
      status: 'active',
    })
    expect(
      decryptTenantSecret(
        tenant?.chatwootApiAccessTokenCiphertext ?? '',
        decodedTenantSecretKey,
      ),
    ).toBe('runtime-token-secret')
    expect(
      decryptTenantSecret(
        tenant?.chatwootAdminVerificationTokenCiphertext ?? '',
        decodedTenantSecretKey,
      ),
    ).toBe('admin-verification-token-secret')
    expect(
      decryptTenantSecret(
        tenant?.chatwootWebhookSecretCiphertext ?? '',
        decodedTenantSecretKey,
      ),
    ).toBe('webhook-secret')
  })

  it('stores resolved provider-subdomain domains', async () => {
    const harness = await createHarness()

    const result = await provisionTenant({
      ...harness,
      input: createProviderOperatorInput(),
      passwordGenerator: () => 'GeneratedPassword1!',
      tenantSecretKey,
    })

    expect(result.tenant).toMatchObject({
      primaryDomain: 'buhfirma.portal.example.com',
      publicBaseUrl: 'https://buhfirma.portal.example.com',
    })
    await expect(
      harness.tenantsRepository.findBySlug('buhfirma'),
    ).resolves.toMatchObject({
      primaryDomain: 'buhfirma.portal.example.com',
      publicBaseUrl: 'https://buhfirma.portal.example.com',
    })
  })

  it('rejects provider-subdomain input that differs from the normalized slug', async () => {
    const harness = await createHarness()

    await expect(
      provisionTenant({
        ...harness,
        input: createProviderOperatorInput({ providerSubdomain: 'other' }),
        tenantSecretKey,
      }),
    ).rejects.toThrow('Provider subdomain must match tenant slug')
    expect(harness.platformClient.createAccount).not.toHaveBeenCalled()
  })

  it('returns already_exists for a matching active tenant', async () => {
    const harness = await createHarness()
    await harness.tenantsRepository.createTenant({
      chatwootAccountId: 101,
      chatwootAdminVerificationTokenCiphertext: encryptTenantSecret(
        'admin-verification-token-secret',
        decodedTenantSecretKey,
      ),
      chatwootApiAccessTokenCiphertext: encryptTenantSecret(
        'runtime-token-secret',
        decodedTenantSecretKey,
      ),
      chatwootBaseUrl: 'https://example.ru',
      chatwootPortalInboxId: 301,
      chatwootWebhookSecretCiphertext: encryptTenantSecret(
        'webhook-secret',
        decodedTenantSecretKey,
      ),
      displayName: 'Бухфирма',
      primaryDomain: 'lk.buhfirma.ru',
      publicBaseUrl: 'https://lk.buhfirma.ru',
      slug: 'buhfirma',
    })

    const result = await provisionTenant({
      ...harness,
      input: createOperatorInput(),
      tenantSecretKey,
    })

    expect(result).toMatchObject({
      action: 'already_exists',
      tenant: {
        chatwootAccountId: 101,
        chatwootPortalInboxId: 301,
        status: 'active',
      },
    })
    expect(harness.platformClient.listAccounts).not.toHaveBeenCalled()
  })

  it.each(['suspended', 'archived'] as const)(
    'rejects a matching existing %s tenant instead of resuming it',
    async (status) => {
      const harness = await createHarness()
      await harness.tenantsRepository.createTenant({
        chatwootAccountId: 101,
        chatwootAdminVerificationTokenCiphertext: encryptTenantSecret(
          'admin-verification-token-secret',
          decodedTenantSecretKey,
        ),
        chatwootApiAccessTokenCiphertext: encryptTenantSecret(
          'runtime-token-secret',
          decodedTenantSecretKey,
        ),
        chatwootBaseUrl: 'https://example.ru',
        chatwootPortalInboxId: 301,
        chatwootWebhookSecretCiphertext: encryptTenantSecret(
          'webhook-secret',
          decodedTenantSecretKey,
        ),
        displayName: 'Бухфирма',
        primaryDomain: 'lk.buhfirma.ru',
        publicBaseUrl: 'https://lk.buhfirma.ru',
        slug: 'buhfirma',
        status,
      })

      await expect(
        provisionTenant({
          ...harness,
          input: createOperatorInput(),
          tenantSecretKey,
        }),
      ).rejects.toThrow(
        'Existing tenant does not match requested provisioning input.',
      )
      expect(harness.platformClient.listAccounts).not.toHaveBeenCalled()
    },
  )

  it('rejects an existing tenant with mismatched Chatwoot base URL', async () => {
    const harness = await createHarness()
    await harness.tenantsRepository.createTenant({
      chatwootAccountId: 101,
      chatwootAdminVerificationTokenCiphertext: encryptTenantSecret(
        'admin-verification-token-secret',
        decodedTenantSecretKey,
      ),
      chatwootApiAccessTokenCiphertext: encryptTenantSecret(
        'runtime-token-secret',
        decodedTenantSecretKey,
      ),
      chatwootBaseUrl: 'https://other.example.ru',
      chatwootPortalInboxId: 301,
      chatwootWebhookSecretCiphertext: encryptTenantSecret(
        'webhook-secret',
        decodedTenantSecretKey,
      ),
      displayName: 'Бухфирма',
      primaryDomain: 'lk.buhfirma.ru',
      publicBaseUrl: 'https://lk.buhfirma.ru',
      slug: 'buhfirma',
    })

    await expect(
      provisionTenant({
        ...harness,
        input: createOperatorInput(),
        tenantSecretKey,
      }),
    ).rejects.toThrow(
      'Existing tenant does not match requested provisioning input.',
    )
    expect(harness.platformClient.listAccounts).not.toHaveBeenCalled()
  })

  it('reuses a stored Chatwoot account id after a partial run', async () => {
    const harness = await createHarness()
    const run = await harness.provisioningRepository.createOrResumeRun(
      createRepositoryInput(),
    )
    await harness.provisioningRepository.storeChatwootAccountId({
      chatwootAccountId: 101,
      id: run.id,
    })

    const result = await provisionTenant({
      ...harness,
      input: createOperatorInput(),
      passwordGenerator: () => 'GeneratedPassword1!',
      tenantSecretKey,
    })

    expect(result.action).toBe('resumed')
    expect(harness.platformClient.createAccount).not.toHaveBeenCalled()
    expect(harness.platformClient.getAccount).toHaveBeenCalledWith(101)
  })

  it('finds an existing Chatwoot account by portal tenant custom attribute', async () => {
    const harness = await createHarness()
    harness.platformClient.listAccounts.mockResolvedValue([
      {
        customAttributes: {
          portal_managed: true,
          portal_tenant_slug: 'buhfirma',
        },
        id: 777,
        name: 'Бухфирма',
      },
    ])

    const result = await provisionTenant({
      ...harness,
      input: createOperatorInput(),
      passwordGenerator: () => 'GeneratedPassword1!',
      tenantSecretKey,
    })

    expect(result.tenant.chatwootAccountId).toBe(777)
    expect(harness.platformClient.createAccount).not.toHaveBeenCalled()
  })

  it('uses an existing exact API inbox before creating another one', async () => {
    const harness = await createHarness()
    harness.chatwootAccountClient.findPortalApiInboxByName.mockResolvedValue({
      channelType: 'Channel::Api',
      id: 444,
      inboxIdentifier: 'existing-source-id',
      name: 'Portal buhfirma',
    })
    harness.chatwootAccountClient.configurePortalInboxWebhook.mockResolvedValue(
      {
        id: 444,
        inboxIdentifier: 'existing-source-id',
        secret: 'webhook-secret',
        url: 'https://lk.buhfirma.ru/api/chatwoot/webhooks',
      },
    )

    const result = await provisionTenant({
      ...harness,
      input: createOperatorInput(),
      passwordGenerator: () => 'GeneratedPassword1!',
      tenantSecretKey,
    })

    expect(result.tenant.chatwootPortalInboxId).toBe(444)
    expect(
      harness.chatwootAccountClient.createPortalApiInbox,
    ).not.toHaveBeenCalled()
    expect(harness.chatwootAccountClientConfigs.at(-1)).toMatchObject({
      portalInboxId: 444,
    })
  })

  it('resumes after creating a provisioning tenant before activation', async () => {
    const harness = await createHarness()
    harness.chatwootAccountClient.ensurePortalInboxSingleConversationRouting
      .mockRejectedValueOnce(new Error('Chatwoot routing unavailable.'))
      .mockResolvedValueOnce({
        channelType: 'Channel::Api',
        id: 301,
        inboxIdentifier: 'api-source-id',
        lockToSingleConversation: true,
        updated: false,
        webhookSecret: 'webhook-secret',
        webhookUrl: 'https://lk.buhfirma.ru/api/chatwoot/webhooks',
      })

    await expect(
      provisionTenant({
        ...harness,
        input: createOperatorInput(),
        passwordGenerator: () => 'GeneratedPassword1!',
        tenantSecretKey,
      }),
    ).rejects.toThrow('Chatwoot routing unavailable.')
    await expect(
      harness.tenantsRepository.findBySlug('buhfirma'),
    ).resolves.toMatchObject({
      status: 'provisioning',
    })

    const result = await provisionTenant({
      ...harness,
      input: createOperatorInput(),
      passwordGenerator: () => 'GeneratedPassword1!',
      tenantSecretKey,
    })

    expect(result).toMatchObject({
      action: 'resumed',
      tenant: {
        chatwootPortalInboxId: 301,
        status: 'active',
      },
    })
    expect(
      harness.chatwootAccountClient.createPortalApiInbox,
    ).toHaveBeenCalledTimes(1)
    expect(
      harness.chatwootAccountClient.findPortalApiInboxByName,
    ).toHaveBeenCalledTimes(1)
  })

  it('rejects immutable provisioning input mismatches on rerun', async () => {
    const harness = await createHarness()
    await harness.provisioningRepository.createOrResumeRun(
      createRepositoryInput(),
    )

    await expect(
      provisionTenant({
        ...harness,
        input: createProviderOperatorInput(),
        tenantSecretKey,
      }),
    ).rejects.toThrow(TenantProvisioningConflictError)
    await expect(
      provisionTenant({
        ...harness,
        input: createOperatorInput({
          primaryDomain: 'lk.changed.ru',
          publicBaseUrl: 'https://lk.changed.ru',
        }),
        tenantSecretKey,
      }),
    ).rejects.toThrow(TenantProvisioningConflictError)
    await expect(
      provisionTenant({
        ...harness,
        input: createOperatorInput({
          chatwootBaseUrl: 'https://other.example.ru',
        }),
        tenantSecretKey,
      }),
    ).rejects.toThrow(TenantProvisioningConflictError)
  })

  it('rejects provider suffix changes on rerun', async () => {
    const harness = await createHarness()
    await harness.provisioningRepository.createOrResumeRun(
      createRepositoryInput({
        domainMode: 'provider_subdomain',
        primaryDomain: 'alpha.portal.example.com',
        providerSubdomain: 'alpha',
        providerTenantDomainSuffix: 'portal.example.com',
        publicBaseUrl: 'https://alpha.portal.example.com',
        slug: 'alpha',
      }),
    )

    await expect(
      provisionTenant({
        ...harness,
        input: createProviderOperatorInput({
          providerSubdomain: 'alpha',
          providerTenantDomainSuffix: 'other.example.com',
          slug: 'alpha',
        }),
        tenantSecretKey,
      }),
    ).rejects.toThrow(TenantProvisioningConflictError)
  })

  it('marks failed runs with sanitized errors', async () => {
    const harness = await createHarness()
    harness.platformClient.createAccount.mockRejectedValue(
      new Error('Chatwoot token plaintext-token failed.'),
    )

    await expect(
      provisionTenant({
        ...harness,
        input: createOperatorInput(),
        tenantSecretKey,
      }),
    ).rejects.toThrow('Chatwoot token plaintext-token failed.')

    const run = await harness.provisioningRepository.createOrResumeRun(
      createRepositoryInput(),
    )

    expect(run).toMatchObject({
      lastError: '[redacted]',
      status: 'failed',
    })
  })

  it('returns a safe result without tokens, passwords or secrets', async () => {
    const harness = await createHarness()

    const result = await provisionTenant({
      ...harness,
      input: createOperatorInput(),
      passwordGenerator: () => 'GeneratedPassword1!',
      tenantSecretKey,
    })
    const serializedResult = JSON.stringify(result)
    const tenant = await harness.tenantsRepository.findBySlug('buhfirma')

    expect(result.runId).toEqual(expect.any(Number))
    expect(result.tenant.status).toBe('active')
    expect(serializedResult).not.toContain('runtime-token-secret')
    expect(serializedResult).not.toContain('admin-verification-token-secret')
    expect(serializedResult).not.toContain('webhook-secret')
    expect(serializedResult).not.toContain('GeneratedPassword1!')
    expect(
      decryptTenantSecret(
        tenant?.chatwootApiAccessTokenCiphertext ?? '',
        decodedTenantSecretKey,
      ),
    ).not.toBe(
      decryptTenantSecret(
        tenant?.chatwootAdminVerificationTokenCiphertext ?? '',
        decodedTenantSecretKey,
      ),
    )
  })
})
