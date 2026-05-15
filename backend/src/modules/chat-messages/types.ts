import type { PublicChatContextSnapshot } from '../chat-threads/privateThread.js'

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
  clientMessageKey?: string | null
  content: string | null
  contentType: string
  createdAt: string
  direction: 'incoming' | 'outgoing'
  id: number
  replyTo: PortalChatReplyPreview | null
  status: string
}

export type ChatMessagesSnapshot = PublicChatContextSnapshot & {
  hasMoreOlder: boolean
  messages: PortalChatMessage[]
  nextOlderCursor: number | null
}

export type ChatSendResult = PublicChatContextSnapshot & {
  sentMessage: PortalChatMessage | null
}
