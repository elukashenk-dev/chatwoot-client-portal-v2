import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import Fastify from 'fastify'
import type { FastifyRequest } from 'fastify'

import type { AppEnv } from './config/env.js'
import type { DatabaseClient } from './db/client.js'
import { createChatwootClientFactory } from './integrations/chatwoot/client.js'
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
import { createTenantsRepository } from './modules/tenants/repository.js'
import {
  requireTenantContext,
  registerTenantContext,
  registerTenantRoutes,
} from './modules/tenants/routes.js'
import { createTenantsService } from './modules/tenants/service.js'

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
    trustProxy: env.PORTAL_TRUST_PROXY,
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
  const chatwootClientFactory = createChatwootClientFactory()
  const chatRealtimeHub = createChatRealtimeHub()
  const tenantsService = createTenantsService({
    defaultTenantSlug: env.DEFAULT_TENANT_SLUG,
    tenantSecretKey: env.PORTAL_TENANT_SECRET_KEY,
    tenantsRepository: createTenantsRepository(database.db),
  })
  const createChatwootClientForRequest = (request: FastifyRequest) =>
    chatwootClientFactory.forTenant(requireTenantContext(request).chatwoot)
  const createChatContextServiceForRequest = (request: FastifyRequest) =>
    createChatContextService({
      chatContextRepository: createChatContextRepository(database.db, {
        tenantId: requireTenantContext(request).id,
      }),
      chatwootClient: createChatwootClientForRequest(request),
    })
  const createChatMessagesServiceForRequest = (request: FastifyRequest) =>
    createChatMessagesService({
      chatContextService: createChatContextServiceForRequest(request),
      chatMessagesRepository: createChatMessagesRepository(database.db, {
        tenantId: requireTenantContext(request).id,
      }),
      chatwootClient: createChatwootClientForRequest(request),
    })
  const createRegistrationServiceForRequest = (request: FastifyRequest) =>
    createRegistrationService({
      chatwootClient: createChatwootClientForRequest(request),
      emailDelivery: createSmtpEmailDelivery({ env }),
      portalUsersRepository: createPortalUsersRepository(database.db),
      registrationRepository: createRegistrationRepository(database.db, {
        tenantId: requireTenantContext(request).id,
      }),
      tenantId: requireTenantContext(request).id,
    })
  const createPasswordResetServiceForRequest = (request: FastifyRequest) =>
    createPasswordResetService({
      emailDelivery: createSmtpEmailDelivery({ env }),
      passwordResetRepository: createPasswordResetRepository(database.db, {
        tenantId: requireTenantContext(request).id,
      }),
    })
  const createChatwootWebhookServiceForRequest = (request: FastifyRequest) => {
    const tenant = requireTenantContext(request)

    return createChatwootWebhookService({
      chatMessagesService: createChatMessagesServiceForRequest(request),
      realtimeHub: chatRealtimeHub,
      webhookRepository: createChatwootWebhookRepository(database.db, {
        tenantId: tenant.id,
      }),
      webhookSecret: tenant.chatwoot.webhookSecret,
    })
  }

  registerHealthRoutes(app, { env })
  registerTenantContext(app, { tenantsService })
  registerTenantRoutes(app, { tenantsService })
  registerAuthRoutes(app, {
    authService,
    env,
  })
  registerRegistrationRoutes(app, {
    createRegistrationService: createRegistrationServiceForRequest,
  })
  registerPasswordResetRoutes(app, {
    createPasswordResetService: createPasswordResetServiceForRequest,
  })
  registerChatContextRoutes(app, {
    authService,
    createChatContextService: createChatContextServiceForRequest,
    env,
  })
  registerChatMessagesRoutes(app, {
    authService,
    createChatMessagesService: createChatMessagesServiceForRequest,
    env,
  })
  registerChatRealtimeRoutes(app, {
    authService,
    createChatContextService: createChatContextServiceForRequest,
    env,
    realtimeHub: chatRealtimeHub,
  })
  registerChatwootWebhookRoutes(app, {
    createChatwootWebhookService: createChatwootWebhookServiceForRequest,
  })

  return app
}
