import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import Fastify, { type FastifyRequest } from 'fastify'

import type { AppEnv } from './config/env.js'
import type { DatabaseClient } from './db/client.js'
import { createChatwootAdminAgentsClient } from './integrations/chatwoot/adminAgents.js'
import { createSmtpEmailDelivery, type SmtpEmailDelivery } from './integrations/email/smtp.js'
import {
  createBrandingObjectStorageFromEnv,
  type BrandingObjectStorage,
} from './integrations/object-storage/brandingStorage.js'
import { registerApiErrorHandler } from './lib/errors.js'
import { createAuthPasswordServiceFactories } from './modules/auth/passwordServiceFactories.js'
import { registerAuthRateLimit } from './modules/auth/rateLimit.js'
import { registerAuthRoutes } from './modules/auth/routes.js'
import { createAuthService } from './modules/auth/service.js'
import { createBrandingRepository } from './modules/branding/repository.js'
import { registerBrandingRoutes } from './modules/branding/routes.js'
import { createBrandingAssetService } from './modules/branding/assetService.js'
import { createBrandingServiceForTenantRequest } from './modules/branding/serviceFactory.js'
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
import { registerLegalDocumentRoutes } from './modules/legal-documents/routes.js'
import { createLegalDocumentsServiceForTenantRequest } from './modules/legal-documents/serviceFactory.js'
import { registerPasswordlessLoginModule } from './modules/passwordless-login/module.js'
import { registerPasswordResetRoutes } from './modules/password-reset/routes.js'
import { registerPasswordSetupRoutes } from './modules/password-setup/routes.js'
import { registerProfileRoutes } from './modules/profile/routes.js'
import { createProfileService } from './modules/profile/service.js'
import { registerTelegramBridgeAdminRoutes } from './modules/telegram-bridge-admin/routes.js'
import { createTelegramBridgeSetupServiceForTenantRequest } from './modules/telegram-bridge-admin/serviceFactory.js'
import { createTenantAdminAuthRepository } from './modules/tenant-admin/adminAuthRepository.js'
import { createTenantAdminAuditLogger } from './modules/tenant-admin/adminAuthAudit.js'
import { registerTenantAdminAuthRoutes } from './modules/tenant-admin/adminAuthRoutes.js'
import { createTenantAdminAuthService } from './modules/tenant-admin/adminAuthService.js'
import { createTenantAdminVerificationService } from './modules/tenant-admin/adminVerification.js'
import { createTenantsRepository } from './modules/tenants/repository.js'
import { requireTenantContext, registerTenantContext, registerTenantRoutes } from './modules/tenants/routes.js'
import { createTenantsService } from './modules/tenants/service.js'
import { createTenantPwaBrandingReader } from './modules/tenants/pwaBrandingReader.js'
import { createTenantPwaIconReader } from './modules/tenants/pwaIconReader.js'
import { createRuntimeChatwootClientFactory, getAttachmentProxyAllowedOrigins } from './runtimeChatwootClientFactory.js'

export { createRuntimeChatwootClientFactory } from './runtimeChatwootClientFactory.js'

type BuildAppOptions = {
  brandingObjectStorage?: BrandingObjectStorage
  chatwootFetchFn?: typeof fetch
  database: DatabaseClient
  emailDelivery?: Pick<SmtpEmailDelivery, 'send'>
  env: AppEnv
  now?: () => Date
  telegramFetchFn?: typeof fetch
}

export function buildApp({
  brandingObjectStorage,
  chatwootFetchFn,
  database,
  emailDelivery,
  env,
  now,
  telegramFetchFn,
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
  const resolvedBrandingObjectStorage =
    brandingObjectStorage ?? createBrandingObjectStorageFromEnv(env)
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
  const createLegalDocumentsServiceForRequest = (request: FastifyRequest) =>
    createLegalDocumentsServiceForTenantRequest({
      database,
      request,
      ...(now ? { now } : {}),
    })
  const {
    createPasswordResetServiceForRequest,
    createPasswordSetupServiceForRequest,
  } = createAuthPasswordServiceFactories({
    authService,
    createEmailDelivery,
    database,
    ...(now ? { now } : {}),
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
  const createBrandingServiceForRequest = (request: FastifyRequest) =>
    createBrandingServiceForTenantRequest({ database, request })
  const createTelegramBridgeSetupServiceForRequest = (
    request: FastifyRequest,
  ) =>
    createTelegramBridgeSetupServiceForTenantRequest({
      ...(chatwootFetchFn ? { chatwootFetchFn } : {}),
      database,
      env,
      request,
      ...(telegramFetchFn ? { telegramFetchFn } : {}),
    })
  const createBrandingAssetServiceForRequest = (request: FastifyRequest) => {
    const tenant = requireTenantContext(request)
    const adminAuthRepository = createTenantAdminAuthRepository(database.db, {
      tenantId: tenant.id,
    })

    return createBrandingAssetService({
      audit: createTenantAdminAuditLogger(adminAuthRepository),
      repository: createBrandingRepository(database.db, {
        tenantId: tenant.id,
      }),
      storage: resolvedBrandingObjectStorage,
      tenantId: tenant.id,
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
  registerTenantRoutes(app, {
    pwaBrandingReader: createTenantPwaBrandingReader({
      db: database.db,
    }),
    pwaIconReader: createTenantPwaIconReader({
      createBrandingAssetService: createBrandingAssetServiceForRequest,
      db: database.db,
    }),
    tenantsService,
  })
  registerAuthRoutes(app, {
    authService,
    env,
  })
  registerProfileRoutes(app, {
    authService,
    createProfileService: createProfileServiceForRequest,
    env,
  })
  registerLegalDocumentRoutes(app, {
    createLegalDocumentsService: createLegalDocumentsServiceForRequest,
    createTenantAdminAuthService: createTenantAdminAuthServiceForRequest,
    env,
  })
  registerPasswordResetRoutes(app, {
    createPasswordResetService: createPasswordResetServiceForRequest,
  })
  registerPasswordlessLoginModule(app, {
    authService,
    createChatwootClient: createChatwootClientForRequest,
    createEmailDelivery,
    createLegalDocumentsService: createLegalDocumentsServiceForRequest,
    database,
    env,
    ...(now ? { now } : {}),
  })
  registerPasswordSetupRoutes(app, {
    authService,
    createPasswordSetupService: createPasswordSetupServiceForRequest,
    env,
  })
  registerTenantAdminAuthRoutes(app, {
    createTenantAdminAuthService: createTenantAdminAuthServiceForRequest,
    env,
  })
  registerBrandingRoutes(app, {
    createBrandingAssetService: createBrandingAssetServiceForRequest,
    createBrandingService: createBrandingServiceForRequest,
    createTenantAdminAuthService: createTenantAdminAuthServiceForRequest,
    env,
  })
  registerTelegramBridgeAdminRoutes(app, {
    createTelegramBridgeSetupService:
      createTelegramBridgeSetupServiceForRequest,
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
