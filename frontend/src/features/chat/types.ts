export type ChatThreadReason =
  | 'none'
  | 'chatwoot_not_configured'
  | 'chatwoot_unavailable'
  | 'contact_link_missing'
  | 'conversation_mapping_unavailable'
  | 'conversation_missing'
  | 'thread_access_denied'
  | 'thread_invalid'

export type ChatThreadResult = 'not_ready' | 'ready' | 'unavailable'

export const PRIVATE_CHAT_THREAD_ID = 'private:me'

export type ChatThreadSummary =
  | {
      id: typeof PRIVATE_CHAT_THREAD_ID
      subtitle: string
      title: string
      type: 'private'
    }
  | {
      id: `group:${number}`
      subtitle: string
      title: string
      type: 'group'
    }

export type ChatThreadsResponse = {
  activeThreadId: typeof PRIVATE_CHAT_THREAD_ID
  threads: ChatThreadSummary[]
}

export type ChatThreadInfoParticipant = {
  displayName: string
  id: `portal-user:${number}`
  isCurrentUser: boolean
}

export type ChatThreadInfoResponse = {
  accessLabel: string
  activeThread: ChatThreadSummary | null
  curatorName: string | null
  lastActivityAt: string | null
  participants: ChatThreadInfoParticipant[]
  reason: ChatThreadReason
  result: ChatThreadResult
  startedAt: string | null
  supportLabel: string
  threadTypeLabel: 'Групповой' | 'Личный' | null
}

export type ChatMessageAuthorRole = 'agent' | 'group_member' | 'current_user'

export type ChatAttachment = {
  fileSize: number | null
  fileType: string
  id: number
  name: string
  thumbUrl: string
  url: string
}

export type ChatMessageReplyPreview = {
  attachmentName: string | null
  authorName: string
  content: string | null
  direction: 'incoming' | 'outgoing'
  messageId: number
}

export type ChatMessage = {
  attachments: ChatAttachment[]
  authorAvatarUrl?: string | null
  authorName: string
  authorRole: ChatMessageAuthorRole
  clientMessageKey?: string | null
  content: string | null
  contentType: string
  createdAt: string
  direction: 'incoming' | 'outgoing'
  id: number
  replyTo?: ChatMessageReplyPreview | null
  status: string
}

export type ChatMessagesSnapshot = {
  activeThread: ChatThreadSummary | null
  hasMoreOlder: boolean
  messages: ChatMessage[]
  nextOlderCursor: number | null
  reason: ChatThreadReason
  result: ChatThreadResult
}

export type ChatSendResult = {
  activeThread: ChatThreadSummary | null
  reason: ChatThreadReason
  result: ChatThreadResult
  sentMessage: ChatMessage | null
}
