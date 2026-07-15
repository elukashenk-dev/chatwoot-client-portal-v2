import { describe, expect, it, vi } from 'vitest'

import type { ChatThreadContactRepository } from './contactRepository.js'
import { createChatThreadsService } from './service.js'

type ChatThreadsServiceOptions = Parameters<typeof createChatThreadsService>[0]

type ChatwootClientStub = ChatThreadsServiceOptions['chatwootClient'] & {
  createConversation: ReturnType<typeof vi.fn>
  findContactById: ReturnType<typeof vi.fn>
  listContactConversations: ReturnType<typeof vi.fn>
}

function createRepositoryStub(
  overrides: Partial<
    Pick<
      ChatThreadContactRepository,
      | 'createContactLink'
      | 'findContactLinkByUserId'
      | 'findPortalUserById'
      | 'listActivePortalUserContactLinks'
    >
  > = {},
): Pick<
  ChatThreadContactRepository,
  | 'createContactLink'
  | 'findContactLinkByUserId'
  | 'findPortalUserById'
  | 'listActivePortalUserContactLinks'
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
    listActivePortalUserContactLinks: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

function createChatwootClientStub({
  overrides = {},
}: {
  overrides?: Partial<ChatwootClientStub>
} = {}): ChatwootClientStub {
  return {
    createContactInbox: vi.fn(),
    createConversation: vi.fn(),
    findContactByEmail: vi.fn(),
    findContactPortalInboxSourceId: vi.fn(),
    listContactConversations: vi.fn().mockResolvedValue([]),
    findContactById: vi.fn(async (contactId: number) => {
      if (contactId === 44) {
        return {
          customAttributes: {
            portal_client_group_contact_ids: '154',
            portal_enabled: true,
          },
          email: 'ivan@example.com',
          id: 44,
          name: 'Иван Петров',
          phoneNumber: null,
        }
      }

      if (contactId === 154) {
        return {
          customAttributes: {
            portal_enabled: true,
            portal_is_group: true,
          },
          email: 'office@romashka.ru',
          id: 154,
          name: 'ООО "Ромашка"',
          phoneNumber: null,
        }
      }

      return null
    }),
    ...overrides,
  } as ChatwootClientStub
}

function createChatThreadsPersistenceRepositoryStub({
  initialGroupConversationId = null,
  initialPrivateConversationId = null,
}: {
  initialGroupConversationId?: number | null
  initialPrivateConversationId?: number | null
} = {}) {
  return {
    findThreadById: vi.fn(async (id: number) => {
      if (id === 1) {
        return {
          chatwootContactId: 44,
          chatwootConversationId: initialPrivateConversationId,
          chatwootInboxId: 9,
          id: 1,
          portalUserId: 7,
          threadType: 'private' as const,
        }
      }

      if (id === 2) {
        return {
          chatwootContactId: 154,
          chatwootConversationId: initialGroupConversationId,
          chatwootInboxId: 9,
          id: 2,
          portalUserId: null,
          threadType: 'group' as const,
        }
      }

      return null
    }),
    transactionWithThreadBootstrapLock: vi.fn(
      async <T>(_chatwootContactId: number, handler: () => Promise<T>) =>
        handler(),
    ),
    updateThreadConversation: vi.fn(),
    upsertGroupThread: vi.fn(async () => ({
      chatwootContactId: 154,
      chatwootConversationId: initialGroupConversationId,
      chatwootInboxId: 9,
      id: 2,
      portalUserId: null,
      threadType: 'group' as const,
    })),
    upsertPrivateThread: vi.fn(async () => ({
      chatwootContactId: 44,
      chatwootConversationId: initialPrivateConversationId,
      chatwootInboxId: 9,
      id: 1,
      portalUserId: 7,
      threadType: 'private' as const,
    })),
  }
}

function createService({
  chatThreadsRepository = createChatThreadsPersistenceRepositoryStub(),
  chatwootClient = createChatwootClientStub(),
  repository = createRepositoryStub(),
}: {
  chatThreadsRepository?: unknown
  chatwootClient?: ReturnType<typeof createChatwootClientStub>
  repository?: ReturnType<typeof createRepositoryStub>
} = {}) {
  return createChatThreadsService({
    contactRepository: repository,
    chatThreadsRepository:
      chatThreadsRepository as ChatThreadsServiceOptions['chatThreadsRepository'],
    chatwootClient:
      chatwootClient as ChatThreadsServiceOptions['chatwootClient'],
    portalInboxId: 9,
    supportLabel: 'Команда ProvGroup',
  })
}

