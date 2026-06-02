import type { ChatMessage, ChatMessageReplyPreview } from '../types'
import type { MessageComposerReplyTarget } from '../components/message-composer/types'

export type OptimisticTextSendStatus = 'failed' | 'queued' | 'sending'

export type OptimisticTextSend = {
  clientMessageKey: string
  content: string
  createdAt: string
  errorCode: string | null
  errorMessage: string | null
  id: number
  replyTo: ChatMessageReplyPreview | null
  replyToMessageId: number | null
  status: OptimisticTextSendStatus
  threadId: string
}

export type CreateOptimisticTextSendInput = {
  clientMessageKey: string
  content: string
  id: number
  now: Date
  replyTarget: MessageComposerReplyTarget | null
  replyToMessageId: number | null
  status?: OptimisticTextSendStatus
  threadId: string
}

export function createOptimisticTextSend({
  clientMessageKey,
  content,
  id,
  now,
  replyTarget,
  replyToMessageId,
  status = 'sending',
  threadId,
}: CreateOptimisticTextSendInput): OptimisticTextSend {
  return {
    clientMessageKey,
    content,
    createdAt: now.toISOString(),
    errorCode: null,
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
    status,
    threadId,
  }
}

export function toOptimisticChatMessage(send: OptimisticTextSend): ChatMessage {
  return {
    attachments: [],
    authorAvatarUrl: null,
    authorName: 'Вы',
    authorRole: 'current_user',
    clientMessageKey: send.clientMessageKey,
    content: send.content,
    contentType: 'text',
    createdAt: send.createdAt,
    direction: 'outgoing',
    errorCode: send.errorCode,
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
  threadId,
}: {
  messages: ChatMessage[]
  optimisticTextSends: OptimisticTextSend[]
  threadId: string
}) {
  const canonicalClientMessageKeys = new Set(
    messages
      .map((message) => message.clientMessageKey?.trim() || null)
      .filter((clientMessageKey): clientMessageKey is string =>
        Boolean(clientMessageKey),
      ),
  )
  const visibleOptimisticMessages = optimisticTextSends
    .filter(
      (send) =>
        send.threadId === threadId &&
        !canonicalClientMessageKeys.has(send.clientMessageKey),
    )
    .map(toOptimisticChatMessage)

  return sortMessagesByTimeline([...messages, ...visibleOptimisticMessages])
}
