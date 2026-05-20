import type {
  ChatThreadRuntimeReason,
  PublicChatThreadSummary,
} from '../chat-threads/types.js'

export type PortalChatAttachment = {
  fileSize: number | null
  fileType: string
  id: number
  name: string
  thumbUrl: string
  url: string
}

export type PortalAttachmentUpload = {
  data: Buffer
  fileName: string
  mimeType: string
  size: number
}

export type PortalChatReplyPreview = {
  attachmentName: string | null
  authorName: string
  content: string | null
  direction: 'incoming' | 'outgoing'
  messageId: number
}

export type PortalChatMessage = {
  attachments: PortalChatAttachment[]
  authorAvatarUrl?: string | null
  authorName: string
  authorRole: PortalChatMessageAuthorRole
  clientMessageKey?: string | null
  content: string | null
  contentType: string
  createdAt: string
  direction: 'incoming' | 'outgoing'
  id: number
  replyTo: PortalChatReplyPreview | null
  status: string
}

export type PortalChatMessageAuthorRole =
  | 'agent'
  | 'group_member'
  | 'current_user'

export type ChatMediaCategory = 'audio' | 'file' | 'image' | 'video'

export type PortalChatMediaItem = {
  attachmentId: number
  authorName: string
  authorRole: PortalChatMessageAuthorRole
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

export type ChatSearchMatchRange = {
  end: number
  start: number
}

export type PortalChatSearchResult = {
  afterSnippet: string | null
  authorName: string
  authorRole: PortalChatMessageAuthorRole
  beforeSnippet: string | null
  content: string
  createdAt: string
  direction: 'incoming' | 'outgoing'
  id: `message:${number}`
  matchRanges: ChatSearchMatchRange[]
  messageId: number
}

export type ChatMessagesSnapshot = {
  activeThread: PublicChatThreadSummary | null
  hasMoreOlder: boolean
  messages: PortalChatMessage[]
  nextOlderCursor: number | null
  reason: ChatThreadRuntimeReason
  result: 'not_ready' | 'ready' | 'unavailable'
}

export type ChatThreadMediaResponse = {
  activeThread: PublicChatThreadSummary | null
  hasMoreOlder: boolean
  items: PortalChatMediaItem[]
  nextOlderCursor: number | null
  reason: ChatThreadRuntimeReason
  result: 'not_ready' | 'ready' | 'unavailable'
}

export type ChatThreadSearchResponse = {
  activeThread: PublicChatThreadSummary | null
  hasMoreOlder: boolean
  items: PortalChatSearchResult[]
  nextOlderCursor: number | null
  query: string
  reason: ChatThreadRuntimeReason
  result: 'not_ready' | 'ready' | 'unavailable'
}

export type ChatSendResult = {
  activeThread: PublicChatThreadSummary | null
  reason: ChatThreadRuntimeReason
  result: 'not_ready' | 'ready' | 'unavailable'
  sentMessage: PortalChatMessage | null
}
