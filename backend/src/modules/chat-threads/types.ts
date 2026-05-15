import type { ChatwootContact } from '../../integrations/chatwoot/client.js'
import { PRIVATE_CHAT_THREAD_ID } from './privateThread.js'

export type PublicChatThreadSummary =
  | {
      id: typeof PRIVATE_CHAT_THREAD_ID
      subtitle: string
      title: string
      type: 'private'
    }
  | {
      id: `company:${number}`
      subtitle: string
      title: string
      type: 'company'
    }

export type CurrentUserChatThreads = {
  activeThreadId: typeof PRIVATE_CHAT_THREAD_ID
  threads: PublicChatThreadSummary[]
}

export type ChatThreadRuntimeReason =
  | 'none'
  | 'chatwoot_not_configured'
  | 'chatwoot_unavailable'
  | 'conversation_mapping_unavailable'
  | 'conversation_missing'
  | 'thread_access_denied'
  | 'thread_invalid'

export type ChatThreadRuntimeConversation = {
  assigneeName: string | null
  id: number
  inboxId: number
  lastActivityAt: number | null
  status: string
}

export type CurrentUserChatThreadContext = {
  activeThread: PublicChatThreadSummary | null
  chatwootConversation: ChatThreadRuntimeConversation | null
  linkedContactId: number | null
  portalChatThreadId: number | null
  reason: ChatThreadRuntimeReason
  result: 'not_ready' | 'ready' | 'unavailable'
  targetChatwootContactId: number | null
  threadType: 'company' | 'private' | null
}

export function buildPrivateThread(): PublicChatThreadSummary {
  return {
    id: PRIVATE_CHAT_THREAD_ID,
    subtitle: 'Только вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  }
}

export function buildCompanyThread(
  contact: ChatwootContact,
): PublicChatThreadSummary {
  return {
    id: `company:${contact.id}`,
    subtitle: 'Общий чат компании',
    title: contact.name?.trim() || `Компания ${contact.id}`,
    type: 'company',
  }
}