describe('chat thread info service', () => {
  it('returns private chat info with person curator and no participants', async () => {
    const chatwootClient = createChatwootClientStub({
      overrides: {
        findContactById: vi.fn(async (contactId: number) =>
          contactId === 44
            ? {
                customAttributes: {
                  curator_name: 'Анна Маттина',
                  portal_client_group_contact_ids: '',
                  portal_enabled: true,
                },
                email: 'ivan@example.com',
                id: 44,
                name: 'Иван Петров',
                phoneNumber: null,
              }
            : null,
        ),
        listContactConversations: vi.fn().mockResolvedValue([
          {
            assigneeName: null,
            channelType: 'Channel::Api',
            createdAt: 1_779_182_400,
            id: 101,
            inboxId: 9,
            lastActivityAt: 1_779_186_000,
            status: 'open',
          },
        ]),
      },
    })
    const service = createService({
      chatThreadsRepository: createChatThreadsPersistenceRepositoryStub({
        initialPrivateConversationId: 101,
      }),
      chatwootClient,
    })

    await expect(
      service.getCurrentUserThreadInfo({
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      curatorName: 'Анна Маттина',
      lastActivityAt: '2026-05-19T10:20:00.000Z',
      participants: [],
      result: 'ready',
      startedAt: '2026-05-19T09:20:00.000Z',
      supportLabel: 'Команда ProvGroup',
      threadTypeLabel: 'Личный',
    })
    expect(chatwootClient.listContactConversations).toHaveBeenCalledWith(44)
    expect(chatwootClient.createConversation).not.toHaveBeenCalled()
  })

  it('returns group participants only for active portal users with current group access', async () => {
    const contactsById = new Map([
      [
        44,
        {
          avatarUrl: 'https://chatwoot.test/rails/active_storage/ivan.png',
          customAttributes: {
            portal_client_group_contact_ids: '154',
            portal_enabled: true,
          },
          email: 'ivan@example.test',
          id: 44,
          name: 'Иван Петров',
          phoneNumber: null,
        },
      ],
      [
        55,
        {
          avatarUrl: 'https://chatwoot.test/rails/active_storage/maria.png',
          customAttributes: {
            portal_client_group_contact_ids: '154',
            portal_enabled: true,
          },
          email: 'maria@example.test',
          id: 55,
          name: 'Мария Соколова',
          phoneNumber: null,
        },
      ],
      [
        66,
        {
          customAttributes: {
            portal_client_group_contact_ids: '',
            portal_enabled: true,
          },
          email: 'denied@example.test',
          id: 66,
          name: 'Нет доступа',
          phoneNumber: null,
        },
      ],
      [
        77,
        {
          customAttributes: {
            portal_client_group_contact_ids: '154',
            portal_enabled: true,
          },
          email: 'petr@example.test',
          id: 77,
          name: 'Петр Без Фото',
          phoneNumber: null,
        },
      ],
      [
        154,
        {
          customAttributes: {
            curator_name: 'Анна Маттина',
            portal_enabled: true,
            portal_is_group: true,
          },
          email: 'office@romashka.test',
          id: 154,
          name: 'ООО "Ромашка"',
          phoneNumber: null,
        },
      ],
    ])
    const chatwootClient = createChatwootClientStub({
      overrides: {
        findContactById: vi.fn(
          async (contactId: number) => contactsById.get(contactId) ?? null,
        ),
      },
    })
    const service = createService({
      chatwootClient,
      repository: createRepositoryStub({
        listActivePortalUserContactLinks: vi.fn().mockResolvedValue([
          {
            chatwootContactId: 44,
            email: 'ivan@example.test',
            fullName: 'Иван Петров',
            userId: 7,
          },
          {
            chatwootContactId: 55,
            email: 'maria@example.test',
            fullName: 'Мария Соколова',
            userId: 8,
          },
          {
            chatwootContactId: 66,
            email: 'denied@example.test',
            fullName: 'Нет доступа',
            userId: 9,
          },
          {
            chatwootContactId: 77,
            email: 'petr@example.test',
            fullName: 'Петр Без Фото',
            userId: 10,
          },
        ]),
      }),
    })

    await expect(
      service.getCurrentUserThreadInfo({
        threadId: 'group:154',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      curatorName: 'Анна Маттина',
      participants: [
        {
          avatarUrl: '/api/chat/threads/group%3A154/participants/7/avatar',
          displayName: 'Иван Петров',
          id: 'portal-user:7',
          isCurrentUser: true,
        },
        {
          avatarUrl: '/api/chat/threads/group%3A154/participants/8/avatar',
          displayName: 'Мария Соколова',
          id: 'portal-user:8',
          isCurrentUser: false,
        },
        {
          avatarUrl: null,
          displayName: 'Петр Без Фото',
          id: 'portal-user:10',
          isCurrentUser: false,
        },
      ],
      threadTypeLabel: 'Групповой',
    })
    expect(chatwootClient.createConversation).not.toHaveBeenCalled()
  })
})
