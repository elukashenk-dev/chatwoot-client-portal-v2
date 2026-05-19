import { describe, expect, it, vi } from 'vitest'

import type { ChatwootMessage } from '../../integrations/chatwoot/client.js'
import type { CurrentUserChatThreadContext } from '../chat-threads/types.js'
import { createChatMessagesService } from './service.js'

const readyContext = {
  activeThread: {
    id: 'group:154',
    subtitle: 'Групповой чат',
    title: 'Бухгалтерия',
    type: 'group',
  },
  chatwootConversation: {
    assigneeName: 'Анна Смирнова',
    id: 101,
    inboxId: 9,
    lastActivityAt: 300,
    status: 'open',
  },
  currentUserEmail: 'user@example.test',
  currentUserName: 'Portal User',
  linkedContactId: 44,
  portalChatThreadId: 15,
  reason: 'none',
  result: 'ready',
  targetChatwootContactId: 154,
  threadType: 'group',
} satisfies CurrentUserChatThreadContext

const inaccessibleContext = {
  ...readyContext,
  activeThread: null,
  chatwootConversation: null,
  portalChatThreadId: null,
  reason: 'thread_access_denied',
  result: 'not_ready',
} satisfies CurrentUserChatThreadContext

const missingConversationContext = {
  ...readyContext,
  chatwootConversation: null,
  reason: 'conversation_missing',
  result: 'not_ready',
} satisfies CurrentUserChatThreadContext

function createChatwootMessage(
  overrides: Partial<ChatwootMessage> = {},
): ChatwootMessage {
  return {
    attachments: [
      {
        extension: 'png',
        fileSize: 2048,
        fileType: 'image',
        id: 91,
        messageId: 501,
        name: 'receipt.png',
        thumbUrl: 'https://chatwoot.test/rails/active_storage/thumb',
        url: 'https://chatwoot.test/rails/active_storage/file',
      },
    ],
    content: null,
    contentAttributes: {},
    contentType: 'text',
    createdAt: 1_779_107_173,
    id: 501,
    messageType: 1,
    private: false,
    sender: {
      id: 8,
      name: 'Support',
      type: 'user',
    },
    sourceId: null,
    status: 'sent',
    ...overrides,
  }
}

function createService({
  attachmentFetchFn = vi.fn().mockResolvedValue(
    new Response('proxy-body', {
      headers: {
        'content-length': '10',
        'content-type': 'image/png',
      },
      status: 206,
    }),
  ),
  context = readyContext,
  message = createChatwootMessage(),
}: {
  attachmentFetchFn?: typeof fetch
  context?: CurrentUserChatThreadContext
  message?: ChatwootMessage | null
} = {}) {
  const chatThreadsService = {
    ensureCurrentUserWritableThreadContext: vi.fn(),
    getCurrentUserThreadContext: vi.fn().mockResolvedValue(context),
    recoverCurrentUserWritableThreadContext: vi.fn(),
  }
  const findConversationMessageById = vi.fn().mockResolvedValue(message)

  return {
    attachmentFetchFn,
    chatThreadsService,
    findConversationMessageById,
    service: createChatMessagesService({
      attachmentFetchFn,
      chatMessagesRepository: null,
      chatThreadsRepository: {
        findSendLedgerAuthorsByMessageIds: vi.fn().mockResolvedValue(new Map()),
      },
      chatThreadsService,
      chatwootClient: {
        createConversationIncomingAttachmentMessage: vi.fn(),
        createConversationIncomingMessage: vi.fn(),
        findConversationMessageById,
        findConversationMessageBySourceId: vi.fn(),
        listConversationMessages: vi.fn(),
      },
    }),
  }
}

