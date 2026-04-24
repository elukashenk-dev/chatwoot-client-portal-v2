import { useCallback, useEffect, useRef, useState } from 'react'

type UseChatResumeResyncInput = {
  canAttemptResync: boolean
  loadInitialChat: () => Promise<void>
  refreshChatSnapshot: () => Promise<void>
  snapshotExists: boolean
}

const LIFECYCLE_RESYNC_MIN_INTERVAL_MS = 15_000

export function useChatResumeResync({
  canAttemptResync,
  loadInitialChat,
  refreshChatSnapshot,
  snapshotExists,
}: UseChatResumeResyncInput) {
  const lastLifecycleResyncAtRef = useRef(0)
  const [resyncStatus, setResyncStatus] = useState<
    'idle' | 'resyncing' | 'error'
  >('idle')

  const resyncChatAfterResume = useCallback(
    async (reason: 'online' | 'visibility') => {
      if (!canAttemptResync && reason !== 'online') {
        return
      }

      const now = Date.now()

      if (
        reason !== 'online' &&
        now - lastLifecycleResyncAtRef.current <
          LIFECYCLE_RESYNC_MIN_INTERVAL_MS
      ) {
        return
      }

      lastLifecycleResyncAtRef.current = now

      if (!snapshotExists) {
        await loadInitialChat()
        return
      }

      setResyncStatus('resyncing')

      try {
        await refreshChatSnapshot()
        setResyncStatus('idle')
      } catch {
        setResyncStatus('error')
      }
    },
    [canAttemptResync, loadInitialChat, refreshChatSnapshot, snapshotExists],
  )

  useEffect(() => {
    function handleOnline() {
      void resyncChatAfterResume('online')
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') {
        return
      }

      void resyncChatAfterResume('visibility')
    }

    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [resyncChatAfterResume])

  return resyncStatus
}
