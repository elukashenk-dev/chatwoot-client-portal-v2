import type { ChatwootContact } from '../../integrations/chatwoot/client.js'
import { PRIVATE_CHAT_THREAD_ID } from './privateThread.js'

export type PublicChatThreadSummary =
  | {
      avatarUrl?: string | null
      id: typeof PRIVATE_CHAT_THREAD_ID
      subtitle: string
      title: string
      type: 'private'
    }
  | {
      avatarUrl?: string | null
      id: `group:${number}`
      subtitle: string
      title: string
      type: 'group'
    }

export type PublicChatThreadListSummary = PublicChatThreadSummary & {
  unreadCount: number
}

export type CurrentUserChatThreads = {
  activeThreadId: typeof PRIVATE_CHAT_THREAD_ID
  threads: PublicChatThreadListSummary[]
  totalUnreadCount: number
}

export type ChatThreadRuntimeReason =
  | 'none'
  | 'chatwoot_not_configured'
  | 'chatwoot_unavailable'
  | 'contact_link_missing'
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
  chatwootContactSourceId: string | null
  chatwootConversation: ChatThreadRuntimeConversation | null
  currentUserEmail: string | null
  currentUserName: string | null
  linkedContactId: number | null
  portalChatThreadId: number | null
  reason: ChatThreadRuntimeReason
  result: 'not_ready' | 'ready' | 'unavailable'
  targetChatwootContactId: number | null
  threadType: 'group' | 'private' | null
}

export type PublicChatThreadInfoParticipant = {
  displayName: string
  id: `portal-user:${number}`
  isCurrentUser: boolean
}

export type PublicChatThreadInfo = {
  accessLabel: string
  activeThread: PublicChatThreadSummary | null
  curatorName: string | null
  lastActivityAt: string | null
  participants: PublicChatThreadInfoParticipant[]
  reason: ChatThreadRuntimeReason
  result: 'not_ready' | 'ready' | 'unavailable'
  startedAt: string | null
  supportLabel: string
  threadTypeLabel: 'Групповой' | 'Личный' | null
}

export function buildPrivateThread(): PublicChatThreadSummary {
  return {
    avatarUrl: '/api/tenant/icons/icon-192.png',
    id: PRIVATE_CHAT_THREAD_ID,
    subtitle: 'Вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  }
}

export function buildPortalThreadAvatarUrl(threadId: string) {
  return `/api/chat/threads/${encodeURIComponent(threadId)}/avatar`
}

export function buildGroupThread(
  contact: ChatwootContact,
): PublicChatThreadSummary {
  const threadId = `group:${contact.id}` as const

  return {
    avatarUrl: contact.avatarUrl ? buildPortalThreadAvatarUrl(threadId) : null,
    id: threadId,
    subtitle: 'Групповой чат',
    title: contact.name?.trim() || `Группа ${contact.id}`,
    type: 'group',
  }
}
