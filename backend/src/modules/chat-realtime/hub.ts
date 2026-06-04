import type { ChatMessagesSnapshot } from '../chat-messages/service.js'

type RealtimeSubscription = {
  send: (event: ChatRealtimeEvent) => void
  tenantId: number
  threadId: string
  userId: number
}

export const CHAT_REALTIME_MAX_SUBSCRIPTIONS_PER_KEY = 5

type RealtimeSubscribeResult =
  | {
      status: 'limit_exceeded'
      limit: number
    }
  | {
      status: 'subscribed'
      unsubscribe: () => void
    }

export type ChatRealtimeEvent =
  | {
      data: ChatMessagesSnapshot
      type: 'messages'
    }
  | {
      data: ChatMessagesSnapshot
      type: 'chat-state'
    }
  | {
      data: ChatTypingEvent
      type: 'typing'
    }

export type ChatTypingEvent = {
  actor: 'agent'
  isTyping: boolean
  threadId: string
}

function buildThreadKey({
  tenantId,
  threadId,
}: {
  tenantId: number
  threadId: string
}) {
  return `${tenantId}:${threadId}`
}

function buildSubscriptionKey({
  tenantId,
  threadId,
  userId,
}: {
  tenantId: number
  threadId: string
  userId: number
}) {
  return `${tenantId}:${threadId}:${userId}`
}

export function createChatRealtimeHub() {
  const subscriptionsByKey = new Map<string, Set<RealtimeSubscription>>()
  const subscriptionsByThreadKey = new Map<string, Set<RealtimeSubscription>>()

  function unsubscribe(subscription: RealtimeSubscription) {
    const key = buildSubscriptionKey(subscription)
    const threadKey = buildThreadKey(subscription)
    const subscriptions = subscriptionsByKey.get(key)
    const threadSubscriptions = subscriptionsByThreadKey.get(threadKey)

    if (subscriptions) {
      subscriptions.delete(subscription)

      if (subscriptions.size === 0) {
        subscriptionsByKey.delete(key)
      }
    }

    if (threadSubscriptions) {
      threadSubscriptions.delete(subscription)

      if (threadSubscriptions.size === 0) {
        subscriptionsByThreadKey.delete(threadKey)
      }
    }
  }

  return {
    async publishThreadMessages({
      createSnapshotForUser,
      tenantId,
      threadId,
    }: {
      createSnapshotForUser: (userId: number) => Promise<ChatMessagesSnapshot>
      tenantId: number
      threadId: string
    }) {
      const subscriptions = subscriptionsByThreadKey.get(
        buildThreadKey({ tenantId, threadId }),
      )

      if (!subscriptions) {
        return 0
      }

      let delivered = 0

      for (const subscription of subscriptions) {
        const snapshot = await createSnapshotForUser(subscription.userId)

        if (snapshot.result !== 'ready') {
          continue
        }

        subscription.send({
          data: snapshot,
          type: 'messages',
        })
        delivered += 1
      }

      return delivered
    },

    publishThreadTyping({
      isTyping,
      tenantId,
      threadId,
    }: {
      isTyping: boolean
      tenantId: number
      threadId: string
    }) {
      const subscriptions = subscriptionsByThreadKey.get(
        buildThreadKey({ tenantId, threadId }),
      )

      if (!subscriptions) {
        return 0
      }

      let delivered = 0

      for (const subscription of subscriptions) {
        subscription.send({
          data: {
            actor: 'agent',
            isTyping,
            threadId,
          },
          type: 'typing',
        })
        delivered += 1
      }

      return delivered
    },

    subscribe(subscription: RealtimeSubscription): RealtimeSubscribeResult {
      const key = buildSubscriptionKey(subscription)
      const threadKey = buildThreadKey(subscription)
      const subscriptions = subscriptionsByKey.get(key) ?? new Set()
      const threadSubscriptions =
        subscriptionsByThreadKey.get(threadKey) ?? new Set()

      if (subscriptions.size >= CHAT_REALTIME_MAX_SUBSCRIPTIONS_PER_KEY) {
        return {
          limit: CHAT_REALTIME_MAX_SUBSCRIPTIONS_PER_KEY,
          status: 'limit_exceeded',
        }
      }

      subscriptions.add(subscription)
      threadSubscriptions.add(subscription)
      subscriptionsByKey.set(key, subscriptions)
      subscriptionsByThreadKey.set(threadKey, threadSubscriptions)

      return {
        status: 'subscribed',
        unsubscribe: () => {
          unsubscribe(subscription)
        },
      }
    },
  }
}

export type ChatRealtimeHub = ReturnType<typeof createChatRealtimeHub>
