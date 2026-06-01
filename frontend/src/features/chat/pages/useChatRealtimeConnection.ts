import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useEffect } from 'react'

import { openChatRealtime } from '../api/chatRealtimeClient'
import { mergeRealtimeSnapshot } from '../lib/chatSnapshot'
import {
  clearChatThreadNotifications,
  setAppIconBadgeCount,
} from '../../../pwa/serviceWorkerRuntime'
import {
  ONLINE_CHAT_PAGE_CACHE_STATE,
  clearThreadUnreadCount,
  type ChatPageState,
} from './chatPageState'

type UseChatRealtimeConnectionInput = {
  isMountedRef: MutableRefObject<boolean>
  markBrowserOnline: () => void
  setPageState: Dispatch<SetStateAction<ChatPageState>>
  threadId: string | null
}

export function useChatRealtimeConnection({
  isMountedRef,
  markBrowserOnline,
  setPageState,
  threadId,
}: UseChatRealtimeConnectionInput) {
  useEffect(() => {
    if (!threadId) {
      return
    }

    const realtimeConnection = openChatRealtime({
      onChatState: (realtimeSnapshot) => {
        if (!isMountedRef.current) {
          return
        }

        if (
          realtimeSnapshot.activeThread !== null &&
          realtimeSnapshot.activeThread.id !== threadId
        ) {
          return
        }

        markBrowserOnline()
        if (realtimeSnapshot.unread) {
          void setAppIconBadgeCount(realtimeSnapshot.unread.totalUnreadCount)
          void clearChatThreadNotifications(
            realtimeSnapshot.unread.clearedThreadId,
          )
        }
        setPageState((currentState) => {
          if (
            currentState.selectedThreadId !== threadId ||
            (realtimeSnapshot.activeThread !== null &&
              realtimeSnapshot.activeThread.id !== threadId)
          ) {
            return currentState
          }

          return {
            ...ONLINE_CHAT_PAGE_CACHE_STATE,
            snapshot: realtimeSnapshot,
            selectedThreadId: currentState.selectedThreadId,
            status: 'ready',
            threads: realtimeSnapshot.unread
              ? clearThreadUnreadCount(
                  currentState.threads,
                  realtimeSnapshot.unread.clearedThreadId,
                )
              : currentState.threads,
          }
        })
      },
      onMessages: (realtimeSnapshot) => {
        if (!isMountedRef.current) {
          return
        }

        if (
          realtimeSnapshot.activeThread !== null &&
          realtimeSnapshot.activeThread.id !== threadId
        ) {
          return
        }

        markBrowserOnline()
        if (realtimeSnapshot.unread) {
          void setAppIconBadgeCount(realtimeSnapshot.unread.totalUnreadCount)
          void clearChatThreadNotifications(
            realtimeSnapshot.unread.clearedThreadId,
          )
        }
        setPageState((currentState) => {
          if (
            currentState.status !== 'ready' ||
            currentState.selectedThreadId !== threadId ||
            (realtimeSnapshot.activeThread !== null &&
              realtimeSnapshot.activeThread.id !== threadId)
          ) {
            return currentState
          }

          return {
            ...ONLINE_CHAT_PAGE_CACHE_STATE,
            snapshot: mergeRealtimeSnapshot({
              currentSnapshot: currentState.snapshot,
              realtimeSnapshot,
            }),
            selectedThreadId: currentState.selectedThreadId,
            status: 'ready',
            threads: realtimeSnapshot.unread
              ? clearThreadUnreadCount(
                  currentState.threads,
                  realtimeSnapshot.unread.clearedThreadId,
                )
              : currentState.threads,
          }
        })
      },
      onOpen: () => {
        if (!isMountedRef.current) {
          return
        }

        markBrowserOnline()
      },
      threadId,
    })

    return () => {
      realtimeConnection.close()
    }
  }, [isMountedRef, markBrowserOnline, setPageState, threadId])
}
