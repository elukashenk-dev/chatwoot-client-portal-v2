import { useCallback, useEffect, useRef, useState } from 'react'

import {
  ChatApiClientError,
  getChatMessages,
  sendChatAttachment,
} from '../api/chatClient'
import { PRIVATE_CHAT_THREAD_ID, type ChatMessagesSnapshot } from '../types'
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
import { ChatAuxiliaryPages } from './ChatAuxiliaryPages'
import type { ChatPageState } from './chatPageState'
import { useChatRealtimeConnection } from './useChatRealtimeConnection'
import { useChatInfoPanel } from './useChatInfoPanel'
import { useChatMediaPanel } from './useChatMediaPanel'
import { useChatSearchNavigation } from './useChatSearchNavigation'
import { useChatSearchPanel } from './useChatSearchPanel'
import { useChatThreadSelection } from './useChatThreadSelection'
import { useOptimisticTextSend } from './useOptimisticTextSend'

const OFFLINE_RUNTIME_MESSAGE =
  'Нет соединения. Новые сообщения временно не обновляются, а отправка отключена.'

export function ChatPage() {
  const isMountedRef = useRef(false)
  const { refreshSession, user } = useAuthSession()
  const [pageState, setPageState] = useState<ChatPageState>({
    selectedThreadId: null,
    snapshot: null,
    status: 'loading',
    threads: [],
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

  const { handleSelectThread, loadInitialChat } = useChatThreadSelection({
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isMountedRef,
    markBrowserOnline,
    pageState,
    setHistoryErrorMessage,
    setPageState,
    setReplyTarget,
    setSendErrorMessage,
  })
  const chatInfoPanel = useChatInfoPanel({
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isMountedRef,
    markBrowserOnline,
    selectedThreadId: pageState.selectedThreadId,
  })
  const chatMediaPanel = useChatMediaPanel({
    currentSnapshot: pageState.status === 'ready' ? pageState.snapshot : null,
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isMountedRef,
    markBrowserOnline,
    selectedThreadId: pageState.selectedThreadId,
  })
  const chatSearchPanel = useChatSearchPanel({
    currentSnapshot: pageState.status === 'ready' ? pageState.snapshot : null,
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isMountedRef,
    markBrowserOnline,
    selectedThreadId: pageState.selectedThreadId,
  })

  async function handleLoadOlderMessages() {
    if (
      !isBrowserOnline ||
      pageState.status !== 'ready' ||
      !pageState.snapshot.activeThread ||
      !pageState.selectedThreadId ||
      !pageState.snapshot.nextOlderCursor
    ) {
      return
    }

    setIsLoadingOlder(true)
    setHistoryErrorMessage(null)
    const threadId = pageState.selectedThreadId

    try {
      const olderSnapshot = await getChatMessages({
        beforeMessageId: pageState.snapshot.nextOlderCursor,
        threadId,
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
        if (
          currentState.status !== 'ready' ||
          currentState.selectedThreadId !== threadId ||
          olderSnapshot.activeThread?.id !== threadId
        ) {
          return currentState
        }

        return {
          snapshot: mergeOlderMessages(currentState.snapshot, olderSnapshot),
          selectedThreadId: currentState.selectedThreadId,
          status: 'ready',
          threads: currentState.threads,
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
    if (
      !isBrowserOnline ||
      pageState.status !== 'ready' ||
      !pageState.selectedThreadId
    ) {
      return false
    }

    const threadId = pageState.selectedThreadId

    setIsSending(true)
    setSendErrorMessage(null)

    try {
      const sendResult = await sendChatAttachment({
        clientMessageKey,
        content,
        file,
        replyToMessageId,
        threadId,
      })

      if (!isMountedRef.current) {
        return false
      }

      if (sendResult.result !== 'ready' || !sendResult.sentMessage) {
        setSendErrorMessage('Не удалось отправить файл. Попробуйте еще раз.')
        return false
      }

      if (sendResult.activeThread?.id !== threadId) {
        setSendErrorMessage('Не удалось отправить файл. Попробуйте еще раз.')
        return false
      }

      markBrowserOnline()
      setPageState((currentState) => {
        if (currentState.selectedThreadId !== threadId) {
          return currentState
        }

        const currentSnapshot =
          currentState.status === 'ready' ? currentState.snapshot : null

        return {
          snapshot: buildSnapshotFromSendResult({
            currentSnapshot,
            sendResult,
          }),
          selectedThreadId: currentState.selectedThreadId,
          status: 'ready',
          threads: currentState.threads,
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
    let latestSnapshot: ChatMessagesSnapshot
    const threadId = pageState.selectedThreadId ?? PRIVATE_CHAT_THREAD_ID

    try {
      latestSnapshot = await getChatMessages({
        threadId,
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
      if (currentState.selectedThreadId !== threadId) {
        return currentState
      }

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
          selectedThreadId: currentState.selectedThreadId,
          status: 'ready',
          threads: currentState.threads,
        }
      }

      return {
        snapshot: latestSnapshot,
        selectedThreadId: currentState.selectedThreadId,
        status: 'ready',
        threads: currentState.threads,
      }
    })
  }, [
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    markBrowserOnline,
    pageState.selectedThreadId,
  ])
  const resyncStatus = useChatResumeResync({
    canAttemptResync: isBrowserOnline || navigatorHintIsOnline,
    loadInitialChat,
    refreshChatSnapshot,
    snapshotExists: Boolean(pageState.snapshot),
  })

  const snapshot = pageState.snapshot
  const selectedThread =
    pageState.threads.find(
      (thread) => thread.id === pageState.selectedThreadId,
    ) ?? null
  const headerThread = snapshot?.activeThread ?? selectedThread
  const realtimeThreadId =
    pageState.status === 'ready' &&
    pageState.snapshot.result === 'ready' &&
    pageState.snapshot.activeThread &&
    pageState.selectedThreadId
      ? pageState.selectedThreadId
      : null

  useChatRealtimeConnection({
    isMountedRef,
    markBrowserOnline,
    setPageState,
    threadId: realtimeThreadId,
  })

  const isReady = snapshot?.result === 'ready' && Boolean(snapshot.activeThread)
  const canSend =
    pageState.status === 'ready' &&
    Boolean(pageState.selectedThreadId) &&
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
      threadId: pageState.selectedThreadId ?? PRIVATE_CHAT_THREAD_ID,
    })
  const visibleMessages =
    pageState.status === 'ready' && pageState.selectedThreadId
      ? mergeOptimisticTextMessages({
          messages: pageState.snapshot.messages,
          optimisticTextSends,
          threadId: pageState.selectedThreadId,
        })
      : []
  const {
    clearHighlightedMessage,
    handleOpenSearchResult,
    highlightedMessageId,
  } = useChatSearchNavigation({
    closeChatSearch: chatSearchPanel.closeChatSearch,
    visibleMessages,
  })

  return (
    <>
      <ChatHeader
        activeThread={headerThread}
        isReady={isReady}
        onOpenThreadSearch={chatSearchPanel.openChatSearch}
        onOpenThreadMedia={() => {
          void chatMediaPanel.loadChatMedia()
        }}
        onOpenThreadInfo={() => {
          void chatInfoPanel.loadChatInfo()
        }}
        onSelectThread={(threadId) => {
          clearHighlightedMessage()
          void handleSelectThread(threadId)
        }}
        selectedThreadId={pageState.selectedThreadId}
        threads={pageState.threads}
      />
      <ChatRuntimeAlerts
        isOnline={isBrowserOnline}
        isRealtimeSupported={isRealtimeSupported}
        resyncStatus={resyncStatus}
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col bg-transparent">
        {pageState.status === 'loading' ? (
          <ChatLoadingState userName={user?.fullName} />
        ) : null}

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
            highlightedMessageId={highlightedMessageId}
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
      <ChatAuxiliaryPages
        activeThread={headerThread}
        chatInfoPanel={chatInfoPanel}
        chatMediaPanel={chatMediaPanel}
        chatSearchPanel={chatSearchPanel}
        onSearchResultSelect={handleOpenSearchResult}
      />
    </>
  )
}
