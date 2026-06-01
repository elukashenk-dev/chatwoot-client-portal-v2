import {
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'

import { getChatMessages } from '../api/chatClient'
import { mergeRealtimeSnapshot } from '../lib/chatSnapshot'
import { PRIVATE_CHAT_THREAD_ID } from '../types'
import {
  clearChatThreadNotifications,
  setAppIconBadgeCount,
} from '../../../pwa/serviceWorkerRuntime'
import {
  ONLINE_CHAT_PAGE_CACHE_STATE,
  clearThreadUnreadCount,
  type ChatPageState,
} from './chatPageState'

type UseChatSnapshotRefreshOptions = {
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isMountedRef: RefObject<boolean>
  markBrowserOnline: () => void
  selectedThreadId: string | null
  setPageState: Dispatch<SetStateAction<ChatPageState>>
}

export function useChatSnapshotRefresh({
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isMountedRef,
  markBrowserOnline,
  selectedThreadId,
  setPageState,
}: UseChatSnapshotRefreshOptions) {
  return useCallback(async () => {
    const threadId = selectedThreadId ?? PRIVATE_CHAT_THREAD_ID

    try {
      const latestSnapshot = await getChatMessages({
        threadId,
      })

      if (!isMountedRef.current) {
        return
      }

      markBrowserOnline()
      if (latestSnapshot.unread) {
        void setAppIconBadgeCount(latestSnapshot.unread.totalUnreadCount)
        void clearChatThreadNotifications(latestSnapshot.unread.clearedThreadId)
      }
      setPageState((currentState) => {
        if (currentState.selectedThreadId !== threadId) {
          return currentState
        }

        if (
          currentState.status === 'ready' &&
          currentState.snapshot.result === 'ready' &&
          latestSnapshot.result === 'ready'
        ) {
          return {
            ...ONLINE_CHAT_PAGE_CACHE_STATE,
            snapshot: mergeRealtimeSnapshot({
              currentSnapshot: currentState.snapshot,
              realtimeSnapshot: latestSnapshot,
            }),
            selectedThreadId: currentState.selectedThreadId,
            status: 'ready',
            threads: latestSnapshot.unread
              ? clearThreadUnreadCount(
                  currentState.threads,
                  latestSnapshot.unread.clearedThreadId,
                )
              : currentState.threads,
          }
        }

        return {
          ...ONLINE_CHAT_PAGE_CACHE_STATE,
          snapshot: latestSnapshot,
          selectedThreadId: currentState.selectedThreadId,
          status: 'ready',
          threads: latestSnapshot.unread
            ? clearThreadUnreadCount(
                currentState.threads,
                latestSnapshot.unread.clearedThreadId,
              )
            : currentState.threads,
        }
      })
    } catch (error) {
      if (await handleUnauthorizedChatError(error)) {
        return
      }

      if (handleConnectionUnavailableError(error)) {
        return
      }

      throw error
    }
  }, [
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isMountedRef,
    markBrowserOnline,
    selectedThreadId,
    setPageState,
  ])
}
