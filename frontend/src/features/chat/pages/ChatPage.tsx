import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import { ChatApiClientError } from '../api/chatClient'
import { PRIVATE_CHAT_THREAD_ID } from '../types'
import { ChatHeader } from '../components/ChatHeader'
import { ChatNotReadyState } from '../components/ChatNotReadyState'
import { ChatRuntimeAlerts } from '../components/ChatRuntimeAlerts'
import { ChatTranscript } from '../components/ChatTranscript'
import type { MessageComposerReplyTarget } from '../components/MessageComposer'
import {
  isFirstConversationBootstrapReady,
  toComposerReplyTarget,
} from '../lib/chatSnapshot'
import { useChatResumeResync } from '../lib/useChatResumeResync'
import { useBrowserConnectionState } from '../lib/useBrowserConnectionState'
import { mergeOptimisticTextMessages } from '../lib/optimisticTextMessages'
import { clearAppIconBadge } from '../../../pwa/serviceWorkerRuntime'
import { useAuthSession } from '../../auth/lib/authSessionContext'
import { useOfflineTextQueueAvailability } from '../../offline/useOfflineTextQueueAvailability'
import { useTenantIdentity } from '../../tenant/lib/useTenantIdentity'
import { ChatAuxiliaryPages } from './ChatAuxiliaryPages'
import { ChatComposerDock } from './ChatComposerDock'
import {
  INITIAL_CHAT_PAGE_STATE,
  type ChatPageState,
  type ChatReachability,
} from './chatPageState'
import { useChatAttachmentSend } from './useChatAttachmentSend'
import { useChatOutboxDrainIntegration } from './useChatOutboxDrainIntegration'
import { useChatRealtimeConnection } from './useChatRealtimeConnection'
import { useChatInfoPanel } from './useChatInfoPanel'
import { useChatMediaPanel } from './useChatMediaPanel'
import { useChatNotificationsPanel } from './useChatNotificationsPanel'
import { useChatOlderMessages } from './useChatOlderMessages'
import { useChatPageNotifications } from './useChatPageNotifications'
import { useChatPushStaleMarkerRefresh } from './useChatPushStaleMarkerRefresh'
import { useChatSearchNavigation } from './useChatSearchNavigation'
import { useChatSearchPanel } from './useChatSearchPanel'
import { useChatSearchResultContext } from './useChatSearchResultContext'
import { useChatSnapshotRefresh } from './useChatSnapshotRefresh'
import { useChatSupportAvailability } from './useChatSupportAvailability'
import { useChatThreadSelection } from './useChatThreadSelection'
import { useChatUnreadThreadMarkers } from './useChatUnreadThreadMarkers'
import { useOfflineChatCachePersistence } from './useOfflineChatCachePersistence'
import { useOptimisticTextSend } from './useOptimisticTextSend'

