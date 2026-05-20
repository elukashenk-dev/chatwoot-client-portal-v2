import { createHash } from 'node:crypto'

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
import {
  createAttachmentProxyFetcher,
  createAttachmentProxyUnavailableError,
} from './attachmentProxy.js'
import {
  formatGroupThreadContent,
  normalizeGroupAuthorDisplayName,
} from './authorFormatting.js'
import { normalizeContent, normalizeOptionalContent } from './content.js'
import { buildPortalChatMediaItems } from './media.js'
import {
  buildReplyTargetsById,
  isClientVisibleMessage,
  mapPortalMessage,
} from './messageMapping.js'
import type { ChatMessagesRepository } from './repository.js'
import { createOrReplayCanonicalMessage } from './sendLedger.js'
import { sendWithDeletedConversationRecovery } from './sendRecovery.js'
import { getCurrentUserChatSearch as getCurrentUserChatSearchFromService } from './searchService.js'
import type {
  ChatMessagesSnapshot,
  ChatThreadMediaResponse,
  ChatThreadSearchResponse,
  ChatSendResult,
  PortalAttachmentUpload,
  PortalChatMediaItem,
  PortalChatMessage,
} from './types.js'

export type {
  ChatMessagesSnapshot,
  ChatThreadMediaResponse,
  ChatThreadSearchResponse,
  ChatSendResult,
  PortalAttachmentUpload,
  PortalChatAttachment,
  PortalChatMediaItem,
  PortalChatMessage,
  PortalChatReplyPreview,
  PortalChatSearchResult,
} from './types.js'

const SEND_LEDGER_MESSAGE_KIND_TEXT = 'text'
const SEND_LEDGER_MESSAGE_KIND_ATTACHMENT = 'attachment'
const CLIENT_MESSAGE_KEY_MAX_LENGTH = 200
export const CHAT_ATTACHMENT_MAX_BYTES = 40 * 1024 * 1024
const CHAT_ATTACHMENT_FILE_NAME_MAX_LENGTH = 255
const CHAT_ATTACHMENT_ALLOWED_MIME_TYPES = new Set([
  'application/json',
  'application/msword',
  'application/pdf',
  'application/rtf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/zip',
  'text/csv',
  'text/plain',
  'text/rtf',
])

type CreateChatMessagesServiceOptions = {
  attachmentAllowedOrigins?: readonly string[]
  attachmentAllowPrivateNetwork?: boolean
  attachmentFetchFn?: typeof fetch
  attachmentRequestTimeoutMs?: number | undefined
  chatThreadsRepository: Pick<
    ChatThreadsRepository,
    'findSendLedgerAuthorsByMessageIds'
  >
  chatThreadsService: Pick<
    ChatThreadsService,
    | 'ensureCurrentUserWritableThreadContext'
    | 'getCurrentUserThreadContext'
    | 'recoverCurrentUserWritableThreadContext'
  >
  chatMessagesRepository?: ChatMessagesRepository | null
  chatwootClient: Pick<
    ChatwootClient,
    | 'createConversationIncomingAttachmentMessage'
    | 'createConversationIncomingMessage'
    | 'findConversationMessageById'
    | 'findConversationMessageBySourceId'
    | 'listConversationMessages'
  >
  now?: () => Date
}

export type ChatAttachmentProxyVariant = 'original' | 'thumb'

export type ChatAttachmentProxyResponse = {
  body: ReadableStream<Uint8Array> | null
  headers: Headers
  status: number
}

function buildMessagesSnapshot(
  context: CurrentUserChatThreadContext,
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
    activeThread: context.activeThread,
    hasMoreOlder,
    messages,
    nextOlderCursor,
    reason: context.reason,
    result: context.result,
  }
}

