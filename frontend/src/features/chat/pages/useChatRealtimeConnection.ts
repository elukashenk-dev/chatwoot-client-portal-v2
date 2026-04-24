import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useEffect } from 'react'

import { openChatRealtime } from '../api/chatRealtimeClient'
import { mergeRealtimeSnapshot } from '../lib/chatSnapshot'
import type { ChatPageState } from './chatPageState'

type UseChatRealtimeConnectionInput = {
  isMountedRef: MutableRefObject<boolean>
  markBrowserOnline: () => void
  primaryConversationId: number | null
  setPageState: Dispatch<SetStateAction<ChatPageState>>
}

export function useChatRealtimeConnection({
  isMountedRef,
  markBrowserOnline,
  primaryConversationId,
  setPageState,
}: UseChatRealtimeConnectionInput) {
  useEffect(() => {
    if (!primaryConversationId) {
      return
    }

    const realtimeConnection = openChatRealtime({
      onChatState: (realtimeSnapshot) => {
        if (!isMountedRef.current) {
          return
        }

        markBrowserOnline()
        setPageState({
          snapshot: realtimeSnapshot,
          status: 'ready',
        })
      },
      onMessages: (realtimeSnapshot) => {
        if (!isMountedRef.current) {
          return
        }

        markBrowserOnline()
        setPageState((currentState) => {
          if (currentState.status !== 'ready') {
            return currentState
          }

          return {
            snapshot: mergeRealtimeSnapshot({
              currentSnapshot: currentState.snapshot,
              realtimeSnapshot,
            }),
            status: 'ready',
          }
        })
      },
      onOpen: () => {
        if (!isMountedRef.current) {
          return
        }

        markBrowserOnline()
      },
      primaryConversationId,
    })

    return () => {
      realtimeConnection.close()
    }
  }, [isMountedRef, markBrowserOnline, primaryConversationId, setPageState])
}
