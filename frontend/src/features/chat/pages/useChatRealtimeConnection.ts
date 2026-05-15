import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useEffect } from 'react'

import { openChatRealtime } from '../api/chatRealtimeClient'
import { mergeRealtimeSnapshot } from '../lib/chatSnapshot'
import type { ChatPageState } from './chatPageState'

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

        markBrowserOnline()
        setPageState((currentState) => {
          if (
            currentState.selectedThreadId !== threadId ||
            (realtimeSnapshot.activeThread !== null &&
              realtimeSnapshot.activeThread.id !== threadId)
          ) {
            return currentState
          }

          return {
            snapshot: realtimeSnapshot,
            selectedThreadId: currentState.selectedThreadId,
            status: 'ready',
            threads: currentState.threads,
          }
        })
      },
      onMessages: (realtimeSnapshot) => {
        if (!isMountedRef.current) {
          return
        }

        markBrowserOnline()
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
            snapshot: mergeRealtimeSnapshot({
              currentSnapshot: currentState.snapshot,
              realtimeSnapshot,
            }),
            selectedThreadId: currentState.selectedThreadId,
            status: 'ready',
            threads: currentState.threads,
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