function buildMediaResponse(
  context: CurrentUserChatThreadContext,
  {
    hasMoreOlder = false,
    items = [],
    nextOlderCursor = null,
    reason = context.reason,
    result = context.result,
  }: {
    hasMoreOlder?: boolean
    items?: PortalChatMediaItem[]
    nextOlderCursor?: number | null
    reason?: ChatThreadMediaResponse['reason']
    result?: ChatThreadMediaResponse['result']
  } = {},
): ChatThreadMediaResponse {
  return {
    activeThread: context.activeThread,
    hasMoreOlder,
    items,
    nextOlderCursor,
    reason,
    result,
  }
}

function createChatUnavailableContext(
  context: CurrentUserChatThreadContext,
): ChatMessagesSnapshot {
  return buildMessagesSnapshot({
    ...context,
    chatwootConversation: null,
    reason: 'chatwoot_unavailable',
    result: 'unavailable',
  })
}

function buildSendResult(
  context: CurrentUserChatThreadContext,
  sentMessage: PortalChatMessage | null = null,
): ChatSendResult {
  return {
    activeThread: context.activeThread,
    reason: context.reason,
    result: context.result,
    sentMessage,
  }
}

function createChatSendUnavailableResult(
  context: CurrentUserChatThreadContext,
): ChatSendResult {
  return buildSendResult({
    ...context,
    chatwootConversation: null,
    reason: 'chatwoot_unavailable',
    result: 'unavailable',
  })
}

function createAttachmentUnavailableError(statusCode = 404) {
  return new ApiError(statusCode, 'attachment_unavailable', 'Файл недоступен.')
}

function createAttachmentThreadContextError(
  context: CurrentUserChatThreadContext,
) {
  if (context.reason === 'thread_access_denied') {
    return new ApiError(403, 'thread_access_denied', 'Доступ к чату запрещен.')
  }

  return createAttachmentUnavailableError()
}

function normalizeClientMessageKey(clientMessageKey: string) {
  const normalizedClientMessageKey = clientMessageKey.trim()

  if (!normalizedClientMessageKey) {
    throw new ApiError(
      400,
      'client_message_key_required',
      'Ключ отправки обязателен.',
    )
  }

  if (normalizedClientMessageKey.length > CLIENT_MESSAGE_KEY_MAX_LENGTH) {
    throw new ApiError(
      400,
      'client_message_key_too_long',
      'Ключ отправки слишком длинный.',
    )
  }

  return normalizedClientMessageKey
}

function normalizeReplyToMessageId(replyToMessageId?: number | null) {
  if (replyToMessageId === undefined || replyToMessageId === null) {
    return null
  }

  if (!Number.isInteger(replyToMessageId) || replyToMessageId <= 0) {
    throw new ApiError(
      400,
      'reply_target_invalid',
      'Некорректное сообщение для ответа.',
    )
  }

  return replyToMessageId
}

async function resolveReplyTargetMessage({
  chatwootClient,
  conversationId,
  replyToMessageId,
}: {
  chatwootClient: Pick<ChatwootClient, 'findConversationMessageById'>
  conversationId: number
  replyToMessageId: number | null
}) {
  if (replyToMessageId === null) {
    return null
  }

  const replyTargetMessage = await chatwootClient.findConversationMessageById(
    conversationId,
    replyToMessageId,
  )

  if (!replyTargetMessage || !isClientVisibleMessage(replyTargetMessage)) {
    throw new ApiError(
      400,
      'reply_target_unavailable',
      'Сообщение для ответа недоступно.',
    )
  }

  return replyTargetMessage
}

function isAllowedAttachmentMimeType(mimeType: string) {
  return (
    mimeType.startsWith('image/') ||
    mimeType.startsWith('video/') ||
    mimeType.startsWith('audio/') ||
    CHAT_ATTACHMENT_ALLOWED_MIME_TYPES.has(mimeType)
  )
}

