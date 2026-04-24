export type ChatContextReason =
  | 'none'
  | 'chatwoot_not_configured'
  | 'chatwoot_unavailable'
  | 'contact_link_missing'
  | 'conversation_mapping_unavailable'
  | 'conversation_missing'
  | 'primary_conversation_missing'

export type ChatContextResult = 'not_ready' | 'ready' | 'unavailable'

export type ChatLinkedContact = {
  id: number
}

export type ChatPrimaryConversation = {
  assigneeName: string | null
  id: number
  inboxId: number
  lastActivityAt: number | null
  status: string
}

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
  authorName: string
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
  hasMoreOlder: boolean
  linkedContact: ChatLinkedContact | null
  messages: ChatMessage[]
  nextOlderCursor: number | null
  primaryConversation: ChatPrimaryConversation | null
  reason: ChatContextReason
  result: ChatContextResult
}

export type ChatSendResult = {
  linkedContact: ChatLinkedContact | null
  primaryConversation: ChatPrimaryConversation | null
  reason: ChatContextReason
  result: ChatContextResult
  sentMessage: ChatMessage | null
}
