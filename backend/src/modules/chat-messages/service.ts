import { createHash, randomUUID } from 'node:crypto'

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
  formatCompanyThreadContent,
  normalizeCompanyAuthorDisplayName,
} from './authorFormatting.js'
import { normalizeContent, normalizeOptionalContent } from './content.js'
import {
  buildReplyTargetsById,
  isClientVisibleMessage,
  mapPortalMessage,
} from './messageMapping.js'
import type {
  ChatMessagesRepository,
  ChatSendLedgerEntry,
} from './repository.js'
import type {
  ChatMessagesSnapshot,
  ChatSendResult,
  PortalAttachmentUpload,
  PortalChatMessage,
} from './types.js'

export type {
  ChatMessagesSnapshot,
  ChatSendResult,
  PortalAttachmentUpload,
  PortalChatAttachment,
  PortalChatMessage,
  PortalChatReplyPreview,
} from './types.js'

const SEND_LEDGER_MESSAGE_KIND_TEXT = 'text'
const SEND_LEDGER_MESSAGE_KIND_ATTACHMENT = 'attachment'
const SEND_LEDGER_STALE_PROCESSING_MS = 2 * 60 * 1000
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
  chatThreadsRepository: Pick<
    ChatThreadsRepository,
    'findSendLedgerAuthorsByMessageIds'
  >
  chatThreadsService: Pick<
    ChatThreadsService,
    'ensureCurrentUserWritableThreadContext' | 'getCurrentUserThreadContext'
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

async function findCanonicalMessageByClientKey({
  chatwootClient,
  clientMessageKey,
  conversationId,
}: {
  chatwootClient: Pick<ChatwootClient, 'findConversationMessageBySourceId'>
  clientMessageKey: string
  conversationId: number
}) {
  return chatwootClient.findConversationMessageBySourceId(
    conversationId,
    clientMessageKey,
  )
}

async function markSendLedgerEntryConfirmed({
  chatMessagesRepository,
  chatwootMessageId,
  clientMessageKey,
  now,
  portalChatThreadId,
  processingToken,
  userId,
}: {
  chatMessagesRepository: ChatMessagesRepository
  chatwootMessageId: number
  clientMessageKey: string
  now: Date
  portalChatThreadId: number
  processingToken?: string
  userId: number
}) {
  return chatMessagesRepository.markSendLedgerEntryConfirmed({
    chatwootMessageId,
    clientMessageKey,
    now,
    portalChatThreadId,
    ...(processingToken === undefined ? {} : { processingToken }),
    userId,
  })
}

async function markSendLedgerEntryFailed({
  chatMessagesRepository,
  clientMessageKey,
  now,
  portalChatThreadId,
  processingToken,
  userId,
}: {
  chatMessagesRepository: ChatMessagesRepository
  clientMessageKey: string
  now: Date
  portalChatThreadId: number
  processingToken?: string
  userId: number
}) {
  return chatMessagesRepository.markSendLedgerEntryFailed({
    clientMessageKey,
    now,
    portalChatThreadId,
    ...(processingToken === undefined ? {} : { processingToken }),
    userId,
  })
}

async function resolveConfirmedLedgerMessage({
  chatMessagesRepository,
  chatwootClient,
  clientMessageKey,
  ledgerEntry,
  now,
  portalChatThreadId,
  conversationId,
  userId,
}: {
  chatMessagesRepository: ChatMessagesRepository
  chatwootClient: Pick<
    ChatwootClient,
    'findConversationMessageById' | 'findConversationMessageBySourceId'
  >
  clientMessageKey: string
  ledgerEntry: ChatSendLedgerEntry
  now: Date
  portalChatThreadId: number
  conversationId: number
  userId: number
}) {
  const exactMessage = ledgerEntry.chatwootMessageId
    ? await chatwootClient.findConversationMessageById(
        conversationId,
        ledgerEntry.chatwootMessageId,
      )
    : null

  if (exactMessage) {
    return exactMessage
  }

  const recoveredMessage = await findCanonicalMessageByClientKey({
    chatwootClient,
    clientMessageKey,
    conversationId,
  })

  if (!recoveredMessage) {
    throw new ChatwootClientRequestError(
      'Previously confirmed Chatwoot message could not be replayed.',
    )
  }

  if (recoveredMessage.id !== ledgerEntry.chatwootMessageId) {
    await markSendLedgerEntryConfirmed({
      chatMessagesRepository,
      chatwootMessageId: recoveredMessage.id,
      clientMessageKey,
      now,
      portalChatThreadId,
      userId,
    })
  }

  return recoveredMessage
}

