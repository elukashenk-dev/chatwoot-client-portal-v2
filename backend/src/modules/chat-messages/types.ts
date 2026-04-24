import type { ChatContextSnapshot } from '../chat-context/service.js'

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

export type ChatMessagesSnapshot = ChatContextSnapshot & {
  hasMoreOlder: boolean
  messages: PortalChatMessage[]
  nextOlderCursor: number | null
}

export type ChatSendResult = ChatContextSnapshot & {
  sentMessage: PortalChatMessage | null
}
