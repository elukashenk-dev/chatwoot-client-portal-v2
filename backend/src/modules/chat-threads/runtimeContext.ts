import type {
  ChatwootConversation,
  ChatwootContact,
} from '../../integrations/chatwoot/client.js'
import {
  ChatwootClientConfigurationError,
  ChatwootClientRequestError,
} from '../../integrations/chatwoot/client.js'
import { ApiError } from '../../lib/errors.js'
import type { PortalChatThreadRecord } from './repository.js'
import { parsePublicChatThreadId } from './threadResolver.js'
import type {
  ChatThreadRuntimeConversation,
  CurrentUserChatThreadContext,
  PublicChatThreadSummary,
} from './types.js'

export function buildThreadContext({
  activeThread = null,
  chatwootConversation = null,
  currentUserEmail = null,
  currentUserName = null,
  linkedContactId = null,
  portalChatThreadId = null,
  reason,
  result,
  targetChatwootContactId = null,
  threadType = null,
}: CurrentUserChatThreadContext): CurrentUserChatThreadContext {
  return {
    activeThread,
    chatwootConversation,
    currentUserEmail,
    currentUserName,
    linkedContactId,
    portalChatThreadId,
    reason,
    result,
    targetChatwootContactId,
    threadType,
  }
}

export function mapChatwootConversation(
  conversation: ChatwootConversation,
): ChatThreadRuntimeConversation {
  return {
    assigneeName: conversation.assigneeName,
    id: conversation.id,
    inboxId: conversation.inboxId,
    lastActivityAt: conversation.lastActivityAt,
    status: conversation.status,
  }
}

export function mapPersistedThreadConversation(
  thread: PortalChatThreadRecord,
): ChatThreadRuntimeConversation | null {
  if (thread.chatwootConversationId === null) {
    return null
  }

  return {
    assigneeName: null,
    id: thread.chatwootConversationId,
    inboxId: thread.chatwootInboxId,
    lastActivityAt: null,
    status: 'open',
  }
}

export function parseRuntimeThreadId(threadId: string) {
  try {
    return parsePublicChatThreadId(threadId)
  } catch (error) {
    if (error instanceof ApiError && error.code === 'chat_thread_unsupported') {
      return null
    }

    throw error
  }
}

export function createUnavailableRuntimeContext({
  activeThread,
  currentUserEmail = null,
  currentUserName = null,
  error,
  linkedContactId,
  portalChatThreadId,
  targetChatwootContactId,
  threadType,
}: {
  activeThread: PublicChatThreadSummary | null
  currentUserEmail?: string | null
  currentUserName?: string | null
  error: unknown
  linkedContactId: number | null
  portalChatThreadId: number | null
  targetChatwootContactId: number | null
  threadType: 'company' | 'private' | null
}) {
  if (error instanceof ChatwootClientConfigurationError) {
    return buildThreadContext({
      activeThread,
      chatwootConversation: null,
      currentUserEmail,
      currentUserName,
      linkedContactId,
      portalChatThreadId,
      reason: 'chatwoot_not_configured',
      result: 'unavailable',
      targetChatwootContactId,
      threadType,
    })
  }

  if (error instanceof ChatwootClientRequestError) {
    return buildThreadContext({
      activeThread,
      chatwootConversation: null,
      currentUserEmail,
      currentUserName,
      linkedContactId,
      portalChatThreadId,
      reason: 'chatwoot_unavailable',
      result: 'unavailable',
      targetChatwootContactId,
      threadType,
    })
  }

  throw error
}

export function buildContextFromThreadRecord({
  activeThread,
  linkedContactId,
  threadRecord,
  userContact,
}: {
  activeThread: PublicChatThreadSummary
  linkedContactId: number
  threadRecord: PortalChatThreadRecord
  userContact: ChatwootContact
}) {
  const chatwootConversation = mapPersistedThreadConversation(threadRecord)

  return buildThreadContext({
    activeThread,
    chatwootConversation,
    currentUserEmail: userContact.email,
    currentUserName: userContact.name,
    linkedContactId,
    portalChatThreadId: threadRecord.id,
    reason: chatwootConversation ? 'none' : 'conversation_missing',
    result: chatwootConversation ? 'ready' : 'not_ready',
    targetChatwootContactId: threadRecord.chatwootContactId,
    threadType: threadRecord.threadType,
  })
}
