import type { FastifyInstance } from 'fastify'

import type { AppEnv } from '../../config/env.js'
import type { DatabaseClient } from '../../db/client.js'
import type { SmtpEmailDelivery } from '../../integrations/email/smtp.js'
import type { AuthService } from '../auth/service.js'
import { registerPasswordlessLoginRoutes } from './routes.js'
import { createPasswordlessLoginServiceFactory } from './serviceFactory.js'

type RegisterPasswordlessLoginModuleOptions = {
  authService: Pick<AuthService, 'issueSessionForUser'>
  createEmailDelivery: () => Pick<SmtpEmailDelivery, 'send'>
  database: DatabaseClient
  env: AppEnv
  now?: () => Date
}

export function registerPasswordlessLoginModule(
  app: FastifyInstance,
  {
    authService,
    createEmailDelivery,
    database,
    env,
    now,
  }: RegisterPasswordlessLoginModuleOptions,
) {
  registerPasswordlessLoginRoutes(app, {
    createPasswordlessLoginService: createPasswordlessLoginServiceFactory({
      authService,
      createEmailDelivery,
      database,
      ...(now ? { now } : {}),
    }),
    env,
  })
}
