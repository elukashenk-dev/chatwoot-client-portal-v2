import { offlineStore } from '../../offline/offlineStore'
import {
  OFFLINE_MESSAGE_SNAPSHOT_LIMIT,
  type OfflineChatThreadListRecord,
} from '../../offline/types'
import { isFirstConversationBootstrapReady } from '../lib/chatSnapshot'
import type { ChatMessagesSnapshot, ChatThreadListSummary } from '../types'

type OfflineChatScope = {
  tenantSlug: string
  userId: number
}

type SaveOfflineThreadListInput = OfflineChatScope & {
  activeThreadId: string
  savedAt?: string
  threads: ChatThreadListSummary[]
}

type SaveOfflineMessageSnapshotInput = OfflineChatScope & {
  savedAt?: string
  snapshot: ChatMessagesSnapshot
  threadId: string
}

type SaveOfflineMessagePageInput = SaveOfflineMessageSnapshotInput & {
  pageCursor: 'latest' | `before:${number}`
}

type ReadOfflineOlderMessagePageInput = OfflineChatScope & {
  pageCursor: `before:${number}`
  threadId: string
}

type ConsumePushStaleMarkersInput = OfflineChatScope & {
  refreshThread: (threadId: string) => Promise<ChatMessagesSnapshot>
  threads: ChatThreadListSummary[]
}

export type OfflineChatFallback = {
  cachedSavedAt: string
  selectedThreadId: string
  snapshot: ChatMessagesSnapshot
  threads: ChatThreadListSummary[]
}

export type PushStaleThreadRefresh = {
  snapshot: ChatMessagesSnapshot
  threadId: string
}

export function shouldSaveOfflineMessageSnapshot(
  snapshot: ChatMessagesSnapshot,
) {
  return (
    snapshot.result === 'ready' || isFirstConversationBootstrapReady(snapshot)
  )
}

export function toBoundedOfflineMessageSnapshot(
  snapshot: ChatMessagesSnapshot,
): ChatMessagesSnapshot {
  const messages = snapshot.messages.slice(-OFFLINE_MESSAGE_SNAPSHOT_LIMIT)
  const wasTrimmed = messages.length < snapshot.messages.length

  return {
    ...snapshot,
    hasMoreOlder: snapshot.hasMoreOlder || wasTrimmed,
    messages,
    nextOlderCursor: wasTrimmed
      ? (messages[0]?.id ?? snapshot.nextOlderCursor)
      : snapshot.nextOlderCursor,
  }
}

export async function saveOfflineThreadList({
  activeThreadId,
  savedAt = new Date().toISOString(),
  tenantSlug,
  threads,
  userId,
}: SaveOfflineThreadListInput) {
  await offlineStore.saveThreadList({
    activeThreadId,
    savedAt,
    tenantSlug,
    threads,
    userId,
  })
}

export async function saveOfflineMessageSnapshot({
  savedAt = new Date().toISOString(),
  snapshot,
  tenantSlug,
  threadId,
  userId,
}: SaveOfflineMessageSnapshotInput) {
  if (!shouldSaveOfflineMessageSnapshot(snapshot)) {
    return
  }

  await offlineStore.saveMessageSnapshot({
    savedAt,
    snapshot: toBoundedOfflineMessageSnapshot(snapshot),
    tenantSlug,
    threadId,
    userId,
  })
}

export async function saveOfflineLatestMessagePage({
  savedAt = new Date().toISOString(),
  snapshot,
  tenantSlug,
  threadId,
  userId,
}: SaveOfflineMessageSnapshotInput) {
  await saveOfflineMessagePage({
    pageCursor: 'latest',
    savedAt,
    snapshot,
    tenantSlug,
    threadId,
    userId,
  })
}

export async function saveOfflineOlderMessagePage({
  pageCursor,
  savedAt = new Date().toISOString(),
  snapshot,
  tenantSlug,
  threadId,
  userId,
}: SaveOfflineMessagePageInput) {
  await saveOfflineMessagePage({
    pageCursor,
    savedAt,
    snapshot,
    tenantSlug,
    threadId,
    userId,
  })
}

