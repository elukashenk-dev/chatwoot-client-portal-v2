import { vi } from 'vitest'

import type { ChatThreadContactRepository } from './contactRepository.js'
import { createChatThreadsService } from './service.js'

type ChatThreadsServiceOptions = Parameters<typeof createChatThreadsService>[0]

export type CountUnreadByThread = NonNullable<
  ChatThreadsServiceOptions['chatUnreadService']
>['countUnreadByThread']

type ChatwootClientStub = ChatThreadsServiceOptions['chatwootClient'] & {
  createContactInbox: ReturnType<typeof vi.fn>
  createConversation: ReturnType<typeof vi.fn>
  findContactByEmail: ReturnType<typeof vi.fn>
  findContactById: ReturnType<typeof vi.fn>
  findContactPortalInboxSourceId: ReturnType<typeof vi.fn>
  listContactConversations: ReturnType<typeof vi.fn>
}

export function createRepositoryStub(
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

export function createChatwootClientStub({
  groupContactIds = '154',
  groupContactOverrides = {},
  overrides = {},
}: {
  groupContactIds?: string
  groupContactOverrides?: Record<string, unknown>
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
            portal_client_group_contact_ids: groupContactIds,
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
          ...groupContactOverrides,
        }
      }

      return null
    }),
    ...overrides,
  } as ChatwootClientStub
}

export function createChatThreadsPersistenceRepositoryStub({
  initialGroupConversationId = null,
  initialPrivateConversationId = null,
}: {
  initialGroupConversationId?: number | null
  initialPrivateConversationId?: number | null
} = {}) {
  let groupThread = {
    chatwootContactId: 154,
    chatwootContactSourceId: null as string | null,
    chatwootConversationId: initialGroupConversationId,
    chatwootInboxId: 9,
    id: 2,
    portalUserId: null,
    threadType: 'group' as const,
  }
  let privateThread = {
    chatwootContactId: 44,
    chatwootContactSourceId: null as string | null,
    chatwootConversationId: initialPrivateConversationId,
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

      if (id === groupThread.id) {
        return groupThread
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

      if (input.id === groupThread.id) {
        groupThread = {
          ...groupThread,
          chatwootConversationId: input.chatwootConversationId,
          chatwootInboxId: input.chatwootInboxId,
        }

        return groupThread
      }

      return null
    }),
    updateThreadContactSourceId: vi.fn(async (input) => {
      if (input.id === privateThread.id) {
        privateThread = {
          ...privateThread,
          chatwootContactSourceId: input.chatwootContactSourceId,
        }

        return privateThread
      }

      if (input.id === groupThread.id) {
        groupThread = {
          ...groupThread,
          chatwootContactSourceId: input.chatwootContactSourceId,
        }

        return groupThread
      }

      return null
    }),
    upsertGroupThread: vi.fn(async () => groupThread),
    upsertPrivateThread: vi.fn(async () => privateThread),
  }
}

export function createService({
  chatUnreadService,
  chatThreadsRepository = createChatThreadsPersistenceRepositoryStub(),
  chatwootClient = createChatwootClientStub(),
  now = () => new Date('2026-05-15T10:00:00.000Z'),
  portalInboxId = 9,
  repository = createRepositoryStub(),
}: {
  chatUnreadService?: ChatThreadsServiceOptions['chatUnreadService']
  chatThreadsRepository?: unknown
  chatwootClient?: ReturnType<typeof createChatwootClientStub>
  now?: () => Date
  portalInboxId?: number
  repository?: ReturnType<typeof createRepositoryStub>
} = {}) {
  return createChatThreadsService({
    ...(chatUnreadService ? { chatUnreadService } : {}),
    contactRepository: repository,
    chatThreadsRepository:
      chatThreadsRepository as ChatThreadsServiceOptions['chatThreadsRepository'],
    chatwootClient:
      chatwootClient as ChatThreadsServiceOptions['chatwootClient'],
    now,
    portalInboxId,
  })
}
