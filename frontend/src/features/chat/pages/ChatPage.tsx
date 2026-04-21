import { useCallback, useEffect, useRef, useState } from 'react'

import { getChatMessages } from '../api/chatClient'
import type { ChatMessagesSnapshot } from '../types'
import { ChatHeader } from '../components/ChatHeader'
import { ChatLoadingState } from '../components/ChatLoadingState'
import { ChatNotReadyState } from '../components/ChatNotReadyState'
import { ChatReadOnlyComposer } from '../components/ChatReadOnlyComposer'
import { ChatTranscript } from '../components/ChatTranscript'

type ChatPageState =
  | {
      status: 'error'
      errorMessage: string
      snapshot: ChatMessagesSnapshot | null
    }
  | {
      status: 'loading'
      snapshot: ChatMessagesSnapshot | null
    }
  | {
      status: 'ready'
      snapshot: ChatMessagesSnapshot
    }

function mergeOlderMessages(
  currentSnapshot: ChatMessagesSnapshot,
  olderSnapshot: ChatMessagesSnapshot,
): ChatMessagesSnapshot {
  const currentIds = new Set(
    currentSnapshot.messages.map((message) => message.id),
  )
  const olderMessages = olderSnapshot.messages.filter(
    (message) => !currentIds.has(message.id),
  )

  return {
    ...olderSnapshot,
    messages: [...olderMessages, ...currentSnapshot.messages],
  }
}

export function ChatPage() {
  const isMountedRef = useRef(false)
  const [pageState, setPageState] = useState<ChatPageState>({
    snapshot: null,
    status: 'loading',
  })
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)

  const loadInitialChat = useCallback(async () => {
    setPageState((currentState) => ({
      snapshot: currentState.snapshot,
      status: 'loading',
    }))

    try {
      const snapshot = await getChatMessages()

      if (!isMountedRef.current) {
        return
      }

      setPageState({
        snapshot,
        status: 'ready',
      })
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      setPageState({
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Мы не смогли загрузить чат. Попробуйте еще раз.',
        snapshot: null,
        status: 'error',
      })
    }
  }, [])

  async function handleLoadOlderMessages() {
    if (
      pageState.status !== 'ready' ||
      !pageState.snapshot.primaryConversation ||
      !pageState.snapshot.nextOlderCursor
    ) {
      return
    }

    setIsLoadingOlder(true)

    try {
      const olderSnapshot = await getChatMessages({
        beforeMessageId: pageState.snapshot.nextOlderCursor,
        primaryConversationId: pageState.snapshot.primaryConversation.id,
      })

      if (!isMountedRef.current) {
        return
      }

      setPageState((currentState) => {
        if (currentState.status !== 'ready') {
          return currentState
        }

        return {
          snapshot: mergeOlderMessages(currentState.snapshot, olderSnapshot),
          status: 'ready',
        }
      })
    } catch {
      if (!isMountedRef.current) {
        return
      }

      setPageState((currentState) => {
        if (currentState.status !== 'ready') {
          return currentState
        }

        return {
          errorMessage:
            'Не удалось загрузить более ранние сообщения. Попробуйте еще раз.',
          snapshot: currentState.snapshot,
          status: 'error',
        }
      })
    } finally {
      if (isMountedRef.current) {
        setIsLoadingOlder(false)
      }
    }
  }

  useEffect(() => {
    isMountedRef.current = true
    const bootstrapTimerId = window.setTimeout(() => {
      void loadInitialChat()
    }, 0)

    return () => {
      window.clearTimeout(bootstrapTimerId)
      isMountedRef.current = false
    }
  }, [loadInitialChat])

  const snapshot = pageState.snapshot
  const isReady =
    snapshot?.result === 'ready' && Boolean(snapshot.primaryConversation)

  return (
    <>
      <ChatHeader
        conversation={snapshot?.primaryConversation ?? null}
        isReady={isReady}
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col bg-transparent">
        {pageState.status === 'loading' ? <ChatLoadingState /> : null}

        {pageState.status === 'error' ? (
          <ChatNotReadyState
            isUnavailable
            onRetry={() => {
              void loadInitialChat()
            }}
            reason={snapshot?.reason ?? 'chatwoot_unavailable'}
          />
        ) : null}

        {pageState.status === 'ready' &&
        pageState.snapshot.result !== 'ready' ? (
          <ChatNotReadyState
            isUnavailable={pageState.snapshot.result === 'unavailable'}
            onRetry={() => {
              void loadInitialChat()
            }}
            reason={pageState.snapshot.reason}
          />
        ) : null}

        {pageState.status === 'ready' &&
        pageState.snapshot.result === 'ready' ? (
          <ChatTranscript
            hasMoreOlder={pageState.snapshot.hasMoreOlder}
            isLoadingOlder={isLoadingOlder}
            messages={pageState.snapshot.messages}
            onLoadOlder={() => {
              void handleLoadOlderMessages()
            }}
          />
        ) : null}

        <ChatReadOnlyComposer />
      </div>
    </>
  )
}
