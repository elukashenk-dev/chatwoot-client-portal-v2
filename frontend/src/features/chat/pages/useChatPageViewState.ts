import { isFirstConversationBootstrapReady } from '../lib/chatSnapshot'
import {
  mergeOptimisticTextMessages,
  type OptimisticTextSend,
} from '../lib/optimisticTextMessages'
import type { PortalPushMessagePayload } from '../../../pwa/serviceWorkerRuntime'
import type { ChatPageState } from './chatPageState'
import { useChatPageNotifications } from './useChatPageNotifications'
import type { useChatNotificationsPanel } from './useChatNotificationsPanel'

type UseChatPageViewStateOptions = {
  canUseBackend: boolean
  chatNotificationsPanel: ReturnType<typeof useChatNotificationsPanel>
  handleOtherThreadPush: (payload: PortalPushMessagePayload) => void
  historyFragmentIsOpen: boolean
  optimisticTextSends: OptimisticTextSend[]
  pageState: ChatPageState
  refreshChatSnapshot: () => Promise<void>
  tenantSlug: string | null
  userId: number | null
}

export function getChatPageRealtimeThreadId(pageState: ChatPageState) {
  return pageState.status === 'ready' &&
    !pageState.isUsingCachedData &&
    pageState.snapshot.result === 'ready' &&
    pageState.snapshot.activeThread &&
    pageState.selectedThreadId
    ? pageState.selectedThreadId
    : null
}

export function useChatPageViewState({
  canUseBackend,
  chatNotificationsPanel,
  handleOtherThreadPush,
  historyFragmentIsOpen,
  optimisticTextSends,
  pageState,
  refreshChatSnapshot,
  tenantSlug,
  userId,
}: UseChatPageViewStateOptions) {
  const snapshot = pageState.snapshot
  const selectedThread =
    pageState.threads.find(
      (thread) => thread.id === pageState.selectedThreadId,
    ) ?? null
  const headerThread = snapshot?.activeThread ?? selectedThread
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
  const shouldRenderNotReadyState =
    pageState.status === 'ready' &&
    pageState.snapshot.result !== 'ready' &&
    !isFirstConversationBootstrapReady(pageState.snapshot)
  const visibleMessages =
    pageState.status === 'ready' && pageState.selectedThreadId
      ? mergeOptimisticTextMessages({
          messages: pageState.snapshot.messages,
          optimisticTextSends,
          threadId: pageState.selectedThreadId,
        })
      : []
  const queuedSendCount = optimisticTextSends.filter(
    (send) =>
      send.threadId === pageState.selectedThreadId && send.status !== 'failed',
  ).length
  const canSuppressActiveThreadPush =
    !historyFragmentIsOpen &&
    pageState.status === 'ready' &&
    pageState.snapshot.result === 'ready' &&
    pageState.snapshot.activeThread?.id === pageState.selectedThreadId
  const selectedThreadNotificationSettings = useChatPageNotifications({
    canLoadNotificationSettings:
      canUseBackend &&
      pageState.status === 'ready' &&
      !pageState.isUsingCachedData,
    canSuppressActiveThreadPush,
    chatNotificationsPanel,
    messages: visibleMessages,
    onOtherThreadPush: handleOtherThreadPush,
    refreshChatSnapshot,
    selectedThreadId: pageState.selectedThreadId,
  })

  return {
    canSend,
    headerThread,
    queuedSendCount,
    selectedThreadNotificationSettings,
    shouldRenderNotReadyState,
    shouldRenderTranscript,
    snapshot,
    visibleMessages,
  }
}
