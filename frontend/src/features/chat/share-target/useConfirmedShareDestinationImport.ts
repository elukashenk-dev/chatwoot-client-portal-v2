import { useEffect } from 'react'

import type { UsePwaShareTargetDraftOptions } from './pwaShareTargetModel'

export function useConfirmedShareDestinationImport({
  canImport,
  confirmedDestinationThreadId,
  importPendingDraft,
  pageStatus,
  selectedThreadId,
  setConfirmedDestinationThreadId,
  setErrorMessage,
}: {
  canImport: boolean
  confirmedDestinationThreadId: string | null
  importPendingDraft: (threadId: string) => Promise<void>
  pageStatus: UsePwaShareTargetDraftOptions['pageStatus']
  selectedThreadId: string | null
  setConfirmedDestinationThreadId: (threadId: string | null) => void
  setErrorMessage: (message: string | null) => void
}) {
  useEffect(() => {
    if (!confirmedDestinationThreadId) {
      return
    }

    let isCurrent = true

    void Promise.resolve().then(() => {
      if (!isCurrent) {
        return
      }

      if (pageStatus === 'error') {
        setConfirmedDestinationThreadId(null)
        setErrorMessage('Не удалось открыть выбранный чат.')
        return
      }

      if (
        canImport &&
        pageStatus === 'ready' &&
        selectedThreadId === confirmedDestinationThreadId
      ) {
        void importPendingDraft(confirmedDestinationThreadId)
      }
    })

    return () => {
      isCurrent = false
    }
  }, [
    canImport,
    confirmedDestinationThreadId,
    importPendingDraft,
    pageStatus,
    selectedThreadId,
    setConfirmedDestinationThreadId,
    setErrorMessage,
  ])
}
