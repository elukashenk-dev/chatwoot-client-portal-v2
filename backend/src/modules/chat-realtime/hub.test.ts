import { describe, expect, it, vi } from 'vitest'

import type { ChatMessagesSnapshot } from '../chat-messages/service.js'
import { createChatRealtimeHub } from './hub.js'

const readySnapshot: ChatMessagesSnapshot = {
  hasMoreOlder: false,
  linkedContact: {
    id: 44,
  },
  messages: [],
  nextOlderCursor: null,
  primaryConversation: {
    assigneeName: null,
    id: 101,
    inboxId: 9,
    lastActivityAt: 1_776_000_000,
    status: 'open',
  },
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
})
