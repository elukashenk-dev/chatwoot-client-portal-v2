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
        authMutedTextColor: '#52637a',
        authSubtitle: 'Для защищенной переписки',
        authTextColor: '#111827',
        authTitle: 'Вход в личный кабинет',
        chatBackgroundColor: '#ffffff',
        chatEmptyBody: 'Напишите нам, когда будет удобно.',
        chatEmptyTitle: 'Мы на связи',
        chatHeaderBackgroundColor: '#112540',
        chatHeaderTextColor: '#f8fafc',
        chatInfoTitle: 'Информация о чате',
        chatMutedTextColor: '#667085',
        chatTextColor: '#344054',
        portalName: 'Портал Альфа',
        primaryColor: '#112540',
        supportLabel: 'Поддержка Альфа',
      })

      await expect(repositoryA.findSettings()).resolves.toMatchObject({
        authMutedTextColor: '#52637a',
        authTextColor: '#111827',
        chatHeaderTextColor: '#f8fafc',
        chatMutedTextColor: '#667085',
        chatTextColor: '#344054',
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
            assetVersion: String(asset.id),
            kind: 'logo',
            publicUrl: `/api/branding/assets/${asset.id}?v=${asset.id}`,
          }),
        }),
      )
      expect(assetMetadata.logo).not.toHaveProperty('contentHash')
      expect(assetMetadata.logo).not.toHaveProperty('originalFilename')
      await expect(repositoryB.findActiveAssetMetadata()).resolves.toEqual({})
    } finally {
      await database.close()
    }
  }, 15_000)

  it('activates and returns a tenant-scoped pwa icon asset', async () => {
    const database = await createTestDatabase()

    try {
      const tenantsRepository = createTenantsRepository(database.db)
      const tenant = await createTenant(tenantsRepository, 'alpha')
      const repository = createBrandingRepository(database.db, {
        tenantId: tenant.id,
      })
      const asset = await repository.createAssetMetadata({
        byteSize: 10,
        checksumSha256: 'p'.repeat(64),
        contentHash: 'hash-pwa',
        contentType: 'image/png',
        kind: 'pwa_icon',
        objectKey: `tenants/${tenant.id}/branding/pwa_icon/hash-pwa/icon.png`,
        originalFilename: 'icon.png',
      })

      await repository.upsertSettings({ pwaIconAssetId: asset.id })

      await expect(repository.findActivePwaIcon()).resolves.toMatchObject({
        contentHash: 'hash-pwa',
        contentType: 'image/png',
        id: asset.id,
        kind: 'pwa_icon',
      })
      await expect(
        repository.findActiveAssetByKind('pwa_icon'),
      ).resolves.toMatchObject({
        id: asset.id,
        objectKey: `tenants/${tenant.id}/branding/pwa_icon/hash-pwa/icon.png`,
      })
    } finally {
      await database.close()
    }
  }, 15_000)

  it('finds public asset metadata only when the asset is active for the tenant', async () => {
    const database = await createTestDatabase()

    try {
      const tenantsRepository = createTenantsRepository(database.db)
      const tenant = await createTenant(tenantsRepository, 'alpha')
      const repository = createBrandingRepository(database.db, {
        tenantId: tenant.id,
      })
      const inactive = await repository.createAssetMetadata({
        byteSize: 10,
        checksumSha256: 'i'.repeat(64),
        contentHash: 'inactive-hash',
        contentType: 'image/png',
        kind: 'logo',
        objectKey: `tenants/${tenant.id}/branding/logo/inactive/logo.png`,
      })
      const active = await repository.createAssetMetadata({
        byteSize: 11,
        checksumSha256: 'a'.repeat(64),
        contentHash: 'active-hash',
        contentType: 'image/png',
        kind: 'logo',
        objectKey: `tenants/${tenant.id}/branding/logo/active/logo.png`,
      })

      await repository.upsertSettings({ logoAssetId: active.id })

      await expect(
        repository.findActiveAssetById(inactive.id),
      ).resolves.toBeNull()
      await expect(
        repository.findActiveAssetById(active.id),
      ).resolves.toMatchObject({
        id: active.id,
        objectKey: `tenants/${tenant.id}/branding/logo/active/logo.png`,
      })
      await expect(
        repository.findActiveAssetByKind('logo'),
      ).resolves.toMatchObject({
        id: active.id,
        objectKey: `tenants/${tenant.id}/branding/logo/active/logo.png`,
      })
    } finally {
      await database.close()
    }
  }, 15_000)

  it('deactivates an active asset kind without deleting other settings', async () => {
    const database = await createTestDatabase()

    try {
      const tenantsRepository = createTenantsRepository(database.db)
      const tenant = await createTenant(tenantsRepository, 'alpha')
      const repository = createBrandingRepository(database.db, {
        tenantId: tenant.id,
      })
      const asset = await repository.createAssetMetadata({
        byteSize: 10,
        checksumSha256: 'l'.repeat(64),
        contentHash: 'logo-hash',
        contentType: 'image/png',
        kind: 'logo',
        objectKey: `tenants/${tenant.id}/branding/logo/logo-hash/logo.png`,
      })

      await repository.upsertSettings({
        logoAssetId: asset.id,
        portalName: 'Tenant Portal',
      })
      await repository.deactivateAssetKind('logo')

      await expect(repository.findSettings()).resolves.toMatchObject({
        logoAssetId: null,
        portalName: 'Tenant Portal',
      })
      await expect(repository.findActiveAssetByKind('logo')).resolves.toBeNull()

      await repository.deleteAssetMetadata(asset.id)
      await expect(repository.findActiveAssetById(asset.id)).resolves.toBeNull()
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
