import { useCallback, useEffect, useRef } from 'react'

const REALTIME_STALE_AFTER_MS = 30_000
const REALTIME_HEALTH_CHECK_INTERVAL_MS = 5_000
const REALTIME_FALLBACK_MIN_INTERVAL_MS = 20_000

type UseChatRealtimeHealthFallbackInput = {
  canUseBackend: boolean
  isRealtimeSupported: boolean
  realtimeThreadId: string | null
  refreshChatSnapshot: () => Promise<void>
  snapshotExists: boolean
}

function documentIsVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

export function useChatRealtimeHealthFallback({
  canUseBackend,
  isRealtimeSupported,
  realtimeThreadId,
  refreshChatSnapshot,
  snapshotExists,
}: UseChatRealtimeHealthFallbackInput) {
  const fallbackInFlightRef = useRef(false)
  const lastFallbackAtRef = useRef(0)
  const lastRealtimeActivityAtRef = useRef(0)

  const reportRealtimeActivity = useCallback(() => {
    lastRealtimeActivityAtRef.current = Date.now()
    fallbackInFlightRef.current = false
  }, [])

  useEffect(() => {
    lastRealtimeActivityAtRef.current = Date.now()
    lastFallbackAtRef.current = 0
    fallbackInFlightRef.current = false
  }, [realtimeThreadId])

  useEffect(() => {
    if (
      !canUseBackend ||
      !isRealtimeSupported ||
      !realtimeThreadId ||
      !snapshotExists
    ) {
      return
    }

    const intervalId = window.setInterval(() => {
      if (!documentIsVisible()) {
        return
      }

      const now = Date.now()
      const realtimeIsStale =
        now - lastRealtimeActivityAtRef.current >= REALTIME_STALE_AFTER_MS

      if (!realtimeIsStale || fallbackInFlightRef.current) {
        return
      }

      if (now - lastFallbackAtRef.current < REALTIME_FALLBACK_MIN_INTERVAL_MS) {
        return
      }

      fallbackInFlightRef.current = true
      lastFallbackAtRef.current = now

      void refreshChatSnapshot()
        .catch(() => {})
        .finally(() => {
          fallbackInFlightRef.current = false
        })
    }, REALTIME_HEALTH_CHECK_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [
    canUseBackend,
    isRealtimeSupported,
    realtimeThreadId,
    refreshChatSnapshot,
    snapshotExists,
  ])

  return { reportRealtimeActivity }
}
