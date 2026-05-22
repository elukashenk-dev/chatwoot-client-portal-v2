import { describe, expect, it, vi } from 'vitest'

import {
  ChatwootClientRequestError,
  ChatwootInvalidHistoryCursorError,
} from '../../integrations/chatwoot/client.js'
import type { ChatwootMessage } from '../../integrations/chatwoot/client.js'
import { PRIVATE_CHAT_THREAD_ID } from '../chat-threads/privateThread.js'
import type { CurrentUserChatThreadContext } from '../chat-threads/types.js'
import { createChatMessagesService } from './service.js'

type ListConversationMessages = Parameters<
  typeof createChatMessagesService
>[0]['chatwootClient']['listConversationMessages']
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
  return {
    activeThread: {
      id: PRIVATE_CHAT_THREAD_ID,
      subtitle: 'Вы и поддержка',
      title: 'Личный чат',
      type: 'private',
    },
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
    ...overrides,
  }
}

function createGroupContext() {
  return createReadyContext({
    activeThread: {
      id: 'group:154',
      subtitle: 'Групповой чат',
      title: 'ООО "Ромашка"',
      type: 'group',
    },
    currentUserName: 'Иван Петров',
    linkedContactId: 44,
    portalChatThreadId: 1540,
    targetChatwootContactId: 154,
    threadType: 'group',
  })
}

function createChatwootMessage({
  content = 'Клиенту виден номер договора 123.',
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
    createdAt: 1_779_148_800,
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
  context = createReadyContext(),
  ensureCurrentUserWritableThreadContext = vi.fn<EnsureCurrentUserWritableThreadContext>(),
  listConversationMessagesError = null,
  pages = null,
  recoverCurrentUserWritableThreadContext = vi.fn<RecoverCurrentUserWritableThreadContext>(),
}: {
  context?: CurrentUserChatThreadContext
  ensureCurrentUserWritableThreadContext?: EnsureCurrentUserWritableThreadContext
  listConversationMessagesError?: Error | null
  pages?: Array<{
    hasMoreOlder: boolean
    messages: ChatwootMessage[]
    nextOlderCursor: number | null
  }> | null
  recoverCurrentUserWritableThreadContext?: RecoverCurrentUserWritableThreadContext
} = {}) {
  const getCurrentUserThreadContext = vi.fn().mockResolvedValue(context)
  const listConversationMessages = vi.fn<ListConversationMessages>()

  if (listConversationMessagesError) {
    listConversationMessages.mockRejectedValue(listConversationMessagesError)
  } else {
    const resolvedPages = pages ?? [
      {
        hasMoreOlder: false,
        messages: [createChatwootMessage()],
        nextOlderCursor: null,
      },
    ]

    for (const page of resolvedPages) {
      listConversationMessages.mockResolvedValueOnce(page)
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
      findConversationMessageById: vi.fn().mockResolvedValue(null),
      findConversationMessageBySourceId: vi.fn().mockResolvedValue(null),
      listConversationMessages,
      listConversationMessagesAfter: vi.fn(),
    },
  })

  return {
    chatThreadsService: {
      ensureCurrentUserWritableThreadContext,
      getCurrentUserThreadContext,
      recoverCurrentUserWritableThreadContext,
    },
    listConversationMessages,
    service,
  }
}

