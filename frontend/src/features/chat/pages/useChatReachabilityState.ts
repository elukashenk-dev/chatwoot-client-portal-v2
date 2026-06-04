import { useCallback, useState } from 'react'

import type { ChatReachability } from './chatPageState'

export function useChatReachabilityState({
  isBrowserOnline,
  markBrowserOffline,
  markBrowserOnline,
}: {
  isBrowserOnline: boolean
  markBrowserOffline: () => void
  markBrowserOnline: () => void
}) {
  const [chatReachability, setChatReachability] = useState<ChatReachability>(
    () =>
      typeof navigator === 'undefined' || navigator.onLine
        ? 'connecting'
        : 'offline',
  )
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

  return {
    canUseBackend,
    connectionStatus,
    markChatOffline,
    markChatOnline,
    setChatReachability,
  }
}
