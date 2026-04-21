import cookie from '@fastify/cookie'
import Fastify from 'fastify'

import type { AppEnv } from './config/env.js'
import type { DatabaseClient } from './db/client.js'
import { createChatwootClient } from './integrations/chatwoot/client.js'
import { createSmtpEmailDelivery } from './integrations/email/smtp.js'
import { registerApiErrorHandler } from './lib/errors.js'
import { registerAuthRoutes } from './modules/auth/routes.js'
import { createAuthService } from './modules/auth/service.js'
import { registerHealthRoutes } from './modules/health/routes.js'
import { createPasswordResetRepository } from './modules/password-reset/repository.js'
import { registerPasswordResetRoutes } from './modules/password-reset/routes.js'
import { createPasswordResetService } from './modules/password-reset/service.js'
import { createPortalUsersRepository } from './modules/portal-users/repository.js'
import { createRegistrationRepository } from './modules/registration/repository.js'
import { registerRegistrationRoutes } from './modules/registration/routes.js'
import { createRegistrationService } from './modules/registration/service.js'

type BuildAppOptions = {
  database: DatabaseClient
  env: AppEnv
}

export function buildApp({ database, env }: BuildAppOptions) {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: env.NODE_ENV === 'development' ? 'info' : 'warn',
          },
  })

  app.register(cookie, {
    hook: 'onRequest',
    secret: env.SESSION_SECRET,
  })

  app.addHook('onClose', async () => {
    await database.close()
  })

  registerApiErrorHandler(app)

  registerHealthRoutes(app, { env })
  registerAuthRoutes(app, {
    authService: createAuthService({
      db: database.db,
      env,
    }),
    env,
  })
  registerRegistrationRoutes(app, {
    env,
    registrationService: createRegistrationService({
      chatwootClient: createChatwootClient({ env }),
      emailDelivery: createSmtpEmailDelivery({ env }),
      portalUsersRepository: createPortalUsersRepository(database.db),
      registrationRepository: createRegistrationRepository(database.db),
    }),
  })
  registerPasswordResetRoutes(app, {
    env,
    passwordResetService: createPasswordResetService({
      emailDelivery: createSmtpEmailDelivery({ env }),
      passwordResetRepository: createPasswordResetRepository(database.db),
    }),
  })

  return app
}
