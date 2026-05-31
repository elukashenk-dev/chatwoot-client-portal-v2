import type { ChatwootClient } from '../../integrations/chatwoot/client.js'
import {
  ChatwootClientConfigurationError,
  ChatwootClientRequestError,
} from '../../integrations/chatwoot/client.js'
import { ApiError } from '../../lib/errors.js'
import type { ChatThreadsService } from '../chat-threads/service.js'
import type { CurrentUserChatThreadContext } from '../chat-threads/types.js'
import {
  createAttachmentProxyFetcher,
  createAttachmentProxyUnavailableError,
} from './attachmentProxy.js'
import { isClientVisibleMessage } from './messageMapping.js'
import type { ChatAttachmentProxyResponse } from './service.js'

type FetchAllowedAttachment = ReturnType<typeof createAttachmentProxyFetcher>

type ChatAvatarProxyDependencies = {
  chatThreadsService: Pick<ChatThreadsService, 'getCurrentUserThreadContext'>
  chatwootClient: Pick<ChatwootClient, 'findConversationMessageById'> &
    Partial<Pick<ChatwootClient, 'findContactById'>>
  fetchAllowedAttachment: FetchAllowedAttachment
}

function createAvatarUnavailableError(statusCode = 404) {
  return new ApiError(statusCode, 'attachment_unavailable', 'Файл недоступен.')
}

function createAvatarThreadContextError(
  context: CurrentUserChatThreadContext,
) {
  if (context.reason === 'thread_access_denied') {
    return new ApiError(403, 'thread_access_denied', 'Доступ к чату запрещен.')
  }

  return createAvatarUnavailableError()
}

async function cancelAvatarResponseBody(response: Response) {
  try {
    await response.body?.cancel()
  } catch {
    // Best-effort cleanup before returning the controlled proxy error.
  }
}

async function fetchAllowedChatwootAvatar({
  fetchAllowedAttachment,
  initialUrl,
}: {
  fetchAllowedAttachment: FetchAllowedAttachment
  initialUrl: string
}): Promise<ChatAttachmentProxyResponse> {
  const headers = new Headers()
  headers.set('accept-encoding', 'identity')

  const upstreamResponse = await fetchAllowedAttachment({
    headers,
    initialUrl,
  })

  if (upstreamResponse.ok) {
    return {
      body: upstreamResponse.body,
      headers: upstreamResponse.headers,
      status: upstreamResponse.status,
    }
  }

  await cancelAvatarResponseBody(upstreamResponse)
  throw createAttachmentProxyUnavailableError()
}

export async function getCurrentUserChatMessageAvatarFromService({
  chatThreadsService,
  chatwootClient,
  fetchAllowedAttachment,
  messageId,
  threadId,
  userId,
}: ChatAvatarProxyDependencies & {
  messageId: number
  threadId: string
  userId: number
}): Promise<ChatAttachmentProxyResponse> {
  const context = await chatThreadsService.getCurrentUserThreadContext({
    threadId,
    userId,
  })

  if (context.result !== 'ready') {
    throw createAvatarThreadContextError(context)
  }

  if (!context.chatwootConversation) {
    throw createAvatarUnavailableError()
  }

  try {
    const message = await chatwootClient.findConversationMessageById(
      context.chatwootConversation.id,
      messageId,
    )
    const avatarUrl = message?.sender?.avatarUrl?.trim() ?? ''

    if (
      !message ||
      !isClientVisibleMessage(message) ||
      message.messageType === 0 ||
      !avatarUrl
    ) {
      throw createAvatarUnavailableError()
    }

    return fetchAllowedChatwootAvatar({
      fetchAllowedAttachment,
      initialUrl: avatarUrl,
    })
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    if (
      error instanceof ChatwootClientConfigurationError ||
      error instanceof ChatwootClientRequestError
    ) {
      throw createAvatarUnavailableError(503)
    }

    throw error
  }
}

export async function getCurrentUserThreadAvatarFromService({
  chatThreadsService,
  chatwootClient,
  fetchAllowedAttachment,
  threadId,
  userId,
}: ChatAvatarProxyDependencies & {
  threadId: string
  userId: number
}): Promise<ChatAttachmentProxyResponse> {
  const context = await chatThreadsService.getCurrentUserThreadContext({
    threadId,
    userId,
  })

  if (context.result !== 'ready') {
    throw createAvatarThreadContextError(context)
  }

  if (
    context.threadType !== 'group' ||
    context.targetChatwootContactId === null
  ) {
    throw createAvatarUnavailableError()
  }

  try {
    if (!chatwootClient.findContactById) {
      throw createAvatarUnavailableError()
    }

    const contact = await chatwootClient.findContactById(
      context.targetChatwootContactId,
    )
    const avatarUrl = contact?.avatarUrl?.trim() ?? ''

    if (!avatarUrl) {
      throw createAvatarUnavailableError()
    }

    return fetchAllowedChatwootAvatar({
      fetchAllowedAttachment,
      initialUrl: avatarUrl,
    })
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    if (
      error instanceof ChatwootClientConfigurationError ||
      error instanceof ChatwootClientRequestError
    ) {
      throw createAvatarUnavailableError(503)
    }

    throw error
  }
}

export function createChatAvatarProxyMethods(
  dependencies: ChatAvatarProxyDependencies,
) {
  return {
    getCurrentUserChatMessageAvatar({
      messageId,
      threadId,
      userId,
    }: {
      messageId: number
      threadId: string
      userId: number
    }) {
      return getCurrentUserChatMessageAvatarFromService({
        ...dependencies,
        messageId,
        threadId,
        userId,
      })
    },

    getCurrentUserThreadAvatar({
      threadId,
      userId,
    }: {
      threadId: string
      userId: number
    }) {
      return getCurrentUserThreadAvatarFromService({
        ...dependencies,
        threadId,
        userId,
      })
    },
  }
}
