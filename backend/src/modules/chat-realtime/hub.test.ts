import { describe, expect, it, vi } from 'vitest'

import { REALTIME_SESSION_AUTHORITY_BATCH_SIZE } from '../auth/realtimeSessionAuthority.js'
import type { ChatMessagesSnapshot } from '../chat-messages/service.js'
import {
  CHAT_REALTIME_MAX_SUBSCRIPTIONS_PER_KEY,
  CHAT_REALTIME_MAX_SUBSCRIPTIONS_PER_THREAD,
  createChatRealtimeHub,
} from './hub.js'

const readySnapshot: ChatMessagesSnapshot = {
  hasMoreOlder: false,
  activeThread: {
    id: 'private:me',
    subtitle: 'Вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  },
  messages: [],
  nextOlderCursor: null,
  reason: 'none',
  result: 'ready',
}

function createAuthorizedRealtimeHub() {
  return createChatRealtimeHub({
    resolveActiveSessions: async ({ candidates }) => candidates,
  })
}

describe('createChatRealtimeHub', () => {
  it('publishes a group thread event to every subscriber on that thread', async () => {
    const resolveActiveSessions = vi.fn(
      async ({
        candidates,
      }: Parameters<
        Parameters<typeof createChatRealtimeHub>[0]['resolveActiveSessions']
      >[0]) => candidates,
    )
    const hub = createChatRealtimeHub({ resolveActiveSessions })
    const firstSend = vi.fn()
    const secondSend = vi.fn()

    hub.subscribe({
      close: vi.fn(),
      send: firstSend,
      sessionId: 71,
      tenantId: 1,
      threadId: 'group:154',
      userId: 7,
    })
    hub.subscribe({
      close: vi.fn(),
      send: secondSend,
      sessionId: 81,
      tenantId: 1,
      threadId: 'group:154',
      userId: 8,
    })

    const groupReadySnapshot: ChatMessagesSnapshot = {
      activeThread: {
        id: 'group:154',
        subtitle: 'Групповой чат',
        title: 'ООО "Ромашка"',
        type: 'group',
      },
      hasMoreOlder: false,
      messages: [],
      nextOlderCursor: null,
      reason: 'none',
      result: 'ready',
    }

    await expect(
      hub.publishThreadMessages({
        createSnapshotForUser: vi.fn().mockResolvedValue(groupReadySnapshot),
        tenantId: 1,
        threadId: 'group:154',
      }),
    ).resolves.toBe(2)

    expect(firstSend).toHaveBeenCalledWith({
      data: groupReadySnapshot,
      type: 'messages',
    })
    expect(secondSend).toHaveBeenCalledWith({
      data: groupReadySnapshot,
      type: 'messages',
    })
    expect(resolveActiveSessions).toHaveBeenCalledTimes(2)
    expect(resolveActiveSessions).toHaveBeenNthCalledWith(1, {
      candidates: [
        { sessionId: 71, userId: 7 },
        { sessionId: 81, userId: 8 },
      ],
      tenantId: 1,
    })
    expect(resolveActiveSessions).toHaveBeenNthCalledWith(2, {
      candidates: [
        { sessionId: 71, userId: 7 },
        { sessionId: 81, userId: 8 },
      ],
      tenantId: 1,
    })
  })

  it('bounds message authority and snapshot work to fixed-size batches', async () => {
    const resolveActiveSessions = vi.fn(
      async ({
        candidates,
      }: Parameters<
        Parameters<typeof createChatRealtimeHub>[0]['resolveActiveSessions']
      >[0]) => candidates,
    )
    const hub = createChatRealtimeHub({ resolveActiveSessions })

    for (
      let index = 0;
      index < REALTIME_SESSION_AUTHORITY_BATCH_SIZE + 1;
      index += 1
    ) {
      hub.subscribe({
        close: vi.fn(),
        send: vi.fn(),
        sessionId: index + 1,
        tenantId: 1,
        threadId: 'group:154',
        userId: index + 1,
      })
    }

    const createSnapshotForUser = vi.fn().mockResolvedValue(readySnapshot)

    await expect(
      hub.publishThreadMessages({
        createSnapshotForUser,
        tenantId: 1,
        threadId: 'group:154',
      }),
    ).resolves.toBe(REALTIME_SESSION_AUTHORITY_BATCH_SIZE + 1)

    expect(resolveActiveSessions).toHaveBeenCalledTimes(4)
    expect(
      resolveActiveSessions.mock.calls.map(
        ([{ candidates }]) => candidates.length,
      ),
    ).toEqual([
      REALTIME_SESSION_AUTHORITY_BATCH_SIZE,
      REALTIME_SESSION_AUTHORITY_BATCH_SIZE,
      1,
      1,
    ])
    expect(createSnapshotForUser).toHaveBeenCalledTimes(
      REALTIME_SESSION_AUTHORITY_BATCH_SIZE + 1,
    )
  })

  it('rechecks session authority after snapshot work and before sending', async () => {
    const resolveActiveSessions = vi
      .fn()
      .mockImplementationOnce(async ({ candidates }) => candidates)
      .mockResolvedValueOnce([])
    const hub = createChatRealtimeHub({ resolveActiveSessions })
    const close = vi.fn()
    const send = vi.fn()
    const createSnapshotForUser = vi.fn().mockResolvedValue(readySnapshot)

    hub.subscribe({
      close,
      send,
      sessionId: 71,
      tenantId: 1,
      threadId: 'private:me',
      userId: 7,
    })

    await expect(
      hub.publishThreadMessages({
        createSnapshotForUser,
        tenantId: 1,
        threadId: 'private:me',
      }),
    ).resolves.toBe(0)

    expect(createSnapshotForUser).toHaveBeenCalledTimes(1)
    expect(resolveActiveSessions).toHaveBeenCalledTimes(2)
    expect(send).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('skips a subscribed user after group thread access is revoked', async () => {
    const hub = createAuthorizedRealtimeHub()
    const firstSend = vi.fn()
    const secondSend = vi.fn()

    hub.subscribe({
      close: vi.fn(),
      send: firstSend,
      sessionId: 71,
      tenantId: 1,
      threadId: 'group:154',
      userId: 7,
    })
    hub.subscribe({
      close: vi.fn(),
      send: secondSend,
      sessionId: 81,
      tenantId: 1,
      threadId: 'group:154',
      userId: 8,
    })

    const readyGroupSnapshot: ChatMessagesSnapshot = {
      activeThread: {
        id: 'group:154',
        subtitle: 'Групповой чат',
        title: 'ООО "Ромашка"',
        type: 'group',
      },
      hasMoreOlder: false,
      messages: [],
      nextOlderCursor: null,
      reason: 'none',
      result: 'ready',
    }
    const revokedGroupSnapshot: ChatMessagesSnapshot = {
      activeThread: null,
      hasMoreOlder: false,
      messages: [],
      nextOlderCursor: null,
      reason: 'thread_access_denied',
      result: 'not_ready',
    }

    await expect(
      hub.publishThreadMessages({
        createSnapshotForUser: vi.fn(async (userId) =>
          userId === 7 ? revokedGroupSnapshot : readyGroupSnapshot,
        ),
        tenantId: 1,
        threadId: 'group:154',
      }),
    ).resolves.toBe(1)

    expect(firstSend).not.toHaveBeenCalled()
    expect(secondSend).toHaveBeenCalledWith({
      data: readyGroupSnapshot,
      type: 'messages',
    })
  })

  it('fans out only to subscribers in the same tenant and thread', async () => {
    const hub = createAuthorizedRealtimeHub()
    const sendTenantA = vi.fn()
    const sendTenantB = vi.fn()

    hub.subscribe({
      close: vi.fn(),
      send: sendTenantA,
      sessionId: 71,
      tenantId: 1,
      threadId: 'private:me',
      userId: 7,
    })
    hub.subscribe({
      close: vi.fn(),
      send: sendTenantB,
      sessionId: 72,
      tenantId: 2,
      threadId: 'private:me',
      userId: 7,
    })

    await expect(
      hub.publishThreadMessages({
        createSnapshotForUser: vi.fn().mockResolvedValue(readySnapshot),
        tenantId: 1,
        threadId: 'private:me',
      }),
    ).resolves.toBe(1)
    expect(sendTenantA).toHaveBeenCalledWith({
      data: readySnapshot,
      type: 'messages',
    })
    expect(sendTenantB).not.toHaveBeenCalled()
  })

  it('publishes agent typing events without building message snapshots', async () => {
    const hub = createAuthorizedRealtimeHub()
    const sendTenantA = vi.fn()
    const sendTenantB = vi.fn()

    hub.subscribe({
      close: vi.fn(),
      send: sendTenantA,
      sessionId: 71,
      tenantId: 1,
      threadId: 'private:me',
      userId: 7,
    })
    hub.subscribe({
      close: vi.fn(),
      send: sendTenantB,
      sessionId: 72,
      tenantId: 2,
      threadId: 'private:me',
      userId: 7,
    })

    await expect(
      hub.publishThreadTyping({
        isTyping: true,
        tenantId: 1,
        threadId: 'private:me',
      }),
    ).resolves.toBe(1)

    expect(sendTenantA).toHaveBeenCalledWith({
      data: {
        actor: 'agent',
        isTyping: true,
        threadId: 'private:me',
      },
      type: 'typing',
    })
    expect(sendTenantB).not.toHaveBeenCalled()
  })

  it('closes a revoked session instead of publishing a typing event', async () => {
    const resolveActiveSessions = vi.fn().mockResolvedValue([])
    const hub = createChatRealtimeHub({ resolveActiveSessions })
    const close = vi.fn()
    const send = vi.fn()

    hub.subscribe({
      close,
      send,
      sessionId: 71,
      tenantId: 1,
      threadId: 'private:me',
      userId: 7,
    })

    await expect(
      hub.publishThreadTyping({
        isTyping: true,
        tenantId: 1,
        threadId: 'private:me',
      }),
    ).resolves.toBe(0)

    expect(resolveActiveSessions).toHaveBeenCalledWith({
      candidates: [{ sessionId: 71, userId: 7 }],
      tenantId: 1,
    })
    expect(send).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(1)

    await expect(
      hub.publishThreadTyping({
        isTyping: true,
        tenantId: 1,
        threadId: 'private:me',
      }),
    ).resolves.toBe(0)
    expect(resolveActiveSessions).toHaveBeenCalledTimes(1)
  })

  it('checks and sends typing events in fixed-size authority batches', async () => {
    const resolveActiveSessions = vi.fn(
      async ({
        candidates,
      }: Parameters<
        Parameters<typeof createChatRealtimeHub>[0]['resolveActiveSessions']
      >[0]) => candidates,
    )
    const hub = createChatRealtimeHub({ resolveActiveSessions })

    for (
      let index = 0;
      index < REALTIME_SESSION_AUTHORITY_BATCH_SIZE + 1;
      index += 1
    ) {
      hub.subscribe({
        close: vi.fn(),
        send: vi.fn(),
        sessionId: index + 1,
        tenantId: 1,
        threadId: 'group:154',
        userId: index + 1,
      })
    }

    await expect(
      hub.publishThreadTyping({
        isTyping: true,
        tenantId: 1,
        threadId: 'group:154',
      }),
    ).resolves.toBe(REALTIME_SESSION_AUTHORITY_BATCH_SIZE + 1)

    expect(
      resolveActiveSessions.mock.calls.map(
        ([{ candidates }]) => candidates.length,
      ),
    ).toEqual([REALTIME_SESSION_AUTHORITY_BATCH_SIZE, 1])
  })

  it('rejects subscriptions above the per user conversation limit and allows another after cleanup', () => {
    const hub = createAuthorizedRealtimeHub()
    const subscriptions: Array<() => void> = []

    for (
      let index = 0;
      index < CHAT_REALTIME_MAX_SUBSCRIPTIONS_PER_KEY;
      index += 1
    ) {
      const result = hub.subscribe({
        close: vi.fn(),
        send: vi.fn(),
        sessionId: index + 1,
        tenantId: 1,
        threadId: 'private:me',
        userId: 7,
      })

      expect(result.status).toBe('subscribed')

      if (result.status === 'subscribed') {
        subscriptions.push(result.unsubscribe)
      }
    }

    expect(
      hub.subscribe({
        close: vi.fn(),
        send: vi.fn(),
        sessionId: 99,
        tenantId: 1,
        threadId: 'private:me',
        userId: 7,
      }),
    ).toEqual({
      limit: CHAT_REALTIME_MAX_SUBSCRIPTIONS_PER_KEY,
      status: 'limit_exceeded',
    })

    subscriptions[0]?.()

    const afterCleanup = hub.subscribe({
      close: vi.fn(),
      send: vi.fn(),
      sessionId: 100,
      tenantId: 1,
      threadId: 'private:me',
      userId: 7,
    })

    expect(afterCleanup.status).toBe('subscribed')
  })
  it('bounds subscriptions across users per tenant/thread without consuming another tenant budget', () => {
    const hub = createAuthorizedRealtimeHub()
    const subscription = {
      tenantId: 1,
      threadId: 'group:154',
      userId: 0,
      sessionId: 0,
      send: vi.fn(),
      close: vi.fn(),
    }
    let last: ReturnType<typeof hub.subscribe> | undefined
    for (
      let userId = 0;
      userId < CHAT_REALTIME_MAX_SUBSCRIPTIONS_PER_THREAD;
      userId++
    ) {
      last = hub.subscribe({ ...subscription, userId, sessionId: userId })
      expect(last.status).toBe('subscribed')
    }
    expect(hub.subscribe({ ...subscription, userId: 9999 })).toEqual({
      status: 'limit_exceeded',
      limit: CHAT_REALTIME_MAX_SUBSCRIPTIONS_PER_THREAD,
    })
    expect(hub.subscribe({ ...subscription, tenantId: 2 }).status).toBe(
      'subscribed',
    )
    if (last?.status === 'subscribed') last.unsubscribe()
    expect(hub.subscribe({ ...subscription, userId: 9999 }).status).toBe(
      'subscribed',
    )
  })
})