async function createOrReplayCanonicalMessageViaChatwoot({
  chatwootClient,
  clientMessageKey,
  createChatwootMessage,
  conversationId,
}: {
  chatwootClient: Pick<ChatwootClient, 'findConversationMessageBySourceId'>
  clientMessageKey: string
  createChatwootMessage: () => Promise<ChatwootMessage | null>
  conversationId: number
}) {
  const existingMessage = await findCanonicalMessageByClientKey({
    chatwootClient,
    clientMessageKey,
    conversationId,
  })

  if (existingMessage) {
    return existingMessage
  }

  try {
    return await createChatwootMessage()
  } catch (error) {
    const recoveredMessage = await findCanonicalMessageByClientKey({
      chatwootClient,
      clientMessageKey,
      conversationId,
    })

    if (recoveredMessage) {
      return recoveredMessage
    }

    throw error
  }
}

async function createOrReplayCanonicalMessageViaLedger({
  authorDisplayNameSnapshot,
  chatMessagesRepository,
  chatwootClient,
  clientMessageKey,
  createChatwootMessage,
  messageKind,
  now,
  payloadMismatchMessage,
  payloadSha256,
  portalChatThreadId,
  conversationId,
  userId,
}: {
  authorDisplayNameSnapshot: string | null
  chatMessagesRepository: ChatMessagesRepository
  chatwootClient: Pick<
    ChatwootClient,
    'findConversationMessageById' | 'findConversationMessageBySourceId'
  >
  clientMessageKey: string
  createChatwootMessage: () => Promise<ChatwootMessage | null>
  messageKind: string
  now: () => Date
  payloadMismatchMessage: string
  payloadSha256: string
  portalChatThreadId: number
  conversationId: number
  userId: number
}) {
  const acquiredAt = now()
  const processingToken = randomUUID()
  const acquireResult = await chatMessagesRepository.acquireSendLedgerEntry({
    authorDisplayNameSnapshot,
    clientMessageKey,
    messageKind,
    now: acquiredAt,
    payloadSha256,
    portalChatThreadId,
    processingToken,
    staleProcessingBefore: new Date(
      acquiredAt.getTime() - SEND_LEDGER_STALE_PROCESSING_MS,
    ),
    userId,
  })

  if (acquireResult.outcome === 'payload_mismatch') {
    throw new ApiError(
      409,
      'client_message_key_conflict',
      payloadMismatchMessage,
    )
  }

  if (acquireResult.outcome === 'confirmed') {
    return resolveConfirmedLedgerMessage({
      chatMessagesRepository,
      chatwootClient,
      clientMessageKey,
      ledgerEntry: acquireResult.entry,
      now: now(),
      portalChatThreadId,
      conversationId,
      userId,
    })
  }

  if (acquireResult.outcome === 'in_progress') {
    const existingMessage = await findCanonicalMessageByClientKey({
      chatwootClient,
      clientMessageKey,
      conversationId,
    })

    if (existingMessage) {
      await markSendLedgerEntryConfirmed({
        chatMessagesRepository,
        chatwootMessageId: existingMessage.id,
        clientMessageKey,
        now: now(),
        portalChatThreadId,
        userId,
      })

      return existingMessage
    }

    throw new ApiError(
      409,
      'chat_send_in_progress',
      'Это сообщение уже отправляется. Повторите через несколько секунд.',
    )
  }

  if (acquireResult.outcome !== 'acquired') {
    throw new ApiError(
      503,
      'chat_send_ledger_unavailable',
      'Не удалось подготовить безопасную отправку сообщения.',
    )
  }

  try {
    const existingMessage = await findCanonicalMessageByClientKey({
      chatwootClient,
      clientMessageKey,
      conversationId,
    })

    if (existingMessage) {
      await markSendLedgerEntryConfirmed({
        chatMessagesRepository,
        chatwootMessageId: existingMessage.id,
        clientMessageKey,
        now: now(),
        portalChatThreadId,
        processingToken,
        userId,
      })

      return existingMessage
    }
  } catch (error) {
    await markSendLedgerEntryFailed({
      chatMessagesRepository,
      clientMessageKey,
      now: now(),
      portalChatThreadId,
      processingToken,
      userId,
    })

    throw error
  }

  try {
    const createdMessage = await createChatwootMessage()

    if (createdMessage === null) {
      await markSendLedgerEntryFailed({
        chatMessagesRepository,
        clientMessageKey,
        now: now(),
        portalChatThreadId,
        processingToken,
        userId,
      })

      return null
    }

    await markSendLedgerEntryConfirmed({
      chatMessagesRepository,
      chatwootMessageId: createdMessage.id,
      clientMessageKey,
      now: now(),
      portalChatThreadId,
      processingToken,
      userId,
    })

    return createdMessage
  } catch (error) {
    let recoveredMessage: ChatwootMessage | null

    try {
      recoveredMessage = await findCanonicalMessageByClientKey({
        chatwootClient,
        clientMessageKey,
        conversationId,
      })
    } catch (lookupError) {
      await markSendLedgerEntryFailed({
        chatMessagesRepository,
        clientMessageKey,
        now: now(),
        portalChatThreadId,
        processingToken,
        userId,
      })

      throw lookupError
    }

    if (recoveredMessage) {
      await markSendLedgerEntryConfirmed({
        chatMessagesRepository,
        chatwootMessageId: recoveredMessage.id,
        clientMessageKey,
        now: now(),
        portalChatThreadId,
        processingToken,
        userId,
      })

      return recoveredMessage
    }

    await markSendLedgerEntryFailed({
      chatMessagesRepository,
      clientMessageKey,
      now: now(),
      portalChatThreadId,
      processingToken,
      userId,
    })

    throw error
  }
}

