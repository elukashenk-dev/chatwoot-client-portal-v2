import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import {
  createTenantProvisioningRepository,
  TenantProvisioningConflictError,
  toSafeTenantProvisioningRunReport,
  type TenantProvisioningInput,
} from './repository.js'

describe('tenant provisioning repository', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  function createCustomDomainInput(
    overrides: Partial<TenantProvisioningInput> = {},
  ): TenantProvisioningInput {
    return {
      chatwootBaseUrl: 'https://chatwoot.shared.example.com/',
      clientAdminEmail: ' Admin@Client.Example ',
      clientAdminName: ' Client Admin ',
      displayName: '  Client Portal  ',
      domainMode: 'custom_domain',
      primaryDomain: ' LK.CLIENT.EXAMPLE. ',
      publicBaseUrl: 'https://lk.client.example/',
      slug: ' Client ',
      ...overrides,
    }
  }

  function createProviderSubdomainInput(
    overrides: Partial<TenantProvisioningInput> = {},
  ): TenantProvisioningInput {
    return {
      chatwootBaseUrl: 'https://chatwoot.shared.example.com/',
      clientAdminEmail: ' Admin@Client.Example ',
      clientAdminName: ' Client Admin ',
      displayName: '  Client Portal  ',
      domainMode: 'provider_subdomain',
      primaryDomain: 'client.portal.example.com',
      providerSubdomain: ' client ',
      providerTenantDomainSuffix: ' PORTAL.EXAMPLE.COM. ',
      publicBaseUrl: 'https://client.portal.example.com/',
      slug: ' Client ',
      ...overrides,
    }
  }

  it('creates a custom-domain run by normalized slug and resumes the same run', async () => {
    const repository = createTenantProvisioningRepository(database.db)

    const createdRun = await repository.createOrResumeRun(
      createCustomDomainInput(),
    )
    const resumedRun = await repository.createOrResumeRun(
      createCustomDomainInput({
        slug: 'CLIENT',
      }),
    )

    expect(createdRun).toMatchObject({
      chatwootBaseUrl: 'https://chatwoot.shared.example.com',
      clientAdminEmail: 'admin@client.example',
      clientAdminName: 'Client Admin',
      displayName: 'Client Portal',
      domainMode: 'custom_domain',
      primaryDomain: 'lk.client.example',
      providerSubdomain: null,
      providerTenantDomainSuffix: null,
      publicBaseUrl: 'https://lk.client.example',
      slug: 'client',
      status: 'pending',
    })
    expect(resumedRun.id).toBe(createdRun.id)
  })

  it('creates a provider-owned subdomain run with provider domain fields', async () => {
    const repository = createTenantProvisioningRepository(database.db)

    const createdRun = await repository.createOrResumeRun(
      createProviderSubdomainInput(),
    )

    expect(createdRun).toMatchObject({
      domainMode: 'provider_subdomain',
      primaryDomain: 'client.portal.example.com',
      providerSubdomain: 'client',
      providerTenantDomainSuffix: 'portal.example.com',
      publicBaseUrl: 'https://client.portal.example.com',
      slug: 'client',
    })
  })

  it('rejects immutable input mismatches when resuming a run by slug', async () => {
    const repository = createTenantProvisioningRepository(database.db)
    await repository.createOrResumeRun(createCustomDomainInput())

    const mismatches: Array<[string, Partial<TenantProvisioningInput>]> = [
      [
        'domainMode',
        {
          domainMode: 'provider_subdomain',
          primaryDomain: 'client.portal.example.com',
          providerSubdomain: 'client',
          providerTenantDomainSuffix: 'portal.example.com',
          publicBaseUrl: 'https://client.portal.example.com',
        },
      ],
      ['primaryDomain', { primaryDomain: 'lk.changed.example' }],
      ['publicBaseUrl', { publicBaseUrl: 'https://other.client.example' }],
      [
        'providerSubdomain',
        {
          domainMode: 'custom_domain',
          providerSubdomain: 'client',
        },
      ],
      [
        'providerTenantDomainSuffix',
        {
          domainMode: 'custom_domain',
          providerTenantDomainSuffix: 'portal.example.com',
        },
      ],
      ['chatwootBaseUrl', { chatwootBaseUrl: 'https://chatwoot.other.test' }],
      ['clientAdminEmail', { clientAdminEmail: 'other@client.example' }],
      ['clientAdminName', { clientAdminName: 'Other Admin' }],
    ]

    for (const [fieldName, patch] of mismatches) {
      await expect(
        repository.createOrResumeRun(createCustomDomainInput(patch)),
      ).rejects.toThrow(TenantProvisioningConflictError)
      await expect(
        repository.createOrResumeRun(createCustomDomainInput(patch)),
      ).rejects.toThrow(`Provisioning input mismatch for ${fieldName}.`)
    }
  })

  it('stores Chatwoot account, service users and inbox IDs one step at a time', async () => {
    const repository = createTenantProvisioningRepository(database.db)
    const createdRun = await repository.createOrResumeRun(
      createCustomDomainInput(),
    )

    const withAccount = await repository.storeChatwootAccountId({
      chatwootAccountId: 1001,
      id: createdRun.id,
    })
    const withClientAdmin = await repository.storeClientAdminUserId({
      clientAdminUserId: 2001,
      id: createdRun.id,
    })
    const withRuntimeUser = await repository.storeRuntimeServiceUserId({
      id: createdRun.id,
      runtimeServiceUserId: 2002,
    })
    const withAdminVerificationUser =
      await repository.storeAdminVerificationServiceUserId({
        adminVerificationServiceUserId: 2003,
        id: createdRun.id,
      })
    const withInbox = await repository.storePortalInboxId({
      chatwootPortalInboxId: 3001,
      id: createdRun.id,
    })

    expect(withAccount.chatwootAccountId).toBe(1001)
    expect(withClientAdmin.clientAdminUserId).toBe(2001)
    expect(withRuntimeUser.runtimeServiceUserId).toBe(2002)
    expect(withAdminVerificationUser.adminVerificationServiceUserId).toBe(2003)
    expect(withInbox.chatwootPortalInboxId).toBe(3001)
  })

  it('accepts same external IDs on retry and rejects conflicting IDs', async () => {
    const repository = createTenantProvisioningRepository(database.db)
    const createdRun = await repository.createOrResumeRun(
      createCustomDomainInput(),
    )

    await repository.storeChatwootAccountId({
      chatwootAccountId: 1001,
      id: createdRun.id,
    })

    await expect(
      repository.storeChatwootAccountId({
        chatwootAccountId: 1001,
        id: createdRun.id,
      }),
    ).resolves.toMatchObject({
      chatwootAccountId: 1001,
      id: createdRun.id,
    })
    await expect(
      repository.storeChatwootAccountId({
        chatwootAccountId: 1002,
        id: createdRun.id,
      }),
    ).rejects.toThrow(TenantProvisioningConflictError)
    await expect(
      repository.storeChatwootAccountId({
        chatwootAccountId: 1002,
        id: createdRun.id,
      }),
    ).rejects.toThrow('Provisioning input mismatch for chatwootAccountId.')
  })

  it('atomically rejects concurrent conflicting external IDs', async () => {
    const repository = createTenantProvisioningRepository(database.db)
    const createdRun = await repository.createOrResumeRun(
      createCustomDomainInput(),
    )

    const results = await Promise.allSettled([
      repository.storeChatwootAccountId({
        chatwootAccountId: 1001,
        id: createdRun.id,
      }),
      repository.storeChatwootAccountId({
        chatwootAccountId: 1002,
        id: createdRun.id,
      }),
    ])
    const fulfilledResults = results.filter(
      (result) => result.status === 'fulfilled',
    )
    const rejectedResults = results.filter(
      (result) => result.status === 'rejected',
    )

    expect(fulfilledResults).toHaveLength(1)
    expect(rejectedResults).toHaveLength(1)
    expect(rejectedResults[0]).toMatchObject({
      reason: expect.any(TenantProvisioningConflictError),
    })
  })

  it('tracks provisioning status, failures and completed runs', async () => {
    const repository = createTenantProvisioningRepository(database.db)
    const createdRun = await repository.createOrResumeRun(
      createCustomDomainInput(),
    )

    const inProgressRun = await repository.markStatus({
      id: createdRun.id,
      status: 'creating_chatwoot_account',
    })
    const failedRun = await repository.markFailed({
      id: createdRun.id,
      message: 'Chatwoot account request failed.',
    })
    const completedRun = await repository.markCompleted({
      id: createdRun.id,
    })
    const completedRuns = await repository.listCompletedRuns()

    expect(inProgressRun.status).toBe('creating_chatwoot_account')
    expect(failedRun).toMatchObject({
      lastError: 'Chatwoot account request failed.',
      status: 'failed',
    })
    expect(completedRun.status).toBe('completed')
    expect(completedRun.completedAt).toBeInstanceOf(Date)
    expect(completedRuns).toHaveLength(1)
    expect(completedRuns[0]).toMatchObject({
      id: createdRun.id,
      status: 'completed',
    })
  })

  it('requires terminal provisioning helpers for completed and failed statuses', async () => {
    const repository = createTenantProvisioningRepository(database.db)
    const createdRun = await repository.createOrResumeRun(
      createCustomDomainInput(),
    )

    await expect(
      repository.markStatus({
        id: createdRun.id,
        status: 'completed',
      }),
    ).rejects.toThrow('Use terminal provisioning helpers for final statuses.')
    await expect(
      repository.markStatus({
        id: createdRun.id,
        status: 'failed',
      }),
    ).rejects.toThrow('Use terminal provisioning helpers for final statuses.')
  })

  it('redacts sensitive metadata and last errors from safe reports', async () => {
    const repository = createTenantProvisioningRepository(database.db)
    const createdRun = await repository.createOrResumeRun(
      createCustomDomainInput({
        metadata: {
          chatwootApiAccessToken: 'plaintext-api-token',
          nested: {
            password: 'plaintext-password',
            visible: 'visible-value',
          },
          visible: 'top-level-visible-value',
        },
      }),
    )
    const failedRun = await repository.markFailed({
      id: createdRun.id,
      message: 'Chatwoot token plaintext-api-token failed.',
    })

    const safeReport = toSafeTenantProvisioningRunReport(failedRun)
    const serializedReport = JSON.stringify(safeReport)

    expect(serializedReport).not.toContain('plaintext-api-token')
    expect(serializedReport).not.toContain('plaintext-password')
    expect(safeReport.lastError).toBe('[redacted]')
    expect(safeReport.metadata).toMatchObject({
      chatwootApiAccessToken: '[redacted]',
      nested: {
        password: '[redacted]',
        visible: 'visible-value',
      },
      visible: 'top-level-visible-value',
    })
  })
})
