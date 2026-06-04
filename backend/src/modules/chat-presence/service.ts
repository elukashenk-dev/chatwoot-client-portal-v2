import { ChatwootClientRequestError } from '../../integrations/chatwoot/client.js'
import type { ChatwootClient } from '../../integrations/chatwoot/client.js'
import type { ChatThreadsRepository } from '../chat-threads/repository.js'
import type { ChatThreadsService } from '../chat-threads/service.js'

const READ_SYNC_THROTTLE_MS = 5_000
const TYPING_ON_THROTTLE_MS = 3_000

type ReadThrottleKey = `${number}:${number}:${string}`
type ReadSyncThrottleStore = Map<string, number>
type TypingThrottleKey = `${number}:${number}:${string}`
type TypingThrottleStore = Map<string, number>

type ChatPresenceChatwootClient = Pick<
  ChatwootClient,
  | 'findContactPortalInboxSourceId'
  | 'togglePublicConversationTyping'
  | 'updatePublicConversationLastSeen'
> & {
  portalInboxIdentifier: string | null
}

export type ChatCustomerReadSyncResult =
  | { result: 'synced' }
  | { reason: 'throttled'; result: 'skipped' }
  | {
      reason:
        | 'chatwoot_unavailable'
        | 'conversation_missing'
        | 'not_configured'
        | 'thread_access_denied'
      result: 'unavailable'
    }

export type ChatTypingSyncResult =
  | { result: 'synced' }
  | { reason: 'throttled'; result: 'skipped' }
  | {
      reason:
        | 'chatwoot_unavailable'
        | 'conversation_missing'
        | 'not_configured'
        | 'source_id_missing'
        | 'source_id_prerequisites_missing'
        | 'thread_access_denied'
      result: 'unavailable'
    }

type ChatPresenceServiceOptions = {
  chatThreadsRepository: Pick<
    ChatThreadsRepository,
    'updateThreadContactSourceId'
  >
  chatThreadsService: Pick<ChatThreadsService, 'getCurrentUserThreadContext'>
  chatwoot: ChatPresenceChatwootClient
  now?: () => Date
  readSyncThrottleStore?: ReadSyncThrottleStore
  tenantId: number
  typingThrottleStore?: TypingThrottleStore
}

function buildReadThrottleKey({
  tenantId,
  threadId,
  userId,
}: {
  tenantId: number
  threadId: string
  userId: number
}): ReadThrottleKey {
  return `${tenantId}:${userId}:${threadId}`
}

function buildTypingThrottleKey({
  tenantId,
  threadId,
  userId,
}: {
  tenantId: number
  threadId: string
  userId: number
}): TypingThrottleKey {
  return `${tenantId}:${userId}:${threadId}`
}

