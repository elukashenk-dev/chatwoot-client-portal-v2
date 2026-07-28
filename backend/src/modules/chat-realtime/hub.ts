import type { ChatMessagesSnapshot } from '../chat-messages/service.js'
import { REALTIME_SESSION_AUTHORITY_BATCH_SIZE } from '../auth/realtimeSessionAuthority.js'

type RealtimeSubscription = {
  close: () => void
  send: (event: ChatRealtimeEvent) => void
  sessionId: number
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

type ResolveActiveSessions = (input: {
  candidates: Array<{ sessionId: number; userId: number }>
  tenantId: number
}) => Promise<Array<{ sessionId: number; userId: number }>>

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

function buildAuthorityBatches(subscriptions: RealtimeSubscription[]) {
  const subscriptionsByUser = new Map<number, RealtimeSubscription[]>()

  for (const subscription of subscriptions) {
    const userSubscriptions = subscriptionsByUser.get(subscription.userId) ?? []
    userSubscriptions.push(subscription)
    subscriptionsByUser.set(subscription.userId, userSubscriptions)
  }

  const batches: RealtimeSubscription[][] = []
  let currentBatch: RealtimeSubscription[] = []

  for (const userSubscriptions of subscriptionsByUser.values()) {
    if (
      currentBatch.length > 0 &&
      currentBatch.length + userSubscriptions.length >
        REALTIME_SESSION_AUTHORITY_BATCH_SIZE
    ) {
      batches.push(currentBatch)
      currentBatch = []
    }

    currentBatch.push(...userSubscriptions)
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }

  return batches
}

export function createChatRealtimeHub({
  resolveActiveSessions,
}: {
  resolveActiveSessions: ResolveActiveSessions
}) {
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

  async function authorizeSubscriptions(subscriptions: RealtimeSubscription[]) {
    const tenantId = subscriptions[0]?.tenantId

    if (tenantId === undefined) {
      return []
    }

    const activeSessions = await resolveActiveSessions({
      candidates: subscriptions.map(({ sessionId, userId }) => ({
        sessionId,
        userId,
      })),
      tenantId,
    })
    const activeUserBySession = new Map(
      activeSessions.map(({ sessionId, userId }) => [sessionId, userId]),
    )
    const authorizedSubscriptions: RealtimeSubscription[] = []

    for (const subscription of subscriptions) {
      if (
        activeUserBySession.get(subscription.sessionId) === subscription.userId
      ) {
        authorizedSubscriptions.push(subscription)
        continue
      }

      unsubscribe(subscription)
      subscription.close()
    }

    return authorizedSubscriptions
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

      for (const batch of buildAuthorityBatches([...subscriptions])) {
        const initiallyAuthorized = await authorizeSubscriptions(batch)

        if (initiallyAuthorized.length === 0) {
          continue
        }

        const snapshotsByUser = new Map<number, ChatMessagesSnapshot>()

        for (const { userId } of initiallyAuthorized) {
          if (!snapshotsByUser.has(userId)) {
            snapshotsByUser.set(userId, await createSnapshotForUser(userId))
          }
        }

        const finallyAuthorized =
          await authorizeSubscriptions(initiallyAuthorized)

        for (const subscription of finallyAuthorized) {
          const snapshot = snapshotsByUser.get(subscription.userId)

          if (!snapshot || snapshot.result !== 'ready') {
            continue
          }

          subscription.send({
            data: snapshot,
            type: 'messages',
          })
          delivered += 1
        }
      }

      return delivered
    },

    async publishThreadTyping({
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

      for (const batch of buildAuthorityBatches([...subscriptions])) {
        const authorizedSubscriptions = await authorizeSubscriptions(batch)

        for (const subscription of authorizedSubscriptions) {
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
