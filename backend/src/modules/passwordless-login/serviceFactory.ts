import type { FastifyRequest } from 'fastify'

import type { DatabaseClient } from '../../db/client.js'
import type { ChatwootClient } from '../../integrations/chatwoot/client.js'
import type { SmtpEmailDelivery } from '../../integrations/email/smtp.js'
import type { AuthService } from '../auth/service.js'
import type { LegalDocumentsService } from '../legal-documents/service.js'
import { requireTenantContext } from '../tenants/routes.js'
import { createPasswordlessLoginRepository } from './repository.js'
import { createPasswordlessLoginService } from './service.js'

type CreatePasswordlessLoginServiceFactoryOptions = {
  authService: Pick<AuthService, 'issueSessionForUser'>
  createChatwootClient: (
    request: FastifyRequest,
  ) => Pick<ChatwootClient, 'findContactByEmail'>
  createEmailDelivery: () => Pick<SmtpEmailDelivery, 'send'>
  createLegalDocumentsService: (
    request: FastifyRequest,
  ) => Pick<LegalDocumentsService, 'getActiveVersionsForCustomerAccess'>
  database: DatabaseClient
  now?: () => Date
}

export function createPasswordlessLoginServiceFactory({
  authService,
  createChatwootClient,
  createEmailDelivery,
  createLegalDocumentsService,
  database,
  now,
}: CreatePasswordlessLoginServiceFactoryOptions) {
  return (request: FastifyRequest) => {
    const tenant = requireTenantContext(request)

    return createPasswordlessLoginService({
      authService,
      chatwootClient: createChatwootClient(request),
      emailDelivery: createEmailDelivery(),
      legalDocumentsReader: createLegalDocumentsService(request),
      passwordlessLoginRepository: createPasswordlessLoginRepository(
        database.db,
        {
          tenantId: tenant.id,
        },
      ),
      tenantId: tenant.id,
      ...(now ? { now } : {}),
    })
  }
}
