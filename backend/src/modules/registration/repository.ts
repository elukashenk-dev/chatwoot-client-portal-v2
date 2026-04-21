import { createHash } from 'node:crypto'

import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import {
  portalUserContactLinks,
  portalUsers,
  verificationRecords,
} from '../../db/schema.js'
import { normalizeEmail } from '../../lib/email.js'

export const REGISTRATION_VERIFICATION_PURPOSE = 'registration'

type CreatePendingVerificationInput = {
  attemptsCount?: number
  chatwootContactId: number
  codeHash: string
  email: string
  expiresAt: Date
  fullName: string
  lastSentAt: Date
  maxAttempts?: number
  resendCount?: number
  resendNotBefore: Date
  status?: string
}

type UpdatePendingVerificationInput = {
  attemptsCount?: number
  chatwootContactId: number
  codeHash: string
  expiresAt: Date
  fullName: string
  lastSentAt: Date
  recordId: number
  resendCount: number
  resendNotBefore: Date
  status?: string
  updatedAt: Date
}

export type PendingVerificationRecord = {
  attemptsCount: number
  chatwootContactId: number | null
  codeHash: string
  continuationTokenExpiresAt: Date | null
  continuationTokenHash: string | null
  email: string
  expiresAt: Date
  fullName: string | null
  id: number
  lastSentAt: Date
  maxAttempts: number
  resendCount: number
  resendNotBefore: Date
  status: string
  verifiedAt: Date | null
}

function basePendingRecordSelection() {
  return {
    attemptsCount: verificationRecords.attemptsCount,
    chatwootContactId: verificationRecords.chatwootContactId,
    codeHash: verificationRecords.codeHash,
    continuationTokenExpiresAt: verificationRecords.continuationTokenExpiresAt,
    continuationTokenHash: verificationRecords.continuationTokenHash,
    email: verificationRecords.email,
    expiresAt: verificationRecords.expiresAt,
    fullName: verificationRecords.fullName,
    id: verificationRecords.id,
    lastSentAt: verificationRecords.lastSentAt,
    maxAttempts: verificationRecords.maxAttempts,
    resendCount: verificationRecords.resendCount,
    resendNotBefore: verificationRecords.resendNotBefore,
    status: verificationRecords.status,
    verifiedAt: verificationRecords.verifiedAt,
  }
}

function createScopedLockKey(email: string) {
  const digest = createHash('sha256')
    .update(`${REGISTRATION_VERIFICATION_PURPOSE}:${normalizeEmail(email)}`)
    .digest()

  return [digest.readInt32BE(0), digest.readInt32BE(4)] as const
}

