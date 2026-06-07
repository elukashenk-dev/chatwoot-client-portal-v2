import { createHash, randomUUID } from 'node:crypto'

import type { BrandingObjectStorage } from '../../integrations/object-storage/brandingStorage.js'
import { ApiError } from '../../lib/errors.js'
import type { PublicTenantAdmin } from '../tenant-admin/adminAuthService.js'
import {
  normalizeBrandingAssetUpload,
  type BrandingAssetUpload,
} from './assetValidation.js'
import {
  createBrandingObjectKey,
  createPublicBrandingAssetUrl,
  type BrandingAssetKind,
} from './brandingAssets.js'
import type {
  BrandingAssetRow,
  BrandingRepository,
  BrandingSettingsPatch,
} from './repository.js'

type BrandingAssetAudit = (input: {
  action: string
  actor?: PublicTenantAdmin | null
  metadata?: Record<string, unknown>
  outcome: string
  requestIp: string | null
  subjectEmail?: string | null
  userAgent: string | null
}) => Promise<void> | void

type CreateBrandingAssetServiceOptions = {
  audit: BrandingAssetAudit
  repository: Pick<
    BrandingRepository,
    | 'createAssetMetadata'
    | 'deactivateAssetKind'
    | 'deleteAssetMetadata'
    | 'findActiveAssetById'
    | 'findActiveAssetByKind'
    | 'upsertSettings'
  >
  storage: BrandingObjectStorage
  tenantId: number
}

const settingsPatchByKind = {
  auth_background_image: (assetId: number | null) => ({
    authBackgroundImageAssetId: assetId,
  }),
  auth_footer_image: (assetId: number | null) => ({
    authFooterImageAssetId: assetId,
  }),
  auth_header_image: (assetId: number | null) => ({
    authHeaderImageAssetId: assetId,
  }),
  chat_background_image: (assetId: number | null) => ({
    chatBackgroundImageAssetId: assetId,
  }),
  chat_header_background_image: (assetId: number | null) => ({
    chatHeaderBackgroundImageAssetId: assetId,
  }),
  logo: (assetId: number | null) => ({ logoAssetId: assetId }),
  pwa_icon: (assetId: number | null) => ({ pwaIconAssetId: assetId }),
} satisfies Record<
  BrandingAssetKind,
  (assetId: number | null) => BrandingSettingsPatch
>

function toPublicAsset(asset: BrandingAssetRow) {
  const assetVersion = String(asset.id)

  return {
    assetVersion,
    contentType: asset.contentType,
    height: asset.height,
    id: asset.id,
    kind: asset.kind as BrandingAssetKind,
    publicUrl: createPublicBrandingAssetUrl({
      assetVersion,
      id: asset.id,
    }),
    width: asset.width,
  }
}

function createStorageError({
  code,
  error,
  message,
}: {
  code:
    | 'BRANDING_ASSET_DELETE_FAILED'
    | 'BRANDING_ASSET_READ_FAILED'
    | 'BRANDING_ASSET_WRITE_FAILED'
  error: unknown
  message: string
}) {
  if (error instanceof ApiError) {
    return error
  }

  return new ApiError(502, code, message)
}

export function createBrandingAssetService({
  audit,
  repository,
  storage,
  tenantId,
}: CreateBrandingAssetServiceOptions) {
  return {
    async uploadAsset({
      admin,
      requestIp,
      upload,
      userAgent,
    }: {
      admin: PublicTenantAdmin
      requestIp: string | null
      upload: BrandingAssetUpload
      userAgent: string | null
    }) {
      const asset = normalizeBrandingAssetUpload(upload)
      const checksumSha256 = createHash('sha256')
        .update(asset.data)
        .digest('hex')
      const contentHash = checksumSha256.slice(0, 32)
      const objectKey = createBrandingObjectKey({
        contentHash,
        filename: asset.fileName,
        instanceId: randomUUID(),
        kind: asset.kind,
        tenantId,
      })
      const previousAsset = await repository.findActiveAssetByKind(asset.kind)

      try {
        await storage.putObject({
          body: asset.data,
          contentLength: asset.size,
          contentType: asset.contentType,
          key: objectKey,
        })
      } catch (error) {
        throw createStorageError({
          code: 'BRANDING_ASSET_WRITE_FAILED',
          error,
          message: 'Не удалось сохранить файл брендинга.',
        })
      }

      const createdAsset = await repository.createAssetMetadata({
        byteSize: asset.size,
        checksumSha256,
        contentHash,
        contentType: asset.contentType,
        kind: asset.kind,
        objectKey,
        originalFilename: asset.fileName,
      })
      await repository.upsertSettings(
        settingsPatchByKind[asset.kind](createdAsset.id),
      )

      if (previousAsset) {
        try {
          await storage.deleteObject({ key: previousAsset.objectKey })
          await repository.deleteAssetMetadata(previousAsset.id)
        } catch {
          await audit({
            action: 'branding_asset_cleanup_failed',
            actor: admin,
            metadata: {
              assetId: previousAsset.id,
              kind: previousAsset.kind,
            },
            outcome: 'failed',
            requestIp,
            subjectEmail: admin.email,
            userAgent,
          })
        }
      }

      await audit({
        action: 'branding_asset_uploaded',
        actor: admin,
        metadata: {
          assetId: createdAsset.id,
          kind: createdAsset.kind,
        },
        outcome: 'success',
        requestIp,
        subjectEmail: admin.email,
        userAgent,
      })

      return { asset: toPublicAsset(createdAsset) }
    },

    async deleteAsset({
      admin,
      kind,
      requestIp,
      userAgent,
    }: {
      admin: PublicTenantAdmin
      kind: BrandingAssetKind
      requestIp: string | null
      userAgent: string | null
    }) {
      const activeAsset = await repository.findActiveAssetByKind(kind)

      if (!activeAsset) {
        return { deleted: false }
      }

      await repository.deactivateAssetKind(kind)

      try {
        await storage.deleteObject({ key: activeAsset.objectKey })
      } catch (error) {
        throw createStorageError({
          code: 'BRANDING_ASSET_DELETE_FAILED',
          error,
          message: 'Не удалось удалить файл брендинга.',
        })
      }

      await repository.deleteAssetMetadata(activeAsset.id)

      await audit({
        action: 'branding_asset_deleted',
        actor: admin,
        metadata: {
          assetId: activeAsset.id,
          kind,
        },
        outcome: 'success',
        requestIp,
        subjectEmail: admin.email,
        userAgent,
      })

      return { deleted: true }
    },

    async getPublicAsset({ assetId }: { assetId: number }) {
      const asset = await repository.findActiveAssetById(assetId)

      if (!asset) {
        throw new ApiError(
          404,
          'BRANDING_ASSET_NOT_FOUND',
          'Файл брендинга не найден.',
        )
      }

      try {
        return await storage.getObject({ key: asset.objectKey })
      } catch (error) {
        throw createStorageError({
          code: 'BRANDING_ASSET_READ_FAILED',
          error,
          message: 'Не удалось прочитать файл брендинга.',
        })
      }
    },
  }
}

export type BrandingAssetService = ReturnType<typeof createBrandingAssetService>