describe('chat attachment proxy service', () => {
  it('streams a visible attachment through a backend-owned fetch', async () => {
    const { attachmentFetchFn, findConversationMessageById, service } =
      createService()

    const result = await service.getCurrentUserChatAttachment({
      attachmentId: 91,
      messageId: 501,
      rangeHeader: 'bytes=0-99',
      threadId: 'group:154',
      userId: 7,
      variant: 'original',
    })

    expect(findConversationMessageById).toHaveBeenCalledWith(101, 501)
    expect(attachmentFetchFn).toHaveBeenCalledWith(
      'https://chatwoot.test/rails/active_storage/file',
      expect.any(Object),
    )
    expect(
      new Headers(vi.mocked(attachmentFetchFn).mock.calls[0]?.[1]?.headers).get(
        'range',
      ),
    ).toBe('bytes=0-99')
    expect(result.status).toBe(206)
    expect(result.headers.get('content-type')).toBe('image/png')
    await expect(new Response(result.body).text()).resolves.toBe('proxy-body')
  })

  it('rejects inaccessible threads before looking up the Chatwoot message', async () => {
    const { attachmentFetchFn, findConversationMessageById, service } =
      createService({
        context: inaccessibleContext,
      })

    await expect(
      service.getCurrentUserChatAttachment({
        attachmentId: 91,
        messageId: 501,
        threadId: 'group:154',
        userId: 7,
        variant: 'original',
      }),
    ).rejects.toMatchObject({
      code: 'thread_access_denied',
      statusCode: 403,
    })
    expect(findConversationMessageById).not.toHaveBeenCalled()
    expect(attachmentFetchFn).not.toHaveBeenCalled()
  })

  it('rejects missing conversations with a controlled attachment error', async () => {
    const { attachmentFetchFn, findConversationMessageById, service } =
      createService({
        context: missingConversationContext,
      })

    await expect(
      service.getCurrentUserChatAttachment({
        attachmentId: 91,
        messageId: 501,
        threadId: 'group:154',
        userId: 7,
        variant: 'original',
      }),
    ).rejects.toMatchObject({
      code: 'attachment_unavailable',
      statusCode: 404,
    })
    expect(findConversationMessageById).not.toHaveBeenCalled()
    expect(attachmentFetchFn).not.toHaveBeenCalled()
  })

  it('rejects private Chatwoot messages', async () => {
    const { attachmentFetchFn, service } = createService({
      message: createChatwootMessage({
        private: true,
      }),
    })

    await expect(
      service.getCurrentUserChatAttachment({
        attachmentId: 91,
        messageId: 501,
        threadId: 'group:154',
        userId: 7,
        variant: 'original',
      }),
    ).rejects.toMatchObject({
      code: 'attachment_unavailable',
      statusCode: 404,
    })
    expect(attachmentFetchFn).not.toHaveBeenCalled()
  })

  it('rejects attachments missing from the parent message', async () => {
    const { attachmentFetchFn, service } = createService()

    await expect(
      service.getCurrentUserChatAttachment({
        attachmentId: 777,
        messageId: 501,
        threadId: 'group:154',
        userId: 7,
        variant: 'original',
      }),
    ).rejects.toMatchObject({
      code: 'attachment_unavailable',
      statusCode: 404,
    })
    expect(attachmentFetchFn).not.toHaveBeenCalled()
  })

  it('streams thumbnail content only when Chatwoot exposes a thumbnail URL', async () => {
    const { attachmentFetchFn, service } = createService()

    const result = await service.getCurrentUserChatAttachment({
      attachmentId: 91,
      messageId: 501,
      threadId: 'group:154',
      userId: 7,
      variant: 'thumb',
    })

    expect(attachmentFetchFn).toHaveBeenCalledWith(
      'https://chatwoot.test/rails/active_storage/thumb',
      expect.any(Object),
    )
    expect(result.status).toBe(206)
  })

  it('maps upstream attachment fetch failures to a controlled portal error', async () => {
    const { service } = createService({
      attachmentFetchFn: vi
        .fn()
        .mockRejectedValue(new TypeError('fetch failed')),
    })

    await expect(
      service.getCurrentUserChatAttachment({
        attachmentId: 91,
        messageId: 501,
        threadId: 'group:154',
        userId: 7,
        variant: 'original',
      }),
    ).rejects.toMatchObject({
      code: 'attachment_unavailable',
      statusCode: 502,
    })
  })
})
