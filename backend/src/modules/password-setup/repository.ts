import { createHash } from 'node:crypto'

import { and, desc, eq, sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import {
  portalSessions,
  portalUsers,
  verificationRecords,
} from '../../db/schema.js'
import { normalizeEmail } from '../../lib/email.js'

export const PASSWORD_SETUP_PURPOSE = 'password_setup'

type PasswordSetupUserScope = {
  email: string
  userId: number
}

type CreatePendingSetupInput = PasswordSetupUserScope & {
  codeHash: string
  expiresAt: Date
  lastSentAt: Date
  maxAttempts?: number
  resendCount?: number
  resendNotBefore: Date
}

type ReplacePendingSetupInput = {
  attemptsCount?: number
  codeHash: string
  expiresAt: Date
  lastSentAt: Date
  recordId: number
  resendCount: number
  resendNotBefore: Date
  updatedAt: Date
}

export type PasswordSetupRecord = {
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

export type PasswordSetupPortalUser = {
  email: string
  fullName: string | null
  id: number
  isActive: boolean
  passwordHash: string | null
}

function baseSetupRecordSelection() {
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

function createScopedLockKey(tenantId: number, userId: number, email: string) {
  const digest = createHash('sha256')
    .update(
      `${PASSWORD_SETUP_PURPOSE}:${tenantId}:${userId}:${normalizeEmail(email)}`,
    )
    .digest()

  return [digest.readInt32BE(0), digest.readInt32BE(4)] as const
}

export function createPasswordSetupRepository(
  db: AppDatabase,
  { tenantId }: { tenantId: number },
) {
  async function findLatestSetupByStatus({
    email,
    executor = db,
    lock = false,
    status,
    userId,
  }: PasswordSetupUserScope & {
    executor?: AppDatabase
    lock?: boolean
    status?: string
  }) {
    const normalizedEmail = normalizeEmail(email)
    const query = executor
      .select(baseSetupRecordSelection())
      .from(verificationRecords)
      .where(
        and(
          eq(verificationRecords.tenantId, tenantId),
          eq(verificationRecords.portalUserId, userId),
          sql`lower(${verificationRecords.email}) = ${normalizedEmail}`,
          eq(verificationRecords.purpose, PASSWORD_SETUP_PURPOSE),
          ...(status ? [eq(verificationRecords.status, status)] : []),
        ),
      )
      .orderBy(desc(verificationRecords.createdAt), desc(verificationRecords.id))
      .limit(1)

    const [record] = lock ? await query.for('update') : await query

    return record ?? null
  }

  return {
    async transactionWithScopedLock<T>(
      { email, userId }: PasswordSetupUserScope,
      handler: (executor: AppDatabase) => Promise<T>,
    ) {
      const normalizedEmail = normalizeEmail(email)
      const [lockKeyPartOne, lockKeyPartTwo] = createScopedLockKey(
        tenantId,
        userId,
        normalizedEmail,
      )

      return db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${lockKeyPartOne}, ${lockKeyPartTwo})`,
        )

        return handler(tx)
      })
    },

    async createPendingSetup(
      input: CreatePendingSetupInput,
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
          portalUserId: input.userId,
          purpose: PASSWORD_SETUP_PURPOSE,
          resendCount: input.resendCount ?? 0,
          resendNotBefore: input.resendNotBefore,
          status: 'pending',
          tenantId,
        })
        .returning(baseSetupRecordSelection())

      if (!createdRecord) {
        throw new Error('Failed to create pending password setup record.')
      }

      return createdRecord
    },

    async deleteSetupRecord(recordId: number, executor: AppDatabase = db) {
      await executor
        .delete(verificationRecords)
        .where(
          and(
            eq(verificationRecords.id, recordId),
            eq(verificationRecords.tenantId, tenantId),
            eq(verificationRecords.purpose, PASSWORD_SETUP_PURPOSE),
          ),
        )
    },

    async expireSetupRecord(
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
        .where(
          and(
            eq(verificationRecords.id, recordId),
            eq(verificationRecords.tenantId, tenantId),
            eq(verificationRecords.purpose, PASSWORD_SETUP_PURPOSE),
          ),
        )
    },

    async findLatestPendingSetupByUser(
      scope: PasswordSetupUserScope,
      executor: AppDatabase = db,
    ) {
      return findLatestSetupByStatus({
        ...scope,
        executor,
        lock: true,
        status: 'pending',
      })
    },

    async findLatestSetupByUser(
      scope: PasswordSetupUserScope,
      executor: AppDatabase = db,
    ) {
      return findLatestSetupByStatus({ ...scope, executor })
    },

    async findLatestVerifiedSetupByUser(
      scope: PasswordSetupUserScope,
      executor: AppDatabase = db,
    ) {
      return findLatestSetupByStatus({
        ...scope,
        executor,
        lock: true,
        status: 'verified',
      })
    },

    async findPortalUserForSetup(
      {
        email,
        executor = db,
        lock = false,
        userId,
      }: PasswordSetupUserScope & {
        executor?: AppDatabase
        lock?: boolean
      },
    ): Promise<PasswordSetupPortalUser | null> {
      const normalizedEmail = normalizeEmail(email)
      const query = executor
        .select({
          email: portalUsers.email,
          fullName: portalUsers.fullName,
          id: portalUsers.id,
          isActive: portalUsers.isActive,
          passwordHash: portalUsers.passwordHash,
        })
        .from(portalUsers)
        .where(
          and(
            eq(portalUsers.id, userId),
            eq(portalUsers.tenantId, tenantId),
            sql`lower(${portalUsers.email}) = ${normalizedEmail}`,
          ),
        )
        .limit(1)

      const [user] = lock ? await query.for('update') : await query

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
        .where(
          and(
            eq(verificationRecords.id, recordId),
            eq(verificationRecords.tenantId, tenantId),
            eq(verificationRecords.purpose, PASSWORD_SETUP_PURPOSE),
          ),
        )
        .returning(baseSetupRecordSelection())

      if (!updatedRecord) {
        throw new Error('Failed to update password setup attempts.')
      }

      return updatedRecord
    },

    async replacePendingSetup(
      input: ReplacePendingSetupInput,
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
          resendCount: input.resendCount,
          resendNotBefore: input.resendNotBefore,
          status: 'pending',
          updatedAt: input.updatedAt,
          verifiedAt: null,
        })
        .where(
          and(
            eq(verificationRecords.id, input.recordId),
            eq(verificationRecords.tenantId, tenantId),
            eq(verificationRecords.purpose, PASSWORD_SETUP_PURPOSE),
          ),
        )
        .returning(baseSetupRecordSelection())

      if (!updatedRecord) {
        throw new Error('Failed to update pending password setup record.')
      }

      return updatedRecord
    },

    async verifyPendingSetup(
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
            eq(verificationRecords.tenantId, tenantId),
            eq(verificationRecords.purpose, PASSWORD_SETUP_PURPOSE),
            eq(verificationRecords.status, 'pending'),
          ),
        )
        .returning(baseSetupRecordSelection())

      return updatedRecord ?? null
    },

    async invalidateVerifiedSetup(
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
            eq(verificationRecords.tenantId, tenantId),
            eq(verificationRecords.purpose, PASSWORD_SETUP_PURPOSE),
            eq(verificationRecords.status, 'verified'),
          ),
        )
        .returning(baseSetupRecordSelection())

      return updatedRecord ?? null
    },

    async consumeVerifiedSetup(
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
            eq(verificationRecords.tenantId, tenantId),
            eq(verificationRecords.purpose, PASSWORD_SETUP_PURPOSE),
            eq(verificationRecords.status, 'verified'),
          ),
        )
        .returning(baseSetupRecordSelection())

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
        .where(
          and(
            eq(portalUsers.id, userId),
            eq(portalUsers.tenantId, tenantId),
            sql`${portalUsers.passwordHash} is null`,
          ),
        )
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
        .where(
          and(
            eq(portalSessions.userId, userId),
            eq(portalSessions.tenantId, tenantId),
          ),
        )
    },
  }
}

export type PasswordSetupRepository = ReturnType<
  typeof createPasswordSetupRepository
>
