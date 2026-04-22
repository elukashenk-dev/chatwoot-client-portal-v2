import type { ChatMessagesSnapshot } from '../chat-messages/service.js'

type RealtimeSubscription = {
  primaryConversationId: number
  send: (event: ChatRealtimeEvent) => void
  userId: number
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
  userId,
}: {
  primaryConversationId: number
  userId: number
}) {
  return `${userId}:${primaryConversationId}`
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
      userId,
    }: {
      primaryConversationId: number
      snapshot: ChatMessagesSnapshot
      userId: number
    }) {
      const subscriptions = subscriptionsByKey.get(
        buildSubscriptionKey({
          primaryConversationId,
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

    subscribe(subscription: RealtimeSubscription) {
      const key = buildSubscriptionKey(subscription)
      const subscriptions = subscriptionsByKey.get(key) ?? new Set()

      subscriptions.add(subscription)
      subscriptionsByKey.set(key, subscriptions)

      return () => {
        unsubscribe(subscription)
      }
    },
  }
}

export type ChatRealtimeHub = ReturnType<typeof createChatRealtimeHub>
