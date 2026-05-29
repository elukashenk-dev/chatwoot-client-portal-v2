import { useEffect, type Dispatch, type SetStateAction } from 'react'

import { getChatMessages } from '../api/chatClient'
import {
  ONLINE_CHAT_PAGE_CACHE_STATE,
  type ChatPageState,
} from './chatPageState'
import { consumePushStaleMarkersForKnownThreads } from './offlineChatCache'

type UseChatPushStaleMarkerRefreshInput = {
  isBrowserOnline: boolean
  pageState: ChatPageState
  setPageState: Dispatch<SetStateAction<ChatPageState>>
  tenantSlug: string | null
  userId: number | null
}

export function useChatPushStaleMarkerRefresh({
  isBrowserOnline,
  pageState,
  setPageState,
  tenantSlug,
  userId,
}: UseChatPushStaleMarkerRefreshInput) {
  useEffect(() => {
    if (
      !isBrowserOnline ||
      tenantSlug === null ||
      userId === null ||
      pageState.status !== 'ready' ||
      pageState.threads.length === 0
    ) {
      return
    }

    let isCurrent = true

    consumePushStaleMarkersForKnownThreads({
      refreshThread: (threadId) => getChatMessages({ threadId }),
      tenantSlug,
      threads: pageState.threads,
      userId,
    })
      .then((refreshedThreads) => {
        if (!isCurrent || refreshedThreads.length === 0) {
          return
        }

        setPageState((currentState) => {
          if (currentState.status !== 'ready') {
            return currentState
          }

          const selectedRefresh = refreshedThreads.find(
            (refresh) => refresh.threadId === currentState.selectedThreadId,
          )

          if (!selectedRefresh) {
            return currentState
          }

          return {
            ...ONLINE_CHAT_PAGE_CACHE_STATE,
            selectedThreadId: currentState.selectedThreadId,
            snapshot: selectedRefresh.snapshot,
            status: 'ready',
            threads: currentState.threads,
          }
        })
      })
      .catch(() => {
        // Keep markers for the next online attempt.
      })

    return () => {
      isCurrent = false
    }
  }, [isBrowserOnline, pageState, setPageState, tenantSlug, userId])
}