async function createOrReplayCanonicalMessage({
  authorDisplayNameSnapshot,
  chatMessagesRepository,
  chatwootClient,
  clientMessageKey,
  createChatwootMessage,
  messageKind,
  now,
  payloadMismatchMessage,
  payloadSha256,
  portalChatThreadId,
  conversationId,
  userId,
}: {
  authorDisplayNameSnapshot: string | null
  chatMessagesRepository?: ChatMessagesRepository | null
  chatwootClient: Pick<
    ChatwootClient,
    'findConversationMessageById' | 'findConversationMessageBySourceId'
  >
  clientMessageKey: string
  createChatwootMessage: () => Promise<ChatwootMessage | null>
  messageKind: string
  now: () => Date
  payloadMismatchMessage: string
  payloadSha256: string
  portalChatThreadId: number | null
  conversationId: number
  userId: number
}) {
  if (!chatMessagesRepository) {
    return createOrReplayCanonicalMessageViaChatwoot({
      chatwootClient,
      clientMessageKey,
      createChatwootMessage,
      conversationId,
    })
  }

  if (portalChatThreadId === null) {
    throw new ApiError(
      503,
      'chat_send_ledger_unavailable',
      'Не удалось подготовить безопасную отправку сообщения.',
    )
  }

  return createOrReplayCanonicalMessageViaLedger({
    authorDisplayNameSnapshot,
    chatMessagesRepository,
    chatwootClient,
    clientMessageKey,
    createChatwootMessage,
    messageKind,
    now,
    payloadMismatchMessage,
    payloadSha256,
    portalChatThreadId,
    conversationId,
    userId,
  })
}

