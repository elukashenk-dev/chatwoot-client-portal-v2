import { useCallback, useEffect, useRef } from 'react'

import type { PendingShareDraftScope } from '../../offline/types'
import { pruneExpiredPendingShareDrafts } from './pendingShareDraftStore'
import type { LiveShareIdentity } from './pwaShareTargetModel'

export function usePendingShareDraftStorageRuntime(
  liveIdentity: LiveShareIdentity | null,
) {
  const liveIdentityRef = useRef(liveIdentity)
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve())
  liveIdentityRef.current = liveIdentity

  useEffect(() => {
    void pruneExpiredPendingShareDrafts().catch(() => undefined)
  }, [])

  const queueDraftMutation = useCallback(
    (
      draftId: string,
      operation: (scope: PendingShareDraftScope) => Promise<void>,
    ) => {
      let didRun = false
      const run = mutationQueueRef.current.then(async () => {
        const currentIdentity = liveIdentityRef.current

        if (!currentIdentity) {
          return
        }

        didRun = true
        await operation({ ...currentIdentity, draftId })
      })

      mutationQueueRef.current = run.catch(() => undefined)

      return run.then(() => didRun)
    },
    [],
  )

  return { liveIdentityRef, queueDraftMutation }
}
