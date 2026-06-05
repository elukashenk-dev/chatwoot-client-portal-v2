import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  ChatwootClient,
  ChatwootMessage,
} from '../../integrations/chatwoot/client.js'
import type { ChatThreadContactRepository } from '../chat-threads/contactRepository.js'
import type { CurrentUserChatThreadContext } from '../chat-threads/types.js'
import { createChatMessagesService } from './service.js'

type ContactRepositoryStub = Pick<
  ChatThreadContactRepository,
  'findActivePortalUserContactLinkByUserId'
>
type FindContactById = ChatwootClient['findContactById']

const readyContext = {
  activeThread: {
    id: 'group:154',
    subtitle: 'Групповой чат',
    title: 'Бухгалтерия',
    type: 'group',
  },
  chatwootContactSourceId: 'portal-contact:source',
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
  attachmentAllowPrivateNetwork = false,
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
  contactRepository = {
    findActivePortalUserContactLinkByUserId: vi
      .fn<ContactRepositoryStub['findActivePortalUserContactLinkByUserId']>()
      .mockResolvedValue(null),
  },
  context = readyContext,
  findContactById = vi.fn<FindContactById>().mockResolvedValue({
    avatarUrl: 'https://chatwoot.test/rails/active_storage/group-avatar.png',
    email: 'office@example.test',
    id: 154,
    name: 'Бухгалтерия',
    phoneNumber: null,
  }),
  message = createChatwootMessage(),
}: {
  attachmentAllowedOrigins?: string[]
  attachmentAllowPrivateNetwork?: boolean
  attachmentFetchFn?: typeof fetch
  attachmentRequestTimeoutMs?: number
  contactRepository?: ContactRepositoryStub
  context?: CurrentUserChatThreadContext
  findContactById?: ReturnType<typeof vi.fn<FindContactById>>
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
    contactRepository,
    findContactById,
    findConversationMessageById,
    service: createChatMessagesService({
      attachmentAllowedOrigins,
      attachmentAllowPrivateNetwork,
      attachmentFetchFn,
      attachmentRequestTimeoutMs,
      chatMessagesRepository: null,
      contactRepository,
      chatThreadsRepository: {
        findSendLedgerAuthorsByMessageIds: vi.fn().mockResolvedValue(new Map()),
      },
      chatThreadsService,
      chatwootClient: {
        createConversationIncomingAttachmentMessage: vi.fn(),
        createConversationIncomingMessage: vi.fn(),
        findContactById,
        findConversationMessageById,
        findConversationMessageBySourceId: vi.fn(),
        listConversationMessages: vi.fn(),
        listConversationMessagesAfter: vi.fn(),
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

  it('streams an agent avatar through a backend-owned fetch', async () => {
    const { attachmentFetchFn, findConversationMessageById, service } =
      createService({
        message: createChatwootMessage({
          attachments: [],
          content: 'Agent reply',
          id: 502,
          sender: {
            avatarUrl: 'https://chatwoot.test/rails/active_storage/avatar.png',
            id: 8,
            name: 'Support',
            type: 'user',
          },
        }),
      })

    const result = await service.getCurrentUserChatMessageAvatar({
      messageId: 502,
      threadId: 'group:154',
      userId: 7,
    })

    expect(findConversationMessageById).toHaveBeenCalledWith(101, 502)
    expect(attachmentFetchFn).toHaveBeenCalledWith(
      'https://chatwoot.test/rails/active_storage/avatar.png',
      expect.any(Object),
    )
    expect(
      new Headers(vi.mocked(attachmentFetchFn).mock.calls[0]?.[1]?.headers).get(
        'accept-encoding',
      ),
    ).toBe('identity')
    expect(result.status).toBe(206)
    expect(result.headers.get('content-type')).toBe('image/png')
    await expect(new Response(result.body).text()).resolves.toBe('proxy-body')
  })

  it('streams a group thread avatar through a backend-owned fetch', async () => {
    const { attachmentFetchFn, findContactById, service } = createService()

    const result = await service.getCurrentUserThreadAvatar({
      threadId: 'group:154',
      userId: 7,
    })

    expect(findContactById).toHaveBeenCalledWith(154)
    expect(attachmentFetchFn).toHaveBeenCalledWith(
      'https://chatwoot.test/rails/active_storage/group-avatar.png',
      expect.any(Object),
    )
    expect(result.status).toBe(206)
    expect(result.headers.get('content-type')).toBe('image/png')
    await expect(new Response(result.body).text()).resolves.toBe('proxy-body')
  })

  it('streams a group participant avatar through a backend-owned fetch', async () => {
    const context = {
      ...readyContext,
      targetChatwootContactId: 154,
      threadType: 'group',
    } satisfies CurrentUserChatThreadContext
    const contactRepository = {
      findActivePortalUserContactLinkByUserId: vi.fn().mockResolvedValue({
        chatwootContactId: 55,
        userId: 8,
      }),
    }
    const findContactById = vi.fn(async (contactId: number) => {
      if (contactId === 55) {
        return {
          avatarUrl: 'https://chatwoot.test/rails/active_storage/maria.png',
          customAttributes: {
            portal_client_group_contact_ids: '154',
            portal_contact_type: 'person',
            portal_enabled: true,
          },
          email: 'maria@example.test',
          id: 55,
          name: 'Мария Соколова',
          phoneNumber: null,
        }
      }

      return null
    })
    const { attachmentFetchFn, service } = createService({
      contactRepository,
      context,
      findContactById,
    })

    const result = await service.getCurrentUserGroupParticipantAvatar({
      participantUserId: 8,
      threadId: 'group:154',
      userId: 7,
    })

    expect(
      contactRepository.findActivePortalUserContactLinkByUserId,
    ).toHaveBeenCalledWith(8)
    expect(findContactById).toHaveBeenCalledWith(55)
    expect(attachmentFetchFn).toHaveBeenCalledWith(
      'https://chatwoot.test/rails/active_storage/maria.png',
      expect.any(Object),
    )
    expect(result.status).toBe(206)
    expect(result.headers.get('content-type')).toBe('image/png')
    await expect(new Response(result.body).text()).resolves.toBe('proxy-body')
  })

  it('rejects group participant avatars for private threads', async () => {
    const contactRepository = {
      findActivePortalUserContactLinkByUserId: vi.fn().mockResolvedValue({
        chatwootContactId: 55,
        userId: 8,
      }),
    }
    const privateReadyContext = {
      ...readyContext,
      activeThread: {
        id: 'private:me',
        subtitle: 'Вы и поддержка',
        title: 'Личный чат',
        type: 'private',
      },
      linkedContactId: 44,
      targetChatwootContactId: 44,
      threadType: 'private',
    } satisfies CurrentUserChatThreadContext
    const { service } = createService({
      contactRepository,
      context: privateReadyContext,
    })

    await expect(
      service.getCurrentUserGroupParticipantAvatar({
        participantUserId: 8,
        threadId: 'private:me',
        userId: 7,
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects group participant avatars without an active participant link', async () => {
    const contactRepository = {
      findActivePortalUserContactLinkByUserId: vi.fn().mockResolvedValue(null),
    }
    const { service } = createService({ contactRepository })

    await expect(
      service.getCurrentUserGroupParticipantAvatar({
        participantUserId: 8,
        threadId: 'group:154',
        userId: 7,
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects group participant avatars when membership no longer includes the group', async () => {
    const contactRepository = {
      findActivePortalUserContactLinkByUserId: vi.fn().mockResolvedValue({
        chatwootContactId: 55,
        userId: 8,
      }),
    }
    const { findContactById, service } = createService({ contactRepository })
    findContactById.mockResolvedValueOnce({
      avatarUrl: 'https://chatwoot.test/rails/active_storage/maria.png',
      customAttributes: {
        portal_client_group_contact_ids: '',
        portal_contact_type: 'person',
        portal_enabled: true,
      },
      email: 'maria@example.test',
      id: 55,
      name: 'Мария Соколова',
      phoneNumber: null,
    })

    await expect(
      service.getCurrentUserGroupParticipantAvatar({
        participantUserId: 8,
        threadId: 'group:154',
        userId: 7,
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects group participant avatars when the participant has no avatar', async () => {
    const contactRepository = {
      findActivePortalUserContactLinkByUserId: vi.fn().mockResolvedValue({
        chatwootContactId: 55,
        userId: 8,
      }),
    }
    const { findContactById, service } = createService({ contactRepository })
    findContactById.mockResolvedValueOnce({
      avatarUrl: null,
      customAttributes: {
        portal_client_group_contact_ids: '154',
        portal_contact_type: 'person',
        portal_enabled: true,
      },
      email: 'maria@example.test',
      id: 55,
      name: 'Мария Соколова',
      phoneNumber: null,
    })

    await expect(
      service.getCurrentUserGroupParticipantAvatar({
        participantUserId: 8,
        threadId: 'group:154',
        userId: 7,
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('allows equivalent loopback attachment origins only when private-network proxying is enabled', async () => {
    const attachmentFetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('loopback-body', {
        headers: {
          'content-type': 'image/png',
        },
        status: 200,
      }),
    )
    const { service } = createService({
      attachmentAllowedOrigins: ['http://127.0.0.1:3000'],
      attachmentAllowPrivateNetwork: true,
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
            url: 'http://localhost:3000/rails/active_storage/file',
          },
        ],
      }),
    })

    const result = await service.getCurrentUserChatAttachment({
      attachmentId: 91,
      messageId: 501,
      threadId: 'group:154',
      userId: 7,
      variant: 'original',
    })

    expect(attachmentFetchFn).toHaveBeenCalledWith(
      'http://localhost:3000/rails/active_storage/file',
      expect.any(Object),
    )
    expect(result.status).toBe(200)
    await expect(new Response(result.body).text()).resolves.toBe(
      'loopback-body',
    )
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

  it('falls back to the original attachment when Chatwoot thumbnail fetch fails', async () => {
    const attachmentFetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('missing-thumb', {
          status: 502,
        }),
      )
      .mockResolvedValueOnce(
        new Response('original-body', {
          headers: {
            'content-type': 'image/png',
          },
          status: 200,
        }),
      )
    const { service } = createService({
      attachmentFetchFn,
    })

    const result = await service.getCurrentUserChatAttachment({
      attachmentId: 91,
      messageId: 501,
      threadId: 'group:154',
      userId: 7,
      variant: 'thumb',
    })

    expect(attachmentFetchFn).toHaveBeenNthCalledWith(
      1,
      'https://chatwoot.test/rails/active_storage/thumb',
      expect.any(Object),
    )
    expect(attachmentFetchFn).toHaveBeenNthCalledWith(
      2,
      'https://chatwoot.test/rails/active_storage/file',
      expect.any(Object),
    )
    expect(result.status).toBe(200)
    expect(result.headers.get('content-type')).toBe('image/png')
    await expect(new Response(result.body).text()).resolves.toBe(
      'original-body',
    )
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
