import { describe, expect, it, vi } from 'vitest'

import { ChatwootClientRequestError } from '../../integrations/chatwoot/client.js'
import { createChatContextService } from './service.js'

function createChatwootClientStub(
  overrides: Partial<
    Parameters<typeof createChatContextService>[0]['chatwootClient']
  > = {},
): Parameters<typeof createChatContextService>[0]['chatwootClient'] {
  return {
    createContactInbox: vi.fn(),
    createConversation: vi.fn(),
    ensurePortalInboxSingleConversationRouting: vi.fn(),
    findContactByEmail: vi.fn(),
    findContactPortalInboxSourceId: vi.fn(),
    listContactConversations: vi.fn(),
    ...overrides,
  }
}

function createChatContextRepositoryStub(
  overrides: Partial<
    Parameters<typeof createChatContextService>[0]['chatContextRepository']
  > = {},
): Parameters<typeof createChatContextService>[0]['chatContextRepository'] {
  return {
    createContactLink: vi.fn(),
    findContactLinkByUserId: vi.fn().mockResolvedValue({
      chatwootContactId: 44,
      userId: 7,
    }),
    findConversationMappingByUserId: vi.fn().mockResolvedValue(null),
    findPortalUserById: vi.fn().mockResolvedValue({
      email: 'client@example.com',
      id: 7,
    }),
    upsertConversationMapping: vi.fn(),
    ...overrides,
  }
}

