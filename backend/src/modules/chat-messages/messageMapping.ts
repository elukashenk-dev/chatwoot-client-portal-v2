import type {
  ChatwootClient,
  ChatwootMessage,
} from '../../integrations/chatwoot/client.js'
import { parseGroupThreadContent } from './authorFormatting.js'
import type {
  PortalChatMessage,
  PortalChatMessageAuthorRole,
  PortalChatReplyPreview,
} from './types.js'

export type SendLedgerAuthor = {
  authorDisplayName: string | null
  userId: number
}

type MessageThreadContext = {
  currentUserId: number
  ledgerAuthorsByMessageId?: Map<number, SendLedgerAuthor> | undefined
  replyTargetsById?: Map<number, ChatwootMessage> | undefined
  threadId: string
  threadType: 'group' | 'private' | null
}

function toIsoTimestamp(seconds: number) {
  return new Date(seconds * 1000).toISOString()
}

function normalizePortalMessageContent(content: string | null) {
  if (content === null) {
    return null
  }

  return content
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\(\r\n|\n|\r)/g, '$1')
}

function getAgentAuthorName(message: ChatwootMessage) {
  return message.sender?.name?.trim() || 'Агент'
}

function getContactFallbackName(message: ChatwootMessage) {
  return message.sender?.name?.trim() || 'Участник'
}

function buildPortalMessageAvatarUrl({
  messageId,
  threadId,
}: {
  messageId: number
  threadId: string
}) {
  return `/api/chat/threads/${encodeURIComponent(
    threadId,
  )}/messages/${messageId}/avatar`
}

function getAgentAvatarUrl(message: ChatwootMessage, threadId: string) {
  return message.sender?.avatarUrl?.trim()
    ? buildPortalMessageAvatarUrl({
        messageId: message.id,
        threadId,
      })
    : '/api/tenant/icons/icon-192.png'
}

function mapMessagePresentation(
  message: ChatwootMessage,
  {
    currentUserId,
    ledgerAuthorsByMessageId,
    threadId,
    threadType,
  }: MessageThreadContext,
): {
  authorAvatarUrl: string | null
  authorName: string
  authorRole: PortalChatMessageAuthorRole
  content: string | null
  direction: 'incoming' | 'outgoing'
} {
  const normalizedContent = normalizePortalMessageContent(message.content)

  if (message.messageType !== 0) {
    return {
      authorAvatarUrl: getAgentAvatarUrl(message, threadId),
      authorName: getAgentAuthorName(message),
      authorRole: 'agent',
      content: normalizedContent,
      direction: 'incoming',
    }
  }

  if (threadType !== 'group') {
    return {
      authorAvatarUrl: null,
      authorName: 'Вы',
      authorRole: 'current_user',
      content: normalizedContent,
      direction: 'outgoing',
    }
  }

  const parsedGroupContent = parseGroupThreadContent(normalizedContent)
  const ledgerAuthor = ledgerAuthorsByMessageId?.get(message.id)

  if (ledgerAuthor?.userId === currentUserId) {
    return {
      authorAvatarUrl: null,
      authorName: 'Вы',
      authorRole: 'current_user',
      content: parsedGroupContent.content,
      direction: 'outgoing',
    }
  }

  return {
    authorAvatarUrl: null,
    authorName:
      ledgerAuthor?.authorDisplayName?.trim() ||
      parsedGroupContent.authorName ||
      getContactFallbackName(message),
    authorRole: 'group_member',
    content: parsedGroupContent.content,
    direction: 'incoming',
  }
}

export function getReplyToMessageId(message: ChatwootMessage) {
  const rawReplyToMessageId =
    message.contentAttributes.in_reply_to ?? message.contentAttributes.inReplyTo

  return typeof rawReplyToMessageId === 'number' &&
    Number.isInteger(rawReplyToMessageId) &&
    rawReplyToMessageId > 0
    ? rawReplyToMessageId
    : null
}

export function isClientVisibleMessage(message: ChatwootMessage) {
  if (message.private) {
    return false
  }

  if (!message.content && message.attachments.length === 0) {
    return false
  }

  return true
}

