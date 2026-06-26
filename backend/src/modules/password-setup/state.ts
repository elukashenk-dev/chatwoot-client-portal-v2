import type { AppDatabase } from '../../db/client.js'
import { createUnauthorizedError } from './errors.js'
import type {
  PasswordSetupPortalUser,
  PasswordSetupRecord,
  PasswordSetupRepository,
} from './repository.js'
import { verifyContinuationToken } from './tokens.js'
import type { PasswordSetupScope } from './types.js'

type PasswordlessUserResult =
  | {
      outcome: 'already_set'
      user: PasswordSetupPortalUser
    }
  | {
      outcome: 'passwordless'
      user: PasswordSetupPortalUser
    }

type VerifiedSetupValidationResult =
  | {
      outcome: 'already_set'
    }
  | {
      outcome: 'continuation_invalid'
    }
  | {
      outcome: 'not_found_or_consumed'
    }
  | {
      outcome: 'ready'
      user: PasswordSetupPortalUser
      verifiedRecord: PasswordSetupRecord
    }
  | {
      outcome: 'verification_required'
    }

export async function readPasswordSetupRequestPreflight({
  passwordSetupRepository,
  requestedAt,
  scope,
}: {
  passwordSetupRepository: PasswordSetupRepository
  requestedAt: Date
  scope: PasswordSetupScope
}) {
  const user = await passwordSetupRepository.findPortalUserForSetup(scope)

  if (!user?.isActive) {
    throw createUnauthorizedError()
  }

  if (user.passwordHash !== null) {
    return { outcome: 'already_set' as const }
  }

  const latestSetup = await passwordSetupRepository.findLatestSetupByUser(scope)

  if (
    latestSetup?.status === 'pending' &&
    latestSetup.expiresAt.getTime() > requestedAt.getTime() &&
    latestSetup.resendNotBefore.getTime() > requestedAt.getTime()
  ) {
    return {
      outcome: 'resend_locked' as const,
      setupRecord: latestSetup,
    }
  }

  return { outcome: 'ready' as const }
}

export async function ensureActivePasswordlessUser({
  passwordSetupRepository,
  scope,
  tx,
}: {
  passwordSetupRepository: PasswordSetupRepository
  scope: PasswordSetupScope
  tx: AppDatabase
}): Promise<PasswordlessUserResult> {
  const user = await passwordSetupRepository.findPortalUserForSetup({
    ...scope,
    executor: tx,
    lock: true,
  })

  if (!user?.isActive) {
    throw createUnauthorizedError()
  }

  if (user.passwordHash !== null) {
    return {
      outcome: 'already_set',
      user,
    }
  }

  return {
    outcome: 'passwordless',
    user,
  }
}

export async function validateVerifiedSetup({
  completedAt,
  continuationToken,
  passwordSetupRepository,
  scope,
  tx,
}: {
  completedAt: Date
  continuationToken: string
  passwordSetupRepository: PasswordSetupRepository
  scope: PasswordSetupScope
  tx: AppDatabase
}): Promise<VerifiedSetupValidationResult> {
  const userResult = await ensureActivePasswordlessUser({
    passwordSetupRepository,
    scope,
    tx,
  })
  const verifiedRecord =
    await passwordSetupRepository.findLatestVerifiedSetupByUser(scope, tx)

  if (userResult.outcome === 'already_set') {
    if (verifiedRecord) {
      await passwordSetupRepository.invalidateVerifiedSetup(
        verifiedRecord.id,
        completedAt,
        tx,
      )
    }

    return { outcome: 'already_set' }
  }

  if (!verifiedRecord) {
    const latestSetup = await passwordSetupRepository.findLatestSetupByUser(
      scope,
      tx,
    )

    return {
      outcome:
        latestSetup?.status === 'consumed'
          ? 'not_found_or_consumed'
          : 'verification_required',
    }
  }

  const isContinuationExpired =
    !verifiedRecord.continuationTokenExpiresAt ||
    verifiedRecord.continuationTokenExpiresAt.getTime() <=
      completedAt.getTime()

  if (isContinuationExpired) {
    await passwordSetupRepository.invalidateVerifiedSetup(
      verifiedRecord.id,
      completedAt,
      tx,
    )

    return { outcome: 'verification_required' }
  }

  if (
    !verifyContinuationToken({
      providedToken: continuationToken,
      storedTokenHash: verifiedRecord.continuationTokenHash,
    })
  ) {
    return { outcome: 'continuation_invalid' }
  }

  return {
    outcome: 'ready',
    user: userResult.user,
    verifiedRecord,
  }
}
