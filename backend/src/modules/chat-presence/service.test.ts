import { describe, expect, it, vi } from 'vitest'

import { ChatwootClientRequestError } from '../../integrations/chatwoot/client.js'
import { createChatPresenceService } from './service.js'

function createReadyPrivateContext(
  overrides: Partial<{
    chatwootContactSourceId: string | null
    portalChatThreadId: number | null
    targetChatwootContactId: number | null
  }> = {},
) {
  return {
    activeThread: {
      id: 'private:me',
      subtitle: 'Вы и поддержка',
      title: 'Личный чат',
      type: 'private',
    },
    chatwootContactSourceId: 'portal-contact:source',
    chatwootConversation: {
      assigneeName: null,
      id: 12,
      inboxId: 9,
      lastActivityAt: null,
      status: 'open',
    },
    currentUserEmail: 'ivan@example.test',
    currentUserName: 'Ivan',
    linkedContactId: 44,
    portalChatThreadId: 2,
    reason: 'none',
    result: 'ready',
    targetChatwootContactId: 44,
    threadType: 'private',
    ...overrides,
  } as const
}

function createReadyGroupContext() {
  return {
    ...createReadyPrivateContext(),
    activeThread: {
      id: 'group:154',
      subtitle: 'Групповой чат',
      title: 'ООО Уточки',
      type: 'group',
    },
    threadType: 'group',
  } as const
}

function createPresenceService({
  context = createReadyPrivateContext(),
  now = () => new Date('2026-06-04T10:00:00.000Z'),
  portalInboxIdentifier = 'api-inbox-token',
  readSyncThrottleStore = new Map<string, number>(),
}: {
  context?: unknown
  now?: () => Date
  portalInboxIdentifier?: string | null
  readSyncThrottleStore?: Map<string, number>
} = {}) {
  const chatThreadsRepository = {
    updateThreadContactSourceId: vi.fn().mockResolvedValue({}),
  }
  const chatThreadsService = {
    getCurrentUserThreadContext: vi.fn().mockResolvedValue(context),
  }
  const chatwoot = {
    findContactPortalInboxSourceId: vi
      .fn()
      .mockResolvedValue('portal-contact:resolved-source'),
    portalInboxIdentifier,
    updatePublicConversationLastSeen: vi.fn().mockResolvedValue(undefined),
  }
  const service = createChatPresenceService({
    chatThreadsRepository,
    chatThreadsService,
    chatwoot,
    now,
    readSyncThrottleStore,
    tenantId: 1,
  })

  return {
    chatThreadsRepository,
    chatThreadsService,
    chatwoot,
    service,
  }
}

describe('createChatPresenceService', () => {
  it('syncs a ready private thread customer read to Chatwoot public API', async () => {
    const { chatwoot, service } = createPresenceService()

    await expect(
      service.markCurrentUserThreadRead({
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toEqual({ result: 'synced' })
    expect(chatwoot.updatePublicConversationLastSeen).toHaveBeenCalledWith({
      contactIdentifier: 'portal-contact:source',
      conversationDisplayId: 12,
      inboxIdentifier: 'api-inbox-token',
    })
  })

  it('skips group thread read sync', async () => {
    const { chatwoot, service } = createPresenceService({
      context: createReadyGroupContext(),
    })

    await expect(
      service.markCurrentUserThreadRead({
        threadId: 'group:154',
        userId: 7,
      }),
    ).resolves.toEqual({
      reason: 'group_thread',
      result: 'skipped',
    })
    expect(chatwoot.updatePublicConversationLastSeen).not.toHaveBeenCalled()
  })

  it('returns not_configured when the tenant public inbox identifier is missing', async () => {
    const { chatwoot, service } = createPresenceService({
      portalInboxIdentifier: null,
    })

    await expect(
      service.markCurrentUserThreadRead({
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toEqual({
      reason: 'not_configured',
      result: 'unavailable',
    })
    expect(chatwoot.updatePublicConversationLastSeen).not.toHaveBeenCalled()
  })

  it('resolves and stores a missing contact source id before read sync', async () => {
    const { chatThreadsRepository, chatwoot, service } = createPresenceService({
      context: createReadyPrivateContext({
        chatwootContactSourceId: null,
      }),
    })

    await expect(
      service.markCurrentUserThreadRead({
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toEqual({ result: 'synced' })
    expect(chatwoot.findContactPortalInboxSourceId).toHaveBeenCalledWith(44)
    expect(chatThreadsRepository.updateThreadContactSourceId).toHaveBeenCalledWith(
      {
        chatwootContactSourceId: 'portal-contact:resolved-source',
        id: 2,
        now: new Date('2026-06-04T10:00:00.000Z'),
      },
    )
    expect(chatwoot.updatePublicConversationLastSeen).toHaveBeenCalledWith({
      contactIdentifier: 'portal-contact:resolved-source',
      conversationDisplayId: 12,
      inboxIdentifier: 'api-inbox-token',
    })
  })

  it('skips repeated read sync inside the throttle window', async () => {
    let currentTimeMs = Date.parse('2026-06-04T10:00:00.000Z')
    const { chatThreadsService, chatwoot, service } = createPresenceService({
      now: () => new Date(currentTimeMs),
    })

    await expect(
      service.markCurrentUserThreadRead({
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toEqual({ result: 'synced' })

    currentTimeMs += 1_000

    await expect(
      service.markCurrentUserThreadRead({
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toEqual({
      reason: 'throttled',
      result: 'skipped',
    })
    expect(chatThreadsService.getCurrentUserThreadContext).toHaveBeenCalledTimes(
      1,
    )
    expect(chatwoot.updatePublicConversationLastSeen).toHaveBeenCalledTimes(1)
  })

  it('skips repeated read sync across request-scoped service instances', async () => {
    const readSyncThrottleStore = new Map<string, number>()
    const firstService = createPresenceService({
      readSyncThrottleStore,
    })

    await expect(
      firstService.service.markCurrentUserThreadRead({
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toEqual({ result: 'synced' })

    const secondService = createPresenceService({
      readSyncThrottleStore,
    })

    await expect(
      secondService.service.markCurrentUserThreadRead({
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toEqual({
      reason: 'throttled',
      result: 'skipped',
    })
    expect(
      secondService.chatThreadsService.getCurrentUserThreadContext,
    ).not.toHaveBeenCalled()
    expect(
      secondService.chatwoot.updatePublicConversationLastSeen,
    ).not.toHaveBeenCalled()
  })

  it('maps Chatwoot request errors to chatwoot_unavailable', async () => {
    const { chatwoot, service } = createPresenceService()

    chatwoot.updatePublicConversationLastSeen.mockRejectedValueOnce(
      new ChatwootClientRequestError('Chatwoot unavailable.'),
    )

    await expect(
      service.markCurrentUserThreadRead({
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toEqual({
      reason: 'chatwoot_unavailable',
      result: 'unavailable',
    })
  })
})
