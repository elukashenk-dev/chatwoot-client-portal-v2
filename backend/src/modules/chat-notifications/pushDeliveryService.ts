import { defaultUserNotificationSettings } from './settings.js'
import { resolveEffectiveChatNotificationSettings } from './settings.js'
import type { ChatNotificationRecipientResolver } from './recipientResolver.js'
import type { ChatNotificationsRepository } from './repository.js'
import type { PushTransport } from './pushTransport.js'
import { emptyChatNotificationOverrides } from './settings.js'

type PushDeliveryRepository = Pick<
  ChatNotificationsRepository,
  | 'findChatOverrides'
  | 'findUserSettings'
  | 'listActivePushSubscriptions'
  | 'markPushSubscriptionExpired'
  | 'recordPushDeliveryAttempt'
  | 'updatePushDeliveryStatus'
  | 'updatePushSubscriptionFailure'
>

export type PushDeliverySummary = {
  expired: number
  failed: number
  recipients: number
  sent: number
  skipped: number
  subscriptions: number
}

type DeliverMessageCreatedInput = {
  chatwootMessageId: number | null
  tenantSlug: string
  threadMapping: Parameters<
    ChatNotificationRecipientResolver['resolveRecipients']
  >[0]['threadMapping']
}

type CreateChatNotificationPushDeliveryServiceOptions = {
  now?: () => Date
  recipientResolver: ChatNotificationRecipientResolver
  repository: PushDeliveryRepository
  transport: PushTransport | null
}

function emptySummary(): PushDeliverySummary {
  return {
    expired: 0,
    failed: 0,
    recipients: 0,
    sent: 0,
    skipped: 0,
    subscriptions: 0,
  }
}

function buildPayload({
  chatwootMessageId,
  portalUserId,
  tenantSlug,
  threadId,
  threadTitle,
  threadType,
}: {
  chatwootMessageId: number
  portalUserId: number
  tenantSlug: string
  threadId: string
  threadTitle: string | null
  threadType: 'group' | 'private' | null
}) {
  return JSON.stringify({
    chatwootMessageId,
    notificationTag: `portal-chat-message-${tenantSlug}-${chatwootMessageId}`,
    portalUserId,
    tenantSlug,
    threadId,
    threadTitle,
    threadType,
    type: 'chat_message',
    url: '/',
  })
}

export function createChatNotificationPushDeliveryService({
  now = () => new Date(),
  recipientResolver,
  repository,
  transport,
}: CreateChatNotificationPushDeliveryServiceOptions) {
  return {
    async deliverMessageCreated(
      input: DeliverMessageCreatedInput,
    ): Promise<PushDeliverySummary> {
      if (!transport || input.chatwootMessageId === null) {
        return emptySummary()
      }

      const summary = emptySummary()
      const recipients = await recipientResolver.resolveRecipients({
        chatwootMessageId: input.chatwootMessageId,
        threadMapping: input.threadMapping,
      })
      summary.recipients = recipients.length

      for (const recipient of recipients) {
        const global =
          (await repository.findUserSettings(recipient.portalUserId)) ??
          defaultUserNotificationSettings
        const overrides =
          (await repository.findChatOverrides({
            portalUserId: recipient.portalUserId,
            threadId: recipient.threadId,
          })) ?? emptyChatNotificationOverrides
        const effective = resolveEffectiveChatNotificationSettings({
          global,
          overrides,
        })

        if (!effective.newMessagesEnabled || !effective.pushEnabled) {
          summary.skipped += 1
          continue
        }

        const subscriptions = await repository.listActivePushSubscriptions(
          recipient.portalUserId,
        )
        summary.subscriptions += subscriptions.length
        const payload = buildPayload({
          chatwootMessageId: input.chatwootMessageId,
          portalUserId: recipient.portalUserId,
          tenantSlug: input.tenantSlug,
          threadId: recipient.threadId,
          threadTitle: recipient.threadTitle,
          threadType: recipient.threadType,
        })

        for (const subscription of subscriptions) {
          const deliveryId = await repository.recordPushDeliveryAttempt({
            chatwootMessageId: input.chatwootMessageId,
            now: now(),
            portalChatThreadId: recipient.portalChatThreadId,
            portalUserId: recipient.portalUserId,
            status: 'skipped',
            subscriptionId: subscription.id,
            threadId: recipient.threadId,
          })

          if (deliveryId === null) {
            summary.skipped += 1
            continue
          }

          const result = await transport.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                auth: subscription.auth,
                p256dh: subscription.p256dh,
              },
            },
            payload,
          )

          if (result.status === 'sent') {
            await repository.updatePushDeliveryStatus({
              deliveryId,
              errorCode: null,
              status: 'sent',
            })
            summary.sent += 1
            continue
          }

          await repository.updatePushDeliveryStatus({
            deliveryId,
            errorCode: result.errorCode,
            status: result.status,
          })

          if (result.status === 'expired') {
            await repository.markPushSubscriptionExpired({
              error: result.errorCode,
              now: now(),
              subscriptionId: subscription.id,
            })
            summary.expired += 1
            continue
          }

          await repository.updatePushSubscriptionFailure({
            error: result.errorCode,
            now: now(),
            subscriptionId: subscription.id,
          })
          summary.failed += 1
        }
      }

      return summary
    },
  }
}

export type ChatNotificationPushDeliveryService = ReturnType<
  typeof createChatNotificationPushDeliveryService
>
