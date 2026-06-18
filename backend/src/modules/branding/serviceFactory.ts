import type { FastifyRequest } from 'fastify'

import type { DatabaseClient } from '../../db/client.js'
import { createTenantAdminAuditLogger } from '../tenant-admin/adminAuthAudit.js'
import { createTenantAdminAuthRepository } from '../tenant-admin/adminAuthRepository.js'
import { requireTenantContext } from '../tenants/routes.js'
import { createBrandingRepository } from './repository.js'
import { createBrandingService } from './service.js'

export function createBrandingServiceForTenantRequest({
  database,
  request,
}: {
  database: DatabaseClient
  request: FastifyRequest
}) {
  const tenant = requireTenantContext(request)
  const adminAuthRepository = createTenantAdminAuthRepository(database.db, {
    tenantId: tenant.id,
  })

  return createBrandingService({
    audit: createTenantAdminAuditLogger(adminAuthRepository),
    repository: createBrandingRepository(database.db, {
      tenantId: tenant.id,
    }),
    tenant,
  })
}
