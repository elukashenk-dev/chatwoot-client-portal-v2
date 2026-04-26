export type SendMessageInput = {
  clientMessageKey: string
  content: string
  replyToMessageId?: number | null
}

export type SendAttachmentInput = {
  clientMessageKey: string
  content?: string | null
  file: File
  replyToMessageId?: number | null
}

export type VoiceRecorderStatus =
  | 'idle'
  | 'recording'
  | 'sending'
  | 'starting'
  | 'stopping'

export type MessageComposerReplyTarget = {
  attachmentName?: string | null
  authorName: string
  content: string | null
  direction: 'incoming' | 'outgoing'
  id: number
}
