import { useCallback, useEffect } from 'react'

import {
  clearRejectedAuthSnapshot,
  offlineStore,
} from '../../offline/offlineStore'
import { offlineOutboxStore } from '../../offline/offlineOutboxStore'
import type { DrainOutcomeEvent } from '../../offline/outboxDrain'
import { useOfflineOutboxDrain } from '../../offline/useOfflineOutboxDrain'
import type { OfflineTextOutboxRecord } from '../../offline/types'
import { buildSnapshotFromSendResult } from '../lib/chatSnapshot'
import type { ChatSendResult } from '../types'
import type { ChatPageState } from './chatPageState'
import { saveOfflineMessageSnapshot } from './offlineChatCache'

type OutboxSendSucceededEvent = {
  record: OfflineTextOutboxRecord
  sendResult: ChatSendResult
}

type OutboxHydrationResult = {
  records: OfflineTextOutboxRecord[]
  requestedAt: Date
  threadId: string
}

type UseChatOutboxDrainIntegrationInput = {
  drainRequestSignal: number
  handleOutboxSendSucceeded: (event: OutboxSendSucceededEvent) => void
  hydrateOptimisticTextSendsFromOutbox: (result: OutboxHydrationResult) => void
  isBrowserOnline: boolean
  markBrowserOffline: () => void
  pageState: ChatPageState
  refreshSession: () => Promise<void>
  tenantSlug: string | null
  userId: number | null
}

export function useChatOutboxDrainIntegration({
  drainRequestSignal,
  handleOutboxSendSucceeded,
  hydrateOptimisticTextSendsFromOutbox,
  isBrowserOnline,
  markBrowserOffline,
  pageState,
  refreshSession,
  tenantSlug,
  userId,
}: UseChatOutboxDrainIntegrationInput) {
  const loadSelectedThreadOutboxRecords = useCallback(async () => {
    if (tenantSlug === null || userId === null || !pageState.selectedThreadId) {
      return null
    }

    const threadId = pageState.selectedThreadId
    const requestedAt = new Date()
    const records = await offlineOutboxStore.listThreadOutboxRecords({
      tenantSlug,
      threadId,
      userId,
    })

    return {
      records,
      requestedAt,
      threadId,
    }
  }, [pageState.selectedThreadId, tenantSlug, userId])

  useEffect(() => {
    let isCurrent = true

    loadSelectedThreadOutboxRecords()
      .then((result) => {
        if (isCurrent && result !== null) {
          hydrateOptimisticTextSendsFromOutbox(result)
        }
      })
      .catch(() => {})

    return () => {
      isCurrent = false
    }
  }, [hydrateOptimisticTextSendsFromOutbox, loadSelectedThreadOutboxRecords])

  const handleOutboxDrainSucceeded = useCallback(
    async ({ record, sendResult }: OutboxSendSucceededEvent) => {
      handleOutboxSendSucceeded({ record, sendResult })

      if (tenantSlug === null || userId === null) {
        return
      }

      const cachedSnapshotRecord = await offlineStore.readMessageSnapshot(
        tenantSlug,
        userId,
        record.threadId,
      )
      const currentSnapshot =
        pageState.status === 'ready' &&
        pageState.selectedThreadId === record.threadId
          ? pageState.snapshot
          : (cachedSnapshotRecord?.snapshot ?? null)
      const nextSnapshot = buildSnapshotFromSendResult({
        currentSnapshot,
        sendResult,
      })

      await saveOfflineMessageSnapshot({
        snapshot: nextSnapshot,
        tenantSlug,
        threadId: record.threadId,
        userId,
      })
    },
    [handleOutboxSendSucceeded, pageState, tenantSlug, userId],
  )

  const handleOutboxDrainOutcome = useCallback(
    async (event: DrainOutcomeEvent) => {
      if (
        event.category === 'sent' ||
        tenantSlug === null ||
        userId === null ||
        event.tenantSlug !== tenantSlug ||
        event.userId !== userId ||
        event.threadId !== pageState.selectedThreadId
      ) {
        return
      }

      if (event.category === 'network_retry' && event.statusCode === 0) {
        markBrowserOffline()
      }

      try {
        const result = await loadSelectedThreadOutboxRecords()
        if (result !== null) {
          hydrateOptimisticTextSendsFromOutbox(result)
        }
      } catch {
        // Outbox hydration is best-effort; keep visible local sends unchanged.
      }
    },
    [
      hydrateOptimisticTextSendsFromOutbox,
      loadSelectedThreadOutboxRecords,
      markBrowserOffline,
      pageState.selectedThreadId,
      tenantSlug,
      userId,
    ],
  )

  const handleOutboxAuthRejected = useCallback(async () => {
    if (tenantSlug === null || userId === null) {
      return
    }

    await clearRejectedAuthSnapshot({
      host: window.location.host,
      tenantSlug,
      userId,
    })
    await refreshSession()
  }, [refreshSession, tenantSlug, userId])

  useOfflineOutboxDrain({
    drainRequestSignal,
    enabled:
      isBrowserOnline &&
      tenantSlug !== null &&
      userId !== null &&
      pageState.status === 'ready',
    onAuthRejected: handleOutboxAuthRejected,
    onDrainOutcome: handleOutboxDrainOutcome,
    onSendSucceeded: handleOutboxDrainSucceeded,
    tenantSlug,
    userId,
  })
}