export function ChatPage() {
  const isMountedRef = useRef(false)
  const { tenant } = useTenantIdentity()
  const { refreshSession, sessionSource, user } = useAuthSession()
  const [pageState, setPageState] = useState<ChatPageState>(
    INITIAL_CHAT_PAGE_STATE,
  )
  const tenantSlug = tenant?.slug ?? null
  const userId = user?.id ?? null
  const [outboxDrainRequestSignal, requestOutboxDrain] = useReducer(
    (value: number) => value + 1,
    0,
  )
  const [historyErrorMessage, setHistoryErrorMessage] = useState<string | null>(
    null,
  )
  const [forceScrollToBottomSignal, setForceScrollToBottomSignal] = useState(0)
  const [replyTarget, setReplyTarget] =
    useState<MessageComposerReplyTarget | null>(null)
  const {
    isOnline: isBrowserOnline,
    markOffline: markBrowserOffline,
    markOnline: markBrowserOnline,
    navigatorHintIsOnline,
  } = useBrowserConnectionState()
  const [chatReachability, setChatReachability] =
    useState<ChatReachability>(() =>
      typeof navigator === 'undefined' || navigator.onLine
        ? 'connecting'
        : 'offline',
    )
  const isRealtimeSupported = typeof EventSource !== 'undefined'
  const canUseOfflineTextQueue = useOfflineTextQueueAvailability({
    sessionSource,
    tenantSlug,
    userId,
  })
  const connectionStatus: ChatReachability = isBrowserOnline
    ? chatReachability
    : 'offline'
  const canUseBackend = connectionStatus === 'online'

  const markChatOnline = useCallback(() => {
    markBrowserOnline()
    setChatReachability('online')
  }, [markBrowserOnline])

  const markChatOffline = useCallback(() => {
    markBrowserOffline()
    setChatReachability('offline')
  }, [markBrowserOffline])

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

      markChatOffline()

      return true
    },
    [markChatOffline],
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
    isBrowserOnline: canUseBackend,
    isMountedRef,
    markBrowserOnline: markChatOnline,
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
    isBrowserOnline: canUseBackend,
    isMountedRef,
    markBrowserOnline: markChatOnline,
    onAttachmentSendStarted: clearHistoryFragment,
    pageState,
    setPageState,
  })
  const { handleSelectThread, loadInitialChat } = useChatThreadSelection({
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isMountedRef,
    markBrowserOffline: markChatOffline,
    markBrowserOnline: markChatOnline,
    navigatorHintIsOnline,
    pageState,
    setChatReachability,
    setHistoryErrorMessage,
    setPageState,
    setReplyTarget,
    setSendErrorMessage,
    tenantSlug,
    userId,
  })
  const loadInitialChatRef = useRef(loadInitialChat)
  const chatInfoPanel = useChatInfoPanel({
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isMountedRef,
    markBrowserOnline: markChatOnline,
    selectedThreadId: pageState.selectedThreadId,
  })
  const chatMediaPanel = useChatMediaPanel({
    currentSnapshot: pageState.status === 'ready' ? pageState.snapshot : null,
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isMountedRef,
    markBrowserOnline: markChatOnline,
    selectedThreadId: pageState.selectedThreadId,
  })
  const chatNotificationsPanel = useChatNotificationsPanel({
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isMountedRef,
    markBrowserOnline: markChatOnline,
    selectedThreadId: pageState.selectedThreadId,
  })
  const chatSearchPanel = useChatSearchPanel({
    currentSnapshot: pageState.status === 'ready' ? pageState.snapshot : null,
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isMountedRef,
    markBrowserOnline: markChatOnline,
    selectedThreadId: pageState.selectedThreadId,
  })
  const supportAvailability = useChatSupportAvailability({
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isBrowserOnline: canUseBackend && pageState.status === 'ready',
    isMountedRef,
    markBrowserOnline: markChatOnline,
  })
  const { handleLoadOlderMessages, isLoadingOlder } = useChatOlderMessages({
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isBrowserOnline: canUseBackend,
    isMountedRef,
    markBrowserOnline: markChatOnline,
    pageState,
    setHistoryErrorMessage,
    setPageState,
    tenantSlug,
    userId,
  })

  useEffect(() => {
    loadInitialChatRef.current = loadInitialChat
  }, [loadInitialChat])

  useEffect(() => {
    isMountedRef.current = true
    void clearAppIconBadge()
    const bootstrapTimerId = window.setTimeout(() => {
      void loadInitialChatRef.current()
    }, 0)

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void clearAppIconBadge()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearTimeout(bootstrapTimerId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      isMountedRef.current = false
    }
  }, [])

  const refreshChatSnapshot = useChatSnapshotRefresh({
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isMountedRef,
    markBrowserOnline: markChatOnline,
    selectedThreadId: pageState.selectedThreadId,
    setPageState,
  })
  const resyncStatus = useChatResumeResync({
    canAttemptResync: isBrowserOnline || navigatorHintIsOnline,
    forceFullReloadOnResync: pageState.isUsingCachedData,
    loadInitialChat,
    refreshChatSnapshot,
    snapshotExists: Boolean(pageState.snapshot),
  })
  useOfflineChatCachePersistence({
    pageState,
    tenantSlug,
    userId,
  })
  useChatPushStaleMarkerRefresh({
    isBrowserOnline: canUseBackend,
    pageState,
    setPageState,
    tenantSlug,
    userId,
  })

  const snapshot = pageState.snapshot
  const selectedThread =
    pageState.threads.find(
      (thread) => thread.id === pageState.selectedThreadId,
    ) ?? null
  const headerThread = snapshot?.activeThread ?? selectedThread
  const realtimeThreadId =
    pageState.status === 'ready' &&
    !pageState.isUsingCachedData &&
    pageState.snapshot.result === 'ready' &&
    pageState.snapshot.activeThread &&
    pageState.selectedThreadId
      ? pageState.selectedThreadId
      : null

  useChatRealtimeConnection({
    isMountedRef,
    markBrowserOnline: markChatOnline,
    setPageState,
    threadId: realtimeThreadId,
  })

  const isReady = snapshot?.result === 'ready' && Boolean(snapshot.activeThread)
  const canSend =
    tenantSlug !== null &&
    userId !== null &&
    pageState.status === 'ready' &&
    Boolean(pageState.selectedThreadId) &&
    (isReady || isFirstConversationBootstrapReady(pageState.snapshot))
  const shouldRenderTranscript =
    pageState.status === 'ready' &&
    (pageState.snapshot.result === 'ready' ||
      isFirstConversationBootstrapReady(pageState.snapshot))
  const {
    handleOutboxSendSucceeded,
    handleRetryTextMessage,
    handleSendMessage,
    hydrateOptimisticTextSendsFromOutbox,
    optimisticTextSends,
  } = useOptimisticTextSend({
    canUseOfflineTextQueue,
    isBrowserOnline: canUseBackend,
    onOutboxRecordQueued: requestOutboxDrain,
    onTextSendStarted: () => {
      clearHistoryFragment()
      clearSendError()
    },
    pageState,
    replyTarget,
    setPageState,
    setSendErrorMessage,
    tenantSlug,
    threadId: pageState.selectedThreadId ?? PRIVATE_CHAT_THREAD_ID,
    userId,
  })

  useChatOutboxDrainIntegration({
    drainRequestSignal: outboxDrainRequestSignal,
    handleOutboxSendSucceeded,
    hydrateOptimisticTextSendsFromOutbox,
    isBrowserOnline: canUseBackend,
    markBrowserOffline: markChatOffline,
    pageState,
    refreshSession,
    tenantSlug,
    userId,
  })
  const visibleMessages =
    pageState.status === 'ready' && pageState.selectedThreadId
      ? mergeOptimisticTextMessages({
          messages: pageState.snapshot.messages,
          optimisticTextSends,
          threadId: pageState.selectedThreadId,
        })
      : []
  const canSuppressActiveThreadPush =
    historyFragment === null &&
    pageState.status === 'ready' &&
    pageState.snapshot.result === 'ready' &&
    pageState.snapshot.activeThread?.id === pageState.selectedThreadId
  const { markUnreadThread, unreadThreadIds } =
    useChatUnreadThreadMarkers(pageState)
  const selectedThreadNotificationSettings = useChatPageNotifications({
    canSuppressActiveThreadPush,
    chatNotificationsPanel,
    messages: visibleMessages,
    onOtherThreadPush: markUnreadThread,
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
        connectionStatus={connectionStatus}
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
        unreadThreadIds={unreadThreadIds}
      />
      <ChatRuntimeAlerts
        isChatAvailable={shouldRenderTranscript}
        connectionStatus={connectionStatus}
        isRealtimeSupported={isRealtimeSupported}
        queuedSendCount={
          optimisticTextSends.filter(
            (send) =>
              send.threadId === pageState.selectedThreadId &&
              send.status !== 'failed',
          ).length
        }
        resyncStatus={resyncStatus}
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col bg-transparent">
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
            isConnectionAvailable={canUseBackend}
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

        <ChatComposerDock
          canSend={canSend}
          handleSendAttachment={handleSendAttachment}
          handleSendMessage={handleSendMessage}
          isBrowserOnline={canUseBackend}
          isSending={isSending}
          onCancelReply={() => {
            setReplyTarget(null)
          }}
          replyTarget={replyTarget}
          sendErrorMessage={sendErrorMessage}
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
