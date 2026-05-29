import { useEffect, useState } from 'react'

import {
  estimateOfflineStorage,
  requestOfflineStoragePersistence,
} from './storagePersistence'

type OfflineTextQueueSessionSource = 'cached' | 'online' | null

type OfflineTextQueueStorageScope = {
  canUse: boolean
  tenantSlug: string
  userId: number
}

export function useOfflineTextQueueAvailability({
  sessionSource,
  tenantSlug,
  userId,
}: {
  sessionSource: OfflineTextQueueSessionSource
  tenantSlug: string | null
  userId: number | null
}) {
  const [storageScope, setStorageScope] =
    useState<OfflineTextQueueStorageScope | null>(null)

  useEffect(() => {
    if (sessionSource !== 'online' || userId === null) {
      return
    }

    void requestOfflineStoragePersistence()
  }, [sessionSource, userId])

  useEffect(() => {
    if (tenantSlug === null || userId === null) {
      return
    }

    const scopedTenantSlug = tenantSlug
    const scopedUserId = userId
    let isCurrent = true

    estimateOfflineStorage()
      .then((estimate) => {
        if (isCurrent) {
          setStorageScope({
            canUse: !estimate.isLowQuota,
            tenantSlug: scopedTenantSlug,
            userId: scopedUserId,
          })
        }
      })
      .catch(() => {
        if (isCurrent) {
          setStorageScope({
            canUse: false,
            tenantSlug: scopedTenantSlug,
            userId: scopedUserId,
          })
        }
      })

    return () => {
      isCurrent = false
    }
  }, [tenantSlug, userId])

  return (
    storageScope?.tenantSlug === tenantSlug &&
    storageScope.userId === userId &&
    storageScope.canUse
  )
}
