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

  it('selects the first created portal conversation and persists its mapping', async () => {
    const upsertConversationMapping = vi.fn().mockResolvedValue({
      chatwootContactId: 44,
      chatwootConversationId: 101,
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
        assigneeName: 'Анна Смирнова',
        id: 101,
        inboxId: 9,
        lastActivityAt: 250,
        status: 'pending',
      },
      reason: 'none',
      result: 'ready',
    })
    expect(upsertConversationMapping).toHaveBeenCalledWith({
      chatwootContactId: 44,
      chatwootConversationId: 101,
      chatwootInboxId: 9,
      now: new Date('2026-04-21T12:00:00.000Z'),
      userId: 7,
    })
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
