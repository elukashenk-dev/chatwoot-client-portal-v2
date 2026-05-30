import { useEffect } from 'react'

import {
  saveOfflineMessageSnapshot,
  saveOfflineLatestMessagePage,
  saveOfflineThreadList,
  toBoundedOfflineMessageSnapshot,
} from './offlineChatCache'
import type { ChatPageState } from './chatPageState'
import { saveStartupChatFallback } from '../../offline/startupCache'

type UseOfflineChatCachePersistenceInput = {
  pageState: ChatPageState
  tenantSlug: string | null
  userId: number | null
}

export function useOfflineChatCachePersistence({
  pageState,
  tenantSlug,
  userId,
}: UseOfflineChatCachePersistenceInput) {
  useEffect(() => {
    if (
      !tenantSlug ||
      userId === null ||
      pageState.isUsingCachedData ||
      !pageState.selectedThreadId ||
      pageState.threads.length === 0
    ) {
      return
    }

    void saveOfflineThreadList({
      activeThreadId: pageState.selectedThreadId,
      tenantSlug,
      threads: pageState.threads,
      userId,
    }).catch(() => undefined)
  }, [
    pageState.isUsingCachedData,
    pageState.selectedThreadId,
    pageState.threads,
    tenantSlug,
    userId,
  ])

  useEffect(() => {
    if (
      !tenantSlug ||
      userId === null ||
      pageState.status !== 'ready' ||
      pageState.isUsingCachedData ||
      !pageState.selectedThreadId
    ) {
      return
    }

    void saveOfflineMessageSnapshot({
      snapshot: pageState.snapshot,
      tenantSlug,
      threadId: pageState.selectedThreadId,
      userId,
    }).catch(() => undefined)
    void saveOfflineLatestMessagePage({
      snapshot: pageState.snapshot,
      tenantSlug,
      threadId: pageState.selectedThreadId,
      userId,
    }).catch(() => undefined)
    saveStartupChatFallback({
      host: window.location.host,
      selectedThreadId: pageState.selectedThreadId,
      snapshot: toBoundedOfflineMessageSnapshot(pageState.snapshot),
      tenantSlug,
      threads: pageState.threads,
      userId,
    })
  }, [
    pageState.isUsingCachedData,
    pageState.selectedThreadId,
    pageState.snapshot,
    pageState.status,
    pageState.threads,
    tenantSlug,
    userId,
  ])
}
