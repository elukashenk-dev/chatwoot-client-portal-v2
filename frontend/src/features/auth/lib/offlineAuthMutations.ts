import { useCallback, useRef } from 'react'

import type { AuthenticatedPortalSession } from '../types'
import { saveOnlineAuthSnapshotSafely } from './offlineAuthSession'

export function useOfflineAuthMutationQueue({
  tenantSlug,
}: {
  tenantSlug: string | null
}) {
  const mutationChainRef = useRef<Promise<void>>(Promise.resolve())

  const runOfflineAuthMutation = useCallback(
    <T,>(operation: () => Promise<T>) => {
      const resultPromise = mutationChainRef.current.then(operation, operation)
      mutationChainRef.current = resultPromise.then(
        () => undefined,
        () => undefined,
      )
      return resultPromise
    },
    [],
  )

  const saveOnlineSessionSnapshot = useCallback(
    (currentSession: AuthenticatedPortalSession) => {
      if (!tenantSlug) {
        return Promise.resolve(null)
      }

      return runOfflineAuthMutation(() =>
        saveOnlineAuthSnapshotSafely({
          currentSession,
          host: window.location.host,
          tenantSlug,
        }),
      )
    },
    [runOfflineAuthMutation, tenantSlug],
  )

  return {
    runOfflineAuthMutation,
    saveOnlineSessionSnapshot,
  }
}