function normalizeAttachmentUpload(
  attachment: PortalAttachmentUpload,
): PortalAttachmentUpload {
  const fileName = attachment.fileName.trim()
  const mimeType = attachment.mimeType.trim().toLowerCase()
  const data = Buffer.from(attachment.data)
  const size = data.byteLength

  if (!fileName) {
    throw new ApiError(
      400,
      'attachment_file_name_required',
      'Имя файла обязательно.',
    )
  }

  if (fileName.length > CHAT_ATTACHMENT_FILE_NAME_MAX_LENGTH) {
    throw new ApiError(
      400,
      'attachment_file_name_too_long',
      'Имя файла слишком длинное.',
    )
  }

  if (size <= 0) {
    throw new ApiError(400, 'attachment_empty', 'Файл пустой.')
  }

  if (size > CHAT_ATTACHMENT_MAX_BYTES) {
    throw new ApiError(
      413,
      'attachment_too_large',
      'Файл больше допустимого размера 40 МБ.',
    )
  }

  if (!mimeType || !isAllowedAttachmentMimeType(mimeType)) {
    throw new ApiError(
      415,
      'attachment_type_not_allowed',
      'Этот тип файла нельзя отправить.',
    )
  }

  return {
    data,
    fileName,
    mimeType,
    size,
  }
}

function createTextPayloadSha256(
  content: string,
  replyToMessageId: number | null,
) {
  return createHash('sha256')
    .update(
      `${SEND_LEDGER_MESSAGE_KIND_TEXT}\0${content}\0${replyToMessageId ?? ''}`,
    )
    .digest('hex')
}

function createAttachmentPayloadSha256(
  attachment: PortalAttachmentUpload,
  content: string | null,
  replyToMessageId: number | null,
) {
  return createHash('sha256')
    .update(
      `${SEND_LEDGER_MESSAGE_KIND_ATTACHMENT}\0${attachment.fileName}\0${attachment.mimeType}\0${attachment.size}\0${content ?? ''}\0${replyToMessageId ?? ''}\0`,
    )
    .update(attachment.data)
    .digest('hex')
}

function buildAttachmentProxyUrlCandidates({
  attachment,
  variant,
}: {
  attachment: {
    thumbUrl: string
    url: string
  }
  variant: ChatAttachmentProxyVariant
}) {
  const rawUrls =
    variant === 'thumb'
      ? [attachment.thumbUrl, attachment.url]
      : [attachment.url]
  const urls: string[] = []

  for (const rawUrl of rawUrls) {
    const url = rawUrl.trim()

    if (url && !urls.includes(url)) {
      urls.push(url)
    }
  }

  return urls
}

async function cancelAttachmentResponseBody(response: Response) {
  try {
    await response.body?.cancel()
  } catch {
    // Best-effort cleanup before trying the fallback attachment URL.
  }
}

