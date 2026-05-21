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
import { PRIVATE_CHAT_THREAD_ID } from '../chat-threads/privateThread.js'
import type { ChatThreadsRepository } from '../chat-threads/repository.js'
import type { ChatThreadsService } from '../chat-threads/service.js'
import type { CurrentUserChatThreadContext } from '../chat-threads/types.js'
import { buildReplyTargetsById, mapPortalMessage } from './messageMapping.js'
import type { ChatMessageContextResponse, PortalChatMessage } from './types.js'

type ChatMessageContextDependencies = {
  chatThreadsRepository: Pick<
    ChatThreadsRepository,
    'findSendLedgerAuthorsByMessageIds'
  >
  chatThreadsService: Pick<ChatThreadsService, 'getCurrentUserThreadContext'>
  chatwootClient: Pick<
    ChatwootClient,
    | 'findConversationMessageById'
    | 'listConversationMessages'
    | 'listConversationMessagesAfter'
  >
}

function buildMessageContextResponse(
  context: CurrentUserChatThreadContext,
  {
    earlierCursor = null,
    hasMoreEarlier = false,
    hasMoreLater = false,
    laterCursor = null,
    messages = [],
    reason = context.reason,
    result = context.result,
    targetMessageId,
  }: {
    earlierCursor?: number | null
    hasMoreEarlier?: boolean
    hasMoreLater?: boolean
    laterCursor?: number | null
    messages?: PortalChatMessage[]
    reason?: ChatMessageContextResponse['reason']
    result?: ChatMessageContextResponse['result']
    targetMessageId: number
  },
): ChatMessageContextResponse {
  return {
    activeThread: context.activeThread,
    earlierCursor,
    hasMoreEarlier,
    hasMoreLater,
    laterCursor,
    messages,
    reason,
    result,
    targetMessageId,
  }
}

async function findLedgerAuthorsForMessages({
  chatThreadsRepository,
  context,
  messageIds,
}: {
  chatThreadsRepository: ChatMessageContextDependencies['chatThreadsRepository']
  context: CurrentUserChatThreadContext
  messageIds: number[]
}) {
  if (context.threadType !== 'group' || context.portalChatThreadId === null) {
    return new Map()
  }

  return chatThreadsRepository.findSendLedgerAuthorsByMessageIds({
    messageIds,
    portalChatThreadId: context.portalChatThreadId,
  })
}

function createContextMessageMapper({
  context,
  ledgerAuthorsByMessageId,
  replyTargetsById,
  userId,
}: {
  context: CurrentUserChatThreadContext
  ledgerAuthorsByMessageId: Awaited<
    ReturnType<typeof findLedgerAuthorsForMessages>
  >
  replyTargetsById: Map<number, ChatwootMessage>
  userId: number
}) {
  return {
    currentUserId: userId,
    ledgerAuthorsByMessageId,
    replyTargetsById,
    threadId: context.activeThread?.id ?? PRIVATE_CHAT_THREAD_ID,
    threadType: context.threadType,
  }
}

async function mapChatwootMessagesForContext({
  chatThreadsRepository,
  chatwootClient,
  context,
  conversationId,
  messages,
  userId,
}: Omit<ChatMessageContextDependencies, 'chatThreadsService'> & {
  context: CurrentUserChatThreadContext
  conversationId: number
  messages: ChatwootMessage[]
  userId: number
}) {
  const replyTargetsById = await buildReplyTargetsById({
    chatwootClient,
    conversationId,
    messages,
  })
  const ledgerAuthorsByMessageId = await findLedgerAuthorsForMessages({
    chatThreadsRepository,
    context,
    messageIds: [
      ...new Set([
        ...messages.map((message) => message.id),
        ...replyTargetsById.keys(),
      ]),
    ],
  })
  const messageMapperContext = createContextMessageMapper({
    context,
    ledgerAuthorsByMessageId,
    replyTargetsById,
    userId,
  })

  return messages
    .map((message) => mapPortalMessage(message, messageMapperContext))
    .filter((message): message is PortalChatMessage => message !== null)
}

function createMessageContextUnavailableError() {
  return new ApiError(
    404,
    'message_context_unavailable',
    'Сообщение недоступно.',
  )
}

function withMissingConversation(context: CurrentUserChatThreadContext) {
  return {
    ...context,
    chatwootConversation: null,
    reason: 'conversation_missing' as const,
    result: 'not_ready' as const,
  }
}

function withChatwootUnavailable(context: CurrentUserChatThreadContext) {
  return {
    ...context,
    chatwootConversation: null,
    reason: 'chatwoot_unavailable' as const,
    result: 'unavailable' as const,
  }
}

