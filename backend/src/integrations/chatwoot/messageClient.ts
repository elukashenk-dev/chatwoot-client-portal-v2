import {
  ChatwootClientRequestError,
  ChatwootInvalidHistoryCursorError,
} from './errors.js'
import { mapMessage, parseMessagesResponse } from './messagePayload.js'
import type {
  ChatwootMessage,
  ChatwootMessagesAfterPage,
  ChatwootMessagesPage,
} from './messagePayload.js'
import type { createChatwootFetch } from './request.js'
import { readChatwootJson } from './request.js'

const MESSAGE_PAGE_SIZE = 20

type ResolvedChatwootClientConfig = {
  accountId: number
  apiAccessToken: string
  baseUrl: string
  portalInboxId: number
}

type CreateChatwootMessageClientOptions = {
  assertConfigured: () => ResolvedChatwootClientConfig
  fetchChatwoot: ReturnType<typeof createChatwootFetch>
}

function sortMessages(messages: ChatwootMessage[]) {
  return [...messages].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt
    }

    return left.id - right.id
  })
}

function buildMessagesPage(messages: ChatwootMessage[]) {
  return sortMessages(messages).slice(-MESSAGE_PAGE_SIZE)
}

function buildMessagesAfterPage(messages: ChatwootMessage[]) {
  return sortMessages(messages).slice(0, MESSAGE_PAGE_SIZE)
}

function validateConversationId(conversationId: number) {
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    throw new ChatwootClientRequestError(
      'Chatwoot messages lookup requires a valid conversation id.',
    )
  }
}

function validateHistoryCursor(messageId: number | null) {
  if (messageId !== null && (!Number.isInteger(messageId) || messageId <= 0)) {
    throw new ChatwootInvalidHistoryCursorError()
  }
}

