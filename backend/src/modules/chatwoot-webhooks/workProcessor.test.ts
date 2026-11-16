import { describe, expect, it, vi } from 'vitest'
import { createWebhookWorkProcessor } from './workProcessor.js'
import type { ClaimedWebhookWork } from './workRepository.js'
import type { TenantRequestContext } from '../tenants/service.js'
import type { ChatMessagesSnapshot } from '../chat-messages/service.js'
import { createChatRealtimeHub } from '../chat-realtime/hub.js'

const job: ClaimedWebhookWork = {
  id: 1,
  tenantId: 1,
  workKey: 'created:501',
  eventName: 'message_created',
  chatwootBaseUrl: 'https://chatwoot.example.test',
  chatwootAccountId: 3,
  chatwootInboxId: 9,
  chatwootConversationId: 101,
  chatwootMessageId: 501,
  portalChatThreadId: 7,
  generation: 1,
  status: 'pending',
  unreadCompleted: false,
  attempts: 1,
  availableAt: new Date(),
  leaseToken: 'lease',
  leaseUntil: new Date(Date.now() + 300_000),
  receivedAt: new Date(),
  updatedAt: new Date(),
}
const mapping = {
  portalChatThreadId: 7,
  chatwootInboxId: 9,
  chatwootConversationId: 101,
  threadId: 'group:154' as const,
  threadType: 'group' as const,
  userId: null,
}
const tenant: TenantRequestContext = {
  chatwoot: {
    baseUrl: job.chatwootBaseUrl,
    accountId: 3,
    portalInboxId: 9,
    apiAccessToken: 'test',
    webhookSecret: 'test',
    portalInboxIdentifier: null,
  },
  displayName: 'Test',
  id: 1,
  isDefault: true,
  primaryDomain: 'localhost',
  publicBaseUrl: 'http://localhost',
  slug: 'default',
  status: 'active',
}
const snapshot: ChatMessagesSnapshot = {
  result: 'ready',
  reason: 'none',
  messages: [],
  hasMoreOlder: false,
  nextOlderCursor: null,
  activeThread: {
    id: 'group:154',
    title: 'Group',
    subtitle: '',
    type: 'group',
  },
}

function harness() {
  const order: string[] = []
  const recipients = [
    {
      portalChatThreadId: 7,
      portalUserId: 2,
      threadId: 'group:154',
      threadType: 'group' as const,
      threadTitle: 'Group',
    },
  ]
  const resolveRecipients = vi.fn(async () => {
    order.push('resolve')
    return recipients
  })
  const checkpointUnread = vi.fn(async () => {
    order.push('unread')
  })
  const deliverMessageCreated = vi.fn(async () => {
    order.push('push')
    return {
      expired: 0,
      failed: 0,
      recipients: 1,
      sent: 1,
      skipped: 0,
      subscriptions: 1,
    }
  })
  const getCurrentUserChatMessages = vi.fn(async () => {
    order.push('snapshot')
    return snapshot
  })
  const runtime = {
    tenant,
    webhookRepository: {
      findConversationMappingByChatwootConversationId: vi.fn(
        async () => mapping,
      ),
      recordDelivery: vi.fn(),
    },
    recipientResolver: { resolveRecipients },
    messagesService: { getCurrentUserChatMessages },
    pushDeliveryService: { deliverMessageCreated },
  }
  const hub = createChatRealtimeHub({
    resolveActiveSessions: async ({ candidates }) => candidates,
  })
  const send = vi.fn()
  hub.subscribe({
    tenantId: 1,
    userId: 2,
    sessionId: 22,
    threadId: 'group:154',
    send,
    close: vi.fn(),
  })
  const repository = {
    claim: vi.fn(),
    renew: vi.fn(),
    checkpointUnread,
    complete: vi.fn(),
    fail: vi.fn(),
    cleanup: vi.fn(),
  }
  const process = createWebhookWorkProcessor({
    repository,
    realtimeHub: hub,
    resolveRuntime: async () => runtime,
  })
  return {
    process,
    runtime,
    hub,
    send,
    order,
    resolveRecipients,
    checkpointUnread,
    deliverMessageCreated,
    getCurrentUserChatMessages,
  }
}

