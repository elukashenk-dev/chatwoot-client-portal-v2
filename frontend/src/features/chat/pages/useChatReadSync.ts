import { useCallback, useRef } from 'react'

const READ_SYNC_DEBOUNCE_MS = 5_000

type VisibleBoundary = {
  latestVisibleAgentMessageId: number | null
}

export function useChatReadSync({
  canUseBackend,
  historyFragmentIsOpen,
  markRead,
  selectedThreadId,
}: {
  canUseBackend: boolean
  historyFragmentIsOpen: boolean
  markRead: (threadId: string) => Promise<void>
  selectedThreadId: string | null
}) {
  const lastSyncByBoundaryRef = useRef(new Map<string, number>())

  return useCallback(
    (boundary: VisibleBoundary) => {
      if (!canUseBackend || historyFragmentIsOpen || !selectedThreadId) {
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
    [canUseBackend, historyFragmentIsOpen, markRead, selectedThreadId],
  )
}
