import { useCallback, useEffect, useState } from 'react'

function readOnlineState() {
  if (typeof navigator === 'undefined') {
    return true
  }

  return navigator.onLine
}

export function useBrowserConnectionState() {
  const [navigatorHintIsOnline, setNavigatorHintIsOnline] =
    useState(readOnlineState)
  const [isOnline, setIsOnline] = useState(readOnlineState)

  const markOnline = useCallback(() => {
    setNavigatorHintIsOnline(true)
    setIsOnline(true)
  }, [])

  const markOffline = useCallback(() => {
    setNavigatorHintIsOnline(readOnlineState())
    setIsOnline(false)
  }, [])

  const syncWithNavigator = useCallback(() => {
    const nextOnlineState = readOnlineState()

    setNavigatorHintIsOnline(nextOnlineState)

    if (!nextOnlineState) {
      setIsOnline(false)
    }
  }, [])

  useEffect(() => {
    function handleOnline() {
      markOnline()
    }

    function handleOffline() {
      setNavigatorHintIsOnline(false)
      setIsOnline(false)
    }

    function handleFocus() {
      syncWithNavigator()
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') {
        return
      }

      syncWithNavigator()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [markOnline, syncWithNavigator])

  return {
    isOnline,
    markOffline,
    markOnline,
    navigatorHintIsOnline,
    syncWithNavigator,
  }
}
