import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../lib/errors.js'
import type { ChatContextRepository } from '../chat-context/repository.js'
import { createChatThreadsService } from './service.js'

type ChatThreadsServiceOptions = Parameters<typeof createChatThreadsService>[0]

type ChatwootClientStub = ChatThreadsServiceOptions['chatwootClient'] & {
  createContactInbox: ReturnType<typeof vi.fn>
  createConversation: ReturnType<typeof vi.fn>
  findContactByEmail: ReturnType<typeof vi.fn>
  findContactById: ReturnType<typeof vi.fn>
  findContactPortalInboxSourceId: ReturnType<typeof vi.fn>
}

function createRepositoryStub(
  overrides: Partial<
    Pick<
      ChatContextRepository,
      'createContactLink' | 'findContactLinkByUserId' | 'findPortalUserById'
    >
  > = {},
): Pick<
  ChatContextRepository,
  'createContactLink' | 'findContactLinkByUserId' | 'findPortalUserById'
> {
  return {
    createContactLink: vi.fn().mockResolvedValue({
      chatwootContactId: 44,
      userId: 7,
    }),
    findContactLinkByUserId: vi.fn().mockResolvedValue({
      chatwootContactId: 44,
      userId: 7,
    }),
    findPortalUserById: vi.fn().mockResolvedValue({
      email: 'ivan@example.com',
      id: 7,
    }),
    ...overrides,
  }
}

function createChatwootClientStub({
  companyContactIds = '154',
  companyContactOverrides = {},
  overrides = {},
}: {
  companyContactIds?: string
  companyContactOverrides?: Record<string, unknown>
  overrides?: Partial<ChatThreadsServiceOptions['chatwootClient']>
} = {}): ChatwootClientStub {
  return {
    createContactInbox: vi.fn(),
    createConversation: vi.fn(),
    findContactByEmail: vi.fn(),
    findContactPortalInboxSourceId: vi.fn(),
    findContactById: vi.fn(async (contactId: number) => {
      if (contactId === 44) {
        return {
          customAttributes: {
            portal_client_company_contact_ids: companyContactIds,
            portal_contact_type: 'person',
            portal_enabled: true,
          },
          email: 'ivan@example.com',
          id: 44,
          name: 'Иван Петров',
        }
      }

      if (contactId === 154) {
        return {
          customAttributes: {
            portal_contact_type: 'company',
            portal_enabled: true,
          },
          email: 'office@romashka.ru',
          id: 154,
          name: 'ООО "Ромашка"',
          ...companyContactOverrides,
        }
      }

      return null
    }),
    ...overrides,
  } as ChatwootClientStub
}

function createChatThreadsPersistenceRepositoryStub() {
  let companyThread = {
    chatwootContactId: 154,
    chatwootConversationId: null as number | null,
    chatwootInboxId: 9,
    id: 2,
    portalUserId: null,
    threadType: 'company' as const,
  }
  let privateThread = {
    chatwootContactId: 44,
    chatwootConversationId: null as number | null,
    chatwootInboxId: 9,
    id: 1,
    portalUserId: 7,
    threadType: 'private' as const,
  }

  return {
    findThreadById: vi.fn(async (id: number) => {
      if (id === privateThread.id) {
        return privateThread
      }

      if (id === companyThread.id) {
        return companyThread
      }

      return null
    }),
    transactionWithThreadBootstrapLock: vi.fn(
      async <T>(_chatwootContactId: number, handler: () => Promise<T>) =>
        handler(),
    ),
    updateThreadConversation: vi.fn(async (input) => {
      if (input.id === privateThread.id) {
        privateThread = {
          ...privateThread,
          chatwootConversationId: input.chatwootConversationId,
          chatwootInboxId: input.chatwootInboxId,
        }

        return privateThread
      }

      if (input.id === companyThread.id) {
        companyThread = {
          ...companyThread,
          chatwootConversationId: input.chatwootConversationId,
          chatwootInboxId: input.chatwootInboxId,
        }

        return companyThread
      }

      return null
    }),
    upsertCompanyThread: vi.fn(async () => companyThread),
    upsertPrivateThread: vi.fn(async () => privateThread),
  }
}

function createService({
  chatThreadsRepository = createChatThreadsPersistenceRepositoryStub(),
  chatwootClient = createChatwootClientStub(),
  now = () => new Date('2026-05-15T10:00:00.000Z'),
  portalInboxId = 9,
  repository = createRepositoryStub(),
}: {
  chatThreadsRepository?: unknown
  chatwootClient?: ReturnType<typeof createChatwootClientStub>
  now?: () => Date
  portalInboxId?: number
  repository?: ReturnType<typeof createRepositoryStub>
} = {}) {
  return createChatThreadsService({
    chatContextRepository: repository,
    chatThreadsRepository:
      chatThreadsRepository as ChatThreadsServiceOptions['chatThreadsRepository'],
    chatwootClient:
      chatwootClient as ChatThreadsServiceOptions['chatwootClient'],
    now,
    portalInboxId,
  })
}

