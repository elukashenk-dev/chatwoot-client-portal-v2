import { useCallback, useEffect, useRef, useState } from 'react'

import {
  ChatApiClientError,
  getChatMessages,
  sendChatAttachment,
} from '../api/chatClient'
import type { ChatMessagesSnapshot } from '../types'
import { ChatHeader } from '../components/ChatHeader'
import { ChatLoadingState } from '../components/ChatLoadingState'
import { ChatNotReadyState } from '../components/ChatNotReadyState'
import { ChatRuntimeAlerts } from '../components/ChatRuntimeAlerts'
import { ChatTranscript } from '../components/ChatTranscript'
import {
  MessageComposer,
  type MessageComposerReplyTarget,
} from '../components/MessageComposer'
import {
  buildSnapshotFromSendResult,
  isFirstConversationBootstrapReady,
  mergeOlderMessages,
  mergeRealtimeSnapshot,
  toComposerReplyTarget,
} from '../lib/chatSnapshot'
import { useChatResumeResync } from '../lib/useChatResumeResync'
import { useBrowserConnectionState } from '../lib/useBrowserConnectionState'
import { mergeOptimisticTextMessages } from '../lib/optimisticTextMessages'
import { useAuthSession } from '../../auth/lib/authSessionContext'
import type { ChatPageState } from './chatPageState'
import { useChatRealtimeConnection } from './useChatRealtimeConnection'
import { useOptimisticTextSend } from './useOptimisticTextSend'

const OFFLINE_RUNTIME_MESSAGE =
  'Нет соединения. Новые сообщения временно не обновляются, а отправка отключена.'

