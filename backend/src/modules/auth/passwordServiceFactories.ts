import type { FastifyRequest } from 'fastify'

import type { DatabaseClient } from '../../db/client.js'
import type { SmtpEmailDelivery } from '../../integrations/email/smtp.js'
import { createPasswordResetRepository } from '../password-reset/repository.js'
import { createPasswordResetService } from '../password-reset/service.js'
import { createPasswordSetupRepository } from '../password-setup/repository.js'
import { createPasswordSetupService } from '../password-setup/service.js'
import { requireTenantContext } from '../tenants/routes.js'
import type { AuthService } from './service.js'

type CreateAuthPasswordServiceFactoriesOptions = {
  authService: AuthService
  createEmailDelivery: () => Pick<SmtpEmailDelivery, 'send'>
  database: DatabaseClient
  now?: () => Date
}

export function createAuthPasswordServiceFactories({
  authService,
  createEmailDelivery,
  database,
  now,
}: CreateAuthPasswordServiceFactoriesOptions) {
  return {
    createPasswordResetServiceForRequest(request: FastifyRequest) {
      return createPasswordResetService({
        emailDelivery: createEmailDelivery(),
        passwordResetRepository: createPasswordResetRepository(database.db, {
          tenantId: requireTenantContext(request).id,
        }),
      })
    },

    createPasswordSetupServiceForRequest(request: FastifyRequest) {
      const tenant = requireTenantContext(request)

      return createPasswordSetupService({
        authService,
        emailDelivery: createEmailDelivery(),
        ...(now ? { now } : {}),
        passwordSetupRepository: createPasswordSetupRepository(database.db, {
          tenantId: tenant.id,
        }),
        tenantId: tenant.id,
      })
    },
  }
}
