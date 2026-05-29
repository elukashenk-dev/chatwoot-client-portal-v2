import { useCallback, useEffect, useState } from 'react'

import type { ChatPageState } from './chatPageState'

export function useChatUnreadThreadMarkers(pageState: ChatPageState) {
  const [unreadThreadIds, setUnreadThreadIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const markUnreadThread = useCallback(
    (threadId: string) => {
      setUnreadThreadIds((currentValue) => {
        if (
          threadId === pageState.selectedThreadId ||
          !pageState.threads.some((thread) => thread.id === threadId) ||
          currentValue.has(threadId)
        ) {
          return currentValue
        }

        const nextValue = new Set(currentValue)
        nextValue.add(threadId)

        return nextValue
      })
    },
    [pageState.selectedThreadId, pageState.threads],
  )

  useEffect(() => {
    const selectedThreadId = pageState.selectedThreadId

    if (
      !selectedThreadId ||
      pageState.status !== 'ready' ||
      pageState.snapshot.activeThread?.id !== selectedThreadId
    ) {
      return
    }

    const clearUnreadTimerId = window.setTimeout(() => {
      setUnreadThreadIds((currentValue) => {
        if (!currentValue.has(selectedThreadId)) {
          return currentValue
        }

        const nextValue = new Set(currentValue)
        nextValue.delete(selectedThreadId)

        return nextValue
      })
    }, 0)

    return () => {
      window.clearTimeout(clearUnreadTimerId)
    }
  }, [pageState])

  return { markUnreadThread, unreadThreadIds }
}
