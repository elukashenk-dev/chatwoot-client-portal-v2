import { describe, expect, it, vi } from 'vitest'

import {
  ChatwootClientConfigurationError,
  ChatwootInvalidHistoryCursorError,
} from '../../integrations/chatwoot/client.js'
import type { ChatwootMessage } from '../../integrations/chatwoot/client.js'
import { PRIVATE_CHAT_THREAD_ID } from '../chat-threads/privateThread.js'
import type { CurrentUserChatThreadContext } from '../chat-threads/types.js'
import { createChatMessagesService } from './service.js'

type ListConversationMessages = Parameters<
  typeof createChatMessagesService
>[0]['chatwootClient']['listConversationMessages']

function createReadyContext(
  overrides: Partial<CurrentUserChatThreadContext> = {},
): CurrentUserChatThreadContext {
  return {
    activeThread: {
      id: PRIVATE_CHAT_THREAD_ID,
      subtitle: 'Только вы и поддержка',
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

function createChatwootMessage({
  attachments = [],
  content = 'Фото',
  id = 501,
}: {
  attachments?: Array<{
    fileSize: number | null
    fileType: string
    id: number
    name: string
    thumbUrl: string
    url: string
  }>
  content?: string | null
  id?: number
} = {}): ChatwootMessage {
  return {
    attachments: attachments.map((attachment) => ({
      extension: null,
      messageId: id,
      ...attachment,
    })),
    content,
    contentAttributes: {},
    contentType: 'text',
    createdAt: 1_779_148_800,
    id,
    messageType: 1,
    private: false,
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
  listConversationMessages,
}: {
  context?: CurrentUserChatThreadContext
  listConversationMessages: ListConversationMessages
}) {
  const chatThreadsService = {
    ensureCurrentUserWritableThreadContext: vi.fn(),
    getCurrentUserThreadContext: vi.fn().mockResolvedValue(context),
    recoverCurrentUserWritableThreadContext: vi.fn(),
  }
  const service = createChatMessagesService({
    chatThreadsRepository: {
      findSendLedgerAuthorsByMessageIds: vi.fn().mockResolvedValue(new Map()),
    },
    chatThreadsService,
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
    chatThreadsService,
    service,
  }
}

describe('chat media service', () => {
  it('returns flattened media items without creating a conversation', async () => {
    const listConversationMessages = vi
      .fn<ListConversationMessages>()
      .mockResolvedValue({
        hasMoreOlder: false,
        messages: [
          createChatwootMessage({
            attachments: [
              {
                fileSize: 4096,
                fileType: 'image',
                id: 71,
                name: 'receipt.png',
                thumbUrl: 'https://chatwoot.test/thumb.png',
                url: 'https://chatwoot.test/receipt.png',
              },
            ],
          }),
        ],
        nextOlderCursor: null,
      })
    const { chatThreadsService, service } = createService({
      listConversationMessages,
    })

    await expect(
      service.getCurrentUserChatMedia({
        threadId: PRIVATE_CHAT_THREAD_ID,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      hasMoreOlder: false,
      items: [
        {
          attachmentId: 71,
          authorName: 'Ольга Support',
          category: 'image',
          id: 'attachment:501:71',
          messageId: 501,
          name: 'receipt.png',
          thumbUrl: '/api/chat/threads/private%3Ame/attachments/501/71/thumb',
          url: '/api/chat/threads/private%3Ame/attachments/501/71',
        },
      ],
      result: 'ready',
    })
    expect(listConversationMessages).toHaveBeenCalledWith(1001, {
      beforeMessageId: null,
    })
    expect(
      chatThreadsService.ensureCurrentUserWritableThreadContext,
    ).not.toHaveBeenCalled()
  })

  it('scans older pages until it finds media items', async () => {
    const listConversationMessages = vi
      .fn<ListConversationMessages>()
      .mockResolvedValueOnce({
        hasMoreOlder: true,
        messages: [
          createChatwootMessage({
            attachments: [],
            content: 'Нет файлов',
            id: 502,
          }),
        ],
        nextOlderCursor: 401,
      })
      .mockResolvedValueOnce({
        hasMoreOlder: false,
        messages: [
          createChatwootMessage({
            attachments: [
              {
                fileSize: null,
                fileType: 'application/pdf',
                id: 72,
                name: 'contract.pdf',
                thumbUrl: '',
                url: 'https://chatwoot.test/contract.pdf',
              },
            ],
            id: 401,
          }),
        ],
        nextOlderCursor: null,
      })
    const { service } = createService({
      listConversationMessages,
    })

    await expect(
      service.getCurrentUserChatMedia({
        threadId: PRIVATE_CHAT_THREAD_ID,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      hasMoreOlder: false,
      items: [
        {
          category: 'file',
          id: 'attachment:401:72',
          name: 'contract.pdf',
        },
      ],
      nextOlderCursor: null,
      result: 'ready',
    })
    expect(listConversationMessages).toHaveBeenNthCalledWith(1, 1001, {
      beforeMessageId: null,
    })
    expect(listConversationMessages).toHaveBeenNthCalledWith(2, 1001, {
      beforeMessageId: 401,
    })
  })

  it('continues scanning older pages after the first media item to build a fuller media page', async () => {
    const listConversationMessages = vi
      .fn<ListConversationMessages>()
      .mockResolvedValueOnce({
        hasMoreOlder: true,
        messages: [
          createChatwootMessage({
            attachments: [
              {
                fileSize: 4096,
                fileType: 'image',
                id: 72,
                name: 'latest.png',
                thumbUrl: 'https://chatwoot.test/latest-thumb.png',
                url: 'https://chatwoot.test/latest.png',
              },
            ],
            id: 502,
          }),
        ],
        nextOlderCursor: 401,
      })
      .mockResolvedValueOnce({
        hasMoreOlder: true,
        messages: [
          createChatwootMessage({
            attachments: [],
            content: 'Обычное сообщение без файлов',
            id: 401,
          }),
        ],
        nextOlderCursor: 301,
      })
      .mockResolvedValueOnce({
        hasMoreOlder: false,
        messages: [
          createChatwootMessage({
            attachments: [
              {
                fileSize: null,
                fileType: 'application/pdf',
                id: 73,
                name: 'older-contract.pdf',
                thumbUrl: '',
                url: 'https://chatwoot.test/older-contract.pdf',
              },
            ],
            id: 301,
          }),
        ],
        nextOlderCursor: null,
      })
    const { service } = createService({
      listConversationMessages,
    })

    await expect(
      service.getCurrentUserChatMedia({
        threadId: PRIVATE_CHAT_THREAD_ID,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      hasMoreOlder: false,
      items: [
        {
          id: 'attachment:502:72',
          name: 'latest.png',
        },
        {
          id: 'attachment:301:73',
          name: 'older-contract.pdf',
        },
      ],
      nextOlderCursor: null,
      result: 'ready',
    })
    expect(listConversationMessages).toHaveBeenCalledTimes(3)
    expect(listConversationMessages).toHaveBeenNthCalledWith(1, 1001, {
      beforeMessageId: null,
    })
    expect(listConversationMessages).toHaveBeenNthCalledWith(2, 1001, {
      beforeMessageId: 401,
    })
    expect(listConversationMessages).toHaveBeenNthCalledWith(3, 1001, {
      beforeMessageId: 301,
    })
  })

  it('returns a ready empty page when the thread has no conversation yet', async () => {
    const listConversationMessages = vi.fn<ListConversationMessages>()
    const { service } = createService({
      context: createReadyContext({
        chatwootConversation: null,
        reason: 'conversation_missing',
        result: 'not_ready',
      }),
      listConversationMessages,
    })

    await expect(
      service.getCurrentUserChatMedia({
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
  })

  it('maps Chatwoot failures and invalid cursors to controlled outcomes', async () => {
    const unavailable = createService({
      listConversationMessages: vi
        .fn<ListConversationMessages>()
        .mockRejectedValue(
          new ChatwootClientConfigurationError('missing config'),
        ),
    }).service

    await expect(
      unavailable.getCurrentUserChatMedia({
        threadId: PRIVATE_CHAT_THREAD_ID,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      items: [],
      reason: 'chatwoot_unavailable',
      result: 'unavailable',
    })

    const invalidCursor = createService({
      listConversationMessages: vi
        .fn<ListConversationMessages>()
        .mockRejectedValue(new ChatwootInvalidHistoryCursorError()),
    }).service

    await expect(
      invalidCursor.getCurrentUserChatMedia({
        beforeMessageId: 123,
        threadId: PRIVATE_CHAT_THREAD_ID,
        userId: 7,
      }),
    ).rejects.toMatchObject({
      code: 'invalid_history_cursor',
      statusCode: 400,
    })
  })
})
