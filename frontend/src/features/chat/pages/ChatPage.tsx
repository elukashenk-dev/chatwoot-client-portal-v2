import { useCallback, useEffect, useRef, useState } from 'react'

import { ChatApiClientError, getChatMessages } from '../api/chatClient'
import { PRIVATE_CHAT_THREAD_ID } from '../types'
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
  isFirstConversationBootstrapReady,
  mergeOlderMessages,
  toComposerReplyTarget,
} from '../lib/chatSnapshot'
import { useChatResumeResync } from '../lib/useChatResumeResync'
import { useBrowserConnectionState } from '../lib/useBrowserConnectionState'
import { mergeOptimisticTextMessages } from '../lib/optimisticTextMessages'
import { useAuthSession } from '../../auth/lib/authSessionContext'
import { ChatAuxiliaryPages } from './ChatAuxiliaryPages'
import type { ChatPageState } from './chatPageState'
import { useChatAttachmentSend } from './useChatAttachmentSend'
import { useChatRealtimeConnection } from './useChatRealtimeConnection'
import { useChatInfoPanel } from './useChatInfoPanel'
import { useChatMediaPanel } from './useChatMediaPanel'
import { useChatPageNotifications } from './useChatPageNotifications'
import { useChatNotificationsPanel } from './useChatNotificationsPanel'
import { useChatSearchNavigation } from './useChatSearchNavigation'
import { useChatSearchPanel } from './useChatSearchPanel'
import { useChatSearchResultContext } from './useChatSearchResultContext'
import { useChatSnapshotRefresh } from './useChatSnapshotRefresh'
import { useChatSupportAvailability } from './useChatSupportAvailability'
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
  const [forceScrollToBottomSignal, setForceScrollToBottomSignal] = useState(0)
  const [replyTarget, setReplyTarget] =
    useState<MessageComposerReplyTarget | null>(null)
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

  const {
    clearHistoryFragment,
    clearSearchResultOpenError,
    historyFragment,
    loadHistoryFragmentContext,
    openSearchResultContext,
    retargetHistoryFragment,
    searchResultOpenErrorMessage,
  } = useChatSearchResultContext({
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isBrowserOnline,
    isMountedRef,
    markBrowserOnline,
    selectedThreadId: pageState.selectedThreadId,
    setHistoryErrorMessage,
  })
  const {
    clearSendError,
    handleSendAttachment,
    isSending,
    sendErrorMessage,
    setSendErrorMessage,
  } = useChatAttachmentSend({
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isBrowserOnline,
    isMountedRef,
    markBrowserOnline,
    onAttachmentSendStarted: clearHistoryFragment,
    pageState,
    setPageState,
  })
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
  const chatNotificationsPanel = useChatNotificationsPanel({
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
  const supportAvailability = useChatSupportAvailability({
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isBrowserOnline: isBrowserOnline && pageState.status === 'ready',
    isMountedRef,
    markBrowserOnline,
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

  const refreshChatSnapshot = useChatSnapshotRefresh({
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isMountedRef,
    markBrowserOnline,
    selectedThreadId: pageState.selectedThreadId,
    setPageState,
  })
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
        clearHistoryFragment()
        clearSendError()
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
  const selectedThreadNotificationSettings = useChatPageNotifications({
    chatNotificationsPanel,
    messages: visibleMessages,
    refreshChatSnapshot,
    selectedThreadId: pageState.selectedThreadId,
  })
  const transcriptMessages = historyFragment
    ? historyFragment.messages
    : visibleMessages
  const handleCloseChatSearch = useCallback(() => {
    clearSearchResultOpenError()
    chatSearchPanel.closeChatSearch()
  }, [chatSearchPanel, clearSearchResultOpenError])
  const {
    clearHighlightedMessage,
    handleOpenSearchResult,
    highlightedMessageId,
    highlightedMessageScrollSignal,
  } = useChatSearchNavigation({
    clearHistoryFragment,
    closeChatSearch: handleCloseChatSearch,
    displayedMessages: transcriptMessages,
    latestMessages: visibleMessages,
    openSearchResultContext,
    retargetHistoryFragment,
  })
  const transcriptHighlightedMessageId =
    historyFragment?.targetMessageId ?? highlightedMessageId

  return (
    <>
      <ChatHeader
        activeThread={headerThread}
        onOpenThreadSearch={() => {
          clearSearchResultOpenError()
          chatSearchPanel.openChatSearch()
        }}
        onOpenThreadMedia={() => {
          void chatMediaPanel.loadChatMedia()
        }}
        onOpenThreadInfo={() => {
          void chatInfoPanel.loadChatInfo()
        }}
        onOpenThreadNotifications={() => {
          void chatNotificationsPanel.loadChatNotifications()
        }}
        onSelectThread={(threadId) => {
          clearHighlightedMessage()
          clearHistoryFragment()
          void handleSelectThread(threadId)
        }}
        selectedThreadId={pageState.selectedThreadId}
        supportAvailability={supportAvailability.state.availability}
        threadNotificationSettings={selectedThreadNotificationSettings}
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
            forceScrollToBottomSignal={forceScrollToBottomSignal}
            hasMoreOlder={
              historyFragment ? false : pageState.snapshot.hasMoreOlder
            }
            highlightedMessageId={transcriptHighlightedMessageId}
            historyFragmentControls={
              historyFragment
                ? {
                    errorMessage: historyFragment.errorMessage,
                    hasMoreEarlier: historyFragment.hasMoreEarlier,
                    hasMoreLater: historyFragment.hasMoreLater,
                    isLoadingEarlier: historyFragment.isLoadingEarlier,
                    isLoadingLater: historyFragment.isLoadingLater,
                    onLoadEarlier: () => {
                      void loadHistoryFragmentContext('earlier')
                    },
                    onLoadLater: () => {
                      void loadHistoryFragmentContext('later')
                    },
                    onReturnToLatest: () => {
                      clearHistoryFragment()
                      clearHighlightedMessage()
                      setForceScrollToBottomSignal((signal) => signal + 1)
                    },
                  }
                : null
            }
            historyErrorMessage={historyErrorMessage}
            isConnectionAvailable={isBrowserOnline}
            isLoadingOlder={isLoadingOlder}
            messages={transcriptMessages}
            onLoadOlder={() => {
              void handleLoadOlderMessages()
            }}
            onReplyToMessage={(message) => {
              setReplyTarget(toComposerReplyTarget(message))
            }}
            onRetryTextMessage={handleRetryTextMessage}
            scrollToMessageId={transcriptHighlightedMessageId}
            scrollToMessageSignal={highlightedMessageScrollSignal}
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
        chatNotificationsPanel={chatNotificationsPanel}
        chatSearchPanel={chatSearchPanel}
        onSearchBack={handleCloseChatSearch}
        onSearchQueryChange={(query) => {
          clearSearchResultOpenError()
          void chatSearchPanel.updateChatSearchQuery(query)
        }}
        onSearchResultSelect={handleOpenSearchResult}
        searchResultOpenErrorMessage={searchResultOpenErrorMessage}
        supportAvailability={supportAvailability.state.availability}
        supportAvailabilityIsLoading={supportAvailability.state.isLoading}
      />
    </>
  )
}