export function createRegistrationRepository(db: AppDatabase) {
  return {
    async transactionWithScopedLock<T>(
      email: string,
      handler: (executor: AppDatabase) => Promise<T>,
    ) {
      const normalizedEmail = normalizeEmail(email)
      const [lockKeyPartOne, lockKeyPartTwo] =
        createScopedLockKey(normalizedEmail)

      return db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${lockKeyPartOne}, ${lockKeyPartTwo})`,
        )

        return handler(tx)
      })
    },

    async createPendingVerification(
      input: CreatePendingVerificationInput,
      executor: AppDatabase = db,
    ) {
      const normalizedEmail = normalizeEmail(input.email)

      const [createdRecord] = await executor
        .insert(verificationRecords)
        .values({
          attemptsCount: input.attemptsCount ?? 0,
          chatwootContactId: input.chatwootContactId,
          codeHash: input.codeHash,
          email: normalizedEmail,
          expiresAt: input.expiresAt,
          fullName: input.fullName.trim(),
          lastSentAt: input.lastSentAt,
          maxAttempts: input.maxAttempts ?? 5,
          purpose: REGISTRATION_VERIFICATION_PURPOSE,
          resendCount: input.resendCount ?? 0,
          resendNotBefore: input.resendNotBefore,
          status: input.status ?? 'pending',
        })
        .returning(basePendingRecordSelection())

      if (!createdRecord) {
        throw new Error('Failed to create pending verification record.')
      }

      return createdRecord
    },

    async deleteVerificationRecord(
      recordId: number,
      executor: AppDatabase = db,
    ) {
      await executor
        .delete(verificationRecords)
        .where(eq(verificationRecords.id, recordId))
    },

    async expireVerificationRecord(
      recordId: number,
      at: Date,
      executor: AppDatabase = db,
    ) {
      await executor
        .update(verificationRecords)
        .set({
          status: 'expired',
          updatedAt: at,
        })
        .where(eq(verificationRecords.id, recordId))
    },

    async findLatestPendingVerificationByEmail(
      email: string,
      executor: AppDatabase = db,
    ) {
      const normalizedEmail = normalizeEmail(email)

      const [record] = await executor
        .select(basePendingRecordSelection())
        .from(verificationRecords)
        .where(
          and(
            sql`lower(${verificationRecords.email}) = ${normalizedEmail}`,
            eq(verificationRecords.purpose, REGISTRATION_VERIFICATION_PURPOSE),
            eq(verificationRecords.status, 'pending'),
          ),
        )
        .orderBy(
          desc(verificationRecords.createdAt),
          desc(verificationRecords.id),
        )
        .limit(1)
        .for('update')

      return record ?? null
    },

    async findLatestActiveVerificationByEmail(
      email: string,
      executor: AppDatabase = db,
    ) {
      const normalizedEmail = normalizeEmail(email)

      const [record] = await executor
        .select(basePendingRecordSelection())
        .from(verificationRecords)
        .where(
          and(
            sql`lower(${verificationRecords.email}) = ${normalizedEmail}`,
            eq(verificationRecords.purpose, REGISTRATION_VERIFICATION_PURPOSE),
            inArray(verificationRecords.status, ['pending', 'sending']),
          ),
        )
        .orderBy(
          desc(verificationRecords.createdAt),
          desc(verificationRecords.id),
        )
        .limit(1)
        .for('update')

      return record ?? null
    },

    async findLatestVerifiedVerificationByEmail(
      email: string,
      executor: AppDatabase = db,
    ) {
      const normalizedEmail = normalizeEmail(email)

      const [record] = await executor
        .select(basePendingRecordSelection())
        .from(verificationRecords)
        .where(
          and(
            sql`lower(${verificationRecords.email}) = ${normalizedEmail}`,
            eq(verificationRecords.purpose, REGISTRATION_VERIFICATION_PURPOSE),
            eq(verificationRecords.status, 'verified'),
          ),
        )
        .orderBy(
          desc(verificationRecords.createdAt),
          desc(verificationRecords.id),
        )
        .limit(1)
        .for('update')

      return record ?? null
    },

    async findLatestVerificationByEmail(
      email: string,
      executor: AppDatabase = db,
    ) {
      const normalizedEmail = normalizeEmail(email)

      const [record] = await executor
        .select(basePendingRecordSelection())
        .from(verificationRecords)
        .where(
          and(
            sql`lower(${verificationRecords.email}) = ${normalizedEmail}`,
            eq(verificationRecords.purpose, REGISTRATION_VERIFICATION_PURPOSE),
          ),
        )
        .orderBy(
          desc(verificationRecords.createdAt),
          desc(verificationRecords.id),
        )
        .limit(1)

      return record ?? null
    },

    async findPortalUserByEmail(email: string, executor: AppDatabase = db) {
      const normalizedEmail = normalizeEmail(email)

      const [user] = await executor
        .select({
          email: portalUsers.email,
          fullName: portalUsers.fullName,
          id: portalUsers.id,
          isActive: portalUsers.isActive,
          passwordHash: portalUsers.passwordHash,
        })
        .from(portalUsers)
        .where(sql`lower(${portalUsers.email}) = ${normalizedEmail}`)
        .limit(1)

      return user ?? null
    },

    async recordInvalidAttempt(
      {
        attemptsCount,
        recordId,
        status = 'pending',
        updatedAt,
      }: {
        attemptsCount: number
        recordId: number
        status?: string
        updatedAt: Date
      },
      executor: AppDatabase = db,
    ) {
      const [updatedRecord] = await executor
        .update(verificationRecords)
        .set({
          attemptsCount,
          status,
          updatedAt,
        })
        .where(eq(verificationRecords.id, recordId))
        .returning(basePendingRecordSelection())

      if (!updatedRecord) {
        throw new Error('Failed to update verification attempts.')
      }

      return updatedRecord
    },

    async replacePendingVerification(
      input: UpdatePendingVerificationInput,
      executor: AppDatabase = db,
    ) {
      const [updatedRecord] = await executor
        .update(verificationRecords)
        .set({
          attemptsCount: input.attemptsCount ?? 0,
          chatwootContactId: input.chatwootContactId,
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
          fullName: input.fullName.trim(),
          lastSentAt: input.lastSentAt,
          resendCount: input.resendCount,
          resendNotBefore: input.resendNotBefore,
          status: input.status ?? 'pending',
          updatedAt: input.updatedAt,
        })
        .where(eq(verificationRecords.id, input.recordId))
        .returning(basePendingRecordSelection())

      if (!updatedRecord) {
        throw new Error('Failed to update pending verification record.')
      }

      return updatedRecord
    },

    async createPortalUser(
      {
        email,
        fullName,
        passwordHash,
      }: {
        email: string
        fullName?: string | null
        passwordHash: string
      },
      executor: AppDatabase = db,
    ) {
      const normalizedEmail = normalizeEmail(email)
      const normalizedFullName = fullName?.trim() ? fullName.trim() : null

      const [createdUser] = await executor
        .insert(portalUsers)
        .values({
          email: normalizedEmail,
          fullName: normalizedFullName,
          passwordHash,
        })
        .returning({
          email: portalUsers.email,
          fullName: portalUsers.fullName,
          id: portalUsers.id,
          isActive: portalUsers.isActive,
        })

      return createdUser ?? null
    },

    async createPortalUserContactLink(
      {
        chatwootContactId,
        userId,
      }: {
        chatwootContactId: number
        userId: number
      },
      executor: AppDatabase = db,
    ) {
      const [createdLink] = await executor
        .insert(portalUserContactLinks)
        .values({
          chatwootContactId,
          userId,
        })
        .returning({
          chatwootContactId: portalUserContactLinks.chatwootContactId,
          id: portalUserContactLinks.id,
          userId: portalUserContactLinks.userId,
        })

      if (!createdLink) {
        throw new Error('Failed to create portal user contact link.')
      }

      return createdLink
    },

    async markVerificationDeliverySucceeded(
      recordId: number,
      updatedAt: Date,
      executor: AppDatabase = db,
    ) {
      const [updatedRecord] = await executor
        .update(verificationRecords)
        .set({
          status: 'pending',
          updatedAt,
        })
        .where(
          and(
            eq(verificationRecords.id, recordId),
            eq(verificationRecords.status, 'sending'),
          ),
        )
        .returning(basePendingRecordSelection())

      return updatedRecord ?? null
    },

    async invalidateVerifiedVerification(
      recordId: number,
      updatedAt: Date,
      executor: AppDatabase = db,
    ) {
      const [updatedRecord] = await executor
        .update(verificationRecords)
        .set({
          continuationTokenExpiresAt: null,
          continuationTokenHash: null,
          status: 'invalidated',
          updatedAt,
        })
        .where(
          and(
            eq(verificationRecords.id, recordId),
            eq(verificationRecords.status, 'verified'),
          ),
        )
        .returning(basePendingRecordSelection())

      return updatedRecord ?? null
    },

    async consumeVerifiedVerification(
      recordId: number,
      updatedAt: Date,
      executor: AppDatabase = db,
    ) {
      const [updatedRecord] = await executor
        .update(verificationRecords)
        .set({
          continuationTokenExpiresAt: null,
          continuationTokenHash: null,
          status: 'consumed',
          updatedAt,
        })
        .where(
          and(
            eq(verificationRecords.id, recordId),
            eq(verificationRecords.status, 'verified'),
          ),
        )
        .returning(basePendingRecordSelection())

      return updatedRecord ?? null
    },

    async verifyPendingVerification(
      {
        continuationTokenExpiresAt,
        continuationTokenHash,
        recordId,
        updatedAt,
        verifiedAt,
      }: {
        continuationTokenExpiresAt: Date
        continuationTokenHash: string
        recordId: number
        updatedAt: Date
        verifiedAt: Date
      },
      executor: AppDatabase = db,
    ) {
      const [updatedRecord] = await executor
        .update(verificationRecords)
        .set({
          continuationTokenExpiresAt,
          continuationTokenHash,
          status: 'verified',
          updatedAt,
          verifiedAt,
        })
        .where(
          and(
            eq(verificationRecords.id, recordId),
            eq(verificationRecords.status, 'pending'),
          ),
        )
        .returning(basePendingRecordSelection())

      return updatedRecord ?? null
    },
  }
}

export type RegistrationRepository = ReturnType<
  typeof createRegistrationRepository
>
