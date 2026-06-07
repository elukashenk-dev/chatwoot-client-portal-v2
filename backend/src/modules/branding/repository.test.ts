import { describe, expect, it } from 'vitest'

import { createTestDatabase } from '../../test/testDatabase.js'
import { createTenantsRepository } from '../tenants/repository.js'
import { encryptTenantSecret } from '../tenants/secrets.js'
import { createBrandingRepository } from './repository.js'

const tenantSecretKey = Buffer.alloc(32, 12)

async function createTenant(
  repository: ReturnType<typeof createTenantsRepository>,
  slug: string,
) {
  return repository.createTenant({
    chatwootAccountId: slug === 'alpha' ? 3 : 4,
    chatwootApiAccessTokenCiphertext: encryptTenantSecret(
      `${slug}-runtime-token`,
      tenantSecretKey,
    ),
    chatwootBaseUrl: 'https://chatwoot.example.test',
    chatwootPortalInboxId: slug === 'alpha' ? 6 : 7,
    chatwootWebhookSecretCiphertext: encryptTenantSecret(
      `${slug}-webhook-secret`,
      tenantSecretKey,
    ),
    displayName: slug === 'alpha' ? 'Альфа' : 'Бета',
    primaryDomain: `${slug}.example.test`,
    publicBaseUrl: `https://${slug}.example.test`,
    slug,
  })
}

