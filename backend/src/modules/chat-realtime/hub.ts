import type { ChatMessagesSnapshot } from '../chat-messages/service.js'

type RealtimeSubscription = {
  primaryConversationId: number
  send: (event: ChatRealtimeEvent) => void
  tenantId: number
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

function buildSubscriptionKey({
  primaryConversationId,
  tenantId,
  userId,
}: {
  primaryConversationId: number
  tenantId: number
  userId: number
}) {
  return `${tenantId}:${userId}:${primaryConversationId}`
}

export function createChatRealtimeHub() {
  const subscriptionsByKey = new Map<string, Set<RealtimeSubscription>>()

  function unsubscribe(subscription: RealtimeSubscription) {
    const key = buildSubscriptionKey(subscription)
    const subscriptions = subscriptionsByKey.get(key)

    if (!subscriptions) {
      return
    }

    subscriptions.delete(subscription)

    if (subscriptions.size === 0) {
      subscriptionsByKey.delete(key)
    }
  }

  return {
    publishMessages({
      primaryConversationId,
      snapshot,
      tenantId,
      userId,
    }: {
      primaryConversationId: number
      snapshot: ChatMessagesSnapshot
      tenantId: number
      userId: number
    }) {
      const subscriptions = subscriptionsByKey.get(
        buildSubscriptionKey({
          primaryConversationId,
          tenantId,
          userId,
        }),
      )

      if (!subscriptions) {
        return 0
      }

      for (const subscription of subscriptions) {
        subscription.send({
          data: snapshot,
          type: snapshot.result === 'ready' ? 'messages' : 'chat-state',
        })
      }

      return subscriptions.size
    },

    subscribe(subscription: RealtimeSubscription): RealtimeSubscribeResult {
      const key = buildSubscriptionKey(subscription)
      const subscriptions = subscriptionsByKey.get(key) ?? new Set()

      if (subscriptions.size >= CHAT_REALTIME_MAX_SUBSCRIPTIONS_PER_KEY) {
        return {
          limit: CHAT_REALTIME_MAX_SUBSCRIPTIONS_PER_KEY,
          status: 'limit_exceeded',
        }
      }

      subscriptions.add(subscription)
      subscriptionsByKey.set(key, subscriptions)

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