describe('chat search service', () => {
  it('searches only client-visible mapped text messages', async () => {
    const { service } = createService({
      pages: [
        {
          hasMoreOlder: false,
          messages: [
            createChatwootMessage({
              content: 'Клиенту виден номер договора 123.',
              id: 301,
              messageType: 1,
            }),
            createChatwootMessage({
              content: 'internal договор hidden',
              id: 302,
              privateMessage: true,
            }),
          ],
          nextOlderCursor: null,
        },
      ],
    })

    await expect(
      service.getCurrentUserChatSearch({
        query: 'договор',
        threadId: PRIVATE_CHAT_THREAD_ID,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      hasMoreOlder: false,
      items: [
        expect.objectContaining({
          content: 'Клиенту виден номер договора 123.',
          messageId: 301,
        }),
      ],
      query: 'договор',
      reason: 'none',
      result: 'ready',
    })
  })

  it('does not create or recover a conversation while searching an empty thread', async () => {
    const ensureCurrentUserWritableThreadContext = vi.fn()
    const recoverCurrentUserWritableThreadContext = vi.fn()
    const { listConversationMessages, service } = createService({
      context: createReadyContext({
        chatwootConversation: null,
        reason: 'conversation_missing',
        result: 'not_ready',
      }),
      ensureCurrentUserWritableThreadContext,
      recoverCurrentUserWritableThreadContext,
    })

    await expect(
      service.getCurrentUserChatSearch({
        query: 'договор',
        threadId: PRIVATE_CHAT_THREAD_ID,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      hasMoreOlder: false,
      items: [],
      nextOlderCursor: null,
      reason: 'none',
      result: 'ready',
    })
    expect(listConversationMessages).not.toHaveBeenCalled()
    expect(ensureCurrentUserWritableThreadContext).not.toHaveBeenCalled()
    expect(recoverCurrentUserWritableThreadContext).not.toHaveBeenCalled()
  })

  it('scans older pages until it finds results', async () => {
    const { listConversationMessages, service } = createService({
      pages: [
        {
          hasMoreOlder: true,
          messages: [
            createChatwootMessage({
              content: 'Нет совпадений',
              id: 205,
            }),
          ],
          nextOlderCursor: 200,
        },
        {
          hasMoreOlder: false,
          messages: [
            createChatwootMessage({
              content: 'Искомый договор найден во второй странице.',
              id: 190,
            }),
          ],
          nextOlderCursor: null,
        },
      ],
    })

    await expect(
      service.getCurrentUserChatSearch({
        query: 'договор',
        threadId: PRIVATE_CHAT_THREAD_ID,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      hasMoreOlder: false,
      items: [expect.objectContaining({ messageId: 190 })],
      nextOlderCursor: null,
      result: 'ready',
    })
    expect(listConversationMessages).toHaveBeenNthCalledWith(1, 1001, {
      beforeMessageId: null,
    })
    expect(listConversationMessages).toHaveBeenNthCalledWith(2, 1001, {
      beforeMessageId: 200,
    })
  })

  it('keeps the older search cursor at the oldest returned result when a scanned page overflows the result limit', async () => {
    const firstPageMessages = Array.from({ length: 10 }, (_, index) =>
      createChatwootMessage({
        content: `Новый договор ${index + 1}`,
        id: 41 + index,
      }),
    )
    const secondPageMessages = Array.from({ length: 20 }, (_, index) =>
      createChatwootMessage({
        content: `Старый договор ${index + 1}`,
        id: 21 + index,
      }),
    )
    const { service } = createService({
      pages: [
        {
          hasMoreOlder: true,
          messages: firstPageMessages,
          nextOlderCursor: 41,
        },
        {
          hasMoreOlder: true,
          messages: secondPageMessages,
          nextOlderCursor: 21,
        },
      ],
    })

    await expect(
      service.getCurrentUserChatSearch({
        query: 'договор',
        threadId: PRIVATE_CHAT_THREAD_ID,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      hasMoreOlder: true,
      items: Array.from({ length: 20 }, (_, index) =>
        expect.objectContaining({ messageId: 50 - index }),
      ),
      nextOlderCursor: 31,
      result: 'ready',
    })
  })

  it('returns unavailable when Chatwoot history request fails', async () => {
    const { service } = createService({
      listConversationMessagesError: new ChatwootClientRequestError(
        'Chatwoot unavailable',
      ),
    })

    await expect(
      service.getCurrentUserChatSearch({
        query: 'договор',
        threadId: PRIVATE_CHAT_THREAD_ID,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      items: [],
      reason: 'chatwoot_unavailable',
      result: 'unavailable',
    })
  })

  it('throws a controlled invalid cursor error', async () => {
    const { service } = createService({
      listConversationMessagesError: new ChatwootInvalidHistoryCursorError(),
    })

    await expect(
      service.getCurrentUserChatSearch({
        beforeMessageId: 999,
        query: 'договор',
        threadId: PRIVATE_CHAT_THREAD_ID,
        userId: 7,
      }),
    ).rejects.toMatchObject({
      code: 'invalid_history_cursor',
      statusCode: 400,
    })
  })

  it('uses existing group thread authority when searching a group thread', async () => {
    const { chatThreadsService, service } = createService({
      context: createGroupContext(),
      pages: [
        {
          hasMoreOlder: false,
          messages: [
            createChatwootMessage({
              content: 'Групповой договор готов.',
              id: 804,
            }),
          ],
          nextOlderCursor: null,
        },
      ],
    })

    await expect(
      service.getCurrentUserChatSearch({
        query: 'договор',
        threadId: 'group:154',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      activeThread: expect.objectContaining({ id: 'group:154' }),
      items: [expect.objectContaining({ messageId: 804 })],
      result: 'ready',
    })
    expect(chatThreadsService.getCurrentUserThreadContext).toHaveBeenCalledWith(
      {
        threadId: 'group:154',
        userId: 7,
      },
    )
  })
})
