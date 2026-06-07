import { Readable } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

import {
  createDisabledBrandingObjectStorage,
  type BrandingObjectStorage,
} from '../../integrations/object-storage/brandingStorage.js'
import type { PublicTenantAdmin } from '../tenant-admin/adminAuthService.js'
import { createBrandingAssetService } from './assetService.js'
import type { BrandingAssetKind } from './brandingAssets.js'

const admin = {
  chatwootAgentId: 42,
  email: 'admin@example.test',
  role: 'administrator',
} satisfies PublicTenantAdmin

type FakeAsset = {
  byteSize: number
  checksumSha256: string
  contentHash: string
  contentType: string
  createdAt: Date
  height: number | null
  id: number
  kind: BrandingAssetKind
  objectKey: string
  originalFilename: string | null
  tenantId: number
  updatedAt: Date
  width: number | null
}

function createAsset(input: Partial<FakeAsset> = {}): FakeAsset {
  return {
    byteSize: 11,
    checksumSha256: 'a'.repeat(64),
    contentHash: 'content-hash',
    contentType: 'image/png',
    createdAt: new Date('2026-06-07T00:00:00Z'),
    height: null,
    id: 12,
    kind: 'logo',
    objectKey: 'tenants/7/branding/logo/content-hash/logo.png',
    originalFilename: 'logo.png',
    tenantId: 7,
    updatedAt: new Date('2026-06-07T00:00:00Z'),
    width: null,
    ...input,
  }
}

function createRepository({
  activeById = new Map<number, FakeAsset>(),
  activeByKind = new Map<BrandingAssetKind, FakeAsset>(),
  operations = [],
}: {
  activeById?: Map<number, FakeAsset>
  activeByKind?: Map<BrandingAssetKind, FakeAsset>
  operations?: string[]
} = {}) {
  return {
    createAssetMetadata: vi.fn().mockImplementation(async (input) => {
      operations.push('create-metadata')

      return createAsset({
        byteSize: input.byteSize,
        checksumSha256: input.checksumSha256,
        contentHash: input.contentHash,
        contentType: input.contentType,
        kind: input.kind,
        objectKey: input.objectKey,
        originalFilename: input.originalFilename,
      })
    }),
    deactivateAssetKind: vi.fn().mockImplementation(async () => {
      operations.push('deactivate-kind')
    }),
    deleteAssetMetadata: vi.fn().mockImplementation(async () => {
      operations.push('delete-metadata')
    }),
    findActiveAssetById: vi.fn().mockImplementation(async (assetId) => {
      operations.push('find-active-by-id')

      return activeById.get(assetId) ?? null
    }),
    findActiveAssetByKind: vi.fn().mockImplementation(async (kind) => {
      operations.push('find-active-by-kind')

      return activeByKind.get(kind) ?? null
    }),
    upsertSettings: vi.fn().mockImplementation(async () => {
      operations.push('activate-settings')
    }),
  }
}

function createStorage(operations: string[] = []): BrandingObjectStorage {
  return {
    deleteObject: vi.fn().mockImplementation(async () => {
      operations.push('delete-object')
    }),
    getObject: vi.fn().mockImplementation(async () => {
      operations.push('get-object')

      return {
        body: Readable.from(Buffer.from('image-bytes')),
        contentLength: 11,
        contentType: 'image/png',
      }
    }),
    putObject: vi.fn().mockImplementation(async () => {
      operations.push('put-object')
    }),
  }
}