export function createChatwootMessageClient({
  assertConfigured,
  fetchChatwoot,
}: CreateChatwootMessageClientOptions) {
  async function fetchConversationMessages({
    afterMessageId,
    beforeMessageId,
    conversationId,
  }: {
    afterMessageId?: number | null
    beforeMessageId?: number | null
    conversationId: number
  }) {
    const resolvedConfig = assertConfigured()
    const requestUrl = new URL(
      `/api/v1/accounts/${resolvedConfig.accountId}/conversations/${conversationId}/messages`,
      resolvedConfig.baseUrl,
    )

    requestUrl.searchParams.set('filter_internal_messages', 'true')

    if (beforeMessageId !== undefined && beforeMessageId !== null) {
      requestUrl.searchParams.set('before', String(beforeMessageId))
    }

    if (afterMessageId !== undefined && afterMessageId !== null) {
      requestUrl.searchParams.set('after', String(afterMessageId))
    }

    const request = await fetchChatwoot(
      requestUrl,
      'Chatwoot messages lookup is unavailable.',
      {
        headers: {
          Accept: 'application/json',
          api_access_token: resolvedConfig.apiAccessToken,
        },
        method: 'GET',
      },
    )
    const { response } = request

    try {
      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        throw new ChatwootClientRequestError(
          `Chatwoot messages lookup failed with status ${response.status}.`,
        )
      }

      const payload = await readChatwootJson({
        invalidJsonMessage: 'Chatwoot messages lookup returned invalid JSON.',
        request,
        unavailableMessage: 'Chatwoot messages lookup is unavailable.',
      })

      return sortMessages(
        parseMessagesResponse(payload).payload.map((message) =>
          mapMessage(message, {
            baseUrl: resolvedConfig.baseUrl,
          }),
        ),
      )
    } finally {
      request.clearTimeout()
    }
  }

  async function isConversationMessageAnchorValid(
    conversationId: number,
    messageId: number,
  ) {
    const probeMessages = await fetchConversationMessages({
      beforeMessageId: messageId + 1,
      conversationId,
    })

    if (probeMessages === null) {
      return null
    }

    return probeMessages.some((message) => message.id === messageId)
  }

  async function hasConversationMessagesBefore(
    conversationId: number,
    beforeMessageId: number,
  ) {
    const olderMessages = await fetchConversationMessages({
      beforeMessageId,
      conversationId,
    })

    if (olderMessages === null) {
      return null
    }

    return olderMessages.length > 0
  }

  async function assertValidAnchor(conversationId: number, messageId: number) {
    const isAnchorValid = await isConversationMessageAnchorValid(
      conversationId,
      messageId,
    )

    if (isAnchorValid === null) {
      return null
    }

    if (!isAnchorValid) {
      throw new ChatwootInvalidHistoryCursorError()
    }

    return true
  }

  return {
    async findConversationMessageById(
      conversationId: number,
      messageId: number,
    ) {
      assertConfigured()

      if (!Number.isInteger(messageId) || messageId <= 0) {
        throw new ChatwootClientRequestError(
          'Chatwoot message lookup requires a valid message id.',
        )
      }

      const messages = await fetchConversationMessages({
        beforeMessageId: messageId + 1,
        conversationId,
      })

      return messages?.find((message) => message.id === messageId) ?? null
    },

    async findConversationMessageBySourceId(
      conversationId: number,
      sourceId: string,
    ) {
      assertConfigured()

      if (!sourceId.trim()) {
        return null
      }

      const messages = await fetchConversationMessages({
        conversationId,
      })

      return (
        messages?.find((message) => message.sourceId === sourceId.trim()) ??
        null
      )
    },

    async listConversationMessages(
      conversationId: number,
      { beforeMessageId = null }: { beforeMessageId?: number | null } = {},
    ): Promise<ChatwootMessagesPage | null> {
      assertConfigured()
      validateConversationId(conversationId)
      validateHistoryCursor(beforeMessageId)

      if (
        beforeMessageId !== null &&
        (await assertValidAnchor(conversationId, beforeMessageId)) === null
      ) {
        return null
      }

      const messages = await fetchConversationMessages({
        beforeMessageId,
        conversationId,
      })

      if (messages === null) {
        return null
      }

      const page = buildMessagesPage(messages)

      if (page.length === 0) {
        return {
          hasMoreOlder: false,
          messages: [],
          nextOlderCursor: null,
        }
      }

      const oldestMessage = page[0]

      if (!oldestMessage || page.length < MESSAGE_PAGE_SIZE) {
        return {
          hasMoreOlder: false,
          messages: page,
          nextOlderCursor: null,
        }
      }

      const hasMoreOlder = await hasConversationMessagesBefore(
        conversationId,
        oldestMessage.id,
      )

      if (hasMoreOlder === null) {
        return null
      }

      return {
        hasMoreOlder,
        messages: page,
        nextOlderCursor: hasMoreOlder ? oldestMessage.id : null,
      }
    },

    async listConversationMessagesAfter(
      conversationId: number,
      { afterMessageId }: { afterMessageId: number },
    ): Promise<ChatwootMessagesAfterPage | null> {
      assertConfigured()
      validateConversationId(conversationId)
      validateHistoryCursor(afterMessageId)

      if ((await assertValidAnchor(conversationId, afterMessageId)) === null) {
        return null
      }

      const messages = await fetchConversationMessages({
        afterMessageId,
        conversationId,
      })

      if (messages === null) {
        return null
      }

      const sortedMessages = sortMessages(messages)
      const page = buildMessagesAfterPage(messages)

      if (page.length === 0) {
        return {
          hasMoreNewer: false,
          messages: [],
          nextNewerCursor: null,
        }
      }

      const newestMessage = page[page.length - 1] ?? null
      const hasMoreNewer = sortedMessages.length > page.length

      return {
        hasMoreNewer,
        messages: page,
        nextNewerCursor: hasMoreNewer ? (newestMessage?.id ?? null) : null,
      }
    },
  }
}
