import { useCallback, useRef } from 'react'

const READ_SYNC_DEBOUNCE_MS = 5_000

type VisibleBoundary = {
  latestVisibleAgentMessageId: number | null
}

function isChatReadSyncPageForeground() {
  if (typeof document === 'undefined') {
    return true
  }

  if (document.visibilityState !== 'visible') {
    return false
  }

  if (typeof document.hasFocus === 'function') {
    return document.hasFocus()
  }

  return true
}

export function useChatReadSync({
  canUseBackend,
  historyFragmentIsOpen,
  isPageForeground = isChatReadSyncPageForeground,
  markRead,
  selectedThreadId,
}: {
  canUseBackend: boolean
  historyFragmentIsOpen: boolean
  isPageForeground?: () => boolean
  markRead: (threadId: string) => Promise<void>
  selectedThreadId: string | null
}) {
  const lastSyncByBoundaryRef = useRef(new Map<string, number>())

  return useCallback(
    (boundary: VisibleBoundary) => {
      if (
        !canUseBackend ||
        historyFragmentIsOpen ||
        !selectedThreadId ||
        !isPageForeground()
      ) {
        return
      }

      if (boundary.latestVisibleAgentMessageId === null) {
        return
      }

      const syncKey = `${selectedThreadId}:${boundary.latestVisibleAgentMessageId}`
      const now = Date.now()
      const lastSyncAt = lastSyncByBoundaryRef.current.get(syncKey)

      if (
        lastSyncAt !== undefined &&
        now - lastSyncAt < READ_SYNC_DEBOUNCE_MS
      ) {
        return
      }

      lastSyncByBoundaryRef.current.set(syncKey, now)
      void markRead(selectedThreadId).catch(() => {
        lastSyncByBoundaryRef.current.delete(syncKey)
      })
    },
    [
      canUseBackend,
      historyFragmentIsOpen,
      isPageForeground,
      markRead,
      selectedThreadId,
    ],
  )
}
