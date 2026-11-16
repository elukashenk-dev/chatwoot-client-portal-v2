import { createWebhookSourceKey } from './sourceKey.js'
import type { AppEnv } from '../../config/env.js'
import type { DatabaseClient } from '../../db/client.js'
import type { TenantRequestContext } from '../tenants/service.js'
import {
  createRuntimeChatwootClientFactory,
  getAttachmentProxyAllowedOrigins,
} from '../../runtimeChatwootClientFactory.js'
import { createChatMessagesRepository } from '../chat-messages/repository.js'
import { createChatMessagesService } from '../chat-messages/service.js'
import { createChatNotificationsRepository } from '../chat-notifications/repository.js'
import { createChatNotificationRecipientResolver } from '../chat-notifications/recipientResolver.js'
import { createChatNotificationPushDeliveryService } from '../chat-notifications/pushDeliveryService.js'
import type { PushTransport } from '../chat-notifications/pushTransport.js'
import { createChatThreadContactRepository } from '../chat-threads/contactRepository.js'
import { createChatThreadsRepository } from '../chat-threads/repository.js'
import { createChatThreadsService } from '../chat-threads/service.js'
import { createChatUnreadRepository } from '../chat-unread/repository.js'
import { createChatUnreadService } from '../chat-unread/service.js'

export function createTenantChatRuntimeFactory({
  database,
  env,
  chatwootClientFactory,
  pushTransport,
}: {
  database: DatabaseClient
  env: AppEnv
  chatwootClientFactory: ReturnType<typeof createRuntimeChatwootClientFactory>
  pushTransport: PushTransport | null
}) {
  const createChatNotificationRecipientResolverForTenant = (
    tenant: TenantRequestContext,
  ) => {
    return createChatNotificationRecipientResolver({
      strict: true,
      maxContactLinks: 1_000,
      chatThreadsRepository: createChatThreadsRepository(database.db, {
        tenantId: tenant.id,
      }),
      chatwootClient: chatwootClientFactory.forTenant(tenant.chatwoot),
      contactRepository: createChatThreadContactRepository(database.db, {
        tenantId: tenant.id,
      }),
    })
  }
  const createChatUnreadServiceForTenant = (tenant: TenantRequestContext) => {
    return createChatUnreadService({
      recipientResolver:
        createChatNotificationRecipientResolverForTenant(tenant),
      repository: createChatUnreadRepository(database.db, {
        sourceKey: createWebhookSourceKey({
          baseUrl: tenant.chatwoot.baseUrl,
          accountId: tenant.chatwoot.accountId,
          inboxId: tenant.chatwoot.portalInboxId,
        }),
        tenantId: tenant.id,
      }),
    })
  }
  const createChatThreadsServiceForTenant = (tenant: TenantRequestContext) => {
    return createChatThreadsService({
      chatUnreadService: createChatUnreadServiceForTenant(tenant),
      contactRepository: createChatThreadContactRepository(database.db, {
        tenantId: tenant.id,
      }),
      chatThreadsRepository: createChatThreadsRepository(database.db, {
        tenantId: tenant.id,
      }),
      chatwootClient: chatwootClientFactory.forTenant(tenant.chatwoot),
      portalInboxId: tenant.chatwoot.portalInboxId,
      supportLabel: `Команда ${tenant.displayName}`,
    })
  }
  const createChatMessagesServiceForTenant = (tenant: TenantRequestContext) => {
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
      chatThreadsService: createChatThreadsServiceForTenant(tenant),
      chatUnreadService: createChatUnreadServiceForTenant(tenant),
      chatMessagesRepository: createChatMessagesRepository(database.db, {
        tenantId: tenant.id,
      }),
      chatwootClient: chatwootClientFactory.forTenant(tenant.chatwoot),
    })
  }
  const createPushDeliveryServiceForTenant = (tenant: TenantRequestContext) => {
    return createChatNotificationPushDeliveryService({
      chatThreadsService: createChatThreadsServiceForTenant(tenant),
      recipientResolver:
        createChatNotificationRecipientResolverForTenant(tenant),
      repository: createChatNotificationsRepository(database.db, {
        tenantId: tenant.id,
      }),
      transport: pushTransport,
    })
  }
  return (tenant: TenantRequestContext) => ({
    messagesService: createChatMessagesServiceForTenant(tenant),
    threadsService: createChatThreadsServiceForTenant(tenant),
    recipientResolver: createChatNotificationRecipientResolverForTenant(tenant),
    pushDeliveryService: createPushDeliveryServiceForTenant(tenant),
  })
}
