import { createHash } from 'node:crypto'

import { and, desc, eq, sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import {
  portalSessions,
  portalUsers,
  verificationRecords,
} from '../../db/schema.js'
import { normalizeEmail } from '../../lib/email.js'

export const PASSWORD_RESET_PURPOSE = 'password_reset'

type CreatePendingResetInput = {
  codeHash: string
  email: string
  expiresAt: Date
  lastSentAt: Date
  maxAttempts?: number
  portalUserId: number | null
  resendCount?: number
  resendNotBefore: Date
}

type ReplacePendingResetInput = {
  attemptsCount?: number
  codeHash: string
  expiresAt: Date
  lastSentAt: Date
  portalUserId: number | null
  recordId: number
  resendCount: number
  resendNotBefore: Date
  updatedAt: Date
}

export type PasswordResetRecord = {
  attemptsCount: number
  codeHash: string
  continuationTokenExpiresAt: Date | null
  continuationTokenHash: string | null
  email: string
  expiresAt: Date
  id: number
  lastSentAt: Date
  maxAttempts: number
  portalUserId: number | null
  resendCount: number
  resendNotBefore: Date
  status: string
  verifiedAt: Date | null
}

function baseResetRecordSelection() {
  return {
    attemptsCount: verificationRecords.attemptsCount,
    codeHash: verificationRecords.codeHash,
    continuationTokenExpiresAt: verificationRecords.continuationTokenExpiresAt,
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
  }
}

function createScopedLockKey(email: string) {
  const digest = createHash('sha256')
    .update(`${PASSWORD_RESET_PURPOSE}:${normalizeEmail(email)}`)
    .digest()

  return [digest.readInt32BE(0), digest.readInt32BE(4)] as const
}

export function createPasswordResetRepository(db: AppDatabase) {
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

    async createPendingReset(
      input: CreatePendingResetInput,
      executor: AppDatabase = db,
    ) {
      const normalizedEmail = normalizeEmail(input.email)

      const [createdRecord] = await executor
        .insert(verificationRecords)
        .values({
          attemptsCount: 0,
          codeHash: input.codeHash,
          email: normalizedEmail,
          expiresAt: input.expiresAt,
          lastSentAt: input.lastSentAt,
          maxAttempts: input.maxAttempts ?? 5,
          portalUserId: input.portalUserId,
          purpose: PASSWORD_RESET_PURPOSE,
          resendCount: input.resendCount ?? 0,
          resendNotBefore: input.resendNotBefore,
          status: 'pending',
        })
        .returning(baseResetRecordSelection())

      if (!createdRecord) {
        throw new Error('Failed to create pending password reset record.')
      }

      return createdRecord
    },

    async deleteResetRecord(recordId: number, executor: AppDatabase = db) {
      await executor
        .delete(verificationRecords)
        .where(eq(verificationRecords.id, recordId))
    },

    async expireResetRecord(
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

    async findLatestPendingResetByEmail(
      email: string,
      executor: AppDatabase = db,
    ) {
      const normalizedEmail = normalizeEmail(email)

      const [record] = await executor
        .select(baseResetRecordSelection())
        .from(verificationRecords)
        .where(
          and(
            sql`lower(${verificationRecords.email}) = ${normalizedEmail}`,
            eq(verificationRecords.purpose, PASSWORD_RESET_PURPOSE),
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

    async findLatestResetByEmail(email: string, executor: AppDatabase = db) {
      const normalizedEmail = normalizeEmail(email)

      const [record] = await executor
        .select(baseResetRecordSelection())
        .from(verificationRecords)
        .where(
          and(
            sql`lower(${verificationRecords.email}) = ${normalizedEmail}`,
            eq(verificationRecords.purpose, PASSWORD_RESET_PURPOSE),
          ),
        )
        .orderBy(
          desc(verificationRecords.createdAt),
          desc(verificationRecords.id),
        )
        .limit(1)

      return record ?? null
    },

    async findLatestVerifiedResetByEmail(
      email: string,
      executor: AppDatabase = db,
    ) {
      const normalizedEmail = normalizeEmail(email)

      const [record] = await executor
        .select(baseResetRecordSelection())
        .from(verificationRecords)
        .where(
          and(
            sql`lower(${verificationRecords.email}) = ${normalizedEmail}`,
            eq(verificationRecords.purpose, PASSWORD_RESET_PURPOSE),
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

    async recordInvalidAttempt({
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
    executor: AppDatabase = db) {
      const [updatedRecord] = await executor
        .update(verificationRecords)
        .set({
          attemptsCount,
          status,
          updatedAt,
        })
        .where(eq(verificationRecords.id, recordId))
        .returning(baseResetRecordSelection())

      if (!updatedRecord) {
        throw new Error('Failed to update password reset attempts.')
      }

      return updatedRecord
    },

    async replacePendingReset(
      input: ReplacePendingResetInput,
      executor: AppDatabase = db,
    ) {
      const [updatedRecord] = await executor
        .update(verificationRecords)
        .set({
          attemptsCount: input.attemptsCount ?? 0,
          codeHash: input.codeHash,
          continuationTokenExpiresAt: null,
          continuationTokenHash: null,
          expiresAt: input.expiresAt,
          lastSentAt: input.lastSentAt,
          portalUserId: input.portalUserId,
          resendCount: input.resendCount,
          resendNotBefore: input.resendNotBefore,
          status: 'pending',
          updatedAt: input.updatedAt,
          verifiedAt: null,
        })
        .where(eq(verificationRecords.id, input.recordId))
        .returning(baseResetRecordSelection())

      if (!updatedRecord) {
        throw new Error('Failed to update pending password reset record.')
      }

      return updatedRecord
    },

    async verifyPendingReset({
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
    executor: AppDatabase = db) {
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
        .returning(baseResetRecordSelection())

      return updatedRecord ?? null
    },

    async invalidateVerifiedReset(
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
        .returning(baseResetRecordSelection())

      return updatedRecord ?? null
    },

    async consumeVerifiedReset(
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
        .returning(baseResetRecordSelection())

      return updatedRecord ?? null
    },

    async updatePortalUserPassword(
      {
        passwordHash,
        updatedAt,
        userId,
      }: {
        passwordHash: string
        updatedAt: Date
        userId: number
      },
      executor: AppDatabase = db,
    ) {
      const [updatedUser] = await executor
        .update(portalUsers)
        .set({
          passwordHash,
          updatedAt,
        })
        .where(eq(portalUsers.id, userId))
        .returning({
          email: portalUsers.email,
          fullName: portalUsers.fullName,
          id: portalUsers.id,
          isActive: portalUsers.isActive,
        })

      return updatedUser ?? null
    },

    async deleteSessionsForUser(userId: number, executor: AppDatabase = db) {
      await executor
        .delete(portalSessions)
        .where(eq(portalSessions.userId, userId))
    },
  }
}

export type PasswordResetRepository = ReturnType<
  typeof createPasswordResetRepository
>
