import { useEffect } from 'react'

import { sendChatMessage } from '../chat/api/chatClient'
import type { ChatSendResult } from '../chat/types'
import { drainOfflineTextOutbox, withOutboxDrainLock } from './outboxDrain'
import type { DrainOutcomeEvent } from './outboxDrain'
import type { OfflineTextOutboxRecord } from './types'

type OutboxDrainSuccessEvent = {
  record: OfflineTextOutboxRecord
  sendResult: ChatSendResult
}

export function useOfflineOutboxDrain({
  drainRequestSignal = 0,
  enabled,
  onAuthRejected,
  onDrainOutcome,
  onSendSucceeded,
  tenantSlug,
  userId,
}: {
  drainRequestSignal?: number
  enabled: boolean
  onAuthRejected: () => void | Promise<void>
  onDrainOutcome?: (event: DrainOutcomeEvent) => void | Promise<void>
  onSendSucceeded: (event: OutboxDrainSuccessEvent) => void | Promise<void>
  tenantSlug: string | null
  userId: number | null
}) {
  useEffect(() => {
    if (!enabled || !tenantSlug || userId === null) {
      return
    }

    const scopedTenantSlug = tenantSlug
    const scopedUserId = userId
    let isMounted = true
    let isDraining = false

    async function drain() {
      if (!isMounted || isDraining) {
        return
      }

      isDraining = true

      try {
        const result = await withOutboxDrainLock(
          scopedTenantSlug,
          scopedUserId,
          () =>
            drainOfflineTextOutbox({
              onDrainOutcome,
              onSendSucceeded,
              sendChatMessage,
              tenantSlug: scopedTenantSlug,
              userId: scopedUserId,
            }),
        )

        if (result === 'auth_rejected' && isMounted) {
          await onAuthRejected()
        }
      } catch {
        // Drain is best-effort; later startup, online and visibility events retry.
      } finally {
        isDraining = false
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void drain()
      }
    }

    void drain()
    window.addEventListener('online', drain)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isMounted = false
      window.removeEventListener('online', drain)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [
    drainRequestSignal,
    enabled,
    onAuthRejected,
    onDrainOutcome,
    onSendSucceeded,
    tenantSlug,
    userId,
  ])
}
