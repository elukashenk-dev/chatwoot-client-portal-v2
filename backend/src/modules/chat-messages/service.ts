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
import type {
  ChatContextService,
  ChatContextSnapshot,
} from '../chat-context/service.js'
import type {
  ChatMessagesRepository,
  ChatSendLedgerEntry,
} from './repository.js'

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

export type PortalChatAttachment = {
  fileSize: number | null
  fileType: string
  id: number
  name: string
  thumbUrl: string
  url: string
}

export type PortalAttachmentUpload = {
  data: Buffer
  fileName: string
  mimeType: string
  size: number
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

export type ChatSendResult = ChatContextSnapshot & {
  sentMessage: PortalChatMessage | null
}

type CreateChatMessagesServiceOptions = {
  chatContextService: Pick<
    ChatContextService,
    'ensureCurrentUserWritableChatContext' | 'getCurrentUserChatContext'
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
    content: normalizePortalMessageContent(message.content),
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

function buildSendResult(
  context: ChatContextSnapshot,
  sentMessage: PortalChatMessage | null = null,
): ChatSendResult {
  return {
    ...context,
    sentMessage,
  }
}

function createChatSendUnavailableResult(
  context: ChatContextSnapshot,
): ChatSendResult {
  return buildSendResult({
    ...context,
    primaryConversation: null,
    reason: 'chatwoot_unavailable',
    result: 'unavailable',
  })
}

function normalizeContent(content: string) {
  const normalizedContent = content.trim()

  if (!normalizedContent) {
    throw new ApiError(400, 'message_content_required', 'Введите сообщение.')
  }

  return normalizedContent
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

function createTextPayloadSha256(content: string) {
  return createHash('sha256')
    .update(`${SEND_LEDGER_MESSAGE_KIND_TEXT}\0${content}`)
    .digest('hex')
}

function createAttachmentPayloadSha256(attachment: PortalAttachmentUpload) {
  return createHash('sha256')
    .update(
      `${SEND_LEDGER_MESSAGE_KIND_ATTACHMENT}\0${attachment.fileName}\0${attachment.mimeType}\0${attachment.size}\0`,
    )
    .update(attachment.data)
    .digest('hex')
}

async function findCanonicalMessageByClientKey({
  chatwootClient,
  clientMessageKey,
  primaryConversationId,
}: {
  chatwootClient: Pick<ChatwootClient, 'findConversationMessageBySourceId'>
  clientMessageKey: string
  primaryConversationId: number
}) {
  return chatwootClient.findConversationMessageBySourceId(
    primaryConversationId,
    clientMessageKey,
  )
}

async function markSendLedgerEntryConfirmed({
  chatMessagesRepository,
  chatwootMessageId,
  clientMessageKey,
  now,
  primaryConversationId,
  processingToken,
  userId,
}: {
  chatMessagesRepository: ChatMessagesRepository
  chatwootMessageId: number
  clientMessageKey: string
  now: Date
  primaryConversationId: number
  processingToken?: string
  userId: number
}) {
  return chatMessagesRepository.markSendLedgerEntryConfirmed({
    chatwootMessageId,
    clientMessageKey,
    now,
    primaryConversationId,
    ...(processingToken === undefined ? {} : { processingToken }),
    userId,
  })
}

async function markSendLedgerEntryFailed({
  chatMessagesRepository,
  clientMessageKey,
  now,
  primaryConversationId,
  processingToken,
  userId,
}: {
  chatMessagesRepository: ChatMessagesRepository
  clientMessageKey: string
  now: Date
  primaryConversationId: number
  processingToken?: string
  userId: number
}) {
  return chatMessagesRepository.markSendLedgerEntryFailed({
    clientMessageKey,
    now,
    primaryConversationId,
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
  primaryConversationId,
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
  primaryConversationId: number
  userId: number
}) {
  const exactMessage = ledgerEntry.chatwootMessageId
    ? await chatwootClient.findConversationMessageById(
        primaryConversationId,
        ledgerEntry.chatwootMessageId,
      )
    : null

  if (exactMessage) {
    return exactMessage
  }

  const recoveredMessage = await findCanonicalMessageByClientKey({
    chatwootClient,
    clientMessageKey,
    primaryConversationId,
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
      primaryConversationId,
      userId,
    })
  }

  return recoveredMessage
}

async function createOrReplayCanonicalMessageViaChatwoot({
  chatwootClient,
  clientMessageKey,
  createChatwootMessage,
  primaryConversationId,
}: {
  chatwootClient: Pick<ChatwootClient, 'findConversationMessageBySourceId'>
  clientMessageKey: string
  createChatwootMessage: () => Promise<ChatwootMessage | null>
  primaryConversationId: number
}) {
  const existingMessage = await findCanonicalMessageByClientKey({
    chatwootClient,
    clientMessageKey,
    primaryConversationId,
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
      primaryConversationId,
    })

    if (recoveredMessage) {
      return recoveredMessage
    }

    throw error
  }
}

async function createOrReplayCanonicalMessageViaLedger({
  chatMessagesRepository,
  chatwootClient,
  clientMessageKey,
  createChatwootMessage,
  messageKind,
  now,
  payloadMismatchMessage,
  payloadSha256,
  primaryConversationId,
  userId,
}: {
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
  primaryConversationId: number
  userId: number
}) {
  const acquiredAt = now()
  const processingToken = randomUUID()
  const acquireResult = await chatMessagesRepository.acquireSendLedgerEntry({
    clientMessageKey,
    messageKind,
    now: acquiredAt,
    payloadSha256,
    primaryConversationId,
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
      primaryConversationId,
      userId,
    })
  }

  if (acquireResult.outcome === 'in_progress') {
    const existingMessage = await findCanonicalMessageByClientKey({
      chatwootClient,
      clientMessageKey,
      primaryConversationId,
    })

    if (existingMessage) {
      await markSendLedgerEntryConfirmed({
        chatMessagesRepository,
        chatwootMessageId: existingMessage.id,
        clientMessageKey,
        now: now(),
        primaryConversationId,
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
      primaryConversationId,
    })

    if (existingMessage) {
      await markSendLedgerEntryConfirmed({
        chatMessagesRepository,
        chatwootMessageId: existingMessage.id,
        clientMessageKey,
        now: now(),
        primaryConversationId,
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
      primaryConversationId,
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
        primaryConversationId,
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
      primaryConversationId,
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
        primaryConversationId,
      })
    } catch (lookupError) {
      await markSendLedgerEntryFailed({
        chatMessagesRepository,
        clientMessageKey,
        now: now(),
        primaryConversationId,
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
        primaryConversationId,
        processingToken,
        userId,
      })

      return recoveredMessage
    }

    await markSendLedgerEntryFailed({
      chatMessagesRepository,
      clientMessageKey,
      now: now(),
      primaryConversationId,
      processingToken,
      userId,
    })

    throw error
  }
}

async function createOrReplayCanonicalMessage({
  chatMessagesRepository,
  chatwootClient,
  clientMessageKey,
  createChatwootMessage,
  messageKind,
  now,
  payloadMismatchMessage,
  payloadSha256,
  primaryConversationId,
  userId,
}: {
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
  primaryConversationId: number
  userId: number
}) {
  if (!chatMessagesRepository) {
    return createOrReplayCanonicalMessageViaChatwoot({
      chatwootClient,
      clientMessageKey,
      createChatwootMessage,
      primaryConversationId,
    })
  }

  return createOrReplayCanonicalMessageViaLedger({
    chatMessagesRepository,
    chatwootClient,
    clientMessageKey,
    createChatwootMessage,
    messageKind,
    now,
    payloadMismatchMessage,
    payloadSha256,
    primaryConversationId,
    userId,
  })
}

export function createChatMessagesService({
  chatContextService,
  chatMessagesRepository = null,
  chatwootClient,
  now = () => new Date(),
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

    async sendCurrentUserTextMessage({
      clientMessageKey,
      content,
      primaryConversationId = null,
      userId,
    }: {
      clientMessageKey: string
      content: string
      primaryConversationId?: number | null
      userId: number
    }): Promise<ChatSendResult> {
      const context =
        await chatContextService.ensureCurrentUserWritableChatContext({
          selectedPrimaryConversationId: primaryConversationId,
          userId,
        })

      if (context.result !== 'ready' || !context.primaryConversation) {
        return buildSendResult(context)
      }

      const normalizedContent = normalizeContent(content)
      const normalizedClientMessageKey =
        normalizeClientMessageKey(clientMessageKey)
      const resolvedPrimaryConversationId = context.primaryConversation.id

      try {
        const sentMessage = await createOrReplayCanonicalMessage({
          chatMessagesRepository,
          chatwootClient,
          clientMessageKey: normalizedClientMessageKey,
          createChatwootMessage: () =>
            chatwootClient.createConversationIncomingMessage({
              content: normalizedContent,
              conversationId: resolvedPrimaryConversationId,
              sourceId: normalizedClientMessageKey,
            }),
          messageKind: SEND_LEDGER_MESSAGE_KIND_TEXT,
          now,
          payloadMismatchMessage:
            'Повторная отправка использует другой текст для того же ключа.',
          payloadSha256: createTextPayloadSha256(normalizedContent),
          primaryConversationId: resolvedPrimaryConversationId,
          userId,
        })

        if (sentMessage === null) {
          return buildSendResult({
            ...context,
            primaryConversation: null,
            reason: 'primary_conversation_missing',
            result: 'not_ready',
          })
        }

        const portalMessage = mapPortalMessage(sentMessage)

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
      primaryConversationId = null,
      userId,
    }: {
      attachment: PortalAttachmentUpload
      clientMessageKey: string
      primaryConversationId?: number | null
      userId: number
    }): Promise<ChatSendResult> {
      const context =
        await chatContextService.ensureCurrentUserWritableChatContext({
          selectedPrimaryConversationId: primaryConversationId,
          userId,
        })

      if (context.result !== 'ready' || !context.primaryConversation) {
        return buildSendResult(context)
      }

      const normalizedAttachment = normalizeAttachmentUpload(attachment)
      const normalizedClientMessageKey =
        normalizeClientMessageKey(clientMessageKey)
      const resolvedPrimaryConversationId = context.primaryConversation.id

      try {
        const sentMessage = await createOrReplayCanonicalMessage({
          chatMessagesRepository,
          chatwootClient,
          clientMessageKey: normalizedClientMessageKey,
          createChatwootMessage: () =>
            chatwootClient.createConversationIncomingAttachmentMessage({
              attachment: normalizedAttachment,
              conversationId: resolvedPrimaryConversationId,
              sourceId: normalizedClientMessageKey,
            }),
          messageKind: SEND_LEDGER_MESSAGE_KIND_ATTACHMENT,
          now,
          payloadMismatchMessage:
            'Повторная отправка использует другой файл для того же ключа.',
          payloadSha256: createAttachmentPayloadSha256(normalizedAttachment),
          primaryConversationId: resolvedPrimaryConversationId,
          userId,
        })

        if (sentMessage === null) {
          return buildSendResult({
            ...context,
            primaryConversation: null,
            reason: 'primary_conversation_missing',
            result: 'not_ready',
          })
        }

        const portalMessage = mapPortalMessage(sentMessage)

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
