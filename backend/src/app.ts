import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import Fastify from 'fastify'

import type { AppEnv } from './config/env.js'
import type { DatabaseClient } from './db/client.js'
import { createChatwootClient } from './integrations/chatwoot/client.js'
import { createSmtpEmailDelivery } from './integrations/email/smtp.js'
import { registerApiErrorHandler } from './lib/errors.js'
import { registerAuthRoutes } from './modules/auth/routes.js'
import { createAuthService } from './modules/auth/service.js'
import { createChatContextRepository } from './modules/chat-context/repository.js'
import { registerChatContextRoutes } from './modules/chat-context/routes.js'
import { createChatContextService } from './modules/chat-context/service.js'
import { registerChatMessagesRoutes } from './modules/chat-messages/routes.js'
import { createChatMessagesRepository } from './modules/chat-messages/repository.js'
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  createChatMessagesService,
} from './modules/chat-messages/service.js'
import { createChatRealtimeHub } from './modules/chat-realtime/hub.js'
import { registerChatRealtimeRoutes } from './modules/chat-realtime/routes.js'
import { createChatwootWebhookRepository } from './modules/chatwoot-webhooks/repository.js'
import { registerChatwootWebhookRoutes } from './modules/chatwoot-webhooks/routes.js'
import { createChatwootWebhookService } from './modules/chatwoot-webhooks/service.js'
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
  app.register(multipart, {
    limits: {
      fields: 4,
      fileSize: CHAT_ATTACHMENT_MAX_BYTES,
      files: 1,
      parts: 5,
    },
  })

  app.addHook('onClose', async () => {
    await database.close()
  })

  registerApiErrorHandler(app)

  const authService = createAuthService({
    db: database.db,
    env,
  })
  const chatwootClient = createChatwootClient({ env })
  const chatContextService = createChatContextService({
    chatContextRepository: createChatContextRepository(database.db),
    chatwootClient,
  })
  const chatMessagesService = createChatMessagesService({
    chatContextService,
    chatMessagesRepository: createChatMessagesRepository(database.db),
    chatwootClient,
  })
  const chatRealtimeHub = createChatRealtimeHub()

  registerHealthRoutes(app, { env })
  registerAuthRoutes(app, {
    authService,
    env,
  })
  registerRegistrationRoutes(app, {
    env,
    registrationService: createRegistrationService({
      chatwootClient,
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
  registerChatContextRoutes(app, {
    authService,
    chatContextService,
    env,
  })
  registerChatMessagesRoutes(app, {
    authService,
    chatMessagesService,
    env,
  })
  registerChatRealtimeRoutes(app, {
    authService,
    chatContextService,
    env,
    realtimeHub: chatRealtimeHub,
  })
  registerChatwootWebhookRoutes(app, {
    chatwootWebhookService: createChatwootWebhookService({
      chatMessagesService,
      env,
      realtimeHub: chatRealtimeHub,
      webhookRepository: createChatwootWebhookRepository(database.db),
    }),
  })

  return app
}
