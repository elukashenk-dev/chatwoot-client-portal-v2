import type { FastifyRequest } from 'fastify'

import type { AppDatabase } from '../../db/client.js'
import { defaultBrandingColors } from '../branding/brandingDefaults.js'
import { createBrandingRepository } from '../branding/repository.js'
import { requireTenantContext, type TenantPwaBrandingReader } from './routes.js'

type CreateTenantPwaBrandingReaderOptions = {
  db: AppDatabase
}

export function createTenantPwaBrandingReader({
  db,
}: CreateTenantPwaBrandingReaderOptions): TenantPwaBrandingReader {
  return {
    async getPwaManifestBranding(request: FastifyRequest) {
      const tenant = requireTenantContext(request)
      const settings = await createBrandingRepository(db, {
        tenantId: tenant.id,
      }).findSettings()

      return {
        backgroundColor:
          settings?.authBackgroundColor ?? defaultBrandingColors.authBackground,
        themeColor: settings?.primaryColor ?? defaultBrandingColors.primary,
      }
    },
  }
}
