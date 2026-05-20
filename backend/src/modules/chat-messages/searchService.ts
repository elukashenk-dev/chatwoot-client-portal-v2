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
import {
  buildPortalChatSearchResults,
  normalizeChatSearchQuery,
} from './search.js'
import type {
  ChatThreadSearchResponse,
  PortalChatMessage,
  PortalChatSearchResult,
} from './types.js'

const CHAT_SEARCH_MAX_SCANNED_PAGES = 8
const CHAT_SEARCH_MAX_RESULTS = 20

type ChatSearchDependencies = {
  chatThreadsRepository: Pick<
    ChatThreadsRepository,
    'findSendLedgerAuthorsByMessageIds'
  >
  chatThreadsService: Pick<ChatThreadsService, 'getCurrentUserThreadContext'>
  chatwootClient: Pick<
    ChatwootClient,
    'findConversationMessageById' | 'listConversationMessages'
  >
}

function buildSearchResponse(
  context: CurrentUserChatThreadContext,
  {
    hasMoreOlder = false,
    items = [],
    nextOlderCursor = null,
    query,
    reason = context.reason,
    result = context.result,
  }: {
    hasMoreOlder?: boolean
    items?: PortalChatSearchResult[]
    nextOlderCursor?: number | null
    query: string
    reason?: ChatThreadSearchResponse['reason']
    result?: ChatThreadSearchResponse['result']
  },
): ChatThreadSearchResponse {
  return {
    activeThread: context.activeThread,
    hasMoreOlder,
    items,
    nextOlderCursor,
    query,
    reason,
    result,
  }
}

async function findLedgerAuthorsForMessages({
  chatThreadsRepository,
  context,
  messageIds,
}: {
  chatThreadsRepository: ChatSearchDependencies['chatThreadsRepository']
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

function createSearchMessageMapperContext({
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

function buildPaginatedSearchResults({
  historyHasMoreOlder,
  historyNextOlderCursor,
  messages,
  query,
}: {
  historyHasMoreOlder: boolean
  historyNextOlderCursor: number | null
  messages: PortalChatMessage[]
  query: string
}) {
  const allItems = buildPortalChatSearchResults({
    messages,
    query,
  })
  const items = allItems.slice(0, CHAT_SEARCH_MAX_RESULTS)
  const overflowCursor =
    allItems.length > items.length
      ? (items[items.length - 1]?.messageId ?? null)
      : null

  return {
    hasMoreOlder: overflowCursor !== null || historyHasMoreOlder,
    items,
    nextOlderCursor: overflowCursor ?? historyNextOlderCursor,
  }
}

export async function getCurrentUserChatSearch({
  beforeMessageId = null,
  chatThreadsRepository,
  chatThreadsService,
  chatwootClient,
  query,
  threadId = PRIVATE_CHAT_THREAD_ID,
  userId,
}: ChatSearchDependencies & {
  beforeMessageId?: number | null
  query: string
  threadId?: string
  userId: number
}): Promise<ChatThreadSearchResponse> {
  const normalizedQuery = normalizeChatSearchQuery(query)
  const context = await chatThreadsService.getCurrentUserThreadContext({
    threadId,
    userId,
  })

  if (!context.chatwootConversation) {
    if (
      context.reason === 'conversation_missing' &&
      context.activeThread !== null
    ) {
      return buildSearchResponse(context, {
        query: normalizedQuery,
        reason: 'none',
        result: 'ready',
      })
    }

    return buildSearchResponse(context, {
      query: normalizedQuery,
    })
  }

  if (context.result !== 'ready') {
    return buildSearchResponse(context, {
      query: normalizedQuery,
    })
  }

  try {
    const conversationId = context.chatwootConversation.id
    let cursor = beforeMessageId
    let hasMoreOlder = false
    let nextOlderCursor: number | null = null
    const visibleMessages: PortalChatMessage[] = []

    for (
      let scannedPages = 0;
      scannedPages < CHAT_SEARCH_MAX_SCANNED_PAGES;
      scannedPages += 1
    ) {
      const page = await chatwootClient.listConversationMessages(
        conversationId,
        {
          beforeMessageId: cursor,
        },
      )

      if (page === null) {
        return buildSearchResponse(
          {
            ...context,
            chatwootConversation: null,
            reason: 'conversation_missing',
            result: 'not_ready',
          },
          { query: normalizedQuery },
        )
      }

      const replyTargetsById = await buildReplyTargetsById({
        chatwootClient,
        conversationId,
        messages: page.messages,
      })
      const ledgerAuthorsByMessageId = await findLedgerAuthorsForMessages({
        chatThreadsRepository,
        context,
        messageIds: [
          ...new Set([
            ...page.messages.map((message) => message.id),
            ...replyTargetsById.keys(),
          ]),
        ],
      })
      const messageMapperContext = createSearchMessageMapperContext({
        context,
        ledgerAuthorsByMessageId,
        replyTargetsById,
        userId,
      })

      visibleMessages.push(
        ...page.messages
          .map((message) => mapPortalMessage(message, messageMapperContext))
          .filter((message): message is PortalChatMessage => message !== null),
      )
      hasMoreOlder = page.hasMoreOlder
      nextOlderCursor = page.nextOlderCursor

      const currentResults = buildPortalChatSearchResults({
        limit: CHAT_SEARCH_MAX_RESULTS,
        messages: visibleMessages,
        query: normalizedQuery,
      })

      if (
        currentResults.length >= CHAT_SEARCH_MAX_RESULTS ||
        !page.hasMoreOlder ||
        !page.nextOlderCursor
      ) {
        break
      }

      cursor = page.nextOlderCursor
    }

    const resultPage = buildPaginatedSearchResults({
      historyHasMoreOlder: hasMoreOlder,
      historyNextOlderCursor: nextOlderCursor,
      messages: visibleMessages,
      query: normalizedQuery,
    })

    return buildSearchResponse(context, {
      ...resultPage,
      query: normalizedQuery,
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
      return buildSearchResponse(context, {
        query: normalizedQuery,
        reason: 'chatwoot_unavailable',
        result: 'unavailable',
      })
    }

    throw error
  }
}