export function createChatPresenceService({
  chatThreadsRepository,
  chatThreadsService,
  chatwoot,
  now = () => new Date(),
  readSyncThrottleStore = new Map(),
  tenantId,
  typingThrottleStore = new Map(),
}: ChatPresenceServiceOptions) {
  async function resolveSourceId({
    contactId,
    portalChatThreadId,
  }: {
    contactId: number
    portalChatThreadId: number
  }) {
    const sourceId = await chatwoot.findContactPortalInboxSourceId(contactId)

    if (!sourceId) {
      return null
    }

    await chatThreadsRepository.updateThreadContactSourceId({
      chatwootContactSourceId: sourceId,
      id: portalChatThreadId,
      now: now(),
    })

    return sourceId
  }

  return {
    async markCurrentUserThreadRead({
      threadId,
      userId,
    }: {
      threadId: string
      userId: number
    }): Promise<ChatCustomerReadSyncResult> {
      const throttleKey = buildReadThrottleKey({ tenantId, threadId, userId })
      const currentTimeMs = now().getTime()
      const lastSyncedAt = readSyncThrottleStore.get(throttleKey)

      if (
        lastSyncedAt !== undefined &&
        currentTimeMs - lastSyncedAt < READ_SYNC_THROTTLE_MS
      ) {
        return {
          reason: 'throttled',
          result: 'skipped',
        }
      }

      const context = await chatThreadsService.getCurrentUserThreadContext({
        threadId,
        userId,
      })

      if (context.result !== 'ready' || !context.chatwootConversation) {
        return {
          reason:
            context.reason === 'thread_access_denied'
              ? 'thread_access_denied'
              : 'conversation_missing',
          result: 'unavailable',
        }
      }

      if (!chatwoot.portalInboxIdentifier) {
        return {
          reason: 'not_configured',
          result: 'unavailable',
        }
      }

      if (
        context.portalChatThreadId === null ||
        context.targetChatwootContactId === null
      ) {
        return {
          reason: 'conversation_missing',
          result: 'unavailable',
        }
      }

      try {
        const sourceId =
          context.chatwootContactSourceId ??
          (await resolveSourceId({
            contactId: context.targetChatwootContactId,
            portalChatThreadId: context.portalChatThreadId,
          }))

        if (!sourceId) {
          return {
            reason: 'not_configured',
            result: 'unavailable',
          }
        }

        await chatwoot.updatePublicConversationLastSeen({
          contactIdentifier: sourceId,
          conversationDisplayId: context.chatwootConversation.id,
          inboxIdentifier: chatwoot.portalInboxIdentifier,
        })
        readSyncThrottleStore.set(throttleKey, currentTimeMs)

        return {
          result: 'synced',
        }
      } catch (error) {
        if (error instanceof ChatwootClientRequestError) {
          return {
            reason: 'chatwoot_unavailable',
            result: 'unavailable',
          }
        }

        throw error
      }
    },

    async setCurrentUserThreadTyping({
      threadId,
      typingStatus,
      userId,
    }: {
      threadId: string
      typingStatus: 'off' | 'on'
      userId: number
    }): Promise<ChatTypingSyncResult> {
      const throttleKey = buildTypingThrottleKey({
        tenantId,
        threadId,
        userId,
      })
      const currentTimeMs = now().getTime()

      if (typingStatus === 'on') {
        const lastSyncedAt = typingThrottleStore.get(throttleKey)

        if (
          lastSyncedAt !== undefined &&
          currentTimeMs - lastSyncedAt < TYPING_ON_THROTTLE_MS
        ) {
          return {
            reason: 'throttled',
            result: 'skipped',
          }
        }
      }

      const context = await chatThreadsService.getCurrentUserThreadContext({
        threadId,
        userId,
      })

      if (context.result !== 'ready' || !context.chatwootConversation) {
        return {
          reason:
            context.reason === 'thread_access_denied'
              ? 'thread_access_denied'
              : 'conversation_missing',
          result: 'unavailable',
        }
      }

      if (!chatwoot.portalInboxIdentifier) {
        return {
          reason: 'not_configured',
          result: 'unavailable',
        }
      }

      if (
        context.portalChatThreadId === null ||
        context.targetChatwootContactId === null
      ) {
        return {
          reason: 'source_id_prerequisites_missing',
          result: 'unavailable',
        }
      }

      try {
        const sourceId =
          context.chatwootContactSourceId ??
          (await resolveSourceId({
            contactId: context.targetChatwootContactId,
            portalChatThreadId: context.portalChatThreadId,
          }))

        if (!sourceId) {
          return {
            reason: 'source_id_missing',
            result: 'unavailable',
          }
        }

        await chatwoot.togglePublicConversationTyping({
          contactIdentifier: sourceId,
          conversationDisplayId: context.chatwootConversation.id,
          inboxIdentifier: chatwoot.portalInboxIdentifier,
          typingStatus,
        })

        if (typingStatus === 'on') {
          typingThrottleStore.set(throttleKey, currentTimeMs)
        } else {
          typingThrottleStore.delete(throttleKey)
        }

        return {
          result: 'synced',
        }
      } catch (error) {
        if (error instanceof ChatwootClientRequestError) {
          return {
            reason: 'chatwoot_unavailable',
            result: 'unavailable',
          }
        }

        throw error
      }
    },
  }
}

export type ChatPresenceService = ReturnType<typeof createChatPresenceService>
