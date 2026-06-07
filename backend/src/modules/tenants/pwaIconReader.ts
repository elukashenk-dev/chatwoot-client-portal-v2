import type { FastifyRequest } from 'fastify'

import type { AppDatabase } from '../../db/client.js'
import type { BrandingAssetService } from '../branding/assetService.js'
import { createBrandingRepository } from '../branding/repository.js'
import { requireTenantContext, type TenantPwaIconReader } from './routes.js'

type CreateTenantPwaIconReaderOptions = {
  createBrandingAssetService: (request: FastifyRequest) => BrandingAssetService
  db: AppDatabase
}

export function createTenantPwaIconReader({
  createBrandingAssetService,
  db,
}: CreateTenantPwaIconReaderOptions): TenantPwaIconReader {
  return {
    async getActivePwaIconMetadata(request) {
      const tenant = requireTenantContext(request)
      const asset = await createBrandingRepository(db, {
        tenantId: tenant.id,
      }).findActivePwaIcon()

      if (!asset) {
        return null
      }

      return {
        contentHash: asset.contentHash,
        contentType: asset.contentType,
      }
    },
    async getActivePwaIconObject(request) {
      const tenant = requireTenantContext(request)
      const asset = await createBrandingRepository(db, {
        tenantId: tenant.id,
      }).findActivePwaIcon()

      if (!asset) {
        return null
      }

      const object = await createBrandingAssetService(request).getPublicAsset({
        assetId: asset.id,
      })

      return {
        ...object,
        contentHash: asset.contentHash,
        contentType: object.contentType ?? asset.contentType,
      }
    },
  }
}
