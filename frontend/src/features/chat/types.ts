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

export type ChatSupportAvailabilityStatus =
  | 'offline'
  | 'online'
  | 'outside_hours'
  | 'unknown'

export type ChatSupportAvailabilityReason =
  | 'none'
  | 'chatwoot_not_configured'
  | 'chatwoot_unavailable'

export type ChatWorkingHoursRow = {
  closeTime: string | null
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6
  isClosedAllDay: boolean
  isOpenAllDay: boolean
  openTime: string | null
}

export type ChatWorkingHoursInfo = {
  enabled: boolean
  isWithinWorkingHours: boolean | null
  rows: ChatWorkingHoursRow[]
  timezone: string
}

export type ChatSupportAvailabilityResponse = {
  currentStatus: ChatSupportAvailabilityStatus
  outOfOfficeMessage: string | null
  reason: ChatSupportAvailabilityReason
  result: ChatThreadResult
  workingHours: ChatWorkingHoursInfo
}

export type UserNotificationSettings = {
  newMessagesEnabled: boolean
  pushEnabled: boolean
  soundEnabled: boolean
}

export type ChatNotificationOverrides = {
  newMessagesEnabled: boolean | null
  pushEnabled: boolean | null
  soundEnabled: boolean | null
}

export type ChatNotificationSettings = {
  effective: UserNotificationSettings
  global: UserNotificationSettings
  overrides: ChatNotificationOverrides
  threadId: string
}

export type PushPublicKeyResponse =
  | {
      available: true
      publicKey: string
      publicKeyFingerprint: string
      vapidKeyId: string
    }
  | {
      available: false
    }

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

export type ChatMediaCategory = 'audio' | 'file' | 'image' | 'video'

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

export type ChatMediaItem = {
  attachmentId: number
  authorName: string
  authorRole: ChatMessageAuthorRole
  category: ChatMediaCategory
  createdAt: string
  direction: 'incoming' | 'outgoing'
  fileSize: number | null
  fileType: string
  id: `attachment:${number}:${number}`
  messageId: number
  name: string
  thumbUrl: string
  url: string
}

export type ChatThreadMediaResponse = {
  activeThread: ChatThreadSummary | null
  hasMoreOlder: boolean
  items: ChatMediaItem[]
  nextOlderCursor: number | null
  reason: ChatThreadReason
  result: ChatThreadResult
}

export type ChatSearchMatchRange = {
  end: number
  start: number
}

export type ChatSearchResult = {
  afterSnippet: string | null
  authorName: string
  authorRole: ChatMessageAuthorRole
  beforeSnippet: string | null
  content: string
  createdAt: string
  direction: 'incoming' | 'outgoing'
  id: `message:${number}`
  matchRanges: ChatSearchMatchRange[]
  messageId: number
}

export type ChatThreadSearchResponse = {
  activeThread: ChatThreadSummary | null
  hasMoreOlder: boolean
  items: ChatSearchResult[]
  nextOlderCursor: number | null
  query: string
  reason: ChatThreadReason
  result: ChatThreadResult
}

export type ChatSearchAuthorFilter = 'all' | 'mine' | 'support'

export type ChatMessageContextDirection = 'earlier' | 'initial' | 'later'

export type ChatMessageContextResponse = {
  activeThread: ChatThreadSummary | null
  earlierCursor: number | null
  hasMoreEarlier: boolean
  hasMoreLater: boolean
  laterCursor: number | null
  messages: ChatMessage[]
  reason: ChatThreadReason
  result: ChatThreadResult
  targetMessageId: number
}

export type ChatSendResult = {
  activeThread: ChatThreadSummary | null
  reason: ChatThreadReason
  result: ChatThreadResult
  sentMessage: ChatMessage | null
}