describe('createChatContextService', () => {
  it('returns not_ready when the portal user has no Chatwoot contact link', async () => {
    const service = createChatContextService({
      chatContextRepository: createChatContextRepositoryStub({
        findContactLinkByUserId: vi.fn().mockResolvedValue(null),
      }),
      chatwootClient: createChatwootClientStub({
        findContactByEmail: vi.fn().mockResolvedValue(null),
      }),
    })

    await expect(
      service.getCurrentUserChatContext({ userId: 7 }),
    ).resolves.toEqual({
      linkedContact: null,
      primaryConversation: null,
      reason: 'contact_link_missing',
      result: 'not_ready',
    })
  })

  it('links an authenticated portal user to an existing Chatwoot contact by email', async () => {
    const createContactLink = vi.fn().mockResolvedValue({
      chatwootContactId: 44,
      userId: 7,
    })
    const findContactByEmail = vi.fn().mockResolvedValue({
      email: 'client@example.com',
      id: 44,
      name: 'Client User',
    })
    const service = createChatContextService({
      chatContextRepository: createChatContextRepositoryStub({
        createContactLink,
        findContactLinkByUserId: vi.fn().mockResolvedValue(null),
        findPortalUserById: vi.fn().mockResolvedValue({
          email: 'client@example.com',
          id: 7,
        }),
      }),
      chatwootClient: createChatwootClientStub({
        findContactByEmail,
        listContactConversations: vi.fn().mockResolvedValue([]),
      }),
    })

    await expect(
      service.getCurrentUserChatContext({ userId: 7 }),
    ).resolves.toEqual({
      linkedContact: {
        id: 44,
      },
      primaryConversation: null,
      reason: 'conversation_missing',
      result: 'not_ready',
    })
    expect(findContactByEmail).toHaveBeenCalledWith('client@example.com')
    expect(createContactLink).toHaveBeenCalledWith({
      chatwootContactId: 44,
      userId: 7,
    })
  })

  it('selects the newest active portal conversation and persists its mapping when no mapping exists', async () => {
    const upsertConversationMapping = vi.fn().mockResolvedValue({
      chatwootContactId: 44,
      chatwootConversationId: 102,
      chatwootInboxId: 9,
      userId: 7,
    })
    const ensurePortalInboxSingleConversationRouting = vi
      .fn()
      .mockResolvedValue({
        channelType: 'Channel::Api',
        id: 9,
        lockToSingleConversation: true,
        updated: true,
      })
    const service = createChatContextService({
      chatContextRepository: createChatContextRepositoryStub({
        findConversationMappingByUserId: vi.fn().mockResolvedValue(null),
        upsertConversationMapping,
      }),
      chatwootClient: createChatwootClientStub({
        ensurePortalInboxSingleConversationRouting,
        listContactConversations: vi.fn().mockResolvedValue([
          {
            assigneeName: null,
            channelType: 'Channel::Api',
            createdAt: 200,
            id: 102,
            inboxId: 9,
            lastActivityAt: 300,
            status: 'open',
          },
          {
            assigneeName: 'Анна Смирнова',
            channelType: 'Channel::Api',
            createdAt: 100,
            id: 101,
            inboxId: 9,
            lastActivityAt: 250,
            status: 'pending',
          },
        ]),
      }),
      now: () => new Date('2026-04-21T12:00:00.000Z'),
    })

    await expect(
      service.getCurrentUserChatContext({ userId: 7 }),
    ).resolves.toEqual({
      linkedContact: {
        id: 44,
      },
      primaryConversation: {
        assigneeName: null,
        id: 102,
        inboxId: 9,
        lastActivityAt: 300,
        status: 'open',
      },
      reason: 'none',
      result: 'ready',
    })
    expect(ensurePortalInboxSingleConversationRouting).toHaveBeenCalledTimes(1)
    expect(upsertConversationMapping).toHaveBeenCalledWith({
      chatwootContactId: 44,
      chatwootConversationId: 102,
      chatwootInboxId: 9,
      now: new Date('2026-04-21T12:00:00.000Z'),
      userId: 7,
    })
  })

  it('keeps a valid persisted mapping even when a newer conversation exists', async () => {
    const upsertConversationMapping = vi.fn()
    const ensurePortalInboxSingleConversationRouting = vi
      .fn()
      .mockResolvedValue({
        channelType: 'Channel::Api',
        id: 9,
        lockToSingleConversation: true,
        updated: false,
      })
    const service = createChatContextService({
      chatContextRepository: createChatContextRepositoryStub({
        findConversationMappingByUserId: vi.fn().mockResolvedValue({
          chatwootContactId: 44,
          chatwootConversationId: 101,
          chatwootInboxId: 9,
          userId: 7,
        }),
        upsertConversationMapping,
      }),
      chatwootClient: createChatwootClientStub({
        ensurePortalInboxSingleConversationRouting,
        listContactConversations: vi.fn().mockResolvedValue([
          {
            assigneeName: 'Анна Смирнова',
            channelType: 'Channel::Api',
            createdAt: 100,
            id: 101,
            inboxId: 9,
            lastActivityAt: 250,
            status: 'resolved',
          },
          {
            assigneeName: null,
            channelType: 'Channel::Api',
            createdAt: 200,
            id: 102,
            inboxId: 9,
            lastActivityAt: 300,
            status: 'open',
          },
        ]),
      }),
    })

    await expect(
      service.getCurrentUserChatContext({ userId: 7 }),
    ).resolves.toEqual({
      linkedContact: {
        id: 44,
      },
      primaryConversation: {
        assigneeName: 'Анна Смирнова',
        id: 101,
        inboxId: 9,
        lastActivityAt: 250,
        status: 'resolved',
      },
      reason: 'none',
      result: 'ready',
    })
    expect(ensurePortalInboxSingleConversationRouting).toHaveBeenCalledTimes(1)
    expect(upsertConversationMapping).not.toHaveBeenCalled()
  })

  it('selects the newest resolved portal conversation when no active conversation exists', async () => {
    const upsertConversationMapping = vi.fn().mockResolvedValue({
      chatwootContactId: 44,
      chatwootConversationId: 102,
      chatwootInboxId: 9,
      userId: 7,
    })
    const service = createChatContextService({
      chatContextRepository: createChatContextRepositoryStub({
        findConversationMappingByUserId: vi.fn().mockResolvedValue(null),
        upsertConversationMapping,
      }),
      chatwootClient: createChatwootClientStub({
        ensurePortalInboxSingleConversationRouting: vi.fn().mockResolvedValue({
          channelType: 'Channel::Api',
          id: 9,
          lockToSingleConversation: true,
          updated: false,
        }),
        listContactConversations: vi.fn().mockResolvedValue([
          {
            assigneeName: 'Анна Смирнова',
            channelType: 'Channel::Api',
            createdAt: 100,
            id: 101,
            inboxId: 9,
            lastActivityAt: 250,
            status: 'resolved',
          },
          {
            assigneeName: null,
            channelType: 'Channel::Api',
            createdAt: 200,
            id: 102,
            inboxId: 9,
            lastActivityAt: 300,
            status: 'resolved',
          },
        ]),
      }),
    })

    await expect(
      service.getCurrentUserChatContext({ userId: 7 }),
    ).resolves.toMatchObject({
      primaryConversation: {
        id: 102,
        status: 'resolved',
      },
      reason: 'none',
      result: 'ready',
    })
    expect(upsertConversationMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        chatwootConversationId: 102,
      }),
    )
  })

  it('returns unavailable when Chatwoot cannot resolve conversations', async () => {
    const service = createChatContextService({
      chatContextRepository: createChatContextRepositoryStub({
        findConversationMappingByUserId: vi.fn().mockResolvedValue(null),
      }),
      chatwootClient: createChatwootClientStub({
        listContactConversations: vi
          .fn()
          .mockRejectedValue(new ChatwootClientRequestError()),
      }),
    })

    await expect(
      service.getCurrentUserChatContext({ userId: 7 }),
    ).resolves.toEqual({
      linkedContact: {
        id: 44,
      },
      primaryConversation: null,
      reason: 'chatwoot_unavailable',
      result: 'unavailable',
    })
  })

  it('bootstraps the first writable portal conversation and persists its mapping', async () => {
    const upsertConversationMapping = vi.fn().mockResolvedValue({
      chatwootContactId: 44,
      chatwootConversationId: 301,
      chatwootInboxId: 9,
      userId: 7,
    })
    const createConversation = vi.fn().mockResolvedValue({
      assigneeName: null,
      channelType: 'Channel::Api',
      createdAt: 400,
      id: 301,
      inboxId: 9,
      lastActivityAt: 400,
      status: 'open',
    })
    const service = createChatContextService({
      chatContextRepository: createChatContextRepositoryStub({
        findConversationMappingByUserId: vi.fn().mockResolvedValue(null),
        upsertConversationMapping,
      }),
      chatwootClient: createChatwootClientStub({
        createConversation,
        findContactPortalInboxSourceId: vi
          .fn()
          .mockResolvedValue('portal-contact-source'),
        listContactConversations: vi.fn().mockResolvedValue([]),
      }),
      now: () => new Date('2026-04-21T12:00:00.000Z'),
    })

    await expect(
      service.ensureCurrentUserWritableChatContext({ userId: 7 }),
    ).resolves.toEqual({
      linkedContact: {
        id: 44,
      },
      primaryConversation: {
        assigneeName: null,
        id: 301,
        inboxId: 9,
        lastActivityAt: 400,
        status: 'open',
      },
      reason: 'none',
      result: 'ready',
    })
    expect(createConversation).toHaveBeenCalledWith({
      contactId: 44,
      sourceId: 'portal-contact-source',
    })
    expect(upsertConversationMapping).toHaveBeenCalledWith({
      chatwootContactId: 44,
      chatwootConversationId: 301,
      chatwootInboxId: 9,
      now: new Date('2026-04-21T12:00:00.000Z'),
      userId: 7,
    })
  })

  it('bootstraps a replacement conversation when the selected primary was deleted and no portal conversations remain', async () => {
    const upsertConversationMapping = vi.fn().mockResolvedValue({
      chatwootContactId: 44,
      chatwootConversationId: 301,
      chatwootInboxId: 9,
      userId: 7,
    })
    const createConversation = vi.fn().mockResolvedValue({
      assigneeName: null,
      channelType: 'Channel::Api',
      createdAt: 400,
      id: 301,
      inboxId: 9,
      lastActivityAt: 400,
      status: 'open',
    })
    const listContactConversations = vi.fn().mockResolvedValue([])
    const service = createChatContextService({
      chatContextRepository: createChatContextRepositoryStub({
        findConversationMappingByUserId: vi.fn().mockResolvedValue({
          chatwootContactId: 44,
          chatwootConversationId: 101,
          chatwootInboxId: 9,
          userId: 7,
        }),
        upsertConversationMapping,
      }),
      chatwootClient: createChatwootClientStub({
        createConversation,
        findContactPortalInboxSourceId: vi
          .fn()
          .mockResolvedValue('portal-contact-source'),
        listContactConversations,
      }),
      now: () => new Date('2026-04-21T12:00:00.000Z'),
    })

    await expect(
      service.ensureCurrentUserWritableChatContext({
        selectedPrimaryConversationId: 101,
        userId: 7,
      }),
    ).resolves.toEqual({
      linkedContact: {
        id: 44,
      },
      primaryConversation: {
        assigneeName: null,
        id: 301,
        inboxId: 9,
        lastActivityAt: 400,
        status: 'open',
      },
      reason: 'none',
      result: 'ready',
    })
    expect(listContactConversations).toHaveBeenCalledTimes(2)
    expect(createConversation).toHaveBeenCalledWith({
      contactId: 44,
      sourceId: 'portal-contact-source',
    })
    expect(upsertConversationMapping).toHaveBeenCalledWith({
      chatwootContactId: 44,
      chatwootConversationId: 301,
      chatwootInboxId: 9,
      now: new Date('2026-04-21T12:00:00.000Z'),
      userId: 7,
    })
  })

  it('does not bootstrap or switch when the selected primary is missing but another portal conversation exists', async () => {
    const createConversation = vi.fn()
    const service = createChatContextService({
      chatContextRepository: createChatContextRepositoryStub({
        findConversationMappingByUserId: vi.fn().mockResolvedValue({
          chatwootContactId: 44,
          chatwootConversationId: 101,
          chatwootInboxId: 9,
          userId: 7,
        }),
      }),
      chatwootClient: createChatwootClientStub({
        createConversation,
        listContactConversations: vi.fn().mockResolvedValue([
          {
            assigneeName: null,
            channelType: 'Channel::Api',
            createdAt: 200,
            id: 102,
            inboxId: 9,
            lastActivityAt: 300,
            status: 'open',
          },
        ]),
      }),
    })

    await expect(
      service.ensureCurrentUserWritableChatContext({
        selectedPrimaryConversationId: 101,
        userId: 7,
      }),
    ).resolves.toEqual({
      linkedContact: {
        id: 44,
      },
      primaryConversation: null,
      reason: 'primary_conversation_missing',
      result: 'not_ready',
    })
    expect(createConversation).not.toHaveBeenCalled()
  })
})
