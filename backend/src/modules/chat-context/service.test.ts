import { describe, expect, it, vi } from 'vitest'

import { ChatwootClientRequestError } from '../../integrations/chatwoot/client.js'
import { createChatContextService } from './service.js'

describe('createChatContextService', () => {
  it('returns not_ready when the portal user has no Chatwoot contact link', async () => {
    const service = createChatContextService({
      chatContextRepository: {
        findContactLinkByUserId: vi.fn().mockResolvedValue(null),
        findConversationMappingByUserId: vi.fn().mockResolvedValue(null),
        upsertConversationMapping: vi.fn(),
      },
      chatwootClient: {
        ensurePortalInboxSingleConversationRouting: vi.fn(),
        listContactConversations: vi.fn(),
      },
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
      chatContextRepository: {
        findContactLinkByUserId: vi.fn().mockResolvedValue({
          chatwootContactId: 44,
          userId: 7,
        }),
        findConversationMappingByUserId: vi.fn().mockResolvedValue(null),
        upsertConversationMapping,
      },
      chatwootClient: {
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
      },
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
      chatContextRepository: {
        findContactLinkByUserId: vi.fn().mockResolvedValue({
          chatwootContactId: 44,
          userId: 7,
        }),
        findConversationMappingByUserId: vi.fn().mockResolvedValue({
          chatwootContactId: 44,
          chatwootConversationId: 101,
          chatwootInboxId: 9,
          userId: 7,
        }),
        upsertConversationMapping,
      },
      chatwootClient: {
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
      },
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
      chatContextRepository: {
        findContactLinkByUserId: vi.fn().mockResolvedValue({
          chatwootContactId: 44,
          userId: 7,
        }),
        findConversationMappingByUserId: vi.fn().mockResolvedValue(null),
        upsertConversationMapping,
      },
      chatwootClient: {
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
      },
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
      chatContextRepository: {
        findContactLinkByUserId: vi.fn().mockResolvedValue({
          chatwootContactId: 44,
          userId: 7,
        }),
        findConversationMappingByUserId: vi.fn().mockResolvedValue(null),
        upsertConversationMapping: vi.fn(),
      },
      chatwootClient: {
        ensurePortalInboxSingleConversationRouting: vi.fn(),
        listContactConversations: vi
          .fn()
          .mockRejectedValue(new ChatwootClientRequestError()),
      },
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
})
