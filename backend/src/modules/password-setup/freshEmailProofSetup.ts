import { isCustomerEmailProofFresh } from '../auth/emailProof.js'
import { createPasswordAlreadySetError } from './errors.js'
import type { PasswordSetupRepository } from './repository.js'
import { buildVerifyResponse } from './responses.js'
import { ensureActivePasswordlessUser } from './state.js'
import {
  createContinuationToken,
  hashContinuationToken,
  PASSWORD_SETUP_CONTINUATION_TTL_SECONDS,
} from './tokens.js'
import type { PasswordSetupVerifyResult } from './types.js'

type FreshEmailProofSetupScope = {
  email: string
  userId: number
}

export async function requestPasswordSetupFromFreshEmailProof({
  emailProofExpiresAt,
  passwordSetupRepository,
  requestedAt,
  scope,
}: {
  emailProofExpiresAt: Date | null | undefined
  passwordSetupRepository: PasswordSetupRepository
  requestedAt: Date
  scope: FreshEmailProofSetupScope
}): Promise<PasswordSetupVerifyResult | null> {
  if (
    !isCustomerEmailProofFresh({
      emailProofExpiresAt,
      now: requestedAt,
    })
  ) {
    return null
  }

  const verificationResult =
    await passwordSetupRepository.transactionWithScopedLock(
      scope,
      async (tx) => {
        const userResult = await ensureActivePasswordlessUser({
          passwordSetupRepository,
          scope,
          tx,
        })

        if (userResult.outcome === 'already_set') {
          return { outcome: 'already_set' as const }
        }

        const continuationToken = createContinuationToken()
        const continuationTokenExpiresAt = new Date(
          requestedAt.getTime() +
            PASSWORD_SETUP_CONTINUATION_TTL_SECONDS * 1000,
        )

        await passwordSetupRepository.createVerifiedSetup(
          {
            continuationTokenExpiresAt,
            continuationTokenHash: hashContinuationToken(continuationToken),
            createdAt: requestedAt,
            email: scope.email,
            userId: scope.userId,
          },
          tx,
        )

        return {
          outcome: 'verified' as const,
          response: buildVerifyResponse({
            continuationToken,
            continuationTokenExpiresAt,
            email: scope.email,
            now: requestedAt,
          }),
        }
      },
    )

  if (verificationResult.outcome === 'already_set') {
    throw createPasswordAlreadySetError()
  }

  return verificationResult.response
}
