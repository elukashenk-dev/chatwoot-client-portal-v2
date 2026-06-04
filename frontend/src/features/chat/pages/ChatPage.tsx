import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { ChatApiClientError, markChatThreadRead } from '../api/chatClient'
import { PRIVATE_CHAT_THREAD_ID } from '../types'
import { AgentTypingIndicator } from '../components/AgentTypingIndicator'
import { ChatHeader } from '../components/ChatHeader'
import { ChatNotReadyState } from '../components/ChatNotReadyState'
import { ChatRuntimeAlerts } from '../components/ChatRuntimeAlerts'
import { ChatTranscript } from '../components/ChatTranscript'
import type { MessageComposerReplyTarget } from '../components/MessageComposer'
import { toComposerReplyTarget } from '../lib/chatSnapshot'
import { useChatResumeResync } from '../lib/useChatResumeResync'
import { useBrowserConnectionState } from '../lib/useBrowserConnectionState'
import {
  buildChatThreadPath,
  readChatThreadIdFromSearch,
} from '../lib/chatThreadRoute'
import { useAuthSession } from '../../auth/lib/authSessionContext'
import { readStartupChatFallback } from '../../offline/startupCache'
import { useOfflineTextQueueAvailability } from '../../offline/useOfflineTextQueueAvailability'
import { useTenantIdentity } from '../../tenant/lib/useTenantIdentity'
import { ChatAuxiliaryPages } from './ChatAuxiliaryPages'
import { ChatComposerDock } from './ChatComposerDock'
import { createChatHistoryFragmentControls } from './chatHistoryFragmentControls'
import {
  INITIAL_CHAT_PAGE_STATE,
  type ChatPageState,
  type ChatReachability,
} from './chatPageState'
import { useChatAttachmentSend } from './useChatAttachmentSend'
import { useChatForegroundUnreadRefresh } from './useChatForegroundUnreadRefresh'
import { useChatOutboxDrainIntegration } from './useChatOutboxDrainIntegration'
import { useChatRealtimeConnection } from './useChatRealtimeConnection'
import { useChatReadSync } from './useChatReadSync'
import { useChatInfoPanel } from './useChatInfoPanel'
import { useChatMediaPanel } from './useChatMediaPanel'
import { useChatNotificationsPanel } from './useChatNotificationsPanel'
import { useChatOlderMessages } from './useChatOlderMessages'
import {
  getChatPageRealtimeThreadId,
  useChatPageViewState,
} from './useChatPageViewState'
import { useChatPushStaleMarkerRefresh } from './useChatPushStaleMarkerRefresh'
import { useChatRealtimeHealthFallback } from './useChatRealtimeHealthFallback'
import { useChatSearchNavigation } from './useChatSearchNavigation'
import { useChatSearchPanel } from './useChatSearchPanel'
import { useChatSearchResultContext } from './useChatSearchResultContext'
import { useChatSnapshotRefresh } from './useChatSnapshotRefresh'
import { useChatSupportAvailability } from './useChatSupportAvailability'
import { useChatThreadSelection } from './useChatThreadSelection'
import { useOfflineChatCachePersistence } from './useOfflineChatCachePersistence'
import { useOptimisticTextSend } from './useOptimisticTextSend'

