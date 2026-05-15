import type { ChatwootConversation } from '../../integrations/chatwoot/client.js'
import type {
  ChatContextLinkedContact,
  ChatContextPrimaryConversation,
} from './service.js'

type ConversationMapping = {
  chatwootContactId: number
  chatwootConversationId: number
  chatwootInboxId: number
}

export function mapPrimaryConversation(
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

export function selectAuthoritativePrimaryConversation(
  conversations: ChatwootConversation[],
) {
  const activeConversations = conversations.filter(
    (conversation) => conversation.status !== 'resolved',
  )
  const candidates =
    activeConversations.length > 0 ? activeConversations : conversations

  return [...candidates].sort((left, right) => {
    const leftLastActivityAt = left.lastActivityAt ?? left.createdAt ?? left.id
    const rightLastActivityAt =
      right.lastActivityAt ?? right.createdAt ?? right.id

    if (leftLastActivityAt !== rightLastActivityAt) {
      return rightLastActivityAt - leftLastActivityAt
    }

    const leftCreatedAt = left.createdAt ?? left.id
    const rightCreatedAt = right.createdAt ?? right.id

    if (leftCreatedAt !== rightCreatedAt) {
      return rightCreatedAt - leftCreatedAt
    }

    return right.id - left.id
  })[0]
}

export function findMappedConversation(
  conversations: ChatwootConversation[],
  mapping: ConversationMapping | null,
  linkedContact: ChatContextLinkedContact,
) {
  if (!mapping || mapping.chatwootContactId !== linkedContact.id) {
    return null
  }

  return (
    conversations.find(
      (conversation) =>
        conversation.id === mapping.chatwootConversationId &&
        conversation.inboxId === mapping.chatwootInboxId,
    ) ?? null
  )
}

export function shouldPersistConversationMapping({
  mapping,
  primaryConversation,
  linkedContact,
}: {
  linkedContact: ChatContextLinkedContact
  mapping: ConversationMapping | null
  primaryConversation: ChatwootConversation
}) {
  return (
    !mapping ||
    mapping.chatwootContactId !== linkedContact.id ||
    mapping.chatwootConversationId !== primaryConversation.id ||
    mapping.chatwootInboxId !== primaryConversation.inboxId
  )
}
