import type { FastifyInstance } from 'fastify'
import type { FastifyRequest } from 'fastify'

import type { AppEnv } from '../../config/env.js'
import type { DatabaseClient } from '../../db/client.js'
import type { ChatwootClient } from '../../integrations/chatwoot/client.js'
import type { SmtpEmailDelivery } from '../../integrations/email/smtp.js'
import type { AuthService } from '../auth/service.js'
import type { LegalDocumentsService } from '../legal-documents/service.js'
import { registerPasswordlessLoginRoutes } from './routes.js'
import { createPasswordlessLoginServiceFactory } from './serviceFactory.js'

type RegisterPasswordlessLoginModuleOptions = {
  authService: Pick<AuthService, 'issueSessionForUser'>
  createChatwootClient: (
    request: FastifyRequest,
  ) => Pick<ChatwootClient, 'findContactByEmail'>
  createEmailDelivery: () => Pick<SmtpEmailDelivery, 'send'>
  createLegalDocumentsService: (
    request: FastifyRequest,
  ) => Pick<LegalDocumentsService, 'getActiveVersionsForCustomerAccess'>
  database: DatabaseClient
  env: AppEnv
  now?: () => Date
}

export function registerPasswordlessLoginModule(
  app: FastifyInstance,
  {
    authService,
    createChatwootClient,
    createEmailDelivery,
    createLegalDocumentsService,
    database,
    env,
    now,
  }: RegisterPasswordlessLoginModuleOptions,
) {
  registerPasswordlessLoginRoutes(app, {
    createPasswordlessLoginService: createPasswordlessLoginServiceFactory({
      authService,
      createChatwootClient,
      createEmailDelivery,
      createLegalDocumentsService,
      database,
      ...(now ? { now } : {}),
    }),
    env,
  })
}