describe('deferred webhook processing', () => {
  it('records unread before push and realtime, once per distinct user', async () => {
    const h = harness()
    const secondTab = vi.fn()
    h.hub.subscribe({
      tenantId: 1,
      userId: 2,
      sessionId: 23,
      threadId: 'group:154',
      send: secondTab,
      close: vi.fn(),
    })
    await h.process(job, () => {})
    expect(h.order).toEqual(['resolve', 'unread', 'snapshot', 'push'])
    expect(h.send).toHaveBeenCalledOnce()
    expect(secondTab).toHaveBeenCalledOnce()
    expect(h.getCurrentUserChatMessages).toHaveBeenCalledOnce()
  })
  it('updates snapshots without unread or push for message_updated', async () => {
    const h = harness()
    await h.process({ ...job, eventName: 'message_updated' }, () => {})
    expect(h.order).toEqual(['snapshot'])
  })
  it('does not repeat completed unread work on recovery', async () => {
    const h = harness()
    await h.process({ ...job, unreadCompleted: true }, () => {})
    expect(h.order).toEqual(['snapshot', 'push'])
  })
  it('keeps the obligation retryable if recipient resolution or unread commit fails', async () => {
    const h = harness()
    h.resolveRecipients.mockRejectedValueOnce(new Error('Chatwoot unavailable'))
    await expect(h.process(job, () => {})).rejects.toThrow(
      'Chatwoot unavailable',
    )
    expect(h.checkpointUnread).not.toHaveBeenCalled()
    h.checkpointUnread.mockRejectedValueOnce(new Error('database unavailable'))
    await expect(h.process(job, () => {})).rejects.toThrow(
      'database unavailable',
    )
    expect(h.deliverMessageCreated).not.toHaveBeenCalled()
    expect(h.send).not.toHaveBeenCalled()
  })
  it('still attempts push and preserves the job for retry if snapshot work fails', async () => {
    const h = harness()
    h.getCurrentUserChatMessages.mockRejectedValueOnce(new Error('timeout'))
    await expect(h.process(job, () => {})).rejects.toThrow('timeout')
    expect(h.deliverMessageCreated).toHaveBeenCalledOnce()
  })
  it.each([
    { ...tenant, id: 2 },
    { ...tenant, status: 'archived' },
    { ...tenant, chatwoot: { ...tenant.chatwoot, accountId: 99 } },
    { ...tenant, chatwoot: { ...tenant.chatwoot, portalInboxId: 99 } },
    {
      ...tenant,
      chatwoot: { ...tenant.chatwoot, baseUrl: 'https://other.test' },
    },
  ])(
    'rejects changed tenant authority before side effects ($id / $status)',
    async (changed) => {
      const h = harness()
      h.runtime.tenant = changed
      await expect(h.process(job, () => {})).rejects.toThrow(
        'configuration changed',
      )
      expect(h.order).toEqual([])
    },
  )
  it('rejects remapped conversations and lost leases', async () => {
    const h = harness()
    h.runtime.webhookRepository.findConversationMappingByChatwootConversationId.mockResolvedValueOnce(
      { ...mapping, portalChatThreadId: 99 },
    )
    await expect(h.process(job, () => {})).rejects.toThrow('mapping changed')
    await expect(
      h.process(job, () => {
        throw new Error('lease lost')
      }),
    ).rejects.toThrow('lease lost')
    expect(h.order).toEqual([])
  })
  it('does not send a snapshot when thread access is no longer ready', async () => {
    const h = harness()
    h.getCurrentUserChatMessages.mockResolvedValueOnce({
      ...snapshot,
      result: 'unavailable',
      reason: 'thread_access_denied',
    } as ChatMessagesSnapshot)
    await h.process(job, () => {})
    expect(h.send).not.toHaveBeenCalled()
  })
  it('rejects a mapping moved to another inbox before side effects', async () => {
    const h = harness()
    h.runtime.webhookRepository.findConversationMappingByChatwootConversationId.mockResolvedValueOnce(
      { ...mapping, chatwootInboxId: 99 },
    )
    await expect(h.process(job, () => {})).rejects.toThrow('mapping changed')
    expect(h.order).toEqual([])
  })
  it('retries the real messages-service unavailable result instead of completing a skipped snapshot', async () => {
    const h = harness()
    h.getCurrentUserChatMessages.mockResolvedValueOnce({
      ...snapshot,
      result: 'unavailable',
      reason: 'chatwoot_unavailable',
    } as ChatMessagesSnapshot)
    await expect(h.process(job, () => {})).rejects.toThrow(
      'snapshot source unavailable',
    )
    expect(h.deliverMessageCreated).toHaveBeenCalledOnce()
    expect(h.send).not.toHaveBeenCalled()
  })
})
