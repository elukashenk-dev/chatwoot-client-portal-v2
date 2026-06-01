import { describe, expect, it, vi } from 'vitest'

import { createChatUnreadService } from './service.js'

const threadMapping = {
  chatwootConversationId: 101,
  portalChatThreadId: 22,
  threadId: 'group:154',
  threadType: 'group',
  userId: null,
} as const

function createRepository() {
  return {
    clearThreadUnreadAndCountVisible: vi.fn(async () => ({
      totalUnreadCount: 3,
    })),
    countThreadUnreadForUser: vi.fn(async () => 2),
    countUnreadByThread: vi.fn(async () => new Map([['group:154', 2]])),
    insertUnreadMessages: vi.fn(async () => undefined),
  }
}

function createRecipientResolver() {
  return {
    resolveRecipients: vi.fn(async () => [
      {
        portalChatThreadId: 22,
        portalUserId: 7,
        threadId: 'group:154',
        threadTitle: 'ООО Ромашка',
        threadType: 'group' as const,
      },
      {
        portalChatThreadId: 22,
        portalUserId: 8,
        threadId: 'group:154',
        threadTitle: 'ООО Ромашка',
        threadType: 'group' as const,
      },
    ]),
  }
}

describe('createChatUnreadService', () => {
  it('records unread rows for every resolved recipient', async () => {
    const repository = createRepository()
    const recipientResolver = createRecipientResolver()
    const service = createChatUnreadService({
      now: () => new Date('2026-06-01T09:00:00.000Z'),
      recipientResolver,
      repository,
    })

    await expect(
      service.recordMessageCreatedUnread({
        chatwootMessageId: 601,
        threadMapping,
      }),
    ).resolves.toEqual({
      recipients: 2,
    })
    expect(repository.insertUnreadMessages).toHaveBeenCalledWith([
      {
        chatwootMessageId: 601,
        now: new Date('2026-06-01T09:00:00.000Z'),
        portalChatThreadId: 22,
        portalUserId: 7,
        threadId: 'group:154',
      },
      {
        chatwootMessageId: 601,
        now: new Date('2026-06-01T09:00:00.000Z'),
        portalChatThreadId: 22,
        portalUserId: 8,
        threadId: 'group:154',
      },
    ])
  })

  it('does not record unread when Chatwoot message id is missing', async () => {
    const repository = createRepository()
    const recipientResolver = createRecipientResolver()
    const service = createChatUnreadService({
      recipientResolver,
      repository,
    })

    await expect(
      service.recordMessageCreatedUnread({
        chatwootMessageId: null,
        threadMapping,
      }),
    ).resolves.toEqual({ recipients: 0 })
    expect(recipientResolver.resolveRecipients).not.toHaveBeenCalled()
    expect(repository.insertUnreadMessages).not.toHaveBeenCalled()
  })

  it('clears a thread and returns the cleared thread id with visible total', async () => {
    const repository = createRepository()
    const service = createChatUnreadService({
      recipientResolver: createRecipientResolver(),
      repository,
    })

    await expect(
      service.clearOpenedThreadUnread({
        portalUserId: 7,
        threadId: 'group:154',
        visibleThreadIds: ['private:me', 'group:154'],
      }),
    ).resolves.toEqual({
      clearedThreadId: 'group:154',
      totalUnreadCount: 3,
    })
    expect(repository.clearThreadUnreadAndCountVisible).toHaveBeenCalledWith({
      portalUserId: 7,
      threadId: 'group:154',
      visibleThreadIds: ['private:me', 'group:154'],
    })
  })
})
