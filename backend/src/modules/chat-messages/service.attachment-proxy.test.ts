import { afterEach, describe, expect, it, vi } from 'vitest'

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
  attachmentAllowedOrigins = ['https://chatwoot.test'],
  attachmentFetchFn = vi.fn().mockResolvedValue(
    new Response('proxy-body', {
      headers: {
        'content-length': '10',
        'content-type': 'image/png',
      },
      status: 206,
    }),
  ),
  attachmentRequestTimeoutMs = undefined,
  context = readyContext,
  message = createChatwootMessage(),
}: {
  attachmentAllowedOrigins?: string[]
  attachmentFetchFn?: typeof fetch
  attachmentRequestTimeoutMs?: number
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
      attachmentAllowedOrigins,
      attachmentFetchFn,
      attachmentRequestTimeoutMs,
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
  afterEach(() => {
    vi.useRealTimers()
  })

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
    expect(
      new Headers(vi.mocked(attachmentFetchFn).mock.calls[0]?.[1]?.headers).get(
        'accept-encoding',
      ),
    ).toBe('identity')
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

  it('aborts slow upstream attachment fetches with a controlled portal error', async () => {
    vi.useFakeTimers()
    const attachmentFetchFn = vi.fn<typeof fetch>((_url, options) => {
      const signal = options?.signal

      return new Promise<Response>((_resolve, reject) => {
        if (!(signal instanceof AbortSignal)) {
          reject(new Error('Missing abort signal.'))
          return
        }

        signal.addEventListener(
          'abort',
          () => reject(signal.reason ?? new Error('Request aborted.')),
          { once: true },
        )
      })
    })
    const { service } = createService({
      attachmentFetchFn,
      attachmentRequestTimeoutMs: 5,
    })

    const attachment = service.getCurrentUserChatAttachment({
      attachmentId: 91,
      messageId: 501,
      threadId: 'group:154',
      userId: 7,
      variant: 'original',
    })
    const attachmentExpectation = expect(attachment).rejects.toMatchObject({
      code: 'attachment_unavailable',
      statusCode: 502,
    })

    await vi.advanceTimersByTimeAsync(5)
    await attachmentExpectation

    expect(attachmentFetchFn.mock.calls[0]?.[1]?.signal).toMatchObject({
      aborted: true,
    })
  })

  it('aborts stalled upstream attachment bodies', async () => {
    vi.useFakeTimers()
    const attachmentFetchFn = vi.fn<typeof fetch>((_url, options) => {
      const signal = options?.signal
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          if (!(signal instanceof AbortSignal)) {
            controller.error(new Error('Missing abort signal.'))
            return
          }

          signal.addEventListener(
            'abort',
            () => controller.error(signal.reason ?? new Error('Aborted.')),
            { once: true },
          )
        },
      })

      return Promise.resolve(
        new Response(body, {
          headers: {
            'content-type': 'image/png',
          },
          status: 200,
        }),
      )
    })
    const { service } = createService({
      attachmentFetchFn,
      attachmentRequestTimeoutMs: 5,
    })

    const result = await service.getCurrentUserChatAttachment({
      attachmentId: 91,
      messageId: 501,
      threadId: 'group:154',
      userId: 7,
      variant: 'original',
    })
    const stalledBody = expect(
      new Response(result.body).arrayBuffer(),
    ).rejects.toThrow(/Chatwoot attachment fetch timed out/)

    await vi.advanceTimersByTimeAsync(5)
    await stalledBody
    expect(attachmentFetchFn.mock.calls[0]?.[1]?.signal).toMatchObject({
      aborted: true,
    })
  })

  it('rejects attachment URLs outside the configured Chatwoot origin', async () => {
    const attachmentFetchFn = vi.fn<typeof fetch>()
    const { service } = createService({
      attachmentFetchFn,
      message: createChatwootMessage({
        attachments: [
          {
            extension: 'png',
            fileSize: 2048,
            fileType: 'image',
            id: 91,
            messageId: 501,
            name: 'receipt.png',
            thumbUrl: '',
            url: 'https://files.example.test/receipt.png',
          },
        ],
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
      statusCode: 502,
    })
    expect(attachmentFetchFn).not.toHaveBeenCalled()
  })

  it('rejects non-http attachment URLs before upstream fetch', async () => {
    const attachmentFetchFn = vi.fn<typeof fetch>()
    const { service } = createService({
      attachmentFetchFn,
      message: createChatwootMessage({
        attachments: [
          {
            extension: 'png',
            fileSize: 2048,
            fileType: 'image',
            id: 91,
            messageId: 501,
            name: 'receipt.png',
            thumbUrl: '',
            url: 'file:///etc/passwd',
          },
        ],
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
      statusCode: 502,
    })
    expect(attachmentFetchFn).not.toHaveBeenCalled()
  })

  it('follows upstream redirects to configured storage origins', async () => {
    const attachmentFetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: {
            location: 'https://storage.example.test/files/receipt.png',
          },
          status: 302,
        }),
      )
      .mockResolvedValueOnce(
        new Response('storage-body', {
          headers: {
            'content-type': 'image/png',
          },
          status: 200,
        }),
      )
    const { service } = createService({
      attachmentAllowedOrigins: [
        'https://chatwoot.test',
        'https://storage.example.test',
      ],
      attachmentFetchFn,
    })

    const result = await service.getCurrentUserChatAttachment({
      attachmentId: 91,
      messageId: 501,
      threadId: 'group:154',
      userId: 7,
      variant: 'original',
    })

    expect(attachmentFetchFn).toHaveBeenCalledTimes(2)
    expect(attachmentFetchFn.mock.calls[1]?.[0]).toBe(
      'https://storage.example.test/files/receipt.png',
    )
    expect(result.status).toBe(200)
    await expect(new Response(result.body).text()).resolves.toBe('storage-body')
  })

  it('rejects private-network attachment URLs before upstream fetch', async () => {
    const attachmentFetchFn = vi.fn<typeof fetch>()
    const { service } = createService({
      attachmentAllowedOrigins: ['http://127.0.0.1:3000'],
      attachmentFetchFn,
      message: createChatwootMessage({
        attachments: [
          {
            extension: 'png',
            fileSize: 2048,
            fileType: 'image',
            id: 91,
            messageId: 501,
            name: 'receipt.png',
            thumbUrl: '',
            url: 'http://127.0.0.1:3000/rails/active_storage/file',
          },
        ],
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
      statusCode: 502,
    })
    expect(attachmentFetchFn).not.toHaveBeenCalled()
  })

  it('rejects IPv4-mapped private-network attachment URLs before upstream fetch', async () => {
    const attachmentFetchFn = vi.fn<typeof fetch>()
    const { service } = createService({
      attachmentAllowedOrigins: ['http://[::ffff:7f00:1]:3000'],
      attachmentFetchFn,
      message: createChatwootMessage({
        attachments: [
          {
            extension: 'png',
            fileSize: 2048,
            fileType: 'image',
            id: 91,
            messageId: 501,
            name: 'receipt.png',
            thumbUrl: '',
            url: 'http://[::ffff:127.0.0.1]:3000/rails/active_storage/file',
          },
        ],
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
      statusCode: 502,
    })
    expect(attachmentFetchFn).not.toHaveBeenCalled()
  })

  it('rejects unsafe upstream redirects before following them', async () => {
    const attachmentFetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        headers: {
          location: 'http://127.0.0.1:3000/private-file',
        },
        status: 302,
      }),
    )
    const { service } = createService({
      attachmentFetchFn,
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
    expect(attachmentFetchFn).toHaveBeenCalledTimes(1)
  })
})
