import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

import {
  createDisabledBrandingObjectStorage,
  type BrandingObjectStorage,
} from '../../integrations/object-storage/brandingStorage.js'
import type { PublicTenantAdmin } from '../tenant-admin/adminAuthService.js'
import { createBrandingAssetService } from './assetService.js'
import type { BrandingAssetKind } from './brandingAssets.js'

const validPngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
)

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

function createStorage(
  operations: string[] = [],
  {
    deleteObject,
  }: {
    deleteObject?: () => Promise<void>
  } = {},
): BrandingObjectStorage {
  return {
    deleteObject: vi.fn().mockImplementation(async () => {
      operations.push('delete-object')

      if (deleteObject) {
        await deleteObject()
      }
    }),
    getObject: vi.fn().mockImplementation(async () => {
      operations.push('get-object')

      return {
        body: Readable.from(validPngBytes),
        contentLength: validPngBytes.byteLength,
        contentType: 'image/png',
      }
    }),
    putObject: vi.fn().mockImplementation(async () => {
      operations.push('put-object')
    }),
  }
}

function getContentHash(data: Buffer) {
  return createHash('sha256').update(data).digest('hex').slice(0, 32)
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
        data: validPngBytes,
        fileName: '../../Tenant Logo.PNG',
        kind: 'logo',
        mimeType: 'image/png',
      },
      userAgent: 'vitest',
    })

    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        contentLength: validPngBytes.byteLength,
        contentType: 'image/png',
        key: expect.stringMatching(
          /^tenants\/7\/branding\/logo\/[a-f0-9]{32}\/[a-f0-9-]+\/tenant-logo\.png$/,
        ),
      }),
    )
    expect(repository.upsertSettings).toHaveBeenCalledWith({
      logoAssetId: response.asset.id,
    })
    expect(response.asset).toEqual(
      expect.objectContaining({
        kind: 'logo',
        publicUrl: `/api/branding/assets/${response.asset.id}?v=${response.asset.assetVersion}`,
      }),
    )
    expect(response.asset).toHaveProperty('assetVersion')
    expect(response.asset).not.toHaveProperty('contentHash')
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

  it('uses a new object key when replacing the same file with the same bytes and filename', async () => {
    const contentHash = getContentHash(validPngBytes)
    const previousObjectKey = `tenants/7/branding/logo/${contentHash}/logo.png`
    const previousAsset = createAsset({
      id: 1,
      contentHash,
      objectKey: previousObjectKey,
    })
    const repository = createRepository({
      activeByKind: new Map([['logo', previousAsset]]),
    })
    const storage = createStorage()
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
        data: validPngBytes,
        fileName: 'logo.png',
        kind: 'logo',
        mimeType: 'image/png',
      },
      userAgent: null,
    })

    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.not.stringMatching(
          new RegExp(
            `^${previousObjectKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          ),
        ),
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
        data: validPngBytes,
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
      'delete-object',
      'delete-metadata',
    ])
    expect(repository.deleteAssetMetadata).toHaveBeenCalledWith(1)
    expect(storage.deleteObject).toHaveBeenCalledWith({
      key: 'tenants/7/branding/logo/old/logo.png',
    })
  })

  it('keeps replacement successful and leaves old metadata when old object cleanup fails', async () => {
    const previousAsset = createAsset({
      id: 1,
      objectKey: 'tenants/7/branding/logo/old/logo.png',
    })
    const audit = vi.fn()
    const repository = createRepository({
      activeByKind: new Map([['logo', previousAsset]]),
    })
    const storage = createStorage([], {
      deleteObject: async () => {
        throw new Error('storage delete failed')
      },
    })
    const service = createBrandingAssetService({
      audit,
      repository,
      storage,
      tenantId: 7,
    })

    await expect(
      service.uploadAsset({
        admin,
        requestIp: null,
        upload: {
          data: validPngBytes,
          fileName: 'logo.png',
          kind: 'logo',
          mimeType: 'image/png',
        },
        userAgent: null,
      }),
    ).resolves.toEqual({
      asset: expect.objectContaining({ kind: 'logo' }),
    })
    expect(repository.upsertSettings).toHaveBeenCalled()
    expect(repository.deleteAssetMetadata).not.toHaveBeenCalledWith(1)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'branding_asset_cleanup_failed',
        outcome: 'failed',
      }),
    )
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'branding_asset_uploaded',
        outcome: 'success',
      }),
    )
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
      'delete-object',
      'delete-metadata',
    ])
  })

  it('keeps metadata when explicit delete object cleanup fails', async () => {
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
    const storage = createStorage(operations, {
      deleteObject: async () => {
        throw new Error('storage delete failed')
      },
    })
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
    ).rejects.toMatchObject({
      code: 'BRANDING_ASSET_DELETE_FAILED',
      statusCode: 502,
    })
    expect(operations).toEqual([
      'find-active-by-kind',
      'deactivate-kind',
      'delete-object',
    ])
    expect(repository.deleteAssetMetadata).not.toHaveBeenCalledWith(3)
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
          data: validPngBytes,
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
        contentLength: validPngBytes.byteLength,
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
