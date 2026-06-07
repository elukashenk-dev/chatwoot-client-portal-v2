import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import Fastify from 'fastify'
import type { FastifyRequest } from 'fastify'

import type { AppEnv } from './config/env.js'
import type { DatabaseClient } from './db/client.js'
import { createChatwootAdminAgentsClient } from './integrations/chatwoot/adminAgents.js'
import { createChatwootClientFactory } from './integrations/chatwoot/client.js'
import {
  createSmtpEmailDelivery,
  type SmtpEmailDelivery,
} from './integrations/email/smtp.js'
import { registerApiErrorHandler } from './lib/errors.js'
import { registerAuthRateLimit } from './modules/auth/rateLimit.js'
import { registerAuthRoutes } from './modules/auth/routes.js'
import { createAuthService } from './modules/auth/service.js'
import { createBrandingRepository } from './modules/branding/repository.js'
import { registerBrandingRoutes } from './modules/branding/routes.js'
import { createBrandingService } from './modules/branding/service.js'
import { createAttachmentProxyFetcher } from './modules/chat-messages/attachmentProxy.js'
import { registerChatMessagesRoutes } from './modules/chat-messages/routes.js'
import { createChatMessagesRepository } from './modules/chat-messages/repository.js'
import {
  createChatSendRateLimiter,
  createChatSendRateLimitRepository,
} from './modules/chat-messages/rateLimit.js'
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  createChatMessagesService,
} from './modules/chat-messages/service.js'
import { registerChatNotificationRoutes } from './modules/chat-notifications/routes.js'
import { createChatNotificationsRepository } from './modules/chat-notifications/repository.js'
import { createChatNotificationRecipientResolver } from './modules/chat-notifications/recipientResolver.js'
import { createChatNotificationPushDeliveryService } from './modules/chat-notifications/pushDeliveryService.js'
import { createPushSubscriptionService } from './modules/chat-notifications/pushSubscriptionService.js'
import { createChatNotificationsService } from './modules/chat-notifications/service.js'
import { createWebPushTransport } from './modules/chat-notifications/pushTransport.js'
import { createVapidConfig } from './modules/chat-notifications/vapid.js'
import { registerChatPresenceRoutes } from './modules/chat-presence/routes.js'
import { createChatPresenceService } from './modules/chat-presence/service.js'
import { createChatRealtimeHub } from './modules/chat-realtime/hub.js'
import { registerChatRealtimeRoutes } from './modules/chat-realtime/routes.js'
import { registerChatSupportRoutes } from './modules/chat-support/routes.js'
import { createChatSupportAvailabilityService } from './modules/chat-support/service.js'
import { createChatThreadContactRepository } from './modules/chat-threads/contactRepository.js'
import { createChatThreadsRepository } from './modules/chat-threads/repository.js'
import { registerChatThreadsRoutes } from './modules/chat-threads/routes.js'
import { createChatThreadsService } from './modules/chat-threads/service.js'
import { createChatUnreadRepository } from './modules/chat-unread/repository.js'
import { createChatUnreadService } from './modules/chat-unread/service.js'
import { createChatwootWebhookRepository } from './modules/chatwoot-webhooks/repository.js'
import { registerChatwootWebhookRoutes } from './modules/chatwoot-webhooks/routes.js'
import { createChatwootWebhookService } from './modules/chatwoot-webhooks/service.js'
import { registerHealthRoutes } from './modules/health/routes.js'
import { createPasswordResetRepository } from './modules/password-reset/repository.js'
import { registerPasswordResetRoutes } from './modules/password-reset/routes.js'
import { createPasswordResetService } from './modules/password-reset/service.js'
import { createPortalUsersRepository } from './modules/portal-users/repository.js'
import { registerProfileRoutes } from './modules/profile/routes.js'
import { createProfileService } from './modules/profile/service.js'
import { createRegistrationRepository } from './modules/registration/repository.js'
import { registerRegistrationRoutes } from './modules/registration/routes.js'
import { createRegistrationService } from './modules/registration/service.js'
import { createTenantAdminAuthRepository } from './modules/tenant-admin/adminAuthRepository.js'
import { createTenantAdminAuditLogger } from './modules/tenant-admin/adminAuthAudit.js'
import { registerTenantAdminAuthRoutes } from './modules/tenant-admin/adminAuthRoutes.js'
import { createTenantAdminAuthService } from './modules/tenant-admin/adminAuthService.js'
import { createTenantAdminVerificationService } from './modules/tenant-admin/adminVerification.js'
import { createTenantsRepository } from './modules/tenants/repository.js'
import {
  requireTenantContext,
  registerTenantContext,
  registerTenantRoutes,
} from './modules/tenants/routes.js'
import { createTenantsService } from './modules/tenants/service.js'

