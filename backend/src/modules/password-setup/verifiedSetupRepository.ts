import type { AppDatabase } from '../../db/client.js'
import { verificationRecords } from '../../db/schema.js'
import { normalizeEmail } from '../../lib/email.js'
import type { PasswordSetupRecord } from './repository.js'

const PASSWORD_SETUP_PURPOSE = 'password_setup'

export type CreateVerifiedSetupInput = {
  continuationTokenExpiresAt: Date
  continuationTokenHash: string
  createdAt: Date
  email: string
  userId: number
}

export async function createVerifiedPasswordSetupRecord({
  executor,
  input,
  tenantId,
}: {
  executor: AppDatabase
  input: CreateVerifiedSetupInput
  tenantId: number
}): Promise<PasswordSetupRecord> {
  const normalizedEmail = normalizeEmail(input.email)

  const [createdRecord] = await executor
    .insert(verificationRecords)
    .values({
      attemptsCount: 0,
      codeHash: 'fresh-email-proof',
      continuationTokenExpiresAt: input.continuationTokenExpiresAt,
      continuationTokenHash: input.continuationTokenHash,
      email: normalizedEmail,
      expiresAt: input.continuationTokenExpiresAt,
      lastSentAt: input.createdAt,
      maxAttempts: 0,
      portalUserId: input.userId,
      purpose: PASSWORD_SETUP_PURPOSE,
      resendCount: 0,
      resendNotBefore: input.createdAt,
      status: 'verified',
      tenantId,
      verifiedAt: input.createdAt,
    })
    .returning({
      attemptsCount: verificationRecords.attemptsCount,
      codeHash: verificationRecords.codeHash,
      continuationTokenExpiresAt:
        verificationRecords.continuationTokenExpiresAt,
      continuationTokenHash: verificationRecords.continuationTokenHash,
      email: verificationRecords.email,
      expiresAt: verificationRecords.expiresAt,
      id: verificationRecords.id,
      lastSentAt: verificationRecords.lastSentAt,
      maxAttempts: verificationRecords.maxAttempts,
      portalUserId: verificationRecords.portalUserId,
      resendCount: verificationRecords.resendCount,
      resendNotBefore: verificationRecords.resendNotBefore,
      status: verificationRecords.status,
      verifiedAt: verificationRecords.verifiedAt,
    })

  if (!createdRecord) {
    throw new Error('Failed to create verified password setup record.')
  }

  return createdRecord
}