describe('createBrandingRepository', () => {
  it('returns null settings for a tenant with no branding row', async () => {
    const database = await createTestDatabase()

    try {
      const tenantsRepository = createTenantsRepository(database.db)
      const tenant = await createTenant(tenantsRepository, 'alpha')
      const brandingRepository = createBrandingRepository(database.db, {
        tenantId: tenant.id,
      })

      await expect(brandingRepository.findSettings()).resolves.toBeNull()
    } finally {
      await database.close()
    }
  }, 15_000)

  it('upserts settings for only the current tenant', async () => {
    const database = await createTestDatabase()

    try {
      const tenantsRepository = createTenantsRepository(database.db)
      const tenantA = await createTenant(tenantsRepository, 'alpha')
      const tenantB = await createTenant(tenantsRepository, 'beta')
      const repositoryA = createBrandingRepository(database.db, {
        tenantId: tenantA.id,
      })
      const repositoryB = createBrandingRepository(database.db, {
        tenantId: tenantB.id,
      })

      await repositoryA.upsertSettings({
        accentColor: '#4676b4',
        authBackgroundColor: '#f3f7fc',
        authSubtitle: 'Для защищенной переписки',
        authTitle: 'Вход в личный кабинет',
        chatBackgroundColor: '#ffffff',
        chatEmptyBody: 'Напишите нам, когда будет удобно.',
        chatEmptyTitle: 'Мы на связи',
        chatHeaderBackgroundColor: '#112540',
        chatInfoTitle: 'Информация о чате',
        portalName: 'Портал Альфа',
        primaryColor: '#112540',
        supportLabel: 'Поддержка Альфа',
      })

      await expect(repositoryA.findSettings()).resolves.toMatchObject({
        portalName: 'Портал Альфа',
        supportLabel: 'Поддержка Альфа',
        version: 1,
      })
      await expect(repositoryB.findSettings()).resolves.toBeNull()
    } finally {
      await database.close()
    }
  }, 15_000)

  it('increments version while preserving omitted fields and normalizing cleared text', async () => {
    const database = await createTestDatabase()

    try {
      const tenantsRepository = createTenantsRepository(database.db)
      const tenant = await createTenant(tenantsRepository, 'alpha')
      const brandingRepository = createBrandingRepository(database.db, {
        tenantId: tenant.id,
      })

      await brandingRepository.upsertSettings({
        portalName: 'Портал Альфа',
        primaryColor: '#112540',
        supportLabel: 'Поддержка Альфа',
      })
      const updatedSettings = await brandingRepository.upsertSettings({
        portalName: '   ',
        supportLabel: null,
      })

      expect(updatedSettings).toMatchObject({
        portalName: null,
        primaryColor: '#112540',
        supportLabel: null,
        version: 2,
      })
    } finally {
      await database.close()
    }
  }, 15_000)

  it('returns active asset metadata only inside the tenant scope', async () => {
    const database = await createTestDatabase()

    try {
      const tenantsRepository = createTenantsRepository(database.db)
      const tenantA = await createTenant(tenantsRepository, 'alpha')
      const tenantB = await createTenant(tenantsRepository, 'beta')
      const repositoryA = createBrandingRepository(database.db, {
        tenantId: tenantA.id,
      })
      const repositoryB = createBrandingRepository(database.db, {
        tenantId: tenantB.id,
      })
      const asset = await repositoryA.createAssetMetadata({
        byteSize: 1234,
        checksumSha256: 'a'.repeat(64),
        contentHash: 'asset-hash-a',
        contentType: 'image/png',
        height: 128,
        kind: 'logo',
        objectKey: `tenants/${tenantA.id}/branding/logo/asset-hash-a`,
        originalFilename: 'logo.png',
        width: 128,
      })

      await repositoryA.upsertSettings({
        logoAssetId: asset.id,
        portalName: 'Портал Альфа',
      })

      const assetMetadata = await repositoryA.findActiveAssetMetadata()

      expect(assetMetadata).toEqual(
        expect.objectContaining({
          logo: expect.objectContaining({
            id: asset.id,
            kind: 'logo',
            publicUrl: `/api/branding/assets/${asset.id}?v=asset-hash-a`,
          }),
        }),
      )
      expect(assetMetadata.logo).not.toHaveProperty('originalFilename')
      await expect(repositoryB.findActiveAssetMetadata()).resolves.toEqual({})
    } finally {
      await database.close()
    }
  }, 15_000)

  it('rejects asset references outside the tenant scope', async () => {
    const database = await createTestDatabase()

    try {
      const tenantsRepository = createTenantsRepository(database.db)
      const tenantA = await createTenant(tenantsRepository, 'alpha')
      const tenantB = await createTenant(tenantsRepository, 'beta')
      const repositoryA = createBrandingRepository(database.db, {
        tenantId: tenantA.id,
      })
      const repositoryB = createBrandingRepository(database.db, {
        tenantId: tenantB.id,
      })
      const asset = await repositoryA.createAssetMetadata({
        byteSize: 1234,
        checksumSha256: 'a'.repeat(64),
        contentHash: 'asset-hash-a',
        contentType: 'image/png',
        height: 128,
        kind: 'logo',
        objectKey: `tenants/${tenantA.id}/branding/logo/asset-hash-a`,
        originalFilename: 'logo.png',
        width: 128,
      })

      await expect(
        repositoryB.upsertSettings({
          logoAssetId: asset.id,
        }),
      ).rejects.toThrow('Branding asset reference is not available')
      await expect(repositoryB.findSettings()).resolves.toBeNull()
    } finally {
      await database.close()
    }
  }, 15_000)

  it('rejects asset references that do not match the target branding slot kind', async () => {
    const database = await createTestDatabase()

    try {
      const tenantsRepository = createTenantsRepository(database.db)
      const tenant = await createTenant(tenantsRepository, 'alpha')
      const brandingRepository = createBrandingRepository(database.db, {
        tenantId: tenant.id,
      })
      const asset = await brandingRepository.createAssetMetadata({
        byteSize: 1234,
        checksumSha256: 'a'.repeat(64),
        contentHash: 'asset-hash-a',
        contentType: 'image/png',
        height: 128,
        kind: 'auth_background_image',
        objectKey: `tenants/${tenant.id}/branding/auth-background/asset-hash-a`,
        originalFilename: 'auth-background.png',
        width: 128,
      })

      await expect(
        brandingRepository.upsertSettings({
          logoAssetId: asset.id,
        }),
      ).rejects.toThrow('Branding asset reference is not available')
      await expect(brandingRepository.findSettings()).resolves.toBeNull()
    } finally {
      await database.close()
    }
  }, 15_000)

  it('rejects empty settings patches without creating version churn', async () => {
    const database = await createTestDatabase()

    try {
      const tenantsRepository = createTenantsRepository(database.db)
      const tenant = await createTenant(tenantsRepository, 'alpha')
      const brandingRepository = createBrandingRepository(database.db, {
        tenantId: tenant.id,
      })

      await expect(brandingRepository.upsertSettings({})).rejects.toThrow(
        'Branding settings patch is empty',
      )
      await expect(brandingRepository.findSettings()).resolves.toBeNull()
    } finally {
      await database.close()
    }
  }, 15_000)
})