function buildReplyPreview(
  replyToMessageId: number | null,
  targetMessage: ChatwootMessage | null | undefined,
  context: MessageThreadContext,
): PortalChatReplyPreview | null {
  if (
    replyToMessageId === null ||
    !targetMessage ||
    !isClientVisibleMessage(targetMessage)
  ) {
    return null
  }

  const presentation = mapMessagePresentation(targetMessage, context)

  return {
    attachmentName: targetMessage.attachments[0]?.name ?? null,
    authorName: presentation.authorName,
    content: presentation.content,
    direction: presentation.direction,
    messageId: replyToMessageId,
  }
}

function isPortalSendSourceId(sourceId: string | null) {
  return sourceId?.startsWith('portal-send:') ?? false
}

function normalizePortalMessageStatus(
  message: ChatwootMessage,
  presentation: Pick<ReturnType<typeof mapMessagePresentation>, 'direction'>,
) {
  if (
    presentation.direction === 'outgoing' &&
    isPortalSendSourceId(message.sourceId)
  ) {
    return 'sent'
  }

  return message.status
}

function buildPortalAttachmentUrl({
  attachmentId,
  messageId,
  threadId,
  variant = 'original',
}: {
  attachmentId: number
  messageId: number
  threadId: string
  variant?: 'original' | 'thumb'
}) {
  const basePath = `/api/chat/threads/${encodeURIComponent(
    threadId,
  )}/attachments/${messageId}/${attachmentId}`

  return variant === 'thumb' ? `${basePath}/thumb` : basePath
}

export function mapPortalMessage(
  message: ChatwootMessage,
  context: MessageThreadContext,
): PortalChatMessage | null {
  if (!isClientVisibleMessage(message)) {
    return null
  }

  const replyToMessageId = getReplyToMessageId(message)
  const replyToMessage =
    replyToMessageId === null
      ? null
      : context.replyTargetsById?.get(replyToMessageId)
  const presentation = mapMessagePresentation(message, context)

  return {
    attachments: message.attachments.map((attachment) => ({
      fileSize: attachment.fileSize,
      fileType: attachment.fileType,
      id: attachment.id,
      name: attachment.name,
      thumbUrl: attachment.thumbUrl
        ? buildPortalAttachmentUrl({
            attachmentId: attachment.id,
            messageId: message.id,
            threadId: context.threadId,
            variant: 'thumb',
          })
        : '',
      url: buildPortalAttachmentUrl({
        attachmentId: attachment.id,
        messageId: message.id,
        threadId: context.threadId,
      }),
    })),
    authorAvatarUrl: presentation.authorAvatarUrl,
    authorName: presentation.authorName,
    authorRole: presentation.authorRole,
    clientMessageKey: isPortalSendSourceId(message.sourceId)
      ? message.sourceId
      : null,
    content: presentation.content,
    contentType: message.contentType,
    createdAt: toIsoTimestamp(message.createdAt),
    direction: presentation.direction,
    id: message.id,
    replyTo: buildReplyPreview(replyToMessageId, replyToMessage, context),
    status: normalizePortalMessageStatus(message, presentation),
  }
}

export async function buildReplyTargetsById({
  chatwootClient,
  conversationId,
  messages,
}: {
  chatwootClient: Pick<ChatwootClient, 'findConversationMessageById'>
  conversationId: number
  messages: ChatwootMessage[]
}) {
  const replyTargetsById = new Map<number, ChatwootMessage>()

  for (const message of messages) {
    if (isClientVisibleMessage(message)) {
      replyTargetsById.set(message.id, message)
    }
  }

  const missingReplyTargetIds = [
    ...new Set(
      messages
        .filter(isClientVisibleMessage)
        .map(getReplyToMessageId)
        .filter((messageId): messageId is number => messageId !== null)
        .filter((messageId) => !replyTargetsById.has(messageId)),
    ),
  ]

  await Promise.all(
    missingReplyTargetIds.map(async (messageId) => {
      const replyTarget = await chatwootClient.findConversationMessageById(
        conversationId,
        messageId,
      )

      if (replyTarget && isClientVisibleMessage(replyTarget)) {
        replyTargetsById.set(messageId, replyTarget)
      }
    }),
  )

  return replyTargetsById
}
