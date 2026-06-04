import { describe, expect, it, vi } from 'vitest'

import {
  ChatwootClientRequestError,
  ChatwootInvalidHistoryCursorError,
} from '../../integrations/chatwoot/client.js'
import type { ChatwootMessage } from '../../integrations/chatwoot/client.js'
import { PRIVATE_CHAT_THREAD_ID } from '../chat-threads/privateThread.js'
import type { CurrentUserChatThreadContext } from '../chat-threads/types.js'
import { createChatMessagesService } from './service.js'

type ChatThreadsServiceOptions = Parameters<
  typeof createChatMessagesService
>[0]['chatThreadsService']
type EnsureCurrentUserWritableThreadContext =
  ChatThreadsServiceOptions['ensureCurrentUserWritableThreadContext']
type RecoverCurrentUserWritableThreadContext =
  ChatThreadsServiceOptions['recoverCurrentUserWritableThreadContext']

function createReadyContext(
  overrides: Partial<CurrentUserChatThreadContext> = {},
): CurrentUserChatThreadContext {
  const {
    chatwootContactSourceId = 'portal-contact:source',
    ...contextOverrides
  } = overrides

  return {
    activeThread: {
      id: PRIVATE_CHAT_THREAD_ID,
      subtitle: 'Вы и поддержка',
      title: 'Личный чат',
      type: 'private',
    },
    chatwootContactSourceId,
    chatwootConversation: {
      assigneeName: 'Анна Смирнова',
      id: 1001,
      inboxId: 9,
      lastActivityAt: 1_779_148_800,
      status: 'open',
    },
    currentUserEmail: 'user@example.test',
    currentUserName: 'Portal User',
    linkedContactId: 44,
    portalChatThreadId: 10,
    reason: 'none',
    result: 'ready',
    targetChatwootContactId: 44,
    threadType: 'private',
    ...contextOverrides,
  }
}

function createChatwootMessage({
  content = 'Клиенту виден договор.',
  id = 301,
  messageType = 1,
  privateMessage = false,
}: {
  content?: string | null
  id?: number
  messageType?: number
  privateMessage?: boolean
} = {}): ChatwootMessage {
  return {
    attachments: [],
    content,
    contentAttributes: {},
    contentType: 'text',
    createdAt: 1_779_148_800 + id,
    id,
    messageType,
    private: privateMessage,
    sender: {
      id: 8,
      name: 'Ольга Support',
      type: 'user',
    },
    sourceId: null,
    status: 'sent',
  }
}

function createService({
  afterPages = [],
  beforePages = [],
  context = createReadyContext(),
  findConversationMessageById = vi
    .fn()
    .mockResolvedValue(createChatwootMessage({ id: 190 })),
  listConversationMessagesAfterError = null,
  listConversationMessagesError = null,
  recoverCurrentUserWritableThreadContext = vi.fn<RecoverCurrentUserWritableThreadContext>(),
}: {
  afterPages?: Array<{
    hasMoreNewer: boolean
    messages: ChatwootMessage[]
    nextNewerCursor: number | null
  }>
  beforePages?: Array<{
    hasMoreOlder: boolean
    messages: ChatwootMessage[]
    nextOlderCursor: number | null
  }>
  context?: CurrentUserChatThreadContext
  findConversationMessageById?: ReturnType<typeof vi.fn>
  listConversationMessagesAfterError?: Error | null
  listConversationMessagesError?: Error | null
  recoverCurrentUserWritableThreadContext?: RecoverCurrentUserWritableThreadContext
} = {}) {
  const ensureCurrentUserWritableThreadContext =
    vi.fn<EnsureCurrentUserWritableThreadContext>()
  const getCurrentUserThreadContext = vi.fn().mockResolvedValue(context)
  const listConversationMessages = vi.fn()
  const listConversationMessagesAfter = vi.fn()

  if (listConversationMessagesError) {
    listConversationMessages.mockRejectedValue(listConversationMessagesError)
  } else {
    for (const page of beforePages) {
      listConversationMessages.mockResolvedValueOnce(page)
    }
  }

  if (listConversationMessagesAfterError) {
    listConversationMessagesAfter.mockRejectedValue(
      listConversationMessagesAfterError,
    )
  } else {
    for (const page of afterPages) {
      listConversationMessagesAfter.mockResolvedValueOnce(page)
    }
  }

  const service = createChatMessagesService({
    chatThreadsRepository: {
      findSendLedgerAuthorsByMessageIds: vi.fn().mockResolvedValue(new Map()),
    },
    chatThreadsService: {
      ensureCurrentUserWritableThreadContext,
      getCurrentUserThreadContext,
      recoverCurrentUserWritableThreadContext,
    },
    chatwootClient: {
      createConversationIncomingAttachmentMessage: vi.fn(),
      createConversationIncomingMessage: vi.fn(),
      findConversationMessageById,
      findConversationMessageBySourceId: vi.fn().mockResolvedValue(null),
      listConversationMessages,
      listConversationMessagesAfter,
    } as never,
  })

  return {
    findConversationMessageById,
    listConversationMessages,
    listConversationMessagesAfter,
    service: service as ReturnType<typeof createChatMessagesService> & {
      getCurrentUserChatMessageContext: (input: {
        cursorMessageId?: number | null
        direction?: 'earlier' | 'initial' | 'later'
        messageId: number
        threadId?: string
        userId: number
      }) => Promise<unknown>
    },
  }
}

