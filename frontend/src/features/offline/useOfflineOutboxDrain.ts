import { useEffect } from 'react'

import { sendChatMessage } from '../chat/api/chatClient'
import type { ChatSendResult } from '../chat/types'
import { offlineOutboxStore } from './offlineOutboxStore'
import { drainOfflineTextOutbox, withOutboxDrainLock } from './outboxDrain'
import type { DrainOutcomeEvent } from './outboxDrain'
import type { OfflineTextOutboxRecord } from './types'

type OutboxDrainSuccessEvent = {
  record: OfflineTextOutboxRecord
  sendResult: ChatSendResult
}

const MIN_SCHEDULED_DRAIN_DELAY_MS = 1000
const MAX_SCHEDULED_DRAIN_DELAY_MS = 2_147_483_647

function getPendingRetryAt(record: OfflineTextOutboxRecord) {
  if (record.status === 'queued') {
    return record.nextAttemptAt
  }

  if (record.status === 'sending') {
    return record.sendingLeaseExpiresAt
  }

  return null
}

function getScheduledDrainDelayMs(records: OfflineTextOutboxRecord[]) {
  const nowMs = Date.now()
  let nextRetryAtMs: number | null = null

  for (const record of records) {
    const pendingRetryAt = getPendingRetryAt(record)

    if (!pendingRetryAt) {
      continue
    }

    const pendingRetryAtMs = new Date(pendingRetryAt).getTime()

    if (!Number.isFinite(pendingRetryAtMs)) {
      return MIN_SCHEDULED_DRAIN_DELAY_MS
    }

    nextRetryAtMs =
      nextRetryAtMs === null
        ? pendingRetryAtMs
        : Math.min(nextRetryAtMs, pendingRetryAtMs)
  }

  if (nextRetryAtMs === null) {
    return null
  }

  return Math.min(
    Math.max(nextRetryAtMs - nowMs, MIN_SCHEDULED_DRAIN_DELAY_MS),
    MAX_SCHEDULED_DRAIN_DELAY_MS,
  )
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
    let scheduledDrainTimerId: number | null = null

    function clearScheduledDrain() {
      if (scheduledDrainTimerId !== null) {
        window.clearTimeout(scheduledDrainTimerId)
        scheduledDrainTimerId = null
      }
    }

    async function scheduleNextDrain() {
      if (!isMounted) {
        return
      }

      try {
        const records = await offlineOutboxStore.listUserOutboxRecords({
          tenantSlug: scopedTenantSlug,
          userId: scopedUserId,
        })
        const delayMs = getScheduledDrainDelayMs(records)

        if (!isMounted || delayMs === null) {
          return
        }

        clearScheduledDrain()
        scheduledDrainTimerId = window.setTimeout(() => {
          scheduledDrainTimerId = null
          void drain()
        }, delayMs)
      } catch {
        // Scheduled retry is best-effort; online/visibility events still retry.
      }
    }

    async function drain() {
      if (!isMounted || isDraining) {
        return
      }

      clearScheduledDrain()
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
        void scheduleNextDrain()
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
      clearScheduledDrain()
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
