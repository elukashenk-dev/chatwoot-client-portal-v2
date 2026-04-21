import type {
  ChatwootClient,
  ChatwootConversation,
} from '../../integrations/chatwoot/client.js'
import {
  ChatwootClientConfigurationError,
  ChatwootClientRequestError,
} from '../../integrations/chatwoot/client.js'
import type { ChatContextRepository } from './repository.js'

export type ChatContextReason =
  | 'none'
  | 'chatwoot_not_configured'
  | 'chatwoot_unavailable'
  | 'contact_link_missing'
  | 'conversation_mapping_unavailable'
  | 'conversation_missing'
  | 'primary_conversation_missing'

export type ChatContextResult = 'not_ready' | 'ready' | 'unavailable'

export type ChatContextLinkedContact = {
  id: number
}

export type ChatContextPrimaryConversation = {
  assigneeName: string | null
  id: number
  inboxId: number
  lastActivityAt: number | null
  status: string
}

export type ChatContextSnapshot = {
  linkedContact: ChatContextLinkedContact | null
  primaryConversation: ChatContextPrimaryConversation | null
  reason: ChatContextReason
  result: ChatContextResult
}

type CreateChatContextServiceOptions = {
  chatContextRepository: Pick<
    ChatContextRepository,
    | 'findContactLinkByUserId'
    | 'findConversationMappingByUserId'
    | 'upsertConversationMapping'
  >
  chatwootClient: Pick<ChatwootClient, 'listContactConversations'>
  now?: () => Date
}

type GetCurrentUserChatContextInput = {
  selectedPrimaryConversationId?: number | null
  userId: number
}

function buildSnapshot({
  linkedContact = null,
  primaryConversation = null,
  reason,
  result,
}: ChatContextSnapshot): ChatContextSnapshot {
  return {
    linkedContact,
    primaryConversation,
    reason,
    result,
  }
}

function mapPrimaryConversation(
  conversation: ChatwootConversation,
): ChatContextPrimaryConversation {
  return {
    assigneeName: conversation.assigneeName,
    id: conversation.id,
    inboxId: conversation.inboxId,
    lastActivityAt: conversation.lastActivityAt,
    status: conversation.status,
  }
}

function selectAuthoritativePrimaryConversation(
  conversations: ChatwootConversation[],
) {
  return [...conversations].sort((left, right) => {
    const leftCreatedAt = left.createdAt ?? left.id
    const rightCreatedAt = right.createdAt ?? right.id

    if (leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt - rightCreatedAt
    }

    return left.id - right.id
  })[0]
}

function isChatwootUnavailableError(error: unknown) {
  return (
    error instanceof ChatwootClientConfigurationError ||
    error instanceof ChatwootClientRequestError
  )
}

export function createChatContextService({
  chatContextRepository,
  chatwootClient,
  now = () => new Date(),
}: CreateChatContextServiceOptions) {
  return {
    async getCurrentUserChatContext({
      selectedPrimaryConversationId = null,
      userId,
    }: GetCurrentUserChatContextInput): Promise<ChatContextSnapshot> {
      const link = await chatContextRepository.findContactLinkByUserId(userId)

      if (!link) {
        return buildSnapshot({
          linkedContact: null,
          primaryConversation: null,
          reason: 'contact_link_missing',
          result: 'not_ready',
        })
      }

      const linkedContact = {
        id: link.chatwootContactId,
      }

      let conversations: ChatwootConversation[]

      try {
        conversations = await chatwootClient.listContactConversations(
          linkedContact.id,
        )
      } catch (error) {
        if (error instanceof ChatwootClientConfigurationError) {
          return buildSnapshot({
            linkedContact,
            primaryConversation: null,
            reason: 'chatwoot_not_configured',
            result: 'unavailable',
          })
        }

        if (isChatwootUnavailableError(error)) {
          return buildSnapshot({
            linkedContact,
            primaryConversation: null,
            reason: 'chatwoot_unavailable',
            result: 'unavailable',
          })
        }

        throw error
      }

      const primaryConversation =
        selectAuthoritativePrimaryConversation(conversations)

      if (!primaryConversation) {
        return buildSnapshot({
          linkedContact,
          primaryConversation: null,
          reason: 'conversation_missing',
          result: 'not_ready',
        })
      }

      if (
        selectedPrimaryConversationId !== null &&
        selectedPrimaryConversationId !== primaryConversation.id
      ) {
        return buildSnapshot({
          linkedContact,
          primaryConversation: null,
          reason: 'primary_conversation_missing',
          result: 'not_ready',
        })
      }

      try {
        await chatContextRepository.upsertConversationMapping({
          chatwootContactId: linkedContact.id,
          chatwootConversationId: primaryConversation.id,
          chatwootInboxId: primaryConversation.inboxId,
          now: now(),
          userId,
        })
      } catch {
        return buildSnapshot({
          linkedContact,
          primaryConversation: null,
          reason: 'conversation_mapping_unavailable',
          result: 'unavailable',
        })
      }

      return buildSnapshot({
        linkedContact,
        primaryConversation: mapPrimaryConversation(primaryConversation),
        reason: 'none',
        result: 'ready',
      })
    },
  }
}

export type ChatContextService = ReturnType<typeof createChatContextService>
