import {
  useCallback,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'

import { getChatMessages, getChatThreads } from '../api/chatClient'
import type { MessageComposerReplyTarget } from '../components/MessageComposer'
import { PRIVATE_CHAT_THREAD_ID } from '../types'
import {
  clearChatThreadNotifications,
  setAppIconBadgeCount,
} from '../../../pwa/serviceWorkerRuntime'
import {
  BOOT_LOCAL_CACHE_READ_DEADLINE_MS,
  BOOT_REQUEST_TIMEOUT_MS,
  createRequestTimeout,
  withBootReadDeadline,
} from '../../offline/bootCoordinator'
import {
  ONLINE_CHAT_PAGE_CACHE_STATE,
  clearThreadUnreadCount,
  readChatPageCacheState,
  type ChatPageState,
  type ChatReachability,
} from './chatPageState'
import {
  readOfflineChatFallback,
  saveOfflineThreadList,
} from './offlineChatCache'
import { getChatBootstrapErrorReason } from './chatBootstrapErrorReason'

type UseChatThreadSelectionInput = {
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isMountedRef: MutableRefObject<boolean>
  markBrowserOffline: () => void
  markBrowserOnline: () => void
  navigatorHintIsOnline: boolean
  pageState: ChatPageState
  requestedThreadId: string | null
  setChatReachability: Dispatch<SetStateAction<ChatReachability>>
  setHistoryErrorMessage: Dispatch<SetStateAction<string | null>>
  setPageState: Dispatch<SetStateAction<ChatPageState>>
  setReplyTarget: Dispatch<SetStateAction<MessageComposerReplyTarget | null>>
  setSendErrorMessage: Dispatch<SetStateAction<string | null>>
  tenantSlug: string | null
  userId: number | null
}

function getFallbackThreadId(threads: { id: string }[]) {
  return threads[0]?.id ?? PRIVATE_CHAT_THREAD_ID
}

function findAvailableThreadId(
  threads: { id: string }[],
  threadId: string | null,
) {
  return threadId && threads.some((thread) => thread.id === threadId)
    ? threadId
    : null
}

export function useChatThreadSelection({
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isMountedRef,
  markBrowserOffline,
  markBrowserOnline,
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
}: UseChatThreadSelectionInput) {
  const loadRequestIdRef = useRef(0)
  const pageStateRef = useRef(pageState)
  const requestedThreadIdRef = useRef(requestedThreadId)
  const selectedThreadIdRef = useRef(pageState.selectedThreadId)
  pageStateRef.current = pageState
  requestedThreadIdRef.current = requestedThreadId
  selectedThreadIdRef.current = pageState.selectedThreadId

  const openCachedChatFallback = useCallback(
    async ({
      canOpen,
      preferredThreadId,
      requestId,
    }: {
      canOpen?: () => boolean
      preferredThreadId: string | null
      requestId: number
    }) => {
      if (!tenantSlug || userId === null) {
        return false
      }

      const fallback = await withBootReadDeadline(
        readOfflineChatFallback({
          preferredThreadId,
          tenantSlug,
          userId,
        }),
        null,
        BOOT_LOCAL_CACHE_READ_DEADLINE_MS,
      )

      if (
        !fallback ||
        !isMountedRef.current ||
        loadRequestIdRef.current !== requestId ||
        canOpen?.() === false
      ) {
        return false
      }

      if (navigatorHintIsOnline) {
        setChatReachability('connecting')
      } else {
        markBrowserOffline()
        setChatReachability('offline')
      }

      const visibleState = pageStateRef.current

      if (
        visibleState.status === 'ready' &&
        visibleState.isUsingCachedData &&
        visibleState.selectedThreadId === fallback.selectedThreadId
      ) {
        return true
      }

      setPageState({
        cachedSavedAt: fallback.cachedSavedAt,
        isUsingCachedData: true,
        selectedThreadId: fallback.selectedThreadId,
        snapshot: fallback.snapshot,
        status: 'ready',
        threads: fallback.threads,
      })

      return true
    },
    [
      isMountedRef,
      markBrowserOffline,
      navigatorHintIsOnline,
      setChatReachability,
      setPageState,
      tenantSlug,
      userId,
    ],
  )

  const loadInitialChat = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = requestId
    const requestTimeout = createRequestTimeout(BOOT_REQUEST_TIMEOUT_MS)
    let cacheFallbackAllowed = true
    let cachedFallbackOpened = false
    const cachedFallbackPromise = openCachedChatFallback({
      canOpen: () => cacheFallbackAllowed,
      preferredThreadId: selectedThreadIdRef.current,
      requestId,
    }).then((opened) => {
      cachedFallbackOpened = cachedFallbackOpened || opened

      return opened
    })
    void cachedFallbackPromise

    setHistoryErrorMessage(null)
    setPageState((currentState) =>
      currentState.status === 'ready'
        ? currentState
        : {
            ...readChatPageCacheState(currentState),
            selectedThreadId: currentState.selectedThreadId,
            snapshot: currentState.snapshot,
            status: 'loading',
            threads: currentState.threads,
          },
    )

    try {
      const threadsResponse = await getChatThreads({
        signal: requestTimeout.signal,
      })
      const selectedThreadId =
        findAvailableThreadId(
          threadsResponse.threads,
          requestedThreadIdRef.current,
        ) ??
        findAvailableThreadId(
          threadsResponse.threads,
          selectedThreadIdRef.current,
        ) ??
        threadsResponse.activeThreadId ??
        getFallbackThreadId(threadsResponse.threads)

      if (tenantSlug && userId !== null) {
        void saveOfflineThreadList({
          activeThreadId: selectedThreadId,
          tenantSlug,
          threads: threadsResponse.threads,
          userId,
        }).catch(() => undefined)
      }

      const snapshot = await getChatMessages({
        signal: requestTimeout.signal,
        threadId: selectedThreadId,
      })
      const threads = snapshot.unread
        ? clearThreadUnreadCount(
            threadsResponse.threads,
            snapshot.unread.clearedThreadId,
          )
        : threadsResponse.threads
      cacheFallbackAllowed = false
      requestTimeout.cancel()

      if (!isMountedRef.current || loadRequestIdRef.current !== requestId) {
        return
      }

      markBrowserOnline()
      setChatReachability('online')
      void setAppIconBadgeCount(
        snapshot.unread?.totalUnreadCount ?? threadsResponse.totalUnreadCount,
      )
      if (snapshot.unread) {
        void clearChatThreadNotifications(snapshot.unread.clearedThreadId)
      }
      setPageState({
        ...ONLINE_CHAT_PAGE_CACHE_STATE,
        selectedThreadId,
        snapshot,
        status: 'ready',
        threads,
      })
    } catch (error) {
      requestTimeout.cancel()

      if (!isMountedRef.current || loadRequestIdRef.current !== requestId) {
        return
      }

      if (await handleUnauthorizedChatError(error)) {
        cacheFallbackAllowed = false
        return
      }

      const canUseOfflineFallback = handleConnectionUnavailableError(error)
      const cachedFallbackAlreadyOpened =
        cachedFallbackOpened || (await cachedFallbackPromise)

      if (cachedFallbackAlreadyOpened) {
        if (canUseOfflineFallback) {
          setChatReachability('offline')
        }

        return
      }

      if (canUseOfflineFallback) {
        setChatReachability('offline')

        const visibleState = pageStateRef.current

        if (visibleState.status === 'ready' && visibleState.isUsingCachedData) {
          return
        }
      }

      cacheFallbackAllowed = false
      setPageState((currentState) => ({
        ...ONLINE_CHAT_PAGE_CACHE_STATE,
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Мы не смогли загрузить чат. Попробуйте еще раз.',
        errorReason: getChatBootstrapErrorReason(error),
        selectedThreadId: currentState.selectedThreadId,
        snapshot: null,
        status: 'error',
        threads: currentState.threads,
      }))
    }
  }, [
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isMountedRef,
    markBrowserOnline,
    openCachedChatFallback,
    setChatReachability,
    setHistoryErrorMessage,
    setPageState,
    tenantSlug,
    userId,
  ])

  const handleSelectThread = useCallback(
    async (threadId: string) => {
      if (
        pageState.selectedThreadId === threadId ||
        !pageState.threads.some((thread) => thread.id === threadId)
      ) {
        return
      }

      const requestId = loadRequestIdRef.current + 1
      loadRequestIdRef.current = requestId
      const requestTimeout = createRequestTimeout(BOOT_REQUEST_TIMEOUT_MS)
      let cacheFallbackAllowed = true
      let cachedFallbackOpened = false
      const cachedFallbackPromise = openCachedChatFallback({
        canOpen: () => cacheFallbackAllowed,
        preferredThreadId: threadId,
        requestId,
      }).then((opened) => {
        cachedFallbackOpened = cachedFallbackOpened || opened

        return opened
      })
      void cachedFallbackPromise

      setHistoryErrorMessage(null)
      setReplyTarget(null)
      setSendErrorMessage(null)
      setPageState((currentState) => ({
        ...readChatPageCacheState(currentState),
        selectedThreadId: threadId,
        snapshot: null,
        status: 'loading',
        threads: currentState.threads,
      }))

      try {
        const snapshot = await getChatMessages({
          signal: requestTimeout.signal,
          threadId,
        })
        cacheFallbackAllowed = false
        requestTimeout.cancel()

        if (!isMountedRef.current || loadRequestIdRef.current !== requestId) {
          return
        }

        markBrowserOnline()
        setChatReachability('online')
        void setAppIconBadgeCount(
          snapshot.unread?.totalUnreadCount ??
            pageStateRef.current.threads.reduce(
              (total, thread) => total + thread.unreadCount,
              0,
            ),
        )
        if (snapshot.unread) {
          void clearChatThreadNotifications(snapshot.unread.clearedThreadId)
        }
        setPageState((currentState) => ({
          ...ONLINE_CHAT_PAGE_CACHE_STATE,
          selectedThreadId: threadId,
          snapshot,
          status: 'ready',
          threads: snapshot.unread
            ? clearThreadUnreadCount(
                currentState.threads,
                snapshot.unread.clearedThreadId,
              )
            : currentState.threads,
        }))
      } catch (error) {
        requestTimeout.cancel()

        if (!isMountedRef.current || loadRequestIdRef.current !== requestId) {
          return
        }

        if (await handleUnauthorizedChatError(error)) {
          cacheFallbackAllowed = false
          return
        }

        const canUseOfflineFallback = handleConnectionUnavailableError(error)
        const cachedFallbackAlreadyOpened =
          cachedFallbackOpened || (await cachedFallbackPromise)

        if (cachedFallbackAlreadyOpened) {
          if (canUseOfflineFallback) {
            setChatReachability('offline')
          }

          return
        }

        if (canUseOfflineFallback) {
          setChatReachability('offline')
        }

        cacheFallbackAllowed = false
        setPageState((currentState) => ({
          ...ONLINE_CHAT_PAGE_CACHE_STATE,
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Мы не смогли загрузить чат. Попробуйте еще раз.',
          errorReason: getChatBootstrapErrorReason(error),
          selectedThreadId: threadId,
          snapshot: null,
          status: 'error',
          threads: currentState.threads,
        }))
      }
    },
    [
      handleConnectionUnavailableError,
      handleUnauthorizedChatError,
      isMountedRef,
      markBrowserOnline,
      openCachedChatFallback,
      pageState.selectedThreadId,
      pageState.threads,
      setChatReachability,
      setHistoryErrorMessage,
      setPageState,
      setReplyTarget,
      setSendErrorMessage,
    ],
  )

  return {
    handleSelectThread,
    loadInitialChat,
  }
}