describe('chat message context service', () => {
  it('returns a bounded fragment around the target message', async () => {
    const targetMessage = createChatwootMessage({
      content: 'Искомый договор найден.',
      id: 190,
    })
    const { listConversationMessages, listConversationMessagesAfter, service } =
      createService({
        afterPages: [
          {
            hasMoreNewer: true,
            messages: [
              createChatwootMessage({ content: 'Позже 1', id: 191 }),
              createChatwootMessage({ content: 'Позже 2', id: 192 }),
            ],
            nextNewerCursor: 192,
          },
        ],
        beforePages: [
          {
            hasMoreOlder: true,
            messages: [
              createChatwootMessage({ content: 'Раньше 1', id: 188 }),
              createChatwootMessage({ content: 'Раньше 2', id: 189 }),
            ],
            nextOlderCursor: 188,
          },
        ],
        findConversationMessageById: vi.fn().mockResolvedValue(targetMessage),
      })

    await expect(
      service.getCurrentUserChatMessageContext({
        messageId: 190,
        threadId: PRIVATE_CHAT_THREAD_ID,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      earlierCursor: 188,
      hasMoreEarlier: true,
      hasMoreLater: true,
      laterCursor: 192,
      messages: [
        expect.objectContaining({ content: 'Раньше 1', id: 188 }),
        expect.objectContaining({ content: 'Раньше 2', id: 189 }),
        expect.objectContaining({
          content: 'Искомый договор найден.',
          id: 190,
        }),
        expect.objectContaining({ content: 'Позже 1', id: 191 }),
        expect.objectContaining({ content: 'Позже 2', id: 192 }),
      ],
      reason: 'none',
      result: 'ready',
      targetMessageId: 190,
    })
    expect(listConversationMessages).toHaveBeenCalledWith(1001, {
      beforeMessageId: 190,
    })
    expect(listConversationMessagesAfter).toHaveBeenCalledWith(1001, {
      afterMessageId: 190,
    })
  })

  it('loads an earlier context page before the current fragment boundary', async () => {
    const { service } = createService({
      beforePages: [
        {
          hasMoreOlder: false,
          messages: [
            createChatwootMessage({ content: 'Еще раньше', id: 180 }),
            createChatwootMessage({ content: 'Перед границей', id: 187 }),
          ],
          nextOlderCursor: null,
        },
      ],
    })

    await expect(
      service.getCurrentUserChatMessageContext({
        cursorMessageId: 188,
        direction: 'earlier',
        messageId: 190,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      earlierCursor: null,
      hasMoreEarlier: false,
      messages: [
        expect.objectContaining({ id: 180 }),
        expect.objectContaining({ id: 187 }),
      ],
      targetMessageId: 190,
    })
  })

  it('loads a later context page after the current fragment boundary', async () => {
    const { service } = createService({
      afterPages: [
        {
          hasMoreNewer: false,
          messages: [
            createChatwootMessage({ content: 'После границы', id: 193 }),
            createChatwootMessage({ content: 'Еще позже', id: 194 }),
          ],
          nextNewerCursor: null,
        },
      ],
    })

    await expect(
      service.getCurrentUserChatMessageContext({
        cursorMessageId: 192,
        direction: 'later',
        messageId: 190,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      hasMoreLater: false,
      laterCursor: null,
      messages: [
        expect.objectContaining({ id: 193 }),
        expect.objectContaining({ id: 194 }),
      ],
      targetMessageId: 190,
    })
  })

  it('rejects missing or hidden target messages', async () => {
    const { service } = createService({
      findConversationMessageById: vi
        .fn()
        .mockResolvedValue(createChatwootMessage({ privateMessage: true })),
    })

    await expect(
      service.getCurrentUserChatMessageContext({
        messageId: 190,
        userId: 7,
      }),
    ).rejects.toMatchObject({
      code: 'message_context_unavailable',
      statusCode: 404,
    })
  })

  it('returns unavailable when Chatwoot context lookup fails', async () => {
    const { service } = createService({
      listConversationMessagesError: new ChatwootClientRequestError(
        'Chatwoot unavailable',
      ),
    })

    await expect(
      service.getCurrentUserChatMessageContext({
        messageId: 190,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      messages: [],
      reason: 'chatwoot_unavailable',
      result: 'unavailable',
      targetMessageId: 190,
    })
  })

  it('throws a controlled invalid cursor error', async () => {
    const { service } = createService({
      listConversationMessagesAfterError:
        new ChatwootInvalidHistoryCursorError(),
    })

    await expect(
      service.getCurrentUserChatMessageContext({
        cursorMessageId: 192,
        direction: 'later',
        messageId: 190,
        userId: 7,
      }),
    ).rejects.toMatchObject({
      code: 'invalid_history_cursor',
      statusCode: 400,
    })
  })
})