export function ChatPage() {
  const isMountedRef = useRef(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { tenant } = useTenantIdentity()
  const { refreshSession, sessionSource, user } = useAuthSession()
  const tenantSlug = tenant?.slug ?? null
  const userId = user?.id ?? null
  const requestedThreadId = readChatThreadIdFromSearch(location.search)
  const [startupChatFallback] = useState(() =>
    tenantSlug && userId !== null
      ? readStartupChatFallback({
          host: window.location.host,
          preferredThreadId: requestedThreadId,
          tenantSlug,
          userId,
        })
      : null,
  )
  const [pageState, setPageState] = useState<ChatPageState>(() =>
    startupChatFallback
      ? {
          cachedSavedAt: startupChatFallback.cachedSavedAt,
          isUsingCachedData: true,
          selectedThreadId: startupChatFallback.selectedThreadId,
          snapshot: startupChatFallback.snapshot,
          status: 'ready',
          threads: startupChatFallback.threads,
        }
      : INITIAL_CHAT_PAGE_STATE,
  )
  const [outboxDrainRequestSignal, requestOutboxDrain] = useReducer(
    (value: number) => value + 1,
    0,
  )
  const [historyErrorMessage, setHistoryErrorMessage] = useState<string | null>(null)
  const [forceScrollToBottomSignal, setForceScrollToBottomSignal] = useState(0)
  const [replyTarget, setReplyTarget] = useState<MessageComposerReplyTarget | null>(null)
  const {
    isOnline: isBrowserOnline,
    markOffline: markBrowserOffline,
    markOnline: markBrowserOnline,
    navigatorHintIsOnline,
  } = useBrowserConnectionState()
  const [chatReachability, setChatReachability] = useState<ChatReachability>(
    () =>
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
  const connectionStatus: ChatReachability = isBrowserOnline ? chatReachability : 'offline'
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
    requestedThreadId,
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
    const bootstrapTimerId = window.setTimeout(() => {
      void loadInitialChatRef.current()
    }, 0)

    return () => {
      window.clearTimeout(bootstrapTimerId)
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
  const { handleOtherThreadPush } = useChatForegroundUnreadRefresh({
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isBrowserOnline: canUseBackend,
    isMountedRef,
    markBrowserOnline: markChatOnline,
    setPageState,
  })
  const realtimeThreadId = getChatPageRealtimeThreadId(pageState)
  const { reportRealtimeActivity } = useChatRealtimeHealthFallback({
    canUseBackend,
    isRealtimeSupported,
    realtimeThreadId,
    refreshChatSnapshot,
    snapshotExists: pageState.status === 'ready',
  })
  const { isAgentTypingVisible } = useChatRealtimeConnection({
    isMountedRef,
    markBrowserOnline: markChatOnline,
    onRealtimeActivity: reportRealtimeActivity,
    setPageState,
    threadId: realtimeThreadId,
  })

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
  const {
    canSend,
    headerThread,
    queuedSendCount,
    selectedThreadNotificationSettings,
    shouldRenderNotReadyState,
    shouldRenderTranscript,
    snapshot,
    visibleMessages,
  } = useChatPageViewState({
    canUseBackend,
    chatNotificationsPanel,
    handleOtherThreadPush,
    historyFragmentIsOpen: historyFragment !== null,
    optimisticTextSends,
    pageState,
    refreshChatSnapshot,
    tenantSlug,
    userId,
  })
  const transcriptMessages = historyFragment?.messages ?? visibleMessages
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
  const historyFragmentControls = createChatHistoryFragmentControls({
    clearHighlightedMessage,
    clearHistoryFragment,
    historyFragment,
    loadHistoryFragmentContext,
    setForceScrollToBottomSignal,
  })
  const handleLatestMessagesVisible = useChatReadSync({
    canUseBackend,
    historyFragmentIsOpen: historyFragment !== null,
    markRead: markChatThreadRead,
    selectedThreadId: pageState.selectedThreadId,
  })

  useEffect(() => {
    if (
      !requestedThreadId ||
      pageState.status !== 'ready' ||
      pageState.selectedThreadId === requestedThreadId ||
      !pageState.threads.some((thread) => thread.id === requestedThreadId)
    ) {
      return
    }

    clearHighlightedMessage()
    clearHistoryFragment()
    void handleSelectThread(requestedThreadId)
  }, [
    clearHighlightedMessage,
    clearHistoryFragment,
    handleSelectThread,
    pageState.selectedThreadId,
    pageState.status,
    pageState.threads,
    requestedThreadId,
  ])

  return (
    <>
      <ChatHeader
        activeThread={headerThread}
        connectionStatus={connectionStatus}
        onOpenThreadSearch={() => {
          clearSearchResultOpenError()
          chatSearchPanel.openChatSearch()
        }}
        onOpenThreadMedia={() => void chatMediaPanel.loadChatMedia()}
        onOpenThreadInfo={() => void chatInfoPanel.loadChatInfo()}
        onOpenThreadNotifications={() =>
          void chatNotificationsPanel.loadChatNotifications()
        }
        onSelectThread={(threadId) => {
          clearHighlightedMessage()
          clearHistoryFragment()
          navigate(buildChatThreadPath(threadId), { replace: true })
        }}
        selectedThreadId={pageState.selectedThreadId}
        supportAvailability={supportAvailability.state.availability}
        threadNotificationSettings={selectedThreadNotificationSettings}
        threads={pageState.threads}
      />
      <ChatRuntimeAlerts
        isChatAvailable={shouldRenderTranscript}
        connectionStatus={connectionStatus}
        isRealtimeSupported={isRealtimeSupported}
        queuedSendCount={queuedSendCount}
        resyncStatus={resyncStatus}
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col bg-transparent">
        {pageState.status === 'error' ? (
          <ChatNotReadyState
            isUnavailable
            onRetry={() => void loadInitialChat()}
            reason={snapshot?.reason ?? 'chatwoot_unavailable'}
          />
        ) : null}

        {shouldRenderNotReadyState ? (
          <ChatNotReadyState
            isUnavailable={snapshot?.result === 'unavailable'}
            onRetry={() => void loadInitialChat()}
            reason={snapshot?.reason ?? 'chatwoot_unavailable'}
          />
        ) : null}

        {shouldRenderTranscript ? (
          <ChatTranscript
            forceScrollToBottomSignal={forceScrollToBottomSignal}
            hasMoreOlder={
              historyFragment ? false : (snapshot?.hasMoreOlder ?? false)
            }
            highlightedMessageId={transcriptHighlightedMessageId}
            historyFragmentControls={historyFragmentControls}
            historyErrorMessage={historyErrorMessage}
            isConnectionAvailable={canUseBackend}
            isLoadingOlder={isLoadingOlder}
            messages={transcriptMessages}
            onLatestMessagesVisible={handleLatestMessagesVisible}
            onLoadOlder={() => void handleLoadOlderMessages()}
            onReplyToMessage={(message) => {
              setReplyTarget(toComposerReplyTarget(message))
            }}
            onRetryTextMessage={handleRetryTextMessage}
            scrollToMessageId={transcriptHighlightedMessageId}
            scrollToMessageSignal={highlightedMessageScrollSignal}
          />
        ) : null}
        <AgentTypingIndicator isVisible={shouldRenderTranscript && isAgentTypingVisible} />

        <ChatComposerDock
          canSend={canSend}
          handleSendAttachment={handleSendAttachment}
          handleSendMessage={handleSendMessage}
          isBrowserOnline={canUseBackend}
          isSending={isSending}
          onCancelReply={() => setReplyTarget(null)}
          replyTarget={replyTarget}
          sendErrorMessage={sendErrorMessage}
          selectedThreadId={pageState.selectedThreadId}
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
