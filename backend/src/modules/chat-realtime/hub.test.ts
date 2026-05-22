import { describe, expect, it, vi } from 'vitest'

import type { ChatMessagesSnapshot } from '../chat-messages/service.js'
import {
  CHAT_REALTIME_MAX_SUBSCRIPTIONS_PER_KEY,
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

describe('createChatRealtimeHub', () => {
  it('publishes a group thread event to every subscriber on that thread', async () => {
    const hub = createChatRealtimeHub()
    const firstSend = vi.fn()
    const secondSend = vi.fn()

    hub.subscribe({
      send: firstSend,
      tenantId: 1,
      threadId: 'group:154',
      userId: 7,
    })
    hub.subscribe({
      send: secondSend,
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
  })

  it('skips a subscribed user after group thread access is revoked', async () => {
    const hub = createChatRealtimeHub()
    const firstSend = vi.fn()
    const secondSend = vi.fn()

    hub.subscribe({
      send: firstSend,
      tenantId: 1,
      threadId: 'group:154',
      userId: 7,
    })
    hub.subscribe({
      send: secondSend,
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
    const hub = createChatRealtimeHub()
    const sendTenantA = vi.fn()
    const sendTenantB = vi.fn()

    hub.subscribe({
      send: sendTenantA,
      tenantId: 1,
      threadId: 'private:me',
      userId: 7,
    })
    hub.subscribe({
      send: sendTenantB,
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

  it('rejects subscriptions above the per user conversation limit and allows another after cleanup', () => {
    const hub = createChatRealtimeHub()
    const subscriptions: Array<() => void> = []

    for (
      let index = 0;
      index < CHAT_REALTIME_MAX_SUBSCRIPTIONS_PER_KEY;
      index += 1
    ) {
      const result = hub.subscribe({
        send: vi.fn(),
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
        send: vi.fn(),
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
      send: vi.fn(),
      tenantId: 1,
      threadId: 'private:me',
      userId: 7,
    })

    expect(afterCleanup.status).toBe('subscribed')
  })
})