export function ChatPage() {
  const isMountedRef = useRef(false)
  const { refreshSession } = useAuthSession()
  const [pageState, setPageState] = useState<ChatPageState>({
    snapshot: null,
    status: 'loading',
  })
  const [historyErrorMessage, setHistoryErrorMessage] = useState<string | null>(
    null,
  )
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [replyTarget, setReplyTarget] =
    useState<MessageComposerReplyTarget | null>(null)
  const [sendErrorMessage, setSendErrorMessage] = useState<string | null>(null)
  const {
    isOnline: isBrowserOnline,
    markOffline: markBrowserOffline,
    markOnline: markBrowserOnline,
    navigatorHintIsOnline,
  } = useBrowserConnectionState()
  const isRealtimeSupported = typeof EventSource !== 'undefined'

  const handleUnauthorizedChatError = useCallback(
    async (error: unknown) => {
      if (!(error instanceof ChatApiClientError) || error.statusCode !== 401) {
        return false
      }

      await refreshSession()

      return true
    },
    [refreshSession],
  )

  const handleConnectionUnavailableError = useCallback(
    (error: unknown) => {
      if (!(error instanceof ChatApiClientError) || error.statusCode !== 0) {
        return false
      }

      markBrowserOffline()

      return true
    },
    [markBrowserOffline],
  )

  const loadInitialChat = useCallback(async () => {
    setHistoryErrorMessage(null)
    setPageState((currentState) => ({
      snapshot: currentState.snapshot,
      status: 'loading',
    }))

    try {
      const snapshot = await getChatMessages()

      if (!isMountedRef.current) {
        return
      }

      markBrowserOnline()
      setPageState({
        snapshot,
        status: 'ready',
      })
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      if (await handleUnauthorizedChatError(error)) {
        return
      }

      handleConnectionUnavailableError(error)

      setPageState({
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Мы не смогли загрузить чат. Попробуйте еще раз.',
        snapshot: null,
        status: 'error',
      })
    }
  }, [
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    markBrowserOnline,
  ])

  async function handleLoadOlderMessages() {
    if (
      !isBrowserOnline ||
      pageState.status !== 'ready' ||
      !pageState.snapshot.primaryConversation ||
      !pageState.snapshot.nextOlderCursor
    ) {
      return
    }

    setIsLoadingOlder(true)
    setHistoryErrorMessage(null)

    try {
      const olderSnapshot = await getChatMessages({
        beforeMessageId: pageState.snapshot.nextOlderCursor,
        primaryConversationId: pageState.snapshot.primaryConversation.id,
      })

      if (!isMountedRef.current) {
        return
      }

      if (olderSnapshot.result !== 'ready') {
        setHistoryErrorMessage(
          'Не удалось загрузить более ранние сообщения. Попробуйте еще раз.',
        )

        return
      }

      markBrowserOnline()
      setPageState((currentState) => {
        if (currentState.status !== 'ready') {
          return currentState
        }

        return {
          snapshot: mergeOlderMessages(currentState.snapshot, olderSnapshot),
          status: 'ready',
        }
      })
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      if (await handleUnauthorizedChatError(error)) {
        return
      }

      handleConnectionUnavailableError(error)

      setHistoryErrorMessage(
        'Не удалось загрузить более ранние сообщения. Попробуйте еще раз.',
      )
    } finally {
      if (isMountedRef.current) {
        setIsLoadingOlder(false)
      }
    }
  }

  async function handleSendAttachment({
    clientMessageKey,
    content,
    file,
    replyToMessageId,
  }: {
    clientMessageKey: string
    content?: string | null
    file: File
    replyToMessageId?: number | null
  }) {
    if (!isBrowserOnline || pageState.status !== 'ready') {
      return false
    }

    setIsSending(true)
    setSendErrorMessage(null)

    try {
      const sendResult = await sendChatAttachment({
        clientMessageKey,
        content,
        file,
        primaryConversationId:
          pageState.snapshot.primaryConversation?.id ?? null,
        replyToMessageId,
      })

      if (!isMountedRef.current) {
        return false
      }

      if (sendResult.result !== 'ready' || !sendResult.sentMessage) {
        setSendErrorMessage('Не удалось отправить файл. Попробуйте еще раз.')
        return false
      }

      markBrowserOnline()
      setPageState((currentState) => {
        const currentSnapshot =
          currentState.status === 'ready' ? currentState.snapshot : null

        return {
          snapshot: buildSnapshotFromSendResult({
            currentSnapshot,
            sendResult,
          }),
          status: 'ready',
        }
      })

      return true
    } catch (error) {
      if (!isMountedRef.current) {
        return false
      }

      if (await handleUnauthorizedChatError(error)) {
        return false
      }

      if (handleConnectionUnavailableError(error)) {
        return false
      }

      setSendErrorMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось отправить файл. Попробуйте еще раз.',
      )

      return false
    } finally {
      if (isMountedRef.current) {
        setIsSending(false)
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

  const refreshChatSnapshot = useCallback(async () => {
    const primaryConversationId =
      pageState.status === 'ready' && pageState.snapshot.primaryConversation
        ? pageState.snapshot.primaryConversation.id
        : null

    let latestSnapshot: ChatMessagesSnapshot

    try {
      latestSnapshot = await getChatMessages({
        primaryConversationId,
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

    if (!isMountedRef.current) {
      return
    }

    markBrowserOnline()
    setPageState((currentState) => {
      if (
        currentState.status === 'ready' &&
        currentState.snapshot.result === 'ready' &&
        latestSnapshot.result === 'ready'
      ) {
        return {
          snapshot: mergeRealtimeSnapshot({
            currentSnapshot: currentState.snapshot,
            realtimeSnapshot: latestSnapshot,
          }),
          status: 'ready',
        }
      }

      return {
        snapshot: latestSnapshot,
        status: 'ready',
      }
    })
  }, [
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    markBrowserOnline,
    pageState,
  ])
  const resyncStatus = useChatResumeResync({
    canAttemptResync: isBrowserOnline || navigatorHintIsOnline,
    loadInitialChat,
    refreshChatSnapshot,
    snapshotExists: Boolean(pageState.snapshot),
  })

  const snapshot = pageState.snapshot
  const realtimePrimaryConversationId =
    pageState.status === 'ready' &&
    pageState.snapshot.result === 'ready' &&
    pageState.snapshot.primaryConversation
      ? pageState.snapshot.primaryConversation.id
      : null

  useChatRealtimeConnection({
    isMountedRef,
    markBrowserOnline,
    primaryConversationId: realtimePrimaryConversationId,
    setPageState,
  })

  const isReady =
    snapshot?.result === 'ready' && Boolean(snapshot.primaryConversation)
  const canSend =
    pageState.status === 'ready' &&
    (isReady || isFirstConversationBootstrapReady(pageState.snapshot))
  const shouldRenderTranscript =
    pageState.status === 'ready' &&
    (pageState.snapshot.result === 'ready' ||
      isFirstConversationBootstrapReady(pageState.snapshot))
  const { handleRetryTextMessage, handleSendMessage, optimisticTextSends } =
    useOptimisticTextSend({
      handleConnectionUnavailableError,
      handleUnauthorizedChatError,
      isBrowserOnline,
      isMountedRef,
      markBrowserOnline,
      onTextSendStarted: () => {
        setSendErrorMessage(null)
      },
      pageState,
      replyTarget,
      setPageState,
    })
  const visibleMessages =
    pageState.status === 'ready'
      ? mergeOptimisticTextMessages({
          messages: pageState.snapshot.messages,
          optimisticTextSends,
        })
      : []

  return (
    <>
      <ChatHeader
        conversation={snapshot?.primaryConversation ?? null}
        isReady={isReady}
      />
      <ChatRuntimeAlerts
        isOnline={isBrowserOnline}
        isRealtimeSupported={isRealtimeSupported}
        resyncStatus={resyncStatus}
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
        pageState.snapshot.result !== 'ready' &&
        !isFirstConversationBootstrapReady(pageState.snapshot) ? (
          <ChatNotReadyState
            isUnavailable={pageState.snapshot.result === 'unavailable'}
            onRetry={() => {
              void loadInitialChat()
            }}
            reason={pageState.snapshot.reason}
          />
        ) : null}

        {shouldRenderTranscript ? (
          <ChatTranscript
            hasMoreOlder={pageState.snapshot.hasMoreOlder}
            historyErrorMessage={historyErrorMessage}
            isConnectionAvailable={isBrowserOnline}
            isLoadingOlder={isLoadingOlder}
            messages={visibleMessages}
            onLoadOlder={() => {
              void handleLoadOlderMessages()
            }}
            onReplyToMessage={(message) => {
              setReplyTarget(toComposerReplyTarget(message))
            }}
            onRetryTextMessage={handleRetryTextMessage}
          />
        ) : null}

        <MessageComposer
          disabled={!canSend || !isBrowserOnline}
          errorMessage={sendErrorMessage}
          isSending={isSending}
          offlineAlertMessage={isBrowserOnline ? null : OFFLINE_RUNTIME_MESSAGE}
          onCancelReply={() => {
            setReplyTarget(null)
          }}
          onSend={handleSendMessage}
          onSendAttachment={handleSendAttachment}
          replyTarget={replyTarget}
        />
      </div>
    </>
  )
}
