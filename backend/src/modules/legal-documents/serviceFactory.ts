import type { FastifyRequest } from 'fastify'

import type { DatabaseClient } from '../../db/client.js'
import { createTenantAdminAuditLogger } from '../tenant-admin/adminAuthAudit.js'
import { createTenantAdminAuthRepository } from '../tenant-admin/adminAuthRepository.js'
import { requireTenantContext } from '../tenants/routes.js'
import { createLegalDocumentsRepository } from './repository.js'
import { createLegalDocumentsService } from './service.js'

export function createLegalDocumentsServiceForTenantRequest({
  database,
  now,
  request,
}: {
  database: DatabaseClient
  now?: () => Date
  request: FastifyRequest
}) {
  const tenant = requireTenantContext(request)
  const adminAuthRepository = createTenantAdminAuthRepository(database.db, {
    tenantId: tenant.id,
  })

  return createLegalDocumentsService({
    audit: createTenantAdminAuditLogger(adminAuthRepository),
    repository: createLegalDocumentsRepository(database.db, {
      tenantId: tenant.id,
    }),
    ...(now ? { now } : {}),
  })
}
