import type { ChatNotificationRecipientResolver } from '../chat-notifications/recipientResolver.js'
import type { ChatUnreadRepository } from './repository.js'

type CreateChatUnreadServiceOptions = {
  now?: () => Date
  recipientResolver: Pick<
    ChatNotificationRecipientResolver,
    'resolveRecipients'
  >
  repository: Pick<
    ChatUnreadRepository,
    | 'clearThreadUnreadAndCountVisible'
    | 'countThreadUnreadForUser'
    | 'countUnreadByThread'
    | 'insertUnreadMessages'
  >
}

export function createChatUnreadService({
  now = () => new Date(),
  recipientResolver,
  repository,
}: CreateChatUnreadServiceOptions) {
  return {
    async recordMessageCreatedUnread({
      chatwootMessageId,
      threadMapping,
    }: {
      chatwootMessageId: number | null
      threadMapping: Parameters<
        ChatNotificationRecipientResolver['resolveRecipients']
      >[0]['threadMapping']
    }) {
      if (chatwootMessageId === null) {
        return { recipients: 0 }
      }

      const recipients = await recipientResolver.resolveRecipients({
        chatwootMessageId,
        threadMapping,
      })
      const currentTime = now()

      await repository.insertUnreadMessages(
        recipients.map((recipient) => ({
          chatwootMessageId,
          now: currentTime,
          portalChatThreadId: recipient.portalChatThreadId,
          portalUserId: recipient.portalUserId,
          threadId: recipient.threadId,
        })),
      )

      return {
        recipients: recipients.length,
      }
    },

    async countUnreadByThread(input: {
      portalUserId: number
      threadIds: string[]
    }) {
      return repository.countUnreadByThread(input)
    },

    async countThreadUnreadForUser(input: {
      portalUserId: number
      threadId: string
    }) {
      return repository.countThreadUnreadForUser(input)
    },

    async clearOpenedThreadUnread({
      portalUserId,
      threadId,
      visibleThreadIds,
    }: {
      portalUserId: number
      threadId: string
      visibleThreadIds: string[]
    }) {
      const clearResult = await repository.clearThreadUnreadAndCountVisible({
        portalUserId,
        threadId,
        visibleThreadIds,
      })

      return {
        clearedThreadId: threadId,
        totalUnreadCount: clearResult.totalUnreadCount,
      }
    },
  }
}

export type ChatUnreadService = ReturnType<typeof createChatUnreadService>
