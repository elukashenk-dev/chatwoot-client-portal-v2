import { describe, expect, it, vi } from 'vitest'

import type { CurrentUserChatThreadContext } from '../chat-threads/types.js'
import { createChatMessagesService } from './service.js'

const groupReadyContext = {
  activeThread: {
    id: 'group:154',
    subtitle: 'Групповой чат',
    title: 'ООО "Ромашка"',
    type: 'group',
  },
  chatwootConversation: {
    assigneeName: null,
    id: 301,
    inboxId: 9,
    lastActivityAt: 1_776_000_000,
    status: 'open',
  },
  currentUserEmail: 'ivan@example.com',
  currentUserName: 'Иван Петров',
  linkedContactId: 44,
  portalChatThreadId: 2,
  reason: 'none',
  result: 'ready',
  targetChatwootContactId: 154,
  threadType: 'group',
} as unknown as CurrentUserChatThreadContext

const groupAccessDeniedContext = {
  ...groupReadyContext,
  activeThread: null,
  chatwootConversation: null,
  reason: 'thread_access_denied',
  result: 'not_ready',
} as unknown as CurrentUserChatThreadContext

const sentChatwootMessage = {
  attachments: [],
  content: '**Иван Петров**\nДобрый день',
  contentAttributes: {},
  contentType: 'text',
  createdAt: 1_776_000_010,
  id: 501,
  messageType: 0,
  private: false,
  sender: {
    id: 154,
    name: 'ООО "Ромашка"',
    type: 'contact',
  },
  sourceId: 'portal-send:key',
  status: 'sent',
}

function createThreadServiceStub({
  context = groupReadyContext,
  writableContext = context,
}: {
  context?: CurrentUserChatThreadContext
  writableContext?: CurrentUserChatThreadContext
} = {}) {
  return {
    ensureCurrentUserWritableThreadContext: vi
      .fn()
      .mockResolvedValue(writableContext),
    getCurrentUserThreadContext: vi.fn().mockResolvedValue(context),
    recoverCurrentUserWritableThreadContext: vi
      .fn()
      .mockResolvedValue(writableContext),
  }
}

function createChatwootClientStub(
  overrides: Partial<
    Parameters<typeof createChatMessagesService>[0]['chatwootClient']
  > = {},
): Parameters<typeof createChatMessagesService>[0]['chatwootClient'] {
  return {
    createConversationIncomingAttachmentMessage: vi.fn(),
    createConversationIncomingMessage: vi
      .fn()
      .mockResolvedValue(sentChatwootMessage),
    findConversationMessageById: vi.fn().mockResolvedValue(null),
    findConversationMessageBySourceId: vi.fn().mockResolvedValue(null),
    listConversationMessages: vi.fn().mockResolvedValue({
      hasMoreOlder: false,
      messages: [],
      nextOlderCursor: null,
    }),
    listConversationMessagesAfter: vi.fn(),
    ...overrides,
  }
}

function createChatThreadsRepositoryStub(
  authors: Map<
    number,
    { authorDisplayName: string | null; userId: number }
  > = new Map(),
) {
  return {
    findSendLedgerAuthorsByMessageIds: vi.fn().mockResolvedValue(authors),
  }
}

function createThreadBackedMessageService({
  authors,
  chatThreadsService = createThreadServiceStub(),
  chatwootClient = createChatwootClientStub(),
}: {
  authors?: Map<number, { authorDisplayName: string | null; userId: number }>
  chatThreadsService?: ReturnType<typeof createThreadServiceStub>
  chatwootClient?: Parameters<
    typeof createChatMessagesService
  >[0]['chatwootClient']
} = {}) {
  return createChatMessagesService({
    chatMessagesRepository: null,
    chatThreadsRepository: createChatThreadsRepositoryStub(authors),
    chatThreadsService,
    chatwootClient,
  } as unknown as Parameters<typeof createChatMessagesService>[0])
}