async function saveOfflineMessagePage({
  pageCursor,
  savedAt = new Date().toISOString(),
  snapshot,
  tenantSlug,
  threadId,
  userId,
}: SaveOfflineMessagePageInput) {
  if (!shouldSaveOfflineMessageSnapshot(snapshot)) {
    return
  }

  await offlineStore.saveMessagePage({
    pageCursor,
    savedAt,
    snapshot,
    tenantSlug,
    threadId,
    userId,
  })
}

export async function readOfflineOlderMessagePage({
  pageCursor,
  tenantSlug,
  threadId,
  userId,
}: ReadOfflineOlderMessagePageInput): Promise<ChatMessagesSnapshot | null> {
  try {
    const cachedPage = await offlineStore.readMessagePage(
      tenantSlug,
      userId,
      threadId,
      pageCursor,
    )

    if (!cachedPage || !shouldSaveOfflineMessageSnapshot(cachedPage.snapshot)) {
      return null
    }

    if (
      cachedPage.snapshot.activeThread &&
      cachedPage.snapshot.activeThread.id !== threadId
    ) {
      return null
    }

    return cachedPage.snapshot
  } catch {
    return null
  }
}

export function selectCachedThreadId({
  cachedThreads,
  preferredThreadId,
}: {
  cachedThreads: OfflineChatThreadListRecord
  preferredThreadId: string | null
}) {
  const threadIds = new Set<string>(
    cachedThreads.threads.map((thread) => thread.id),
  )

  if (preferredThreadId && threadIds.has(preferredThreadId)) {
    return preferredThreadId
  }

  if (threadIds.has(cachedThreads.activeThreadId)) {
    return cachedThreads.activeThreadId
  }

  return cachedThreads.threads[0]?.id ?? null
}

export async function readOfflineChatFallback({
  preferredThreadId,
  tenantSlug,
  userId,
}: OfflineChatScope & {
  preferredThreadId: string | null
}): Promise<OfflineChatFallback | null> {
  try {
    const cachedThreads = await offlineStore.readThreadList(tenantSlug, userId)

    if (!cachedThreads) {
      return null
    }

    const selectedThreadId = selectCachedThreadId({
      cachedThreads,
      preferredThreadId,
    })

    if (!selectedThreadId) {
      return null
    }

    const cachedSnapshot = await offlineStore.readMessageSnapshot(
      tenantSlug,
      userId,
      selectedThreadId,
    )

    if (!cachedSnapshot) {
      return null
    }

    if (!shouldSaveOfflineMessageSnapshot(cachedSnapshot.snapshot)) {
      return null
    }

    if (
      cachedSnapshot.snapshot.result === 'ready' &&
      !cachedSnapshot.snapshot.activeThread
    ) {
      return null
    }

    if (
      cachedSnapshot.snapshot.activeThread &&
      cachedSnapshot.snapshot.activeThread.id !== selectedThreadId
    ) {
      return null
    }

    return {
      cachedSavedAt: cachedSnapshot.savedAt,
      selectedThreadId,
      snapshot: cachedSnapshot.snapshot,
      threads: cachedThreads.threads,
    }
  } catch {
    return null
  }
}

export async function consumePushStaleMarkersForKnownThreads({
  refreshThread,
  tenantSlug,
  threads,
  userId,
}: ConsumePushStaleMarkersInput): Promise<PushStaleThreadRefresh[]> {
  const knownThreadIds = new Set<string>(threads.map((thread) => thread.id))
  const markers = (
    await offlineStore.listPushStaleMarkers(tenantSlug, userId)
  ).filter((marker) => knownThreadIds.has(marker.threadId))
  const refreshed: PushStaleThreadRefresh[] = []

  for (const threadId of [
    ...new Set(markers.map((marker) => marker.threadId)),
  ]) {
    const snapshot = await refreshThread(threadId)
    const canUseRefresh =
      shouldSaveOfflineMessageSnapshot(snapshot) &&
      snapshot.activeThread?.id === threadId

    if (!canUseRefresh) {
      continue
    }

    await saveOfflineMessageSnapshot({
      snapshot,
      tenantSlug,
      threadId,
      userId,
    })
    await offlineStore.deletePushStaleMarkers(
      markers.filter((marker) => marker.threadId === threadId),
    )
    refreshed.push({
      snapshot,
      threadId,
    })
  }

  return refreshed
}
