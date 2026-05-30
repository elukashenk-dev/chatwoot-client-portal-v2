import type { PublicTenantContext } from '../api/tenantClient'
import { createTenantMonogram } from '../lib/tenantIdentityMetadata'

export function createStartupSurfaceBrand(tenant: PublicTenantContext | null) {
  if (!tenant) {
    return {}
  }

  return {
    brandMonogram: createTenantMonogram(tenant.displayName),
    brandName: tenant.displayName,
  }
}
