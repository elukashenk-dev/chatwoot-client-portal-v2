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
  | 'company_member'
  | 'current_user'

export type ChatMessagesSnapshot = {
  activeThread: PublicChatThreadSummary | null
  hasMoreOlder: boolean
  messages: PortalChatMessage[]
  nextOlderCursor: number | null
  reason: ChatThreadRuntimeReason
  result: 'not_ready' | 'ready' | 'unavailable'
}

export type ChatSendResult = {
  activeThread: PublicChatThreadSummary | null
  reason: ChatThreadRuntimeReason
  result: 'not_ready' | 'ready' | 'unavailable'
  sentMessage: PortalChatMessage | null
}
