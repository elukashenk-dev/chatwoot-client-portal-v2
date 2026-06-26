import { createHash } from 'node:crypto'

import { normalizeEmail } from '../../lib/email.js'
import {
  createAccountExistsError,
  createVerificationContinuationInvalidError,
  createVerificationNotFoundOrInvalidatedError,
  createVerificationRequiredError,
} from './errors.js'
import type { RegistrationRepository } from './repository.js'

type VerifiedRegistrationRecord = NonNullable<
  Awaited<
    ReturnType<RegistrationRepository['findLatestVerifiedVerificationByEmail']>
  >
>

type RegistrationRepositoryExecutor = Parameters<
  RegistrationRepository['findLatestVerifiedVerificationByEmail']
>[1]

export type RegistrationCompletionFailureOutcome =
  | 'account_exists'
  | 'continuation_invalid'
  | 'not_found_or_consumed'
  | 'verification_required'

export type RegistrationCompletionReadinessResult =
  | {
      outcome: 'ready'
      verifiedRecord: VerifiedRegistrationRecord
    }
  | {
      outcome: RegistrationCompletionFailureOutcome
    }

export function hashRegistrationContinuationToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function verifyRegistrationContinuationToken({
  providedToken,
  storedTokenHash,
}: {
  providedToken: string
  storedTokenHash: string | null
}) {
  if (!storedTokenHash) {
    return false
  }

  return hashRegistrationContinuationToken(providedToken) === storedTokenHash
}

export function throwRegistrationCompletionFailure(
  outcome: RegistrationCompletionFailureOutcome,
): never {
  if (outcome === 'account_exists') {
    throw createAccountExistsError()
  }

  if (outcome === 'continuation_invalid') {
    throw createVerificationContinuationInvalidError()
  }

  if (outcome === 'not_found_or_consumed') {
    throw createVerificationNotFoundOrInvalidatedError()
  }

  if (outcome === 'verification_required') {
    throw createVerificationRequiredError()
  }

  const exhaustiveOutcome: never = outcome
  throw exhaustiveOutcome
}

export async function checkRegistrationCompletionReadiness({
  completedAt,
  normalizedContinuationToken,
  normalizedEmail,
  registrationRepository,
  tx,
}: {
  completedAt: Date
  normalizedContinuationToken: string
  normalizedEmail: string
  registrationRepository: RegistrationRepository
  tx: RegistrationRepositoryExecutor
}): Promise<RegistrationCompletionReadinessResult> {
  const verifiedRecord =
    await registrationRepository.findLatestVerifiedVerificationByEmail(
      normalizedEmail,
      tx,
    )

  if (!verifiedRecord) {
    const latestVerification =
      await registrationRepository.findLatestVerificationByEmail(
        normalizedEmail,
        tx,
      )

    if (latestVerification?.status === 'consumed') {
      return {
        outcome: 'not_found_or_consumed',
      }
    }

    return {
      outcome: 'verification_required',
    }
  }

  const isContinuationExpired =
    !verifiedRecord.continuationTokenExpiresAt ||
    verifiedRecord.continuationTokenExpiresAt.getTime() <=
      completedAt.getTime()

  if (isContinuationExpired) {
    await registrationRepository.invalidateVerifiedVerification(
      verifiedRecord.id,
      completedAt,
      tx,
    )

    return {
      outcome: 'verification_required',
    }
  }

  if (
    !verifyRegistrationContinuationToken({
      providedToken: normalizedContinuationToken,
      storedTokenHash: verifiedRecord.continuationTokenHash,
    })
  ) {
    return {
      outcome: 'continuation_invalid',
    }
  }

  const existingPortalUser =
    await registrationRepository.findPortalUserByEmail(normalizedEmail, tx)

  if (existingPortalUser) {
    await registrationRepository.invalidateVerifiedVerification(
      verifiedRecord.id,
      completedAt,
      tx,
    )

    return {
      outcome: 'account_exists',
    }
  }

  return {
    outcome: 'ready',
    verifiedRecord,
  }
}

export async function assertRegistrationCompletionReadyBeforeExpensiveWork({
  continuationToken,
  email,
  now,
  registrationRepository,
}: {
  continuationToken: string
  email: string
  now: () => Date
  registrationRepository: RegistrationRepository
}) {
  const normalizedEmail = normalizeEmail(email)
  const normalizedContinuationToken = continuationToken.trim()
  const checkedAt = now()
  const readiness = await registrationRepository.transactionWithScopedLock(
    normalizedEmail,
    async (tx) =>
      checkRegistrationCompletionReadiness({
        completedAt: checkedAt,
        normalizedContinuationToken,
        normalizedEmail,
        registrationRepository,
        tx,
      }),
  )

  if (readiness.outcome !== 'ready') {
    throwRegistrationCompletionFailure(readiness.outcome)
  }
}