describe('createChatThreadsService', () => {
  it('returns a company thread context without creating a Chatwoot conversation for read-only empty state', async () => {
    const createConversation = vi.fn()
    const service = createService({
      chatwootClient: createChatwootClientStub({
        overrides: {
          createConversation,
        },
      }),
    })

    await expect(
      service.getCurrentUserThreadContext({
        threadId: 'company:154',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      activeThread: {
        id: 'company:154',
        title: 'ООО "Ромашка"',
        type: 'company',
      },
      chatwootConversation: null,
      reason: 'conversation_missing',
      result: 'not_ready',
      targetChatwootContactId: 154,
      threadType: 'company',
    })
    expect(createConversation).not.toHaveBeenCalled()
  })

  it('bootstraps a company conversation only for writable context', async () => {
    const now = new Date('2026-05-15T10:00:00.000Z')
    const createConversation = vi.fn().mockResolvedValue({
      assigneeName: null,
      channelType: 'Channel::Api',
      createdAt: 1_776_000_000,
      id: 301,
      inboxId: 9,
      lastActivityAt: 1_776_000_000,
      status: 'open',
    })
    const chatThreadsRepository = createChatThreadsPersistenceRepositoryStub()
    const service = createService({
      chatThreadsRepository,
      chatwootClient: createChatwootClientStub({
        overrides: {
          createContactInbox: vi.fn().mockResolvedValue({
            inboxId: 9,
            sourceId: 'portal-contact:generated',
          }),
          createConversation,
          findContactPortalInboxSourceId: vi.fn().mockResolvedValue(null),
        },
      }),
      now: () => now,
    })

    await expect(
      service.ensureCurrentUserWritableThreadContext({
        threadId: 'company:154',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      chatwootConversation: {
        id: 301,
      },
      reason: 'none',
      result: 'ready',
    })
    expect(createConversation).toHaveBeenCalledWith({
      contactId: 154,
      sourceId: 'portal-contact:generated',
    })
    expect(chatThreadsRepository.updateThreadConversation).toHaveBeenCalledWith(
      {
        chatwootConversationId: 301,
        chatwootInboxId: 9,
        id: 2,
        now,
      },
    )
  })

  it('serializes parallel company conversation bootstrap attempts for one thread', async () => {
    let persistedCompanyConversationId: number | null = null
    let lockQueue = Promise.resolve()
    const createConversation = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        setImmediate(resolve)
      })
      persistedCompanyConversationId = 301

      return {
        assigneeName: null,
        channelType: 'Channel::Api' as const,
        createdAt: 1_776_000_000,
        id: 301,
        inboxId: 9,
        lastActivityAt: 1_776_000_000,
        status: 'open',
      }
    })
    const chatThreadsRepository = {
      ...createChatThreadsPersistenceRepositoryStub(),
      findThreadById: vi.fn(async () => ({
        chatwootContactId: 154,
        chatwootConversationId: persistedCompanyConversationId,
        chatwootInboxId: 9,
        id: 2,
        portalUserId: null,
        threadType: 'company' as const,
      })),
      transactionWithThreadBootstrapLock: vi.fn(
        async <T>(_chatwootContactId: number, handler: () => Promise<T>) => {
          const previousLock = lockQueue
          let releaseLock!: () => void
          lockQueue = new Promise<void>((resolve) => {
            releaseLock = resolve
          })

          await previousLock

          try {
            return await handler()
          } finally {
            releaseLock()
          }
        },
      ),
      updateThreadConversation: vi.fn(async () => {
        persistedCompanyConversationId = 301

        return {
          chatwootContactId: 154,
          chatwootConversationId: 301,
          chatwootInboxId: 9,
          id: 2,
          portalUserId: null,
          threadType: 'company' as const,
        }
      }),
      upsertCompanyThread: vi.fn(async () => ({
        chatwootContactId: 154,
        chatwootConversationId: persistedCompanyConversationId,
        chatwootInboxId: 9,
        id: 2,
        portalUserId: null,
        threadType: 'company' as const,
      })),
    }
    const service = createService({
      chatThreadsRepository,
      chatwootClient: createChatwootClientStub({
        overrides: {
          createContactInbox: vi.fn().mockResolvedValue({
            inboxId: 9,
            sourceId: 'portal-contact:generated',
          }),
          createConversation,
          findContactPortalInboxSourceId: vi.fn().mockResolvedValue(null),
        },
      }),
    })

    await Promise.all([
      service.ensureCurrentUserWritableThreadContext({
        threadId: 'company:154',
        userId: 7,
      }),
      service.ensureCurrentUserWritableThreadContext({
        threadId: 'company:154',
        userId: 8,
      }),
    ])

    expect(
      chatThreadsRepository.transactionWithThreadBootstrapLock,
    ).toHaveBeenCalledTimes(2)
    expect(createConversation).toHaveBeenCalledTimes(1)
    expect(
      chatThreadsRepository.updateThreadConversation,
    ).toHaveBeenCalledTimes(1)
  })

  it('fails closed for a forged company thread not listed on the current person contact', async () => {
    const createConversation = vi.fn()
    const chatThreadsRepository = createChatThreadsPersistenceRepositoryStub()
    const service = createService({
      chatThreadsRepository,
      chatwootClient: createChatwootClientStub({
        companyContactIds: '203',
        overrides: {
          createConversation,
        },
      }),
    })

    await expect(
      service.getCurrentUserThreadContext({
        threadId: 'company:154',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      activeThread: null,
      chatwootConversation: null,
      reason: 'thread_access_denied',
      result: 'not_ready',
    })
    expect(createConversation).not.toHaveBeenCalled()
    expect(chatThreadsRepository.upsertCompanyThread).not.toHaveBeenCalled()
  })

  it('fails closed for malformed public thread IDs', async () => {
    const createConversation = vi.fn()
    const chatThreadsRepository = createChatThreadsPersistenceRepositoryStub()
    const service = createService({
      chatThreadsRepository,
      chatwootClient: createChatwootClientStub({
        overrides: {
          createConversation,
        },
      }),
    })

    await expect(
      service.getCurrentUserThreadContext({
        threadId: 'company:not-a-number',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      activeThread: null,
      chatwootConversation: null,
      reason: 'thread_invalid',
      result: 'not_ready',
    })
    expect(createConversation).not.toHaveBeenCalled()
    expect(chatThreadsRepository.upsertCompanyThread).not.toHaveBeenCalled()
  })

  it('persists private and company thread records while listing available threads', async () => {
    const now = new Date('2026-05-15T10:00:00.000Z')
    const chatThreadsRepository = createChatThreadsPersistenceRepositoryStub()
    const service = createService({
      chatThreadsRepository,
      now: () => now,
    })

    await service.listCurrentUserThreads({ userId: 7 })

    expect(chatThreadsRepository.upsertPrivateThread).toHaveBeenCalledWith({
      chatwootContactId: 44,
      chatwootInboxId: 9,
      now,
      userId: 7,
    })
    expect(chatThreadsRepository.upsertCompanyThread).toHaveBeenCalledWith({
      chatwootContactId: 154,
      chatwootInboxId: 9,
      now,
    })
  })

  it('returns private thread plus enabled company threads from person attributes', async () => {
    const service = createService()

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).resolves.toEqual({
      activeThreadId: 'private:me',
      threads: [
        {
          id: 'private:me',
          subtitle: 'Только вы и поддержка',
          title: 'Личный чат',
          type: 'private',
        },
        {
          id: 'company:154',
          subtitle: 'Общий чат компании',
          title: 'ООО "Ромашка"',
          type: 'company',
        },
      ],
    })
  })

  it('deduplicates company IDs before looking up company contacts', async () => {
    const chatwootClient = createChatwootClientStub({
      companyContactIds: '154, 154,154',
    })
    const service = createService({ chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).resolves.toEqual({
      activeThreadId: 'private:me',
      threads: [
        expect.objectContaining({
          id: 'private:me',
        }),
        expect.objectContaining({
          id: 'company:154',
        }),
      ],
    })
    expect(chatwootClient.findContactById).toHaveBeenCalledTimes(2)
    expect(chatwootClient.findContactById).toHaveBeenNthCalledWith(1, 44)
    expect(chatwootClient.findContactById).toHaveBeenNthCalledWith(2, 154)
  })

  it('fails closed before company lookups when the membership list is oversized', async () => {
    const chatwootClient = createChatwootClientStub({
      companyContactIds: Array.from({ length: 21 }, (_, index) =>
        String(index + 1),
      ).join(','),
    })
    const service = createService({ chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_client_company_contact_ids_invalid',
      statusCode: 403,
    })
    expect(chatwootClient.findContactById).toHaveBeenCalledTimes(1)
    expect(chatwootClient.findContactById).toHaveBeenCalledWith(44)
  })

  it('fails closed when a referenced company contact is missing', async () => {
    const chatwootClient = createChatwootClientStub({
      companyContactIds: '999',
    })
    const service = createService({ chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_company_contact_missing',
      statusCode: 403,
    })
  })

  it('fails closed when a referenced company contact has the wrong type', async () => {
    const chatwootClient = createChatwootClientStub({
      companyContactOverrides: {
        customAttributes: {
          portal_contact_type: 'person',
          portal_enabled: true,
        },
      },
    })
    const service = createService({ chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_company_contact_type_invalid',
      statusCode: 403,
    })
  })

  it('fails closed when a referenced company contact is disabled', async () => {
    const chatwootClient = createChatwootClientStub({
      companyContactOverrides: {
        customAttributes: {
          portal_contact_type: 'company',
          portal_enabled: false,
        },
      },
    })
    const service = createService({ chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_company_contact_disabled',
      statusCode: 403,
    })
  })

  it('fails closed before company lookups when the current person contact is disabled', async () => {
    const chatwootClient = createChatwootClientStub({
      companyContactIds: '154',
    })

    chatwootClient.findContactById.mockImplementation(async (contactId) => {
      if (contactId === 44) {
        return {
          customAttributes: {
            portal_client_company_contact_ids: '154',
            portal_contact_type: 'person',
            portal_enabled: false,
          },
          email: 'ivan@example.com',
          id: 44,
          name: 'Иван Петров',
        }
      }

      return null
    })
    const service = createService({ chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_contact_disabled',
      statusCode: 403,
    })
    expect(chatwootClient.findContactById).toHaveBeenCalledTimes(1)
    expect(chatwootClient.findContactById).toHaveBeenCalledWith(44)
  })

  it('fails closed before company lookups when the current contact is not a person', async () => {
    const chatwootClient = createChatwootClientStub({
      companyContactIds: '154',
    })

    chatwootClient.findContactById.mockImplementation(async (contactId) => {
      if (contactId === 44) {
        return {
          customAttributes: {
            portal_client_company_contact_ids: '154',
            portal_contact_type: 'company',
            portal_enabled: true,
          },
          email: 'office@romashka.ru',
          id: 44,
          name: 'ООО "Ромашка"',
        }
      }

      return null
    })
    const service = createService({ chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_contact_type_invalid',
      statusCode: 403,
    })
    expect(chatwootClient.findContactById).toHaveBeenCalledTimes(1)
    expect(chatwootClient.findContactById).toHaveBeenCalledWith(44)
  })

  it('keeps the private thread available even when no company memberships are configured', async () => {
    const service = createService({
      chatwootClient: createChatwootClientStub({
        companyContactIds: '',
      }),
    })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).resolves.toEqual({
      activeThreadId: 'private:me',
      threads: [
        {
          id: 'private:me',
          subtitle: 'Только вы и поддержка',
          title: 'Личный чат',
          type: 'private',
        },
      ],
    })
  })

  it('uses email lookup and persists a contact link when a portal link does not exist yet', async () => {
    const repository = createRepositoryStub({
      createContactLink: vi.fn().mockResolvedValue({
        chatwootContactId: 44,
        userId: 7,
      }),
      findContactLinkByUserId: vi.fn().mockResolvedValue(null),
    })
    const chatwootClient = createChatwootClientStub()

    chatwootClient.findContactByEmail.mockResolvedValue({
      email: 'ivan@example.com',
      id: 44,
      name: 'Иван Петров',
    })
    const service = createService({ chatwootClient, repository })

    await service.listCurrentUserThreads({ userId: 7 })

    expect(chatwootClient.findContactByEmail).toHaveBeenCalledWith(
      'ivan@example.com',
    )
    expect(repository.createContactLink).toHaveBeenCalledWith({
      chatwootContactId: 44,
      userId: 7,
    })
  })

  it('returns a controlled error when the person contact is missing', async () => {
    const repository = createRepositoryStub({
      findContactLinkByUserId: vi.fn().mockResolvedValue(null),
    })
    const chatwootClient = createChatwootClientStub()

    chatwootClient.findContactByEmail.mockResolvedValue(null)
    const service = createService({ chatwootClient, repository })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_contact_missing',
      statusCode: 403,
    })
  })

  it('surfaces configuration ApiErrors without wrapping them', async () => {
    const service = createService({
      chatwootClient: createChatwootClientStub({
        companyContactIds: 'bad',
      }),
    })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toBeInstanceOf(ApiError)
  })
})
