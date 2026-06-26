import { createHash } from 'node:crypto'

import { and, desc, eq, sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import { portalUsers, verificationRecords } from '../../db/schema.js'
import { normalizeEmail } from '../../lib/email.js'

export const PASSWORDLESS_LOGIN_PURPOSE = 'passwordless_login'

type CreatePendingLoginInput = {
  codeHash: string
  email: string
  expiresAt: Date
  lastSentAt: Date
  maxAttempts?: number
  portalUserId: number | null
  resendCount?: number
  resendNotBefore: Date
}

type ReplacePendingLoginInput = {
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

export type PasswordlessLoginRecord = {
  attemptsCount: number
  codeHash: string
  email: string
  expiresAt: Date
  id: number
  lastSentAt: Date
  maxAttempts: number
  portalUserId: number | null
  resendCount: number
  resendNotBefore: Date
  status: string
}

export type PasswordlessLoginPortalUser = {
  email: string
  fullName: string | null
  id: number
  isActive: boolean
  passwordConfigured: boolean
}

function baseLoginRecordSelection() {
  return {
    attemptsCount: verificationRecords.attemptsCount,
    codeHash: verificationRecords.codeHash,
    email: verificationRecords.email,
    expiresAt: verificationRecords.expiresAt,
    id: verificationRecords.id,
    lastSentAt: verificationRecords.lastSentAt,
    maxAttempts: verificationRecords.maxAttempts,
    portalUserId: verificationRecords.portalUserId,
    resendCount: verificationRecords.resendCount,
    resendNotBefore: verificationRecords.resendNotBefore,
    status: verificationRecords.status,
  }
}

function createScopedLockKey(tenantId: number, email: string) {
  const digest = createHash('sha256')
    .update(
      `${PASSWORDLESS_LOGIN_PURPOSE}:${tenantId}:${normalizeEmail(email)}`,
    )
    .digest()

  return [digest.readInt32BE(0), digest.readInt32BE(4)] as const
}

function scopedLoginRecord(tenantId: number, recordId: number) {
  return and(
    eq(verificationRecords.id, recordId),
    eq(verificationRecords.tenantId, tenantId),
    eq(verificationRecords.purpose, PASSWORDLESS_LOGIN_PURPOSE),
  )
}

async function findLatestLoginByStatus({
  email,
  executor,
  lock = false,
  status,
  tenantId,
}: {
  email: string
  executor: AppDatabase
  lock?: boolean
  status?: string
  tenantId: number
}) {
  const normalizedEmail = normalizeEmail(email)
  const query = executor
    .select(baseLoginRecordSelection())
    .from(verificationRecords)
    .where(
      and(
        eq(verificationRecords.tenantId, tenantId),
        eq(verificationRecords.email, normalizedEmail),
        eq(verificationRecords.purpose, PASSWORDLESS_LOGIN_PURPOSE),
        ...(status ? [eq(verificationRecords.status, status)] : []),
      ),
    )
    .orderBy(desc(verificationRecords.createdAt), desc(verificationRecords.id))
    .limit(1)

  const [record] = lock ? await query.for('update') : await query

  return record ?? null
}

export function createPasswordlessLoginRepository(
  db: AppDatabase,
  { tenantId }: { tenantId: number },
) {
  return {
    async transactionWithScopedLock<T>(
      email: string,
      handler: (executor: AppDatabase) => Promise<T>,
    ) {
      const [lockKeyPartOne, lockKeyPartTwo] = createScopedLockKey(
        tenantId,
        email,
      )

      return db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${lockKeyPartOne}, ${lockKeyPartTwo})`,
        )

        return handler(tx)
      })
    },

    async createPendingLogin(
      input: CreatePendingLoginInput,
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
          purpose: PASSWORDLESS_LOGIN_PURPOSE,
          resendCount: input.resendCount ?? 0,
          resendNotBefore: input.resendNotBefore,
          status: 'pending',
          tenantId,
        })
        .returning(baseLoginRecordSelection())

      if (!createdRecord) {
        throw new Error('Failed to create pending passwordless login record.')
      }

      return createdRecord
    },

    async deleteLoginRecord(recordId: number, executor: AppDatabase = db) {
      await executor
        .delete(verificationRecords)
        .where(scopedLoginRecord(tenantId, recordId))
    },

    async expireLoginRecord(
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
        .where(scopedLoginRecord(tenantId, recordId))
    },

    async findActivePortalUserById(
      userId: number,
      executor: AppDatabase = db,
    ): Promise<PasswordlessLoginPortalUser | null> {
      const [user] = await executor
        .select({
          email: portalUsers.email,
          fullName: portalUsers.fullName,
          id: portalUsers.id,
          isActive: portalUsers.isActive,
          passwordConfigured: sql<boolean>`${portalUsers.passwordHash} is not null`,
        })
        .from(portalUsers)
        .where(
          and(
            eq(portalUsers.id, userId),
            eq(portalUsers.tenantId, tenantId),
            eq(portalUsers.isActive, true),
          ),
        )
        .limit(1)

      return user ?? null
    },

    async findLatestLoginByEmail(email: string, executor: AppDatabase = db) {
      return findLatestLoginByStatus({ email, executor, tenantId })
    },

    async findLatestPendingLoginByEmail(
      email: string,
      executor: AppDatabase = db,
    ) {
      return findLatestLoginByStatus({
        email,
        executor,
        lock: true,
        status: 'pending',
        tenantId,
      })
    },

    async findPortalUserByEmail(
      email: string,
      executor: AppDatabase = db,
    ): Promise<PasswordlessLoginPortalUser | null> {
      const normalizedEmail = normalizeEmail(email)

      const [user] = await executor
        .select({
          email: portalUsers.email,
          fullName: portalUsers.fullName,
          id: portalUsers.id,
          isActive: portalUsers.isActive,
          passwordConfigured: sql<boolean>`${portalUsers.passwordHash} is not null`,
        })
        .from(portalUsers)
        .where(
          and(
            eq(portalUsers.tenantId, tenantId),
            eq(portalUsers.email, normalizedEmail),
          ),
        )
        .limit(1)

      return user ?? null
    },

    async replacePendingLogin(
      input: ReplacePendingLoginInput,
      executor: AppDatabase = db,
    ) {
      const [updatedRecord] = await executor
        .update(verificationRecords)
        .set({
          attemptsCount: input.attemptsCount ?? 0,
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
          lastSentAt: input.lastSentAt,
          portalUserId: input.portalUserId,
          resendCount: input.resendCount,
          resendNotBefore: input.resendNotBefore,
          status: 'pending',
          updatedAt: input.updatedAt,
        })
        .where(
          and(
            scopedLoginRecord(tenantId, input.recordId),
            eq(verificationRecords.status, 'pending'),
          ),
        )
        .returning(baseLoginRecordSelection())

      if (!updatedRecord) {
        throw new Error('Failed to replace pending passwordless login record.')
      }

      return updatedRecord
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
        status?: 'invalidated' | 'pending'
        updatedAt: Date
      },
      executor: AppDatabase = db,
    ) {
      await executor
        .update(verificationRecords)
        .set({
          attemptsCount,
          status,
          updatedAt,
        })
        .where(scopedLoginRecord(tenantId, recordId))
    },

    async consumePendingLogin(
      recordId: number,
      at: Date,
      executor: AppDatabase = db,
    ) {
      const [updatedRecord] = await executor
        .update(verificationRecords)
        .set({
          status: 'consumed',
          updatedAt: at,
          verifiedAt: at,
        })
        .where(
          and(
            scopedLoginRecord(tenantId, recordId),
            eq(verificationRecords.status, 'pending'),
          ),
        )
        .returning(baseLoginRecordSelection())

      return updatedRecord ?? null
    },
  }
}

export type PasswordlessLoginRepository = ReturnType<
  typeof createPasswordlessLoginRepository
>
