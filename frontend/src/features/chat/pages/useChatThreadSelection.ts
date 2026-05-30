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
  BOOT_LOCAL_CACHE_READ_DEADLINE_MS,
  BOOT_REQUEST_TIMEOUT_MS,
  createRequestTimeout,
  withBootReadDeadline,
} from '../../offline/bootCoordinator'
import {
  ONLINE_CHAT_PAGE_CACHE_STATE,
  readChatPageCacheState,
  type ChatPageState,
  type ChatReachability,
} from './chatPageState'
import {
  readOfflineChatFallback,
  saveOfflineThreadList,
} from './offlineChatCache'

type UseChatThreadSelectionInput = {
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isMountedRef: MutableRefObject<boolean>
  markBrowserOffline: () => void
  markBrowserOnline: () => void
  navigatorHintIsOnline: boolean
  pageState: ChatPageState
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

export function useChatThreadSelection({
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isMountedRef,
  markBrowserOffline,
  markBrowserOnline,
  navigatorHintIsOnline,
  pageState,
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
  const selectedThreadIdRef = useRef(pageState.selectedThreadId)
  pageStateRef.current = pageState
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
      cacheFallbackAllowed = false
      requestTimeout.cancel()

      if (!isMountedRef.current || loadRequestIdRef.current !== requestId) {
        return
      }

      markBrowserOnline()
      setChatReachability('online')
      setPageState({
        ...ONLINE_CHAT_PAGE_CACHE_STATE,
        selectedThreadId,
        snapshot,
        status: 'ready',
        threads: threadsResponse.threads,
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
        setPageState((currentState) => ({
          ...ONLINE_CHAT_PAGE_CACHE_STATE,
          selectedThreadId: threadId,
          snapshot,
          status: 'ready',
          threads: currentState.threads,
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
