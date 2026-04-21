import type {
  ChatwootClient,
  ChatwootMessage,
} from '../../integrations/chatwoot/client.js'
import {
  ChatwootClientConfigurationError,
  ChatwootClientRequestError,
  ChatwootInvalidHistoryCursorError,
} from '../../integrations/chatwoot/client.js'
import { ApiError } from '../../lib/errors.js'
import type {
  ChatContextService,
  ChatContextSnapshot,
} from '../chat-context/service.js'

export type PortalChatAttachment = {
  fileSize: number | null
  fileType: string
  id: number
  name: string
  thumbUrl: string
  url: string
}

export type PortalChatMessage = {
  attachments: PortalChatAttachment[]
  authorName: string
  content: string | null
  contentType: string
  createdAt: string
  direction: 'incoming' | 'outgoing'
  id: number
  status: string
}

export type ChatMessagesSnapshot = ChatContextSnapshot & {
  hasMoreOlder: boolean
  messages: PortalChatMessage[]
  nextOlderCursor: number | null
}

type CreateChatMessagesServiceOptions = {
  chatContextService: Pick<ChatContextService, 'getCurrentUserChatContext'>
  chatwootClient: Pick<ChatwootClient, 'listConversationMessages'>
}

function buildMessagesSnapshot(
  context: ChatContextSnapshot,
  {
    hasMoreOlder = false,
    messages = [],
    nextOlderCursor = null,
  }: {
    hasMoreOlder?: boolean
    messages?: PortalChatMessage[]
    nextOlderCursor?: number | null
  } = {},
): ChatMessagesSnapshot {
  return {
    ...context,
    hasMoreOlder,
    messages,
    nextOlderCursor,
  }
}

function toIsoTimestamp(seconds: number) {
  return new Date(seconds * 1000).toISOString()
}

function mapMessageDirection(message: ChatwootMessage) {
  return message.messageType === 0 ? 'outgoing' : 'incoming'
}

function mapAuthorName(message: ChatwootMessage) {
  if (message.messageType === 0) {
    return 'Вы'
  }

  return message.sender?.name?.trim() || 'Агент'
}

function mapPortalMessage(message: ChatwootMessage): PortalChatMessage | null {
  if (message.private) {
    return null
  }

  if (!message.content && message.attachments.length === 0) {
    return null
  }

  return {
    attachments: message.attachments.map((attachment) => ({
      fileSize: attachment.fileSize,
      fileType: attachment.fileType,
      id: attachment.id,
      name: attachment.name,
      thumbUrl: attachment.thumbUrl,
      url: attachment.url,
    })),
    authorName: mapAuthorName(message),
    content: message.content,
    contentType: message.contentType,
    createdAt: toIsoTimestamp(message.createdAt),
    direction: mapMessageDirection(message),
    id: message.id,
    status: message.status,
  }
}

function createChatUnavailableContext(
  context: ChatContextSnapshot,
): ChatMessagesSnapshot {
  return buildMessagesSnapshot({
    ...context,
    primaryConversation: null,
    reason: 'chatwoot_unavailable',
    result: 'unavailable',
  })
}

export function createChatMessagesService({
  chatContextService,
  chatwootClient,
}: CreateChatMessagesServiceOptions) {
  return {
    async getCurrentUserChatMessages({
      beforeMessageId = null,
      primaryConversationId = null,
      userId,
    }: {
      beforeMessageId?: number | null
      primaryConversationId?: number | null
      userId: number
    }): Promise<ChatMessagesSnapshot> {
      const context = await chatContextService.getCurrentUserChatContext({
        selectedPrimaryConversationId: primaryConversationId,
        userId,
      })

      if (context.result !== 'ready' || !context.primaryConversation) {
        return buildMessagesSnapshot(context)
      }

      try {
        const page = await chatwootClient.listConversationMessages(
          context.primaryConversation.id,
          {
            beforeMessageId,
          },
        )

        if (page === null) {
          return buildMessagesSnapshot({
            ...context,
            primaryConversation: null,
            reason: 'primary_conversation_missing',
            result: 'not_ready',
          })
        }

        return buildMessagesSnapshot(context, {
          hasMoreOlder: page.hasMoreOlder,
          messages: page.messages
            .map(mapPortalMessage)
            .filter(
              (message): message is PortalChatMessage => message !== null,
            ),
          nextOlderCursor: page.nextOlderCursor,
        })
      } catch (error) {
        if (error instanceof ChatwootInvalidHistoryCursorError) {
          throw new ApiError(
            400,
            'invalid_history_cursor',
            'History cursor is invalid for the current conversation.',
          )
        }

        if (
          error instanceof ChatwootClientConfigurationError ||
          error instanceof ChatwootClientRequestError
        ) {
          return createChatUnavailableContext(context)
        }

        throw error
      }
    },
  }
}

export type ChatMessagesService = ReturnType<typeof createChatMessagesService>
