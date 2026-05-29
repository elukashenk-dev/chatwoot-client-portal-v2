import { registerOfflineTextOutboxBackgroundSync } from './backgroundOutboxSync'
import { offlineOutboxStore } from './offlineOutboxStore'
import type { OfflineTextOutboxRecord } from './types'

type RetryFailedOutboxRecordInput = {
  clientMessageKey: string
  tenantSlug: string
  threadId: string
  userId: number
}

export async function saveOfflineTextOutboxRecord(
  record: OfflineTextOutboxRecord,
) {
  await offlineOutboxStore.saveOutboxRecord(record)
  void registerOfflineTextOutboxBackgroundSync()
}

export async function retryFailedOfflineTextOutboxRecord(
  input: RetryFailedOutboxRecordInput,
) {
  const retryRecord = await offlineOutboxStore.retryFailedOutboxRecord(input)

  if (retryRecord) {
    void registerOfflineTextOutboxBackgroundSync()
  }

  return retryRecord
}