type BuildAppOptions = {
  chatwootFetchFn?: typeof fetch
  database: DatabaseClient
  emailDelivery?: Pick<SmtpEmailDelivery, 'send'>
  env: AppEnv
  now?: () => Date
}

type RuntimeChatwootClientFactoryOptions = {
  chatwootFetchFn?: typeof fetch | undefined
  env: Pick<AppEnv, 'CHATWOOT_REQUEST_TIMEOUT_MS'>
}

function getAttachmentProxyAllowedOrigins({
  env,
  tenantChatwootBaseUrl,
}: {
  env: Pick<AppEnv, 'CHAT_ATTACHMENT_PROXY_ALLOWED_ORIGINS'>
  tenantChatwootBaseUrl: string
}) {
  return [tenantChatwootBaseUrl, ...env.CHAT_ATTACHMENT_PROXY_ALLOWED_ORIGINS]
}

export function createRuntimeChatwootClientFactory({
  chatwootFetchFn,
  env,
}: RuntimeChatwootClientFactoryOptions) {
  return createChatwootClientFactory({
    ...(chatwootFetchFn ? { fetchFn: chatwootFetchFn } : {}),
    requestTimeoutMs: env.CHATWOOT_REQUEST_TIMEOUT_MS,
  })
}

export function buildApp({
  chatwootFetchFn,
  database,
  emailDelivery,
  env,
  now,
}: BuildAppOptions) {
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
    ...(now ? { now } : {}),
  })
  const chatwootClientFactory = createRuntimeChatwootClientFactory({
    chatwootFetchFn,
    env,
  })
  const chatRealtimeHub = createChatRealtimeHub()
  const chatReadSyncThrottleStore = new Map<string, number>()
  const chatTypingThrottleStore = new Map<string, number>()
  const vapidConfig = createVapidConfig(env)
  const pushTransport = vapidConfig ? createWebPushTransport(vapidConfig) : null
  const chatSendRateLimiter = createChatSendRateLimiter({
    repository: createChatSendRateLimitRepository(database.db),
  })
  const tenantsService = createTenantsService({
    defaultTenantSlug: env.DEFAULT_TENANT_SLUG,
    tenantSecretKey: env.PORTAL_TENANT_SECRET_KEY,
    tenantsRepository: createTenantsRepository(database.db),
  })
  const createEmailDelivery = () =>
    emailDelivery ?? createSmtpEmailDelivery({ env })
  const createChatwootClientForRequest = (request: FastifyRequest) =>
    chatwootClientFactory.forTenant(requireTenantContext(request).chatwoot)
  const createChatNotificationRecipientResolverForRequest = (
    request: FastifyRequest,
  ) => {
    const tenant = requireTenantContext(request)

    return createChatNotificationRecipientResolver({
      chatThreadsRepository: createChatThreadsRepository(database.db, {
        tenantId: tenant.id,
      }),
      chatwootClient: createChatwootClientForRequest(request),
      contactRepository: createChatThreadContactRepository(database.db, {
        tenantId: tenant.id,
      }),
    })
  }
  const createChatUnreadServiceForRequest = (request: FastifyRequest) => {
    const tenant = requireTenantContext(request)

    return createChatUnreadService({
      recipientResolver:
        createChatNotificationRecipientResolverForRequest(request),
      repository: createChatUnreadRepository(database.db, {
        tenantId: tenant.id,
      }),
    })
  }
  const createChatThreadsServiceForRequest = (request: FastifyRequest) => {
    const tenant = requireTenantContext(request)

    return createChatThreadsService({
      chatUnreadService: createChatUnreadServiceForRequest(request),
      contactRepository: createChatThreadContactRepository(database.db, {
        tenantId: tenant.id,
      }),
      chatThreadsRepository: createChatThreadsRepository(database.db, {
        tenantId: tenant.id,
      }),
      chatwootClient: createChatwootClientForRequest(request),
      portalInboxId: tenant.chatwoot.portalInboxId,
      supportLabel: `Команда ${tenant.displayName}`,
    })
  }
  const createChatMessagesServiceForRequest = (request: FastifyRequest) => {
    const tenant = requireTenantContext(request)

    return createChatMessagesService({
      attachmentAllowedOrigins: getAttachmentProxyAllowedOrigins({
        env,
        tenantChatwootBaseUrl: tenant.chatwoot.baseUrl,
      }),
      attachmentAllowPrivateNetwork: env.NODE_ENV !== 'production',
      attachmentRequestTimeoutMs: env.CHATWOOT_REQUEST_TIMEOUT_MS,
      chatThreadsRepository: createChatThreadsRepository(database.db, {
        tenantId: tenant.id,
      }),
      contactRepository: createChatThreadContactRepository(database.db, {
        tenantId: tenant.id,
      }),
      chatThreadsService: createChatThreadsServiceForRequest(request),
      chatUnreadService: createChatUnreadServiceForRequest(request),
      chatMessagesRepository: createChatMessagesRepository(database.db, {
        tenantId: tenant.id,
      }),
      chatwootClient: createChatwootClientForRequest(request),
    })
  }
  const createProfileServiceForRequest = (request: FastifyRequest) => {
    const tenant = requireTenantContext(request)

    return createProfileService({
      chatwootClient: createChatwootClientForRequest(request),
      contactRepository: createChatThreadContactRepository(database.db, {
        tenantId: tenant.id,
      }),
      fetchAllowedAttachment: createAttachmentProxyFetcher({
        allowedOrigins: getAttachmentProxyAllowedOrigins({
          env,
          tenantChatwootBaseUrl: tenant.chatwoot.baseUrl,
        }),
        allowPrivateNetwork: env.NODE_ENV !== 'production',
        fetchFn: fetch,
        requestTimeoutMs: env.CHATWOOT_REQUEST_TIMEOUT_MS,
      }),
    })
  }
  const createChatPresenceServiceForRequest = (request: FastifyRequest) => {
    const tenant = requireTenantContext(request)
    const chatwootClient = createChatwootClientForRequest(request)

    return createChatPresenceService({
      chatThreadsRepository: createChatThreadsRepository(database.db, {
        tenantId: tenant.id,
      }),
      chatThreadsService: createChatThreadsServiceForRequest(request),
      chatwoot: {
        findContactPortalInboxSourceId:
          chatwootClient.findContactPortalInboxSourceId,
        portalInboxIdentifier: tenant.chatwoot.portalInboxIdentifier,
        togglePublicConversationTyping:
          chatwootClient.togglePublicConversationTyping,
        updatePublicConversationLastSeen:
          chatwootClient.updatePublicConversationLastSeen,
      },
      ...(now ? { now } : {}),
      readSyncThrottleStore: chatReadSyncThrottleStore,
      tenantId: tenant.id,
      typingThrottleStore: chatTypingThrottleStore,
    })
  }
  const createChatSupportAvailabilityServiceForRequest = (
    request: FastifyRequest,
  ) =>
    createChatSupportAvailabilityService({
      chatwootClient: createChatwootClientForRequest(request),
    })
  const createChatNotificationsServiceForRequest = (request: FastifyRequest) =>
    createChatNotificationsService({
      chatThreadsService: createChatThreadsServiceForRequest(request),
      repository: createChatNotificationsRepository(database.db, {
        tenantId: requireTenantContext(request).id,
      }),
    })
  const createPushSubscriptionServiceForRequest = (request: FastifyRequest) =>
    createPushSubscriptionService({
      repository: createChatNotificationsRepository(database.db, {
        tenantId: requireTenantContext(request).id,
      }),
      vapidConfig,
    })
  const createPushDeliveryServiceForRequest = (request: FastifyRequest) => {
    const tenant = requireTenantContext(request)

    return createChatNotificationPushDeliveryService({
      chatThreadsService: createChatThreadsServiceForRequest(request),
      recipientResolver:
        createChatNotificationRecipientResolverForRequest(request),
      repository: createChatNotificationsRepository(database.db, {
        tenantId: tenant.id,
      }),
      transport: pushTransport,
    })
  }
  const createRegistrationServiceForRequest = (request: FastifyRequest) =>
    createRegistrationService({
      chatwootClient: createChatwootClientForRequest(request),
      emailDelivery: createEmailDelivery(),
      portalUsersRepository: createPortalUsersRepository(database.db),
      registrationRepository: createRegistrationRepository(database.db, {
        tenantId: requireTenantContext(request).id,
      }),
      tenantId: requireTenantContext(request).id,
    })
  const createPasswordResetServiceForRequest = (request: FastifyRequest) =>
    createPasswordResetService({
      emailDelivery: createEmailDelivery(),
      passwordResetRepository: createPasswordResetRepository(database.db, {
        tenantId: requireTenantContext(request).id,
      }),
    })
  const createTenantAdminAuthServiceForRequest = (request: FastifyRequest) => {
    const tenant = requireTenantContext(request)

    return createTenantAdminAuthService({
      emailDelivery: createEmailDelivery(),
      repository: createTenantAdminAuthRepository(database.db, {
        tenantId: tenant.id,
      }),
      tenantAdminVerificationService: createTenantAdminVerificationService({
        chatwootAdminAgentsClientFactory: {
          forTenant: (config) =>
            createChatwootAdminAgentsClient({
              config,
              fetchFn: chatwootFetchFn ?? fetch,
              requestTimeoutMs: env.CHATWOOT_REQUEST_TIMEOUT_MS,
            }),
        },
        tenantSecretKey: env.PORTAL_TENANT_SECRET_KEY ?? '',
        tenantsRepository: createTenantsRepository(database.db),
      }),
      tenantId: tenant.id,
      ...(now ? { now } : {}),
    })
  }
  const createBrandingServiceForRequest = (request: FastifyRequest) => {
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
  const createChatwootWebhookServiceForRequest = (request: FastifyRequest) => {
    const tenant = requireTenantContext(request)

    return createChatwootWebhookService({
      chatMessagesService: createChatMessagesServiceForRequest(request),
      chatUnreadService: createChatUnreadServiceForRequest(request),
      chatwootAccountId: tenant.chatwoot.accountId,
      chatwootPortalInboxId: tenant.chatwoot.portalInboxId,
      pushDeliveryService: createPushDeliveryServiceForRequest(request),
      realtimeHub: chatRealtimeHub,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      webhookRepository: createChatwootWebhookRepository(database.db, {
        tenantId: tenant.id,
      }),
      webhookSecret: tenant.chatwoot.webhookSecret,
    })
  }

  registerHealthRoutes(app, { env })
  registerTenantContext(app, { tenantsService })
  registerAuthRateLimit(app, {
    maxRequests: env.AUTH_RATE_LIMIT_MAX,
    windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  })
  registerTenantRoutes(app, { tenantsService })
  registerAuthRoutes(app, {
    authService,
    env,
  })
  registerProfileRoutes(app, {
    authService,
    createProfileService: createProfileServiceForRequest,
    env,
  })
  registerRegistrationRoutes(app, {
    createRegistrationService: createRegistrationServiceForRequest,
  })
  registerPasswordResetRoutes(app, {
    createPasswordResetService: createPasswordResetServiceForRequest,
  })
  registerTenantAdminAuthRoutes(app, {
    createTenantAdminAuthService: createTenantAdminAuthServiceForRequest,
    env,
  })
  registerBrandingRoutes(app, {
    createBrandingService: createBrandingServiceForRequest,
    createTenantAdminAuthService: createTenantAdminAuthServiceForRequest,
    env,
  })
  registerChatThreadsRoutes(app, {
    authService,
    createChatThreadsService: createChatThreadsServiceForRequest,
    env,
  })
  registerChatSupportRoutes(app, {
    authService,
    createChatSupportAvailabilityService:
      createChatSupportAvailabilityServiceForRequest,
    env,
  })
  registerChatNotificationRoutes(app, {
    authService,
    createChatNotificationsService: createChatNotificationsServiceForRequest,
    createPushSubscriptionService: createPushSubscriptionServiceForRequest,
    env,
  })
  registerChatMessagesRoutes(app, {
    authService,
    chatSendRateLimiter,
    createChatMessagesService: createChatMessagesServiceForRequest,
    env,
  })
  registerChatPresenceRoutes(app, {
    authService,
    createChatPresenceService: createChatPresenceServiceForRequest,
    env,
  })
  registerChatRealtimeRoutes(app, {
    authService,
    createChatThreadsService: createChatThreadsServiceForRequest,
    env,
    realtimeHub: chatRealtimeHub,
  })
  registerChatwootWebhookRoutes(app, {
    createChatwootWebhookService: createChatwootWebhookServiceForRequest,
  })

  return app
}
