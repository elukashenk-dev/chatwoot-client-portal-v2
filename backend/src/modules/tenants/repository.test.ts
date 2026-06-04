import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { createTenantsRepository, TenantValidationError } from './repository.js'

describe('tenants repository', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  it('creates and loads a tenant by slug and primary domain', async () => {
    const repository = createTenantsRepository(database.db)

    const tenant = await repository.createTenant({
      chatwootAccountId: 3,
      chatwootApiAccessTokenCiphertext: 'v1:api-token-ciphertext',
      chatwootBaseUrl: 'https://chatwoot.shared.example.com/',
      chatwootPortalInboxId: 6,
      chatwootWebhookSecretCiphertext: 'v1:webhook-secret-ciphertext',
      displayName: '  Buhfirma  ',
      primaryDomain: ' LK.BUHFIRMA.RU. ',
      publicBaseUrl: 'https://lk.buhfirma.ru/',
      slug: ' buhfirma ',
      status: 'active',
    })

    expect(tenant).toMatchObject({
      chatwootAccountId: 3,
      chatwootBaseUrl: 'https://chatwoot.shared.example.com',
      chatwootPortalInboxId: 6,
      displayName: 'Buhfirma',
      primaryDomain: 'lk.buhfirma.ru',
      publicBaseUrl: 'https://lk.buhfirma.ru',
      slug: 'buhfirma',
      status: 'active',
    })
    expect(tenant).not.toHaveProperty('mode')

    await expect(repository.findBySlug('BUHFIRMA')).resolves.toMatchObject({
      id: tenant.id,
      slug: 'buhfirma',
    })
    await expect(
      repository.findByPrimaryDomain('LK.BUHFIRMA.RU'),
    ).resolves.toMatchObject({
      id: tenant.id,
      primaryDomain: 'lk.buhfirma.ru',
    })
  })

  it('upserts the default tenant by slug without exposing plaintext secrets', async () => {
    const repository = createTenantsRepository(database.db)

    await repository.upsertTenantBySlug({
      chatwootAccountId: 1,
      chatwootApiAccessTokenCiphertext: 'v1:first-api-token',
      chatwootBaseUrl: 'https://chatwoot.example.com',
      chatwootPortalInboxId: 5,
      chatwootWebhookSecretCiphertext: 'v1:first-webhook-secret',
      displayName: 'Default Tenant',
      primaryDomain: 'lk.example.com',
      publicBaseUrl: 'https://lk.example.com',
      slug: 'default',
      status: 'active',
    })

    const updatedTenant = await repository.upsertTenantBySlug({
      chatwootAccountId: 1,
      chatwootApiAccessTokenCiphertext: 'v1:second-api-token',
      chatwootBaseUrl: 'https://chatwoot.example.com',
      chatwootPortalInboxId: 9,
      chatwootWebhookSecretCiphertext: 'v1:second-webhook-secret',
      displayName: 'Default Tenant Updated',
      primaryDomain: 'lk.example.com',
      publicBaseUrl: 'https://lk.example.com',
      slug: 'default',
      status: 'suspended',
    })

    await expect(repository.listTenants()).resolves.toHaveLength(1)
    expect(updatedTenant).toMatchObject({
      chatwootApiAccessTokenCiphertext: 'v1:second-api-token',
      chatwootPortalInboxId: 9,
      chatwootWebhookSecretCiphertext: 'v1:second-webhook-secret',
      displayName: 'Default Tenant Updated',
      status: 'suspended',
    })
  })

  it('rejects unsupported tenant identity values before insert', async () => {
    const repository = createTenantsRepository(database.db)

    await expect(
      repository.createTenant({
        chatwootAccountId: 1,
        chatwootApiAccessTokenCiphertext: 'v1:api-token',
        chatwootBaseUrl: 'https://chatwoot.example.com',
        chatwootPortalInboxId: 1,
        chatwootWebhookSecretCiphertext: 'v1:webhook-secret',
        displayName: 'Bad Tenant',
        primaryDomain: 'https://lk.example.com',
        publicBaseUrl: 'https://lk.example.com',
        slug: 'Bad Tenant',
      }),
    ).rejects.toThrow(TenantValidationError)
  })

  it('rejects tenants whose public URL belongs to a different host', async () => {
    const repository = createTenantsRepository(database.db)

    await expect(
      repository.createTenant({
        chatwootAccountId: 1,
        chatwootApiAccessTokenCiphertext: 'v1:api-token',
        chatwootBaseUrl: 'https://chatwoot.example.com',
        chatwootPortalInboxId: 1,
        chatwootWebhookSecretCiphertext: 'v1:webhook-secret',
        displayName: 'Bad Tenant',
        primaryDomain: 'lk.example.com',
        publicBaseUrl: 'https://lk.other-example.com',
        slug: 'bad-tenant',
      }),
    ).rejects.toThrow(TenantValidationError)

    await expect(repository.listTenants()).resolves.toHaveLength(0)
  })

  it('rejects default tenant upserts whose public URL belongs to a different host', async () => {
    const repository = createTenantsRepository(database.db)

    await expect(
      repository.upsertTenantBySlug({
        chatwootAccountId: 1,
        chatwootApiAccessTokenCiphertext: 'v1:api-token',
        chatwootBaseUrl: 'https://chatwoot.example.com',
        chatwootPortalInboxId: 1,
        chatwootWebhookSecretCiphertext: 'v1:webhook-secret',
        displayName: 'Default Tenant',
        primaryDomain: 'lk.example.com',
        publicBaseUrl: 'https://lk.other-example.com',
        slug: 'default',
      }),
    ).rejects.toThrow(TenantValidationError)

    await expect(repository.listTenants()).resolves.toHaveLength(0)
  })

  it('stores a trimmed Chatwoot portal inbox public identifier', async () => {
    const repository = createTenantsRepository(database.db)
    const tenant = await repository.createTenant({
      chatwootAccountId: 3,
      chatwootApiAccessTokenCiphertext: 'v1:api-token-ciphertext',
      chatwootBaseUrl: 'https://chatwoot.shared.example.com',
      chatwootPortalInboxId: 6,
      chatwootWebhookSecretCiphertext: 'v1:webhook-secret-ciphertext',
      displayName: 'Buhfirma',
      primaryDomain: 'lk.buhfirma.ru',
      publicBaseUrl: 'https://lk.buhfirma.ru',
      slug: 'buhfirma',
    })

    const updatedTenant =
      await repository.updateChatwootPortalInboxIdentifier({
        chatwootPortalInboxIdentifier: ' api-channel-public-identifier ',
        tenantId: tenant.id,
        updatedAt: new Date('2026-06-04T10:00:00.000Z'),
      })

    expect(updatedTenant.chatwootPortalInboxIdentifier).toBe(
      'api-channel-public-identifier',
    )
    await expect(repository.findBySlug('buhfirma')).resolves.toMatchObject({
      chatwootPortalInboxIdentifier: 'api-channel-public-identifier',
    })
  })

  it('throws when updating a missing tenant Chatwoot portal inbox identifier', async () => {
    const repository = createTenantsRepository(database.db)

    await expect(
      repository.updateChatwootPortalInboxIdentifier({
        chatwootPortalInboxIdentifier: 'api-channel-public-identifier',
        tenantId: 404,
      }),
    ).rejects.toThrow(
      'Failed to update tenant Chatwoot portal inbox identifier.',
    )
  })
})
