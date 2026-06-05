import { useCallback, useEffect, useRef } from 'react'

const READ_SYNC_DEBOUNCE_MS = 5_000

type VisibleBoundary = {
  latestVisibleAgentMessageId: number | null
}

type PendingTrailingSync = {
  messageId: number
  threadId: string
  timeoutId: number
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
  const lastSyncAttemptByThreadRef = useRef(new Map<string, number>())
  const pendingTrailingSyncRef = useRef<PendingTrailingSync | null>(null)

  const clearPendingTrailingSync = useCallback(() => {
    if (pendingTrailingSyncRef.current) {
      window.clearTimeout(pendingTrailingSyncRef.current.timeoutId)
      pendingTrailingSyncRef.current = null
    }
  }, [])

  const sendReadNow = useCallback(
    (threadId: string, messageId: number) => {
      const syncKey = `${threadId}:${messageId}`
      const now = Date.now()

      lastSyncByBoundaryRef.current.set(syncKey, now)
      lastSyncAttemptByThreadRef.current.set(threadId, now)
      void markRead(threadId).catch(() => {
        if (lastSyncByBoundaryRef.current.get(syncKey) === now) {
          lastSyncByBoundaryRef.current.delete(syncKey)
        }

        if (lastSyncAttemptByThreadRef.current.get(threadId) === now) {
          lastSyncAttemptByThreadRef.current.delete(threadId)
        }
      })
    },
    [markRead],
  )

  const scheduleTrailingSync = useCallback(
    ({
      delayMs,
      messageId,
      threadId,
    }: {
      delayMs: number
      messageId: number
      threadId: string
    }) => {
      clearPendingTrailingSync()

      const timeoutId = window.setTimeout(() => {
        const pendingSync = pendingTrailingSyncRef.current

        if (!pendingSync || pendingSync.timeoutId !== timeoutId) {
          return
        }

        pendingTrailingSyncRef.current = null

        if (
          !canUseBackend ||
          historyFragmentIsOpen ||
          selectedThreadId !== threadId ||
          !isPageForeground()
        ) {
          return
        }

        sendReadNow(threadId, messageId)
      }, delayMs)

      pendingTrailingSyncRef.current = {
        messageId,
        threadId,
        timeoutId,
      }
    },
    [
      canUseBackend,
      clearPendingTrailingSync,
      historyFragmentIsOpen,
      isPageForeground,
      selectedThreadId,
      sendReadNow,
    ],
  )

  useEffect(() => clearPendingTrailingSync, [clearPendingTrailingSync])

  useEffect(() => {
    clearPendingTrailingSync()
  }, [
    canUseBackend,
    clearPendingTrailingSync,
    historyFragmentIsOpen,
    selectedThreadId,
  ])

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

      const visibleMessageId = boundary.latestVisibleAgentMessageId

      if (visibleMessageId === null) {
        return
      }

      const syncKey = `${selectedThreadId}:${visibleMessageId}`
      const now = Date.now()
      const lastSyncAt = lastSyncByBoundaryRef.current.get(syncKey)

      if (
        lastSyncAt !== undefined &&
        now - lastSyncAt < READ_SYNC_DEBOUNCE_MS
      ) {
        return
      }

      const pendingSync = pendingTrailingSyncRef.current

      if (
        pendingSync?.threadId === selectedThreadId &&
        pendingSync.messageId === visibleMessageId
      ) {
        return
      }

      const lastThreadSyncAt =
        lastSyncAttemptByThreadRef.current.get(selectedThreadId)

      if (
        lastThreadSyncAt === undefined ||
        now - lastThreadSyncAt >= READ_SYNC_DEBOUNCE_MS
      ) {
        clearPendingTrailingSync()
        sendReadNow(selectedThreadId, visibleMessageId)
        return
      }

      scheduleTrailingSync({
        delayMs: READ_SYNC_DEBOUNCE_MS - (now - lastThreadSyncAt),
        messageId: visibleMessageId,
        threadId: selectedThreadId,
      })
    },
    [
      canUseBackend,
      clearPendingTrailingSync,
      historyFragmentIsOpen,
      isPageForeground,
      scheduleTrailingSync,
      selectedThreadId,
      sendReadNow,
    ],
  )
}
