import type { SmtpEmailDelivery } from '../../integrations/email/smtp.js'
import { buildPasswordlessLoginEmail } from './email.js'
import type {
  PasswordlessLoginRecord,
  PasswordlessLoginRepository,
} from './repository.js'

function ownsCurrentPendingLogin({
  currentRecord,
  loginRecord,
}: {
  currentRecord: PasswordlessLoginRecord | null
  loginRecord: PasswordlessLoginRecord
}) {
  return (
    currentRecord?.id === loginRecord.id &&
    currentRecord.status === 'pending' &&
    currentRecord.codeHash === loginRecord.codeHash &&
    currentRecord.lastSentAt.getTime() === loginRecord.lastSentAt.getTime()
  )
}

async function cleanupFailedLoginDelivery({
  passwordlessLoginRepository,
  previousPendingLogin,
  loginRecord,
  updatedAt,
}: {
  passwordlessLoginRepository: PasswordlessLoginRepository
  previousPendingLogin: PasswordlessLoginRecord | null
  loginRecord: PasswordlessLoginRecord
  updatedAt: Date
}) {
  await passwordlessLoginRepository.transactionWithScopedLock(
    loginRecord.email,
    async (tx) => {
      const currentRecord =
        await passwordlessLoginRepository.findLatestLoginByEmail(
          loginRecord.email,
          tx,
        )

      if (!ownsCurrentPendingLogin({ currentRecord, loginRecord })) {
        return
      }

      if (previousPendingLogin) {
        await passwordlessLoginRepository.replacePendingLogin(
          {
            attemptsCount: previousPendingLogin.attemptsCount,
            codeHash: previousPendingLogin.codeHash,
            expiresAt: previousPendingLogin.expiresAt,
            lastSentAt: previousPendingLogin.lastSentAt,
            portalUserId: previousPendingLogin.portalUserId,
            recordId: previousPendingLogin.id,
            resendCount: previousPendingLogin.resendCount,
            resendNotBefore: previousPendingLogin.resendNotBefore,
            updatedAt,
          },
          tx,
        )
        return
      }

      await passwordlessLoginRepository.deleteLoginRecord(loginRecord.id, tx)
    },
  )
}

async function deliverLoginEmail({
  emailDelivery,
  loginCode,
  loginRecord,
  normalizedEmail,
  passwordlessLoginRepository,
  previousPendingLogin,
  requestedAt,
}: {
  emailDelivery: Pick<SmtpEmailDelivery, 'send'>
  loginCode: string
  loginRecord: PasswordlessLoginRecord
  normalizedEmail: string
  passwordlessLoginRepository: PasswordlessLoginRepository
  previousPendingLogin: PasswordlessLoginRecord | null
  requestedAt: Date
}) {
  try {
    await emailDelivery.send(
      buildPasswordlessLoginEmail({
        code: loginCode,
        to: normalizedEmail,
      }),
    )
  } catch (error) {
    await cleanupFailedLoginDelivery({
      loginRecord,
      passwordlessLoginRepository,
      previousPendingLogin,
      updatedAt: requestedAt,
    })

    throw error
  }
}

export function dispatchPasswordlessLoginEmail(
  input: Parameters<typeof deliverLoginEmail>[0],
) {
  setImmediate(() => {
    void deliverLoginEmail(input).catch(() => undefined)
  })
}
