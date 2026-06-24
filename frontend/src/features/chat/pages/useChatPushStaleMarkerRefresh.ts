import { useEffect, type Dispatch, type SetStateAction } from 'react'

import { getChatMessages } from '../api/chatClient'
import {
  clearChatThreadNotifications,
  setAppIconBadgeCount,
} from '../../../pwa/serviceWorkerRuntime'
import {
  ONLINE_CHAT_PAGE_CACHE_STATE,
  clearThreadUnreadCount,
  type ChatPageState,
} from './chatPageState'
import { withChatRecoveryRequestTimeout } from './chatRecoveryRequestTimeout'
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

    const selectedThread = pageState.threads.find(
      (thread) => thread.id === pageState.selectedThreadId,
    )

    if (!selectedThread) {
      return
    }

    let isCurrent = true

    consumePushStaleMarkersForKnownThreads({
      refreshThread: (threadId) =>
        withChatRecoveryRequestTimeout((signal) =>
          getChatMessages({ signal, threadId }),
        ),
      tenantSlug,
      threads: [selectedThread],
      userId,
    })
      .then((refreshedThreads) => {
        if (!isCurrent || refreshedThreads.length === 0) {
          return
        }

        const selectedRefresh = refreshedThreads.find(
          (refresh) => refresh.threadId === pageState.selectedThreadId,
        )

        if (!selectedRefresh) {
          return
        }

        if (selectedRefresh.snapshot.unread) {
          void setAppIconBadgeCount(
            selectedRefresh.snapshot.unread.totalUnreadCount,
          )
          void clearChatThreadNotifications(
            selectedRefresh.snapshot.unread.clearedThreadId,
          )
        }

        setPageState((currentState) => {
          if (currentState.status !== 'ready') {
            return currentState
          }

          if (selectedRefresh.threadId !== currentState.selectedThreadId) {
            return currentState
          }

          return {
            ...ONLINE_CHAT_PAGE_CACHE_STATE,
            selectedThreadId: currentState.selectedThreadId,
            snapshot: selectedRefresh.snapshot,
            status: 'ready',
            threads: selectedRefresh.snapshot.unread
              ? clearThreadUnreadCount(
                  currentState.threads,
                  selectedRefresh.snapshot.unread.clearedThreadId,
                )
              : currentState.threads,
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
