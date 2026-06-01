import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'

import { setAppIconBadgeCount } from '../../../pwa/serviceWorkerRuntime'
import type { PortalPushMessagePayload } from '../../../pwa/serviceWorkerRuntime'
import { getChatThreads } from '../api/chatClient'
import { applyPushUnreadCounts, type ChatPageState } from './chatPageState'

const FOREGROUND_UNREAD_REFRESH_INTERVAL_MS = 30_000

type UseChatForegroundUnreadRefreshInput = {
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isBrowserOnline: boolean
  isMountedRef: RefObject<boolean>
  markBrowserOnline: () => void
  setPageState: Dispatch<SetStateAction<ChatPageState>>
}

export function useChatForegroundUnreadRefresh({
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isBrowserOnline,
  isMountedRef,
  markBrowserOnline,
  setPageState,
}: UseChatForegroundUnreadRefreshInput) {
  const isRefreshingRef = useRef(false)

  const refreshUnreadFromThreads = useCallback(async () => {
    if (
      !isBrowserOnline ||
      isRefreshingRef.current ||
      document.visibilityState === 'hidden'
    ) {
      return
    }

    isRefreshingRef.current = true

    try {
      const threadsResponse = await getChatThreads()

      if (!isMountedRef.current) {
        return
      }

      markBrowserOnline()
      void setAppIconBadgeCount(threadsResponse.totalUnreadCount)
      setPageState((currentState) => ({
        ...currentState,
        threads: threadsResponse.threads,
      }))
    } catch (error) {
      if (await handleUnauthorizedChatError(error)) {
        return
      }

      handleConnectionUnavailableError(error)
    } finally {
      isRefreshingRef.current = false
    }
  }, [
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isBrowserOnline,
    isMountedRef,
    markBrowserOnline,
    setPageState,
  ])

  useEffect(() => {
    if (!isBrowserOnline) {
      return
    }

    function handleForegroundRefresh() {
      void refreshUnreadFromThreads()
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') {
        return
      }

      void refreshUnreadFromThreads()
    }

    const intervalId = window.setInterval(
      handleForegroundRefresh,
      FOREGROUND_UNREAD_REFRESH_INTERVAL_MS,
    )

    window.addEventListener('focus', handleForegroundRefresh)
    window.addEventListener('online', handleForegroundRefresh)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleForegroundRefresh)
      window.removeEventListener('online', handleForegroundRefresh)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isBrowserOnline, refreshUnreadFromThreads])

  const handleOtherThreadPush = useCallback(
    (payload: PortalPushMessagePayload) => {
      if (payload.totalUnreadCount !== null) {
        void setAppIconBadgeCount(payload.totalUnreadCount)
      }

      setPageState((currentState) => ({
        ...currentState,
        threads: applyPushUnreadCounts(currentState.threads, payload),
      }))
    },
    [setPageState],
  )

  return {
    handleOtherThreadPush,
  }
}
