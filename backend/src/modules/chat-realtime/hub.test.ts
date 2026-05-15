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
    subtitle: 'Только вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  },
  linkedContact: {
    id: 44,
  },
  messages: [],
  nextOlderCursor: null,
  reason: 'none',
  result: 'ready',
}

describe('createChatRealtimeHub', () => {
  it('fans out only to subscribers in the same tenant, user, and conversation', () => {
    const hub = createChatRealtimeHub()
    const sendTenantA = vi.fn()
    const sendTenantB = vi.fn()

    hub.subscribe({
      primaryConversationId: 101,
      send: sendTenantA,
      tenantId: 1,
      userId: 7,
    })
    hub.subscribe({
      primaryConversationId: 101,
      send: sendTenantB,
      tenantId: 2,
      userId: 7,
    })

    expect(
      hub.publishMessages({
        primaryConversationId: 101,
        snapshot: readySnapshot,
        tenantId: 1,
        userId: 7,
      }),
    ).toBe(1)
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
        primaryConversationId: 101,
        send: vi.fn(),
        tenantId: 1,
        userId: 7,
      })

      expect(result.status).toBe('subscribed')

      if (result.status === 'subscribed') {
        subscriptions.push(result.unsubscribe)
      }
    }

    expect(
      hub.subscribe({
        primaryConversationId: 101,
        send: vi.fn(),
        tenantId: 1,
        userId: 7,
      }),
    ).toEqual({
      limit: CHAT_REALTIME_MAX_SUBSCRIPTIONS_PER_KEY,
      status: 'limit_exceeded',
    })

    subscriptions[0]?.()

    const afterCleanup = hub.subscribe({
      primaryConversationId: 101,
      send: vi.fn(),
      tenantId: 1,
      userId: 7,
    })

    expect(afterCleanup.status).toBe('subscribed')
  })
})
