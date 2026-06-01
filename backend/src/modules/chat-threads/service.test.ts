import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../lib/errors.js'
import {
  createChatThreadsPersistenceRepositoryStub,
  createChatwootClientStub,
  createRepositoryStub,
  createService,
  type CountUnreadByThread,
} from './service.testSupport.js'

describe('createChatThreadsService', () => {
  it('returns a group thread context without creating a Chatwoot conversation for read-only empty state', async () => {
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
        threadId: 'group:154',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      activeThread: {
        id: 'group:154',
        title: 'ООО "Ромашка"',
        type: 'group',
      },
      chatwootConversation: null,
      reason: 'conversation_missing',
      result: 'not_ready',
      targetChatwootContactId: 154,
      threadType: 'group',
    })
    expect(createConversation).not.toHaveBeenCalled()
  })

  it('bootstraps a group conversation only for writable context', async () => {
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
        threadId: 'group:154',
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

  it('does not reuse previous Chatwoot conversations during normal writable bootstrap', async () => {
    const now = new Date('2026-05-15T10:00:00.000Z')
    const createConversation = vi.fn().mockResolvedValue({
      assigneeName: null,
      channelType: 'Channel::Api',
      createdAt: 1_776_000_000,
      id: 304,
      inboxId: 9,
      lastActivityAt: 1_776_000_000,
      status: 'open',
    })
    const listContactConversations = vi.fn().mockResolvedValue([
      {
        assigneeName: 'Анна Смирнова',
        channelType: 'Channel::Api',
        createdAt: 1_775_000_000,
        id: 303,
        inboxId: 9,
        lastActivityAt: 1_775_000_100,
        status: 'open',
      },
    ])
    const chatThreadsRepository = createChatThreadsPersistenceRepositoryStub()
    const service = createService({
      chatThreadsRepository,
      chatwootClient: createChatwootClientStub({
        overrides: {
          createConversation,
          findContactPortalInboxSourceId: vi
            .fn()
            .mockResolvedValue('portal-contact:existing'),
          listContactConversations,
        },
      }),
      now: () => now,
    })

    await expect(
      service.ensureCurrentUserWritableThreadContext({
        threadId: 'group:154',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      chatwootConversation: {
        id: 304,
      },
      reason: 'none',
      result: 'ready',
    })
    expect(listContactConversations).not.toHaveBeenCalled()
    expect(createConversation).toHaveBeenCalledWith({
      contactId: 154,
      sourceId: 'portal-contact:existing',
    })
    expect(chatThreadsRepository.updateThreadConversation).toHaveBeenCalledWith(
      {
        chatwootConversationId: 304,
        chatwootInboxId: 9,
        id: 2,
        now,
      },
    )
  })

  it('bootstraps a replacement private conversation when the mapped Chatwoot conversation was deleted', async () => {
    const now = new Date('2026-05-15T10:00:00.000Z')
    const createConversation = vi.fn().mockResolvedValue({
      assigneeName: null,
      channelType: 'Channel::Api',
      createdAt: 1_776_000_000,
      id: 302,
      inboxId: 9,
      lastActivityAt: 1_776_000_000,
      status: 'open',
    })
    const chatThreadsRepository = createChatThreadsPersistenceRepositoryStub({
      initialPrivateConversationId: 101,
    })
    const service = createService({
      chatThreadsRepository,
      chatwootClient: createChatwootClientStub({
        overrides: {
          createConversation,
          findContactPortalInboxSourceId: vi
            .fn()
            .mockResolvedValue('portal-contact:existing'),
        },
      }),
      now: () => now,
    })

    await expect(
      service.recoverCurrentUserWritableThreadContext({
        staleConversationId: 101,
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      chatwootConversation: {
        id: 302,
      },
      reason: 'none',
      result: 'ready',
    })
    expect(createConversation).toHaveBeenCalledWith({
      contactId: 44,
      sourceId: 'portal-contact:existing',
    })
    expect(chatThreadsRepository.updateThreadConversation).toHaveBeenCalledWith(
      {
        chatwootConversationId: 302,
        chatwootInboxId: 9,
        id: 1,
        now,
      },
    )
  })

  it('does not reuse previous Chatwoot conversations while recovering a stale mapping', async () => {
    const now = new Date('2026-05-15T10:00:00.000Z')
    const createConversation = vi.fn().mockResolvedValue({
      assigneeName: null,
      channelType: 'Channel::Api',
      createdAt: 1_776_000_000,
      id: 304,
      inboxId: 9,
      lastActivityAt: 1_776_000_000,
      status: 'open',
    })
    const listContactConversations = vi.fn().mockResolvedValue([
      {
        assigneeName: 'Анна Смирнова',
        channelType: 'Channel::Api',
        createdAt: 1_776_000_000,
        id: 303,
        inboxId: 9,
        lastActivityAt: 1_776_000_100,
        status: 'open',
      },
    ])
    const chatThreadsRepository = createChatThreadsPersistenceRepositoryStub({
      initialGroupConversationId: 101,
    })
    const service = createService({
      chatThreadsRepository,
      chatwootClient: createChatwootClientStub({
        overrides: {
          createConversation,
          findContactPortalInboxSourceId: vi
            .fn()
            .mockResolvedValue('portal-contact:existing'),
          listContactConversations,
        },
      }),
      now: () => now,
    })

    await expect(
      service.recoverCurrentUserWritableThreadContext({
        staleConversationId: 101,
        threadId: 'group:154',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      chatwootConversation: {
        id: 304,
      },
      reason: 'none',
      result: 'ready',
    })
    expect(listContactConversations).not.toHaveBeenCalled()
    expect(createConversation).toHaveBeenCalledWith({
      contactId: 154,
      sourceId: 'portal-contact:existing',
    })
    expect(chatThreadsRepository.updateThreadConversation).toHaveBeenCalledWith(
      {
        chatwootConversationId: 304,
        chatwootInboxId: 9,
        id: 2,
        now,
      },
    )
  })

  it('serializes parallel group conversation bootstrap attempts for one thread', async () => {
    let persistedGroupConversationId: number | null = null
    let lockQueue = Promise.resolve()
    const createConversation = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        setImmediate(resolve)
      })
      persistedGroupConversationId = 301

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
        chatwootConversationId: persistedGroupConversationId,
        chatwootInboxId: 9,
        id: 2,
        portalUserId: null,
        threadType: 'group' as const,
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
        persistedGroupConversationId = 301

        return {
          chatwootContactId: 154,
          chatwootConversationId: 301,
          chatwootInboxId: 9,
          id: 2,
          portalUserId: null,
          threadType: 'group' as const,
        }
      }),
      upsertGroupThread: vi.fn(async () => ({
        chatwootContactId: 154,
        chatwootConversationId: persistedGroupConversationId,
        chatwootInboxId: 9,
        id: 2,
        portalUserId: null,
        threadType: 'group' as const,
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
        threadId: 'group:154',
        userId: 7,
      }),
      service.ensureCurrentUserWritableThreadContext({
        threadId: 'group:154',
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

  it('fails closed for a forged group thread not listed on the current person contact', async () => {
    const createConversation = vi.fn()
    const chatThreadsRepository = createChatThreadsPersistenceRepositoryStub()
    const service = createService({
      chatThreadsRepository,
      chatwootClient: createChatwootClientStub({
        groupContactIds: '203',
        overrides: {
          createConversation,
        },
      }),
    })

    await expect(
      service.getCurrentUserThreadContext({
        threadId: 'group:154',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      activeThread: null,
      chatwootConversation: null,
      reason: 'thread_access_denied',
      result: 'not_ready',
    })
    expect(createConversation).not.toHaveBeenCalled()
    expect(chatThreadsRepository.upsertGroupThread).not.toHaveBeenCalled()
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
        threadId: 'group:not-a-number',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      activeThread: null,
      chatwootConversation: null,
      reason: 'thread_invalid',
      result: 'not_ready',
    })
    expect(createConversation).not.toHaveBeenCalled()
    expect(chatThreadsRepository.upsertGroupThread).not.toHaveBeenCalled()
  })

  it('persists private and group thread records while listing available threads', async () => {
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
    expect(chatThreadsRepository.upsertGroupThread).toHaveBeenCalledWith({
      chatwootContactId: 154,
      chatwootInboxId: 9,
      now,
    })
  })

  it('returns private thread plus enabled group threads from person attributes', async () => {
    const service = createService()

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).resolves.toEqual({
      activeThreadId: 'private:me',
      threads: [
        {
          avatarUrl: '/api/tenant/icons/icon-192.png',
          id: 'private:me',
          subtitle: 'Вы и поддержка',
          title: 'Личный чат',
          type: 'private',
          unreadCount: 0,
        },
        {
          avatarUrl: null,
          id: 'group:154',
          subtitle: 'Групповой чат',
          title: 'ООО "Ромашка"',
          type: 'group',
          unreadCount: 0,
        },
      ],
      totalUnreadCount: 0,
    })
  })

  it('adds unread counts and totals only for visible threads while listing threads', async () => {
    const countUnreadByThread = vi.fn<CountUnreadByThread>().mockResolvedValue(
      new Map([
        ['private:me', 2],
        ['group:154', 3],
        ['group:203', 99],
      ]),
    )
    const service = createService({
      chatUnreadService: {
        countUnreadByThread,
      },
      chatwootClient: createChatwootClientStub({
        groupContactIds: '154,203',
      }),
    })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).resolves.toEqual({
      activeThreadId: 'private:me',
      threads: [
        expect.objectContaining({
          id: 'private:me',
          unreadCount: 2,
        }),
        expect.objectContaining({
          id: 'group:154',
          unreadCount: 3,
        }),
      ],
      totalUnreadCount: 5,
    })
    expect(countUnreadByThread).toHaveBeenCalledWith({
      portalUserId: 7,
      threadIds: ['private:me', 'group:154'],
    })
  })

  it('deduplicates group IDs before looking up group contacts', async () => {
    const chatwootClient = createChatwootClientStub({
      groupContactIds: '154, 154,154',
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
          id: 'group:154',
        }),
      ],
      totalUnreadCount: 0,
    })
    expect(chatwootClient.findContactById).toHaveBeenCalledTimes(2)
    expect(chatwootClient.findContactById).toHaveBeenNthCalledWith(1, 44)
    expect(chatwootClient.findContactById).toHaveBeenNthCalledWith(2, 154)
  })

  it('keeps valid chats available when one referenced group is disabled while listing threads', async () => {
    const chatwootClient = createChatwootClientStub({
      groupContactIds: '154,203',
    })

    chatwootClient.findContactById.mockImplementation(async (contactId) => {
      if (contactId === 44) {
        return {
          customAttributes: {
            portal_client_group_contact_ids: '154,203',
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
            portal_contact_type: 'group',
            portal_enabled: true,
          },
          email: 'office@romashka.ru',
          id: 154,
          name: 'ООО "Ромашка"',
        }
      }

      if (contactId === 203) {
        return {
          customAttributes: {
            portal_contact_type: 'group',
            portal_enabled: false,
          },
          email: 'disabled@romashka.ru',
          id: 203,
          name: 'Отключенная группа',
        }
      }

      return null
    })

    const chatThreadsRepository = createChatThreadsPersistenceRepositoryStub()
    const service = createService({ chatThreadsRepository, chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).resolves.toEqual({
      activeThreadId: 'private:me',
      threads: [
        expect.objectContaining({
          id: 'private:me',
        }),
        expect.objectContaining({
          id: 'group:154',
        }),
      ],
      totalUnreadCount: 0,
    })
    expect(chatThreadsRepository.upsertGroupThread).toHaveBeenCalledTimes(1)
    expect(chatThreadsRepository.upsertGroupThread).toHaveBeenCalledWith({
      chatwootContactId: 154,
      chatwootInboxId: 9,
      now: new Date('2026-05-15T10:00:00.000Z'),
    })
  })

  it('fails closed before group lookups when the membership list is oversized', async () => {
    const chatwootClient = createChatwootClientStub({
      groupContactIds: Array.from({ length: 21 }, (_, index) =>
        String(index + 1),
      ).join(','),
    })
    const service = createService({ chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_client_group_contact_ids_invalid',
      statusCode: 403,
    })
    expect(chatwootClient.findContactById).toHaveBeenCalledTimes(1)
    expect(chatwootClient.findContactById).toHaveBeenCalledWith(44)
  })

  it('omits a referenced group contact that is missing while listing threads', async () => {
    const chatwootClient = createChatwootClientStub({
      groupContactIds: '999',
    })
    const chatThreadsRepository = createChatThreadsPersistenceRepositoryStub()
    const service = createService({ chatThreadsRepository, chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).resolves.toEqual({
      activeThreadId: 'private:me',
      threads: [
        expect.objectContaining({
          id: 'private:me',
        }),
      ],
      totalUnreadCount: 0,
    })
    expect(chatThreadsRepository.upsertGroupThread).not.toHaveBeenCalled()
  })

  it('omits a referenced group contact that has the wrong type while listing threads', async () => {
    const chatwootClient = createChatwootClientStub({
      groupContactOverrides: {
        customAttributes: {
          portal_contact_type: 'person',
          portal_enabled: true,
        },
      },
    })
    const chatThreadsRepository = createChatThreadsPersistenceRepositoryStub()
    const service = createService({ chatThreadsRepository, chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).resolves.toEqual({
      activeThreadId: 'private:me',
      threads: [
        expect.objectContaining({
          id: 'private:me',
        }),
      ],
      totalUnreadCount: 0,
    })
    expect(chatThreadsRepository.upsertGroupThread).not.toHaveBeenCalled()
  })

  it('omits a referenced group contact that is disabled while listing threads', async () => {
    const chatwootClient = createChatwootClientStub({
      groupContactOverrides: {
        customAttributes: {
          portal_contact_type: 'group',
          portal_enabled: false,
        },
      },
    })
    const chatThreadsRepository = createChatThreadsPersistenceRepositoryStub()
    const service = createService({ chatThreadsRepository, chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).resolves.toEqual({
      activeThreadId: 'private:me',
      threads: [
        expect.objectContaining({
          id: 'private:me',
        }),
      ],
      totalUnreadCount: 0,
    })
    expect(chatThreadsRepository.upsertGroupThread).not.toHaveBeenCalled()
  })

  it('omits a referenced group contact with missing portal attributes while listing threads', async () => {
    const chatwootClient = createChatwootClientStub({
      groupContactOverrides: {
        customAttributes: {},
      },
    })
    const chatThreadsRepository = createChatThreadsPersistenceRepositoryStub()
    const service = createService({ chatThreadsRepository, chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).resolves.toEqual({
      activeThreadId: 'private:me',
      threads: [
        expect.objectContaining({
          id: 'private:me',
        }),
      ],
      totalUnreadCount: 0,
    })
    expect(chatThreadsRepository.upsertGroupThread).not.toHaveBeenCalled()
  })

  it('still fails closed when directly opening a disabled group thread', async () => {
    const chatwootClient = createChatwootClientStub({
      groupContactOverrides: {
        customAttributes: {
          portal_contact_type: 'group',
          portal_enabled: false,
        },
      },
    })
    const chatThreadsRepository = createChatThreadsPersistenceRepositoryStub()
    const service = createService({ chatThreadsRepository, chatwootClient })

    await expect(
      service.getCurrentUserThreadContext({
        threadId: 'group:154',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      activeThread: null,
      chatwootConversation: null,
      reason: 'thread_access_denied',
      result: 'not_ready',
    })
    expect(chatThreadsRepository.upsertGroupThread).not.toHaveBeenCalled()
  })

  it('fails closed before group lookups when the current person contact is disabled', async () => {
    const chatwootClient = createChatwootClientStub({
      groupContactIds: '154',
    })

    chatwootClient.findContactById.mockImplementation(async (contactId) => {
      if (contactId === 44) {
        return {
          customAttributes: {
            portal_client_group_contact_ids: '154',
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

  it('fails closed before group lookups when the current contact is not a person', async () => {
    const chatwootClient = createChatwootClientStub({
      groupContactIds: '154',
    })

    chatwootClient.findContactById.mockImplementation(async (contactId) => {
      if (contactId === 44) {
        return {
          customAttributes: {
            portal_client_group_contact_ids: '154',
            portal_contact_type: 'group',
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

  it('keeps the private thread available even when no group memberships are configured', async () => {
    const service = createService({
      chatwootClient: createChatwootClientStub({
        groupContactIds: '',
      }),
    })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).resolves.toEqual({
      activeThreadId: 'private:me',
      threads: [
        {
          avatarUrl: '/api/tenant/icons/icon-192.png',
          id: 'private:me',
          subtitle: 'Вы и поддержка',
          title: 'Личный чат',
          type: 'private',
          unreadCount: 0,
        },
      ],
      totalUnreadCount: 0,
    })
  })

  it('returns portal-owned avatar URLs for private and group threads', async () => {
    const service = createService({
      chatwootClient: createChatwootClientStub({
        groupContactOverrides: {
          avatarUrl: 'https://chatwoot.test/rails/active_storage/group.png',
        },
      }),
    })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).resolves.toEqual({
      activeThreadId: 'private:me',
      threads: [
        {
          avatarUrl: '/api/tenant/icons/icon-192.png',
          id: 'private:me',
          subtitle: 'Вы и поддержка',
          title: 'Личный чат',
          type: 'private',
          unreadCount: 0,
        },
        {
          avatarUrl: '/api/chat/threads/group%3A154/avatar',
          id: 'group:154',
          subtitle: 'Групповой чат',
          title: 'ООО "Ромашка"',
          type: 'group',
          unreadCount: 0,
        },
      ],
      totalUnreadCount: 0,
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
        groupContactIds: 'bad',
      }),
    })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toBeInstanceOf(ApiError)
  })
})
