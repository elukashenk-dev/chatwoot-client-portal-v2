import type { PasswordSetupRecord } from './repository.js'
import type { CreatePasswordSetupServiceOptions } from './types.js'

function ownsCurrentPendingSetup({
  currentRecord,
  setupRecord,
}: {
  currentRecord: PasswordSetupRecord | null
  setupRecord: PasswordSetupRecord
}) {
  return (
    currentRecord?.id === setupRecord.id &&
    currentRecord.status === 'pending' &&
    currentRecord.codeHash === setupRecord.codeHash &&
    currentRecord.lastSentAt.getTime() === setupRecord.lastSentAt.getTime()
  )
}

export async function cleanupFailedDelivery({
  passwordSetupRepository,
  previousPendingSetup,
  setupRecord,
  updatedAt,
}: {
  passwordSetupRepository: CreatePasswordSetupServiceOptions['passwordSetupRepository']
  previousPendingSetup: PasswordSetupRecord | null
  setupRecord: PasswordSetupRecord
  updatedAt: Date
}) {
  await passwordSetupRepository.transactionWithScopedLock(
    { email: setupRecord.email, userId: setupRecord.portalUserId ?? 0 },
    async (tx) => {
      const currentRecord = await passwordSetupRepository.findLatestSetupByUser(
        {
          email: setupRecord.email,
          userId: setupRecord.portalUserId ?? 0,
        },
        tx,
      )

      if (!ownsCurrentPendingSetup({ currentRecord, setupRecord })) {
        return
      }

      if (previousPendingSetup) {
        await passwordSetupRepository.replacePendingSetup(
          {
            attemptsCount: previousPendingSetup.attemptsCount,
            codeHash: previousPendingSetup.codeHash,
            expiresAt: previousPendingSetup.expiresAt,
            lastSentAt: previousPendingSetup.lastSentAt,
            recordId: previousPendingSetup.id,
            resendCount: previousPendingSetup.resendCount,
            resendNotBefore: previousPendingSetup.resendNotBefore,
            updatedAt,
          },
          tx,
        )
        return
      }

      await passwordSetupRepository.deleteSetupRecord(setupRecord.id, tx)
    },
  )
}
