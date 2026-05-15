import type {
  ChatMessage,
  ChatMessageReplyPreview,
} from '../types'
import type { MessageComposerReplyTarget } from '../components/message-composer/types'

export type OptimisticTextSendStatus = 'failed' | 'sending'

export type OptimisticTextSend = {
  clientMessageKey: string
  content: string
  createdAt: string
  errorMessage: string | null
  id: number
  replyTo: ChatMessageReplyPreview | null
  replyToMessageId: number | null
  status: OptimisticTextSendStatus
}

export type CreateOptimisticTextSendInput = {
  clientMessageKey: string
  content: string
  id: number
  now: Date
  replyTarget: MessageComposerReplyTarget | null
  replyToMessageId: number | null
}

export function createOptimisticTextSend({
  clientMessageKey,
  content,
  id,
  now,
  replyTarget,
  replyToMessageId,
}: CreateOptimisticTextSendInput): OptimisticTextSend {
  return {
    clientMessageKey,
    content,
    createdAt: now.toISOString(),
    errorMessage: null,
    id,
    replyTo:
      replyTarget && replyTarget.id === replyToMessageId
        ? {
            attachmentName: replyTarget.attachmentName ?? null,
            authorName: replyTarget.authorName,
            content: replyTarget.content,
            direction: replyTarget.direction,
            messageId: replyTarget.id,
          }
        : null,
    replyToMessageId,
    status: 'sending',
  }
}

export function toOptimisticChatMessage(send: OptimisticTextSend): ChatMessage {
  return {
    attachments: [],
    authorAvatarUrl: null,
    authorName: 'Вы',
    clientMessageKey: send.clientMessageKey,
    content: send.content,
    contentType: 'text',
    createdAt: send.createdAt,
    direction: 'outgoing',
    id: send.id,
    replyTo: send.replyTo,
    status: send.status,
  }
}

function sortMessagesByTimeline(messages: ChatMessage[]) {
  return [...messages].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime()
    const rightTime = new Date(right.createdAt).getTime()

    if (leftTime !== rightTime) {
      return leftTime - rightTime
    }

    return left.id - right.id
  })
}

export function mergeOptimisticTextMessages({
  messages,
  optimisticTextSends,
}: {
  messages: ChatMessage[]
  optimisticTextSends: OptimisticTextSend[]
}) {
  const canonicalClientMessageKeys = new Set(
    messages
      .map((message) => message.clientMessageKey?.trim() || null)
      .filter((clientMessageKey): clientMessageKey is string =>
        Boolean(clientMessageKey),
      ),
  )
  const visibleOptimisticMessages = optimisticTextSends
    .filter((send) => !canonicalClientMessageKeys.has(send.clientMessageKey))
    .map(toOptimisticChatMessage)

  return sortMessagesByTimeline([...messages, ...visibleOptimisticMessages])
}
