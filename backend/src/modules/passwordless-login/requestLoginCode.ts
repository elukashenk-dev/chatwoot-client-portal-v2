import type { ChatwootClient } from '../../integrations/chatwoot/client.js'
import type { SmtpEmailDelivery } from '../../integrations/email/smtp.js'
import { normalizeEmail } from '../../lib/email.js'
import { hashPassword } from '../../lib/password.js'
import {
  PASSWORDLESS_LOGIN_RESEND_COOLDOWN_SECONDS,
  PASSWORDLESS_LOGIN_TTL_SECONDS,
} from './constants.js'
import { dispatchPasswordlessLoginEmail } from './delivery.js'
import type { PasswordlessLoginRepository } from './repository.js'
import {
  buildRequestResponse,
  type PasswordlessLoginRequestResult,
} from './responses.js'
import { createLoginCode } from './tokens.js'

type ChatwootEmailContact = Awaited<
  ReturnType<ChatwootClient['findContactByEmail']>
>

function isExpired(record: { expiresAt: Date }, requestedAt: Date) {
  return record.expiresAt.getTime() <= requestedAt.getTime()
}

function isResendLocked(record: { resendNotBefore: Date }, requestedAt: Date) {
  return record.resendNotBefore.getTime() > requestedAt.getTime()
}

export async function requestLoginCode({
  chatwootClient,
  email,
  emailDelivery,
  now,
  passwordlessLoginRepository,
}: {
  chatwootClient: Pick<ChatwootClient, 'findContactByEmail'>
  email: string
  emailDelivery: Pick<SmtpEmailDelivery, 'send'>
  now: () => Date
  passwordlessLoginRepository: PasswordlessLoginRepository
}): Promise<PasswordlessLoginRequestResult> {
  const normalizedEmail = normalizeEmail(email)
  const requestedAt = now()

  const lockedCooldownResult =
    await passwordlessLoginRepository.transactionWithScopedLock(
      normalizedEmail,
      async (tx) => {
        const existingPendingLogin =
          await passwordlessLoginRepository.findLatestPendingLoginByEmail(
            normalizedEmail,
            tx,
          )

        if (!existingPendingLogin) {
          return null
        }

        if (isExpired(existingPendingLogin, requestedAt)) {
          await passwordlessLoginRepository.expireLoginRecord(
            existingPendingLogin.id,
            requestedAt,
            tx,
          )

          return null
        }

        if (!isResendLocked(existingPendingLogin, requestedAt)) {
          return null
        }

        return {
          loginCode: null,
          loginRecord: existingPendingLogin,
          previousPendingLogin: existingPendingLogin,
          shouldSendEmail: false,
        }
      },
    )

  if (lockedCooldownResult) {
    return buildRequestResponse({
      email: normalizedEmail,
      expiresAt: lockedCooldownResult.loginRecord.expiresAt,
      now: requestedAt,
      resendNotBefore: lockedCooldownResult.loginRecord.resendNotBefore,
    })
  }

  const observedUser =
    await passwordlessLoginRepository.findPortalUserByEmail(normalizedEmail)
  const observedContact: ChatwootEmailContact = observedUser
    ? null
    : await chatwootClient.findContactByEmail(normalizedEmail)
  const loginCode = createLoginCode()
  const codeHash = await hashPassword(loginCode)
  const expiresAt = new Date(
    requestedAt.getTime() + PASSWORDLESS_LOGIN_TTL_SECONDS * 1000,
  )
  const resendNotBefore = new Date(
    requestedAt.getTime() + PASSWORDLESS_LOGIN_RESEND_COOLDOWN_SECONDS * 1000,
  )

  const result = await passwordlessLoginRepository.transactionWithScopedLock(
    normalizedEmail,
    async (tx) => {
      const user = await passwordlessLoginRepository.findPortalUserByEmail(
        normalizedEmail,
        tx,
      )
      const activeUser = user?.isActive ? user : null
      const existingPendingLogin =
        await passwordlessLoginRepository.findLatestPendingLoginByEmail(
          normalizedEmail,
          tx,
        )
      let previousPendingLogin: typeof existingPendingLogin | null = null

      if (existingPendingLogin) {
        if (!isExpired(existingPendingLogin, requestedAt)) {
          if (isResendLocked(existingPendingLogin, requestedAt)) {
            return {
              loginCode: null,
              loginRecord: existingPendingLogin,
              previousPendingLogin: existingPendingLogin,
              shouldSendEmail: false,
            }
          }

          previousPendingLogin = existingPendingLogin
        } else {
          await passwordlessLoginRepository.expireLoginRecord(
            existingPendingLogin.id,
            requestedAt,
            tx,
          )
        }
      }

      const contact = user ? null : observedContact
      const loginRecord = previousPendingLogin
        ? await passwordlessLoginRepository.replacePendingLogin(
            {
              chatwootContactId: contact?.id ?? null,
              codeHash,
              expiresAt,
              fullName: contact?.name ?? null,
              lastSentAt: requestedAt,
              portalUserId: activeUser?.id ?? null,
              recordId: previousPendingLogin.id,
              resendCount: previousPendingLogin.resendCount + 1,
              resendNotBefore,
              updatedAt: requestedAt,
            },
            tx,
          )
        : await passwordlessLoginRepository.createPendingLogin(
            {
              chatwootContactId: contact?.id ?? null,
              codeHash,
              email: normalizedEmail,
              expiresAt,
              fullName: contact?.name ?? null,
              lastSentAt: requestedAt,
              portalUserId: activeUser?.id ?? null,
              resendCount: 0,
              resendNotBefore,
            },
            tx,
          )

      return {
        loginCode,
        loginRecord,
        previousPendingLogin,
        shouldSendEmail: Boolean(activeUser || contact),
      }
    },
  )

  if (result.shouldSendEmail && result.loginCode) {
    dispatchPasswordlessLoginEmail({
      emailDelivery,
      loginCode: result.loginCode,
      loginRecord: result.loginRecord,
      normalizedEmail,
      passwordlessLoginRepository,
      previousPendingLogin: result.previousPendingLogin,
      requestedAt,
    })
  }

  return buildRequestResponse({
    email: normalizedEmail,
    expiresAt: result.loginRecord.expiresAt,
    now: requestedAt,
    resendNotBefore: result.loginRecord.resendNotBefore,
  })
}