export async function getCurrentUserChatMessageContext({
  chatThreadsRepository,
  chatThreadsService,
  chatwootClient,
  cursorMessageId = null,
  direction = 'initial',
  messageId,
  threadId = PRIVATE_CHAT_THREAD_ID,
  userId,
}: ChatMessageContextDependencies & {
  cursorMessageId?: number | null
  direction?: 'earlier' | 'initial' | 'later'
  messageId: number
  threadId?: string
  userId: number
}): Promise<ChatMessageContextResponse> {
  const context = await chatThreadsService.getCurrentUserThreadContext({
    threadId,
    userId,
  })

  if (context.result !== 'ready' || !context.chatwootConversation) {
    return buildMessageContextResponse(context, { targetMessageId: messageId })
  }

  try {
    const conversationId = context.chatwootConversation.id
    const targetMessage = await chatwootClient.findConversationMessageById(
      conversationId,
      messageId,
    )

    if (!targetMessage) {
      throw createMessageContextUnavailableError()
    }

    const mappedTargetMessages = await mapChatwootMessagesForContext({
      chatThreadsRepository,
      chatwootClient,
      context,
      conversationId,
      messages: [targetMessage],
      userId,
    })
    const mappedTargetMessage = mappedTargetMessages[0] ?? null

    if (!mappedTargetMessage) {
      throw createMessageContextUnavailableError()
    }

    if (direction === 'earlier') {
      const page = await chatwootClient.listConversationMessages(
        conversationId,
        {
          beforeMessageId: cursorMessageId ?? messageId,
        },
      )

      if (page === null) {
        return buildMessageContextResponse(withMissingConversation(context), {
          targetMessageId: messageId,
        })
      }

      return buildMessageContextResponse(context, {
        earlierCursor: page.nextOlderCursor,
        hasMoreEarlier: page.hasMoreOlder,
        messages: await mapChatwootMessagesForContext({
          chatThreadsRepository,
          chatwootClient,
          context,
          conversationId,
          messages: page.messages,
          userId,
        }),
        targetMessageId: messageId,
      })
    }

    if (direction === 'later') {
      const page = await chatwootClient.listConversationMessagesAfter(
        conversationId,
        {
          afterMessageId: cursorMessageId ?? messageId,
        },
      )

      if (page === null) {
        return buildMessageContextResponse(withMissingConversation(context), {
          targetMessageId: messageId,
        })
      }

      return buildMessageContextResponse(context, {
        hasMoreLater: page.hasMoreNewer,
        laterCursor: page.nextNewerCursor,
        messages: await mapChatwootMessagesForContext({
          chatThreadsRepository,
          chatwootClient,
          context,
          conversationId,
          messages: page.messages,
          userId,
        }),
        targetMessageId: messageId,
      })
    }

    const [earlierPage, laterPage] = await Promise.all([
      chatwootClient.listConversationMessages(conversationId, {
        beforeMessageId: messageId,
      }),
      chatwootClient.listConversationMessagesAfter(conversationId, {
        afterMessageId: messageId,
      }),
    ])

    if (earlierPage === null || laterPage === null) {
      return buildMessageContextResponse(withMissingConversation(context), {
        targetMessageId: messageId,
      })
    }

    const [earlierMessages, laterMessages] = await Promise.all([
      mapChatwootMessagesForContext({
        chatThreadsRepository,
        chatwootClient,
        context,
        conversationId,
        messages: earlierPage.messages,
        userId,
      }),
      mapChatwootMessagesForContext({
        chatThreadsRepository,
        chatwootClient,
        context,
        conversationId,
        messages: laterPage.messages,
        userId,
      }),
    ])

    return buildMessageContextResponse(context, {
      earlierCursor: earlierPage.nextOlderCursor,
      hasMoreEarlier: earlierPage.hasMoreOlder,
      hasMoreLater: laterPage.hasMoreNewer,
      laterCursor: laterPage.nextNewerCursor,
      messages: [...earlierMessages, mappedTargetMessage, ...laterMessages],
      targetMessageId: messageId,
    })
  } catch (error) {
    if (error instanceof ChatwootInvalidHistoryCursorError) {
      throw new ApiError(
        400,
        'invalid_history_cursor',
        'History cursor is invalid for the current conversation.',
      )
    }

    if (error instanceof ApiError) {
      throw error
    }

    if (
      error instanceof ChatwootClientConfigurationError ||
      error instanceof ChatwootClientRequestError
    ) {
      return buildMessageContextResponse(withChatwootUnavailable(context), {
        targetMessageId: messageId,
      })
    }

    throw error
  }
}