export function createChatMessagesService({
  chatThreadsRepository,
  chatThreadsService,
  chatMessagesRepository = null,
  chatwootClient,
  now = () => new Date(),
}: CreateChatMessagesServiceOptions) {
  async function findLedgerAuthorsForMessages({
    context,
    messageIds,
  }: {
    context: CurrentUserChatThreadContext
    messageIds: number[]
  }) {
    if (
      context.threadType !== 'company' ||
      context.portalChatThreadId === null
    ) {
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
    if (context.threadType !== 'company') {
      return content
    }

    return formatCompanyThreadContent({
      authorName: normalizeCompanyAuthorDisplayName({
        email: context.currentUserEmail,
        name: context.currentUserName,
      }),
      content,
    })
  }

  return {
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
      const authorDisplayName = normalizeCompanyAuthorDisplayName({
        email: context.currentUserEmail,
        name: context.currentUserName,
      })
      const normalizedClientMessageKey =
        normalizeClientMessageKey(clientMessageKey)
      const normalizedReplyToMessageId =
        normalizeReplyToMessageId(replyToMessageId)
      const conversationId = context.chatwootConversation.id

      try {
        const replyTargetMessage = await resolveReplyTargetMessage({
          chatwootClient,
          conversationId,
          replyToMessageId: normalizedReplyToMessageId,
        })
        const sentMessage = await createOrReplayCanonicalMessage({
          authorDisplayNameSnapshot:
            context.threadType === 'company' ? authorDisplayName : null,
          chatMessagesRepository,
          chatwootClient,
          clientMessageKey: normalizedClientMessageKey,
          createChatwootMessage: () =>
            chatwootClient.createConversationIncomingMessage({
              content: outboundContent,
              conversationId,
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
          portalChatThreadId: context.portalChatThreadId,
          conversationId,
          userId,
        })

        if (sentMessage === null) {
          return buildSendResult({
            ...context,
            chatwootConversation: null,
            reason: 'conversation_missing',
            result: 'not_ready',
          })
        }

        const replyTargetsById = new Map(
          replyTargetMessage
            ? [[replyTargetMessage.id, replyTargetMessage]]
            : [],
        )
        const ledgerAuthorsByMessageId =
          context.portalChatThreadId === null
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
            context,
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

        return buildSendResult(context, portalMessage)
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
      const authorDisplayName = normalizeCompanyAuthorDisplayName({
        email: context.currentUserEmail,
        name: context.currentUserName,
      })
      const normalizedClientMessageKey =
        normalizeClientMessageKey(clientMessageKey)
      const normalizedReplyToMessageId =
        normalizeReplyToMessageId(replyToMessageId)
      const conversationId = context.chatwootConversation.id

      try {
        const replyTargetMessage = await resolveReplyTargetMessage({
          chatwootClient,
          conversationId,
          replyToMessageId: normalizedReplyToMessageId,
        })
        const sentMessage = await createOrReplayCanonicalMessage({
          authorDisplayNameSnapshot:
            context.threadType === 'company' ? authorDisplayName : null,
          chatMessagesRepository,
          chatwootClient,
          clientMessageKey: normalizedClientMessageKey,
          createChatwootMessage: () =>
            chatwootClient.createConversationIncomingAttachmentMessage({
              attachment: normalizedAttachment,
              content: outboundContent,
              conversationId,
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
          portalChatThreadId: context.portalChatThreadId,
          conversationId,
          userId,
        })

        if (sentMessage === null) {
          return buildSendResult({
            ...context,
            chatwootConversation: null,
            reason: 'conversation_missing',
            result: 'not_ready',
          })
        }

        const replyTargetsById = new Map(
          replyTargetMessage
            ? [[replyTargetMessage.id, replyTargetMessage]]
            : [],
        )
        const ledgerAuthorsByMessageId =
          context.portalChatThreadId === null
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
            context,
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

        return buildSendResult(context, portalMessage)
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
