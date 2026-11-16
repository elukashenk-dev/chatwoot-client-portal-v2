import type { ChatMessagesSnapshot } from '../chat-messages/service.js'
import type { ChatNotificationRecipientResolver } from '../chat-notifications/recipientResolver.js'
import type { ChatNotificationPushDeliveryService } from '../chat-notifications/pushDeliveryService.js'
import type { ChatRealtimeHub } from '../chat-realtime/hub.js'
import type { TenantRequestContext } from '../tenants/service.js'
import type { ChatwootWebhookRepository } from './repository.js'
import type {
  ClaimedWebhookWork,
  WebhookWorkRepository,
} from './workRepository.js'

type Runtime = {
  tenant: TenantRequestContext
  webhookRepository: ChatwootWebhookRepository
  recipientResolver: ChatNotificationRecipientResolver
  messagesService: {
    getCurrentUserChatMessages: (input: {
      threadId: string
      userId: number
    }) => Promise<ChatMessagesSnapshot>
  }
  pushDeliveryService: Pick<
    ChatNotificationPushDeliveryService,
    'deliverMessageCreated'
  >
}

export function createWebhookWorkProcessor({
  resolveRuntime,
  repository,
  realtimeHub,
}: {
  resolveRuntime: (tenantId: number) => Promise<Runtime>
  repository: WebhookWorkRepository
  realtimeHub: ChatRealtimeHub
}) {
  return async (job: ClaimedWebhookWork, assertLease: () => void) => {
    const runtime = await resolveRuntime(job.tenantId)
    const { tenant } = runtime
    if (
      tenant.id !== job.tenantId ||
      tenant.status !== 'active' ||
      tenant.chatwoot.accountId !== job.chatwootAccountId ||
      tenant.chatwoot.portalInboxId !== job.chatwootInboxId ||
      tenant.chatwoot.baseUrl !== job.chatwootBaseUrl
    ) {
      throw new Error('Webhook tenant configuration changed')
    }
    const mapping =
      await runtime.webhookRepository.findConversationMappingByChatwootConversationId(
        job.chatwootConversationId,
      )
    if (
      !mapping ||
      mapping.portalChatThreadId !== job.portalChatThreadId ||
      mapping.chatwootInboxId !== job.chatwootInboxId
    )
      throw new Error('Webhook mapping changed')
    assertLease()
    if (job.eventName === 'message_created' && !job.unreadCompleted) {
      const recipients =
        job.chatwootMessageId === null
          ? []
          : await runtime.recipientResolver.resolveRecipients({
              chatwootMessageId: job.chatwootMessageId,
              threadMapping: mapping,
            })
      assertLease()
      await repository.checkpointUnread(job, recipients)
    }
    assertLease()
    try {
      await realtimeHub.publishThreadMessages({
        tenantId: tenant.id,
        threadId: mapping.threadId,
        createSnapshotForUser: async (userId) => {
          assertLease()
          const snapshot =
            await runtime.messagesService.getCurrentUserChatMessages({
              userId,
              threadId: mapping.threadId,
            })
          if (
            snapshot.reason === 'chatwoot_unavailable' ||
            snapshot.reason === 'chatwoot_not_configured'
          ) {
            throw new Error('Webhook snapshot source unavailable')
          }
          return snapshot
        },
      })
    } finally {
      assertLease()
      // Push has its own durable, unique attempt claim. Await it before releasing work.
      if (job.eventName === 'message_created') {
        await runtime.pushDeliveryService.deliverMessageCreated({
          chatwootMessageId: job.chatwootMessageId,
          tenantSlug: tenant.slug,
          threadMapping: mapping,
        })
      }
    }
  }
}