export function createChatMessagesService({
  attachmentAllowedOrigins = [],
  attachmentAllowPrivateNetwork = false,
  attachmentFetchFn = fetch,
  attachmentRequestTimeoutMs: inputAttachmentRequestTimeoutMs,
  chatThreadsRepository,
  chatThreadsService,
  chatMessagesRepository = null,
  chatwootClient,
  now = () => new Date(),
}: CreateChatMessagesServiceOptions) {
  const fetchAllowedAttachment = createAttachmentProxyFetcher({
    allowedOrigins: attachmentAllowedOrigins,
    allowPrivateNetwork: attachmentAllowPrivateNetwork,
    fetchFn: attachmentFetchFn,
    requestTimeoutMs: inputAttachmentRequestTimeoutMs,
  })

  async function findLedgerAuthorsForMessages({
    context,
    messageIds,
  }: {
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

  function createMessageMapperContext({
    context,
    ledgerAuthorsByMessageId,
    replyTargetsById = new Map(),
    userId,
  }: {
    context: CurrentUserChatThreadContext
    ledgerAuthorsByMessageId?: Awaited<
      ReturnType<typeof findLedgerAuthorsForMessages>
    >
    replyTargetsById?: Map<number, ChatwootMessage>
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

  function formatOutboundContentForThread({
    content,
    context,
  }: {
    content: string | null
    context: CurrentUserChatThreadContext
  }) {
    if (context.threadType !== 'group') {
      return content
    }

    return formatGroupThreadContent({
      authorName: normalizeGroupAuthorDisplayName({
        email: context.currentUserEmail,
        name: context.currentUserName,
      }),
      content,
    })
  }

  return {
    async getCurrentUserChatAttachment({
      attachmentId,
      messageId,
      rangeHeader = null,
      threadId,
      userId,
      variant,
    }: {
      attachmentId: number
      messageId: number
      rangeHeader?: string | null
      threadId: string
      userId: number
      variant: ChatAttachmentProxyVariant
    }): Promise<ChatAttachmentProxyResponse> {
      const context = await chatThreadsService.getCurrentUserThreadContext({
        threadId,
        userId,
      })

      if (context.result !== 'ready') {
        throw createAttachmentThreadContextError(context)
      }

      if (!context.chatwootConversation) {
        throw createAttachmentUnavailableError()
      }

      try {
        const message = await chatwootClient.findConversationMessageById(
          context.chatwootConversation.id,
          messageId,
        )

        if (!message || !isClientVisibleMessage(message)) {
          throw createAttachmentUnavailableError()
        }

        const attachment = message.attachments.find(
          (candidate) =>
            candidate.id === attachmentId && candidate.messageId === messageId,
        )

        if (!attachment) {
          throw createAttachmentUnavailableError()
        }

        const attachmentUrls = buildAttachmentProxyUrlCandidates({
          attachment,
          variant,
        })

        if (attachmentUrls.length === 0) {
          throw createAttachmentUnavailableError()
        }

        const headers = new Headers()
        const normalizedRangeHeader = rangeHeader?.trim()

        if (normalizedRangeHeader) {
          headers.set('range', normalizedRangeHeader)
        }
        headers.set('accept-encoding', 'identity')

        let lastAttachmentError: ApiError | null = null

        for (const attachmentUrl of attachmentUrls) {
          try {
            const upstreamResponse = await fetchAllowedAttachment({
              headers,
              initialUrl: attachmentUrl,
            })

            if (upstreamResponse.ok) {
              return {
                body: upstreamResponse.body,
                headers: upstreamResponse.headers,
                status: upstreamResponse.status,
              }
            }

            await cancelAttachmentResponseBody(upstreamResponse)
            lastAttachmentError = createAttachmentProxyUnavailableError()
          } catch {
            lastAttachmentError = createAttachmentProxyUnavailableError()
          }
        }

        throw lastAttachmentError ?? createAttachmentProxyUnavailableError()
      } catch (error) {
        if (error instanceof ApiError) {
          throw error
        }

        if (
          error instanceof ChatwootClientConfigurationError ||
          error instanceof ChatwootClientRequestError
        ) {
          throw createAttachmentUnavailableError(503)
        }

        throw error
      }
    },

    async getCurrentUserChatMedia({
      beforeMessageId = null,
      threadId = PRIVATE_CHAT_THREAD_ID,
      userId,
    }: {
      beforeMessageId?: number | null
      threadId?: string
      userId: number
    }): Promise<ChatThreadMediaResponse> {
      const context = await chatThreadsService.getCurrentUserThreadContext({
        threadId,
        userId,
      })

      if (!context.chatwootConversation) {
        if (
          context.reason === 'conversation_missing' &&
          context.activeThread !== null
        ) {
          return buildMediaResponse(context, {
            reason: 'none',
            result: 'ready',
          })
        }

        return buildMediaResponse(context)
      }

      if (context.result !== 'ready') {
        return buildMediaResponse(context)
      }

      try {
        const conversationId = context.chatwootConversation.id
        let cursor = beforeMessageId
        let hasMoreOlder = false
        let nextOlderCursor: number | null = null
        const mediaItems: PortalChatMediaItem[] = []

        for (let scannedPages = 0; scannedPages < 4; scannedPages += 1) {
          const page = await chatwootClient.listConversationMessages(
            conversationId,
            {
              beforeMessageId: cursor,
            },
          )

          if (page === null) {
            return buildMediaResponse(context, {
              reason: 'conversation_missing',
              result: 'not_ready',
            })
          }

          const replyTargetsById = await buildReplyTargetsById({
            chatwootClient,
            conversationId,
            messages: page.messages,
          })
          const ledgerAuthorsByMessageId = await findLedgerAuthorsForMessages({
            context,
            messageIds: [
              ...new Set([
                ...page.messages.map((message) => message.id),
                ...replyTargetsById.keys(),
              ]),
            ],
          })
          const messageMapperContext = createMessageMapperContext({
            context,
            ledgerAuthorsByMessageId,
            replyTargetsById,
            userId,
          })
          const visibleMessages = page.messages
            .map((message) => mapPortalMessage(message, messageMapperContext))
            .filter((message): message is PortalChatMessage => message !== null)

          mediaItems.push(...buildPortalChatMediaItems(visibleMessages))
          hasMoreOlder = page.hasMoreOlder
          nextOlderCursor = page.nextOlderCursor

          if (
            mediaItems.length > 0 ||
            !page.hasMoreOlder ||
            !page.nextOlderCursor
          ) {
            break
          }

          cursor = page.nextOlderCursor
        }

        return buildMediaResponse(context, {
          hasMoreOlder,
          items: mediaItems,
          nextOlderCursor,
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
          return buildMediaResponse(context, {
            reason: 'chatwoot_unavailable',
            result: 'unavailable',
          })
        }

        throw error
      }
    },

    async getCurrentUserChatSearch({
      beforeMessageId = null,
      query,
      threadId = PRIVATE_CHAT_THREAD_ID,
      userId,
    }: {
      beforeMessageId?: number | null
      query: string
      threadId?: string
      userId: number
    }): Promise<ChatThreadSearchResponse> {
      return getCurrentUserChatSearchFromService({
        beforeMessageId,
        chatThreadsRepository,
        chatThreadsService,
        chatwootClient,
        query,
        threadId,
        userId,
      })
    },

    async getCurrentUserChatMessages({
      beforeMessageId = null,
      threadId = PRIVATE_CHAT_THREAD_ID,
      userId,
    }: {
      beforeMessageId?: number | null
      threadId?: string
      userId: number
    }): Promise<ChatMessagesSnapshot> {
      const context = await chatThreadsService.getCurrentUserThreadContext({
        threadId,
        userId,
      })

      if (context.result !== 'ready' || !context.chatwootConversation) {
        return buildMessagesSnapshot(context)
      }

      try {
        const conversationId = context.chatwootConversation.id
        const page = await chatwootClient.listConversationMessages(
          conversationId,
          {
            beforeMessageId,
          },
        )

        if (page === null) {
          return buildMessagesSnapshot({
            ...context,
            chatwootConversation: null,
            reason: 'conversation_missing',
            result: 'not_ready',
          })
        }

        const replyTargetsById = await buildReplyTargetsById({
          chatwootClient,
          conversationId,
          messages: page.messages,
        })
        const ledgerAuthorsByMessageId = await findLedgerAuthorsForMessages({
          context,
          messageIds: [
            ...new Set([
              ...page.messages.map((message) => message.id),
              ...replyTargetsById.keys(),
            ]),
          ],
        })
        const messageMapperContext = createMessageMapperContext({
          context,
          ledgerAuthorsByMessageId,
          replyTargetsById,
          userId,
        })

        return buildMessagesSnapshot(context, {
          hasMoreOlder: page.hasMoreOlder,
          messages: page.messages
            .map((message) => mapPortalMessage(message, messageMapperContext))
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

    async sendCurrentUserTextMessage({
      clientMessageKey,
      content,
      replyToMessageId = null,
      threadId,
      userId,
    }: {
      clientMessageKey: string
      content: string
      replyToMessageId?: number | null
      threadId: string
      userId: number
    }): Promise<ChatSendResult> {
      const context =
        await chatThreadsService.ensureCurrentUserWritableThreadContext({
          threadId,
          userId,
        })

      if (context.result !== 'ready' || !context.chatwootConversation) {
        return buildSendResult(context)
      }

      const normalizedContent = normalizeContent(content)
      const outboundContent =
        formatOutboundContentForThread({
          content: normalizedContent,
          context,
        }) ?? normalizedContent
      const authorDisplayName = normalizeGroupAuthorDisplayName({
        email: context.currentUserEmail,
        name: context.currentUserName,
      })
      const normalizedClientMessageKey =
        normalizeClientMessageKey(clientMessageKey)
      const normalizedReplyToMessageId =
        normalizeReplyToMessageId(replyToMessageId)
      const conversationId = context.chatwootConversation.id
      const sendTextViaContext = (
        sendContext: CurrentUserChatThreadContext,
        sendConversationId: number,
      ) =>
        createOrReplayCanonicalMessage({
          authorDisplayNameSnapshot:
            sendContext.threadType === 'group' ? authorDisplayName : null,
          chatMessagesRepository,
          chatwootClient,
          clientMessageKey: normalizedClientMessageKey,
          createChatwootMessage: () =>
            chatwootClient.createConversationIncomingMessage({
              content: outboundContent,
              conversationId: sendConversationId,
              replyToMessageId: normalizedReplyToMessageId,
              sourceId: normalizedClientMessageKey,
            }),
          messageKind: SEND_LEDGER_MESSAGE_KIND_TEXT,
          now,
          payloadMismatchMessage:
            'Повторная отправка использует другой текст для того же ключа.',
          payloadSha256: createTextPayloadSha256(
            outboundContent,
            normalizedReplyToMessageId,
          ),
          portalChatThreadId: sendContext.portalChatThreadId,
          conversationId: sendConversationId,
          userId,
        })

      try {
        const replyTargetMessage = await resolveReplyTargetMessage({
          chatwootClient,
          conversationId,
          replyToMessageId: normalizedReplyToMessageId,
        })
        const sendResult = await sendWithDeletedConversationRecovery({
          chatThreadsService,
          context,
          replyToMessageId: normalizedReplyToMessageId,
          send: sendTextViaContext,
          threadId,
          userId,
        })

        if (sendResult.message === null) {
          return buildSendResult(sendResult.context)
        }

        const sendContext = sendResult.context
        const sentMessage = sendResult.message
        const replyTargetsById = new Map(
          replyTargetMessage
            ? [[replyTargetMessage.id, replyTargetMessage]]
            : [],
        )
        const ledgerAuthorsByMessageId =
          sendContext.portalChatThreadId === null
            ? new Map()
            : new Map([
                [
                  sentMessage.id,
                  {
                    authorDisplayName,
                    userId,
                  },
                ],
              ])
        const portalMessage = mapPortalMessage(
          sentMessage,
          createMessageMapperContext({
            context: sendContext,
            ledgerAuthorsByMessageId,
            replyTargetsById,
            userId,
          }),
        )

        if (!portalMessage) {
          throw new ApiError(
            503,
            'chat_send_unavailable',
            'Chatwoot не вернул клиентское сообщение.',
          )
        }

        return buildSendResult(sendContext, portalMessage)
      } catch (error) {
        if (error instanceof ApiError) {
          throw error
        }

        if (
          error instanceof ChatwootClientConfigurationError ||
          error instanceof ChatwootClientRequestError
        ) {
          return createChatSendUnavailableResult(context)
        }

        throw error
      }
    },

    async sendCurrentUserAttachmentMessage({
      attachment,
      clientMessageKey,
      content = null,
      replyToMessageId = null,
      threadId,
      userId,
    }: {
      attachment: PortalAttachmentUpload
      clientMessageKey: string
      content?: string | null
      replyToMessageId?: number | null
      threadId: string
      userId: number
    }): Promise<ChatSendResult> {
      const context =
        await chatThreadsService.ensureCurrentUserWritableThreadContext({
          threadId,
          userId,
        })

      if (context.result !== 'ready' || !context.chatwootConversation) {
        return buildSendResult(context)
      }

      const normalizedAttachment = normalizeAttachmentUpload(attachment)
      const normalizedContent = normalizeOptionalContent(content)
      const outboundContent = formatOutboundContentForThread({
        content: normalizedContent,
        context,
      })
      const authorDisplayName = normalizeGroupAuthorDisplayName({
        email: context.currentUserEmail,
        name: context.currentUserName,
      })
      const normalizedClientMessageKey =
        normalizeClientMessageKey(clientMessageKey)
      const normalizedReplyToMessageId =
        normalizeReplyToMessageId(replyToMessageId)
      const conversationId = context.chatwootConversation.id
      const sendAttachmentViaContext = (
        sendContext: CurrentUserChatThreadContext,
        sendConversationId: number,
      ) =>
        createOrReplayCanonicalMessage({
          authorDisplayNameSnapshot:
            sendContext.threadType === 'group' ? authorDisplayName : null,
          chatMessagesRepository,
          chatwootClient,
          clientMessageKey: normalizedClientMessageKey,
          createChatwootMessage: () =>
            chatwootClient.createConversationIncomingAttachmentMessage({
              attachment: normalizedAttachment,
              content: outboundContent,
              conversationId: sendConversationId,
              replyToMessageId: normalizedReplyToMessageId,
              sourceId: normalizedClientMessageKey,
            }),
          messageKind: SEND_LEDGER_MESSAGE_KIND_ATTACHMENT,
          now,
          payloadMismatchMessage:
            'Повторная отправка использует другой файл или подпись для того же ключа.',
          payloadSha256: createAttachmentPayloadSha256(
            normalizedAttachment,
            outboundContent,
            normalizedReplyToMessageId,
          ),
          portalChatThreadId: sendContext.portalChatThreadId,
          conversationId: sendConversationId,
          userId,
        })

      try {
        const replyTargetMessage = await resolveReplyTargetMessage({
          chatwootClient,
          conversationId,
          replyToMessageId: normalizedReplyToMessageId,
        })
        const sendResult = await sendWithDeletedConversationRecovery({
          chatThreadsService,
          context,
          replyToMessageId: normalizedReplyToMessageId,
          send: sendAttachmentViaContext,
          threadId,
          userId,
        })

        if (sendResult.message === null) {
          return buildSendResult(sendResult.context)
        }

        const sendContext = sendResult.context
        const sentMessage = sendResult.message
        const replyTargetsById = new Map(
          replyTargetMessage
            ? [[replyTargetMessage.id, replyTargetMessage]]
            : [],
        )
        const ledgerAuthorsByMessageId =
          sendContext.portalChatThreadId === null
            ? new Map()
            : new Map([
                [
                  sentMessage.id,
                  {
                    authorDisplayName,
                    userId,
                  },
                ],
              ])
        const portalMessage = mapPortalMessage(
          sentMessage,
          createMessageMapperContext({
            context: sendContext,
            ledgerAuthorsByMessageId,
            replyTargetsById,
            userId,
          }),
        )

        if (!portalMessage) {
          throw new ApiError(
            503,
            'chat_send_unavailable',
            'Chatwoot не вернул клиентское сообщение.',
          )
        }

        return buildSendResult(sendContext, portalMessage)
      } catch (error) {
        if (error instanceof ApiError) {
          throw error
        }

        if (
          error instanceof ChatwootClientConfigurationError ||
          error instanceof ChatwootClientRequestError
        ) {
          return createChatSendUnavailableResult(context)
        }

        throw error
      }
    },
  }
}

export type ChatMessagesService = ReturnType<typeof createChatMessagesService>