describe('createChatMessagesService thread runtime integration', () => {
  it('formats group thread text messages for Chatwoot with a Markdown author prefix', async () => {
    const createConversationIncomingMessage = vi
      .fn()
      .mockResolvedValue(sentChatwootMessage)
    const service = createThreadBackedMessageService({
      chatwootClient: createChatwootClientStub({
        createConversationIncomingMessage,
      }),
    })

    await service.sendCurrentUserTextMessage({
      clientMessageKey: 'portal-send:key',
      content: 'Добрый день',
      threadId: 'group:154',
      userId: 7,
    })

    expect(createConversationIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '**Иван Петров**\nДобрый день',
      }),
    )
  })

  it('normalizes and escapes group author names before Chatwoot formatting', async () => {
    const createConversationIncomingMessage = vi
      .fn()
      .mockResolvedValue(sentChatwootMessage)
    const service = createThreadBackedMessageService({
      chatThreadsService: createThreadServiceStub({
        writableContext: {
          ...groupReadyContext,
          currentUserEmail: 'fallback@example.com',
          currentUserName: '  Иван\n\tПетров  *CEO* [docs] `quoted`  '.padEnd(
            140,
            'x',
          ),
        } as unknown as CurrentUserChatThreadContext,
      }),
      chatwootClient: createChatwootClientStub({
        createConversationIncomingMessage,
      }),
    })

    await service.sendCurrentUserTextMessage({
      clientMessageKey: 'portal-send:key',
      content: 'Добрый день',
      threadId: 'group:154',
      userId: 7,
    })

    expect(createConversationIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content:
          '**Иван Петров \\*CEO\\* \\[docs\\] \\`quoted\\` ' +
          `${'x'.repeat(46)}**\nДобрый день`,
      }),
    )
  })

  it('falls back to email when the group author display name is empty', async () => {
    const createConversationIncomingMessage = vi
      .fn()
      .mockResolvedValue(sentChatwootMessage)
    const service = createThreadBackedMessageService({
      chatThreadsService: createThreadServiceStub({
        writableContext: {
          ...groupReadyContext,
          currentUserEmail: 'ivan@example.com',
          currentUserName: '\n\t ',
        } as unknown as CurrentUserChatThreadContext,
      }),
      chatwootClient: createChatwootClientStub({
        createConversationIncomingMessage,
      }),
    })

    await service.sendCurrentUserTextMessage({
      clientMessageKey: 'portal-send:key',
      content: 'Добрый день',
      threadId: 'group:154',
      userId: 7,
    })

    expect(createConversationIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '**ivan@example.com**\nДобрый день',
      }),
    )
  })

  it('strips group Markdown author prefix from portal history and exposes author role', async () => {
    const service = createThreadBackedMessageService({
      authors: new Map([
        [
          501,
          {
            authorDisplayName: 'Иван Петров',
            userId: 7,
          },
        ],
      ]),
      chatwootClient: createChatwootClientStub({
        listConversationMessages: vi.fn().mockResolvedValue({
          hasMoreOlder: false,
          messages: [sentChatwootMessage],
          nextOlderCursor: null,
        }),
      }),
    })

    await expect(
      service.getCurrentUserChatMessages({
        threadId: 'group:154',
        userId: 8,
      }),
    ).resolves.toMatchObject({
      messages: [
        {
          authorName: 'Иван Петров',
          authorRole: 'group_member',
          content: 'Добрый день',
          direction: 'incoming',
        },
      ],
    })
  })

  it('exposes group member avatar URLs for ledger-backed incoming history', async () => {
    const service = createThreadBackedMessageService({
      authors: new Map([
        [
          701,
          {
            authorDisplayName: 'Мария Соколова',
            userId: 8,
          },
        ],
      ]),
      chatwootClient: createChatwootClientStub({
        listConversationMessages: vi.fn().mockResolvedValue({
          hasMoreOlder: false,
          messages: [
            {
              ...sentChatwootMessage,
              content: '**Мария Соколова**\nНужен договор 123.',
              id: 701,
              messageType: 0,
              sender: {
                id: 154,
                name: 'ООО "Ромашка"',
                type: 'contact',
              },
            },
          ],
          nextOlderCursor: null,
        }),
      }),
    })

    await expect(
      service.getCurrentUserChatMessages({
        threadId: 'group:154',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      messages: [
        {
          authorAvatarUrl:
            '/api/chat/threads/group%3A154/participants/8/avatar',
          authorName: 'Мария Соколова',
          authorRole: 'group_member',
          content: 'Нужен договор 123.',
          direction: 'incoming',
        },
      ],
    })
  })

  it('does not read group history after membership is removed', async () => {
    const listConversationMessages = vi.fn()
    const service = createThreadBackedMessageService({
      chatThreadsService: createThreadServiceStub({
        context: groupAccessDeniedContext,
      }),
      chatwootClient: createChatwootClientStub({
        listConversationMessages,
      }),
    })

    await expect(
      service.getCurrentUserChatMessages({
        threadId: 'group:154',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      messages: [],
      reason: 'thread_access_denied',
      result: 'not_ready',
    })
    expect(listConversationMessages).not.toHaveBeenCalled()
  })

  it('does not send to Chatwoot after group membership is removed', async () => {
    const createConversationIncomingMessage = vi.fn()
    const service = createThreadBackedMessageService({
      chatThreadsService: createThreadServiceStub({
        writableContext: groupAccessDeniedContext,
      }),
      chatwootClient: createChatwootClientStub({
        createConversationIncomingMessage,
      }),
    })

    await expect(
      service.sendCurrentUserTextMessage({
        clientMessageKey: 'portal-send:key',
        content: 'Добрый день',
        threadId: 'group:154',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      reason: 'thread_access_denied',
      result: 'not_ready',
      sentMessage: null,
    })
    expect(createConversationIncomingMessage).not.toHaveBeenCalled()
  })
})