describe('createBrandingAssetService', () => {
  it('uploads an asset, stores object content, activates the matching slot and audits success', async () => {
    const audit = vi.fn()
    const operations: string[] = []
    const repository = createRepository({ operations })
    const storage = createStorage(operations)
    const service = createBrandingAssetService({
      audit,
      repository,
      storage,
      tenantId: 7,
    })

    const response = await service.uploadAsset({
      admin,
      requestIp: '127.0.0.1',
      upload: {
        data: Buffer.from('image-bytes'),
        fileName: '../../Tenant Logo.PNG',
        kind: 'logo',
        mimeType: 'image/png',
      },
      userAgent: 'vitest',
    })

    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        contentLength: 11,
        contentType: 'image/png',
        key: expect.stringMatching(
          /^tenants\/7\/branding\/logo\/[a-f0-9]{32}\/tenant-logo\.png$/,
        ),
      }),
    )
    expect(repository.upsertSettings).toHaveBeenCalledWith({
      logoAssetId: response.asset.id,
    })
    expect(response.asset).toEqual(
      expect.objectContaining({
        kind: 'logo',
        publicUrl: `/api/branding/assets/${response.asset.id}?v=${response.asset.contentHash}`,
      }),
    )
    expect(response.asset).not.toHaveProperty('objectKey')
    expect(response.asset).not.toHaveProperty('checksumSha256')
    expect(response.asset).not.toHaveProperty('originalFilename')
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'branding_asset_uploaded',
        actor: admin,
        outcome: 'success',
        subjectEmail: admin.email,
      }),
    )
  })

  it('replaces an existing active asset and deletes the old object after activation', async () => {
    const previousAsset = createAsset({
      id: 1,
      objectKey: 'tenants/7/branding/logo/old/logo.png',
    })
    const operations: string[] = []
    const repository = createRepository({
      activeByKind: new Map([['logo', previousAsset]]),
      operations,
    })
    const storage = createStorage(operations)
    const service = createBrandingAssetService({
      audit: vi.fn(),
      repository,
      storage,
      tenantId: 7,
    })

    await service.uploadAsset({
      admin,
      requestIp: null,
      upload: {
        data: Buffer.from('new-image'),
        fileName: 'logo.png',
        kind: 'logo',
        mimeType: 'image/png',
      },
      userAgent: null,
    })

    expect(operations).toEqual([
      'find-active-by-kind',
      'put-object',
      'create-metadata',
      'activate-settings',
      'delete-metadata',
      'delete-object',
    ])
    expect(repository.deleteAssetMetadata).toHaveBeenCalledWith(1)
    expect(storage.deleteObject).toHaveBeenCalledWith({
      key: 'tenants/7/branding/logo/old/logo.png',
    })
  })

  it('deletes an active asset kind by deactivating settings and deleting metadata/content', async () => {
    const activeAsset = createAsset({
      id: 3,
      kind: 'pwa_icon',
      objectKey: 'tenants/7/branding/pwa_icon/hash/icon.png',
    })
    const operations: string[] = []
    const repository = createRepository({
      activeByKind: new Map([['pwa_icon', activeAsset]]),
      operations,
    })
    const storage = createStorage(operations)
    const service = createBrandingAssetService({
      audit: vi.fn(),
      repository,
      storage,
      tenantId: 7,
    })

    await expect(
      service.deleteAsset({
        admin,
        kind: 'pwa_icon',
        requestIp: null,
        userAgent: null,
      }),
    ).resolves.toEqual({ deleted: true })
    expect(operations).toEqual([
      'find-active-by-kind',
      'deactivate-kind',
      'delete-metadata',
      'delete-object',
    ])
  })

  it('returns a controlled unavailable error when storage is disabled', async () => {
    const repository = createRepository()
    const service = createBrandingAssetService({
      audit: vi.fn(),
      repository,
      storage: createDisabledBrandingObjectStorage(),
      tenantId: 7,
    })

    await expect(
      service.uploadAsset({
        admin,
        requestIp: null,
        upload: {
          data: Buffer.from('image-bytes'),
          fileName: 'logo.png',
          kind: 'logo',
          mimeType: 'image/png',
        },
        userAgent: null,
      }),
    ).rejects.toMatchObject({
      code: 'BRANDING_ASSET_STORAGE_UNAVAILABLE',
      statusCode: 503,
    })
    expect(repository.createAssetMetadata).not.toHaveBeenCalled()
    expect(repository.upsertSettings).not.toHaveBeenCalled()
  })

  it('streams only active tenant-owned assets without leaking object metadata', async () => {
    const activeAsset = createAsset({
      id: 4,
      objectKey: 'tenants/7/branding/logo/hash/logo.png',
    })
    const repository = createRepository({
      activeById: new Map([[activeAsset.id, activeAsset]]),
    })
    const storage = createStorage()
    const service = createBrandingAssetService({
      audit: vi.fn(),
      repository,
      storage,
      tenantId: 7,
    })

    const response = await service.getPublicAsset({ assetId: activeAsset.id })

    expect(repository.findActiveAssetById).toHaveBeenCalledWith(activeAsset.id)
    expect(storage.getObject).toHaveBeenCalledWith({
      key: 'tenants/7/branding/logo/hash/logo.png',
    })
    expect(response).toEqual(
      expect.objectContaining({
        body: expect.any(Readable),
        contentLength: 11,
        contentType: 'image/png',
      }),
    )
    expect(response).not.toHaveProperty('objectKey')
    expect(response).not.toHaveProperty('checksumSha256')
    expect(response).not.toHaveProperty('originalFilename')
  })

  it('fails closed when a public asset is not active for the tenant', async () => {
    const repository = createRepository()
    const storage = createStorage()
    const service = createBrandingAssetService({
      audit: vi.fn(),
      repository,
      storage,
      tenantId: 7,
    })

    await expect(service.getPublicAsset({ assetId: 99 })).rejects.toMatchObject(
      {
        code: 'BRANDING_ASSET_NOT_FOUND',
        statusCode: 404,
      },
    )
    expect(storage.getObject).not.toHaveBeenCalled()
  })
})
