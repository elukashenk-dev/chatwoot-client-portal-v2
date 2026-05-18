import { randomUUID } from 'node:crypto'

import type {
  ChatwootClient,
  ChatwootMessage,
} from '../../integrations/chatwoot/client.js'
import { ChatwootClientRequestError } from '../../integrations/chatwoot/client.js'
import { ApiError } from '../../lib/errors.js'
import type {
  ChatMessagesRepository,
  ChatSendLedgerEntry,
} from './repository.js'

const SEND_LEDGER_STALE_PROCESSING_MS = 2 * 60 * 1000

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

export async function createOrReplayCanonicalMessage({
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
