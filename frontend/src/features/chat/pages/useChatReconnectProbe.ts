import { useEffect, useRef } from 'react'

const RECONNECT_PROBE_DELAYS_MS = [1000, 3000, 5000, 10_000, 15_000]

type UseChatReconnectProbeInput = {
  enabled: boolean
  navigatorHintIsOnline: boolean
  queuedSendCount: number
  refreshChatSnapshot: () => Promise<boolean>
  requestOutboxDrain: () => void
}

export function useChatReconnectProbe({
  enabled,
  navigatorHintIsOnline,
  queuedSendCount,
  refreshChatSnapshot,
  requestOutboxDrain,
}: UseChatReconnectProbeInput) {
  const delayIndexRef = useRef(0)

  useEffect(() => {
    const shouldProbe =
      enabled && (navigatorHintIsOnline || queuedSendCount > 0)

    if (!shouldProbe) {
      delayIndexRef.current = 0
      return
    }

    let isCurrent = true
    let isProbing = false
    let timerId: number | null = null

    function clearProbeTimer() {
      if (timerId !== null) {
        window.clearTimeout(timerId)
        timerId = null
      }
    }

    function increaseBackoff() {
      delayIndexRef.current = Math.min(
        delayIndexRef.current + 1,
        RECONNECT_PROBE_DELAYS_MS.length - 1,
      )
    }

    function scheduleNextProbe() {
      if (!isCurrent) {
        return
      }

      clearProbeTimer()
      timerId = window.setTimeout(() => {
        timerId = null
        void probe()
      }, RECONNECT_PROBE_DELAYS_MS[delayIndexRef.current])
    }

    async function probe() {
      if (!isCurrent || isProbing) {
        return
      }

      if (document.visibilityState === 'hidden') {
        scheduleNextProbe()
        return
      }

      isProbing = true

      try {
        const recovered = await refreshChatSnapshot()

        if (!isCurrent) {
          return
        }

        if (recovered) {
          delayIndexRef.current = 0
          requestOutboxDrain()
          return
        }

        increaseBackoff()
        scheduleNextProbe()
      } catch {
        increaseBackoff()
        scheduleNextProbe()
      } finally {
        isProbing = false
      }
    }

    function handleFocus() {
      void probe()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void probe()
      }
    }

    scheduleNextProbe()
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isCurrent = false
      clearProbeTimer()
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [
    enabled,
    navigatorHintIsOnline,
    queuedSendCount,
    refreshChatSnapshot,
    requestOutboxDrain,
  ])
}
