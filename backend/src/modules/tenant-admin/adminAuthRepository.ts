import { createHash } from 'node:crypto'

import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import {
  portalAdminAuditEvents,
  portalAdminLoginChallenges,
  portalAdminSessions,
} from '../../db/schema.js'
import { normalizeEmail } from '../../lib/email.js'
import { normalizeAuditMetadata } from './adminAuditMetadata.js'
import {
  baseAuditEventSelection,
  baseChallengeSelection,
} from './adminAuthSelections.js'

const ADMIN_LOGIN_PURPOSE = 'tenant_admin_login'
const ACTIVE_CHALLENGE_STATUSES = ['pending', 'sending']

type CreatePendingChallengeInput = {
  chatwootAgentId: number
  codeHash: string
  email: string
  expiresAt: Date
  lastSentAt: Date
  maxAttempts?: number
  resendCount?: number
  resendNotBefore: Date
  role: string
  status?: string
}

type ReplacePendingChallengeInput = CreatePendingChallengeInput & {
  attemptsCount?: number
  recordId: number
  updatedAt: Date
}

type CreateSessionInput = {
  chatwootAgentId: number
  email: string
  expiresAt: Date
  lastSeenAt: Date
  role: string
  tokenHash: string
}

type TokenHashLookupInput = {
  now: Date
  tokenHash: string
}

type CreateAuditEventInput = {
  action: string
  actorChatwootAgentId?: number | null
  actorEmail?: string | null
  metadata?: Record<string, unknown>
  outcome: string
  requestIp?: string | null
  subjectEmail?: string | null
  userAgent?: string | null
}

function normalizeNonEmptyString(value: string, fieldName: string) {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    throw new Error(`${fieldName} is required.`)
  }

  return normalizedValue
}

function normalizeNullableString(value: string | null | undefined) {
  const normalizedValue = value?.trim()

  return normalizedValue || null
}

function normalizeNullableEmail(value: string | null | undefined) {
  const normalizedValue = normalizeNullableString(value)

  return normalizedValue ? normalizeEmail(normalizedValue) : null
}

function createScopedLockKey(tenantId: number, email: string) {
  const digest = createHash('sha256')
    .update(`${ADMIN_LOGIN_PURPOSE}:${tenantId}:${normalizeEmail(email)}`)
    .digest()

  return [digest.readInt32BE(0), digest.readInt32BE(4)] as const
}

async function findLatestChallengeByEmail({
  email,
  executor,
  lock = false,
  status,
  statuses,
  tenantId,
}: {
  email: string
  executor: AppDatabase
  lock?: boolean
  status?: string
  statuses?: string[]
  tenantId: number
}) {
  const normalizedEmail = normalizeEmail(email)
  const statusFilter = status
    ? eq(portalAdminLoginChallenges.status, status)
    : statuses
      ? inArray(portalAdminLoginChallenges.status, statuses)
      : undefined
  const query = executor
    .select(baseChallengeSelection())
    .from(portalAdminLoginChallenges)
    .where(
      and(
        eq(portalAdminLoginChallenges.tenantId, tenantId),
        sql`lower(${portalAdminLoginChallenges.email}) = ${normalizedEmail}`,
        statusFilter,
      ),
    )
    .orderBy(
      desc(portalAdminLoginChallenges.createdAt),
      desc(portalAdminLoginChallenges.id),
    )
    .limit(1)

  const [challenge] = lock ? await query.for('update') : await query

  return challenge ?? null
}

export function createTenantAdminAuthRepository(
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

    async createPendingChallenge(
      input: CreatePendingChallengeInput,
      executor: AppDatabase = db,
    ) {
      const [challenge] = await executor
        .insert(portalAdminLoginChallenges)
        .values({
          attemptsCount: 0,
          chatwootAgentId: input.chatwootAgentId,
          codeHash: normalizeNonEmptyString(input.codeHash, 'codeHash'),
          email: normalizeEmail(input.email),
          expiresAt: input.expiresAt,
          lastSentAt: input.lastSentAt,
          maxAttempts: input.maxAttempts ?? 5,
          resendCount: input.resendCount ?? 0,
          resendNotBefore: input.resendNotBefore,
          role: normalizeNonEmptyString(input.role, 'role'),
          status: input.status ?? 'pending',
          tenantId,
        })
        .returning(baseChallengeSelection())

      if (!challenge) {
        throw new Error('Failed to create tenant admin login challenge.')
      }

      return challenge
    },

    async replacePendingChallenge(
      input: ReplacePendingChallengeInput,
      executor: AppDatabase = db,
    ) {
      const [challenge] = await executor
        .update(portalAdminLoginChallenges)
        .set({
          attemptsCount: input.attemptsCount ?? 0,
          chatwootAgentId: input.chatwootAgentId,
          codeHash: normalizeNonEmptyString(input.codeHash, 'codeHash'),
          email: normalizeEmail(input.email),
          expiresAt: input.expiresAt,
          lastSentAt: input.lastSentAt,
          maxAttempts: input.maxAttempts ?? 5,
          resendCount: input.resendCount ?? 0,
          resendNotBefore: input.resendNotBefore,
          role: normalizeNonEmptyString(input.role, 'role'),
          status: input.status ?? 'pending',
          updatedAt: input.updatedAt,
        })
        .where(
          and(
            eq(portalAdminLoginChallenges.id, input.recordId),
            eq(portalAdminLoginChallenges.tenantId, tenantId),
          ),
        )
        .returning(baseChallengeSelection())

      if (!challenge) {
        throw new Error('Failed to replace tenant admin login challenge.')
      }

      return challenge
    },

    async findLatestActiveChallengeByEmail(
      email: string,
      executor: AppDatabase = db,
    ) {
      return findLatestChallengeByEmail({
        email,
        executor,
        lock: true,
        statuses: ACTIVE_CHALLENGE_STATUSES,
        tenantId,
      })
    },

    async findLatestPendingChallengeByEmail(
      email: string,
      executor: AppDatabase = db,
    ) {
      return findLatestChallengeByEmail({
        email,
        executor,
        lock: true,
        status: 'pending',
        tenantId,
      })
    },

    async incrementChallengeAttempts({
      executor = db,
      recordId,
      updatedAt,
    }: {
      executor?: AppDatabase
      recordId: number
      updatedAt: Date
    }) {
      const [challenge] = await executor
        .update(portalAdminLoginChallenges)
        .set({
          attemptsCount: sql`${portalAdminLoginChallenges.attemptsCount} + 1`,
          updatedAt,
        })
        .where(
          and(
            eq(portalAdminLoginChallenges.id, recordId),
            eq(portalAdminLoginChallenges.tenantId, tenantId),
          ),
        )
        .returning(baseChallengeSelection())

      if (!challenge) {
        throw new Error('Failed to update tenant admin challenge attempts.')
      }

      return challenge
    },

    async markChallengeVerified({
      executor = db,
      recordId,
      verifiedAt,
    }: {
      executor?: AppDatabase
      recordId: number
      verifiedAt: Date
    }) {
      const [challenge] = await executor
        .update(portalAdminLoginChallenges)
        .set({
          status: 'verified',
          updatedAt: verifiedAt,
          verifiedAt,
        })
        .where(
          and(
            eq(portalAdminLoginChallenges.id, recordId),
            eq(portalAdminLoginChallenges.tenantId, tenantId),
          ),
        )
        .returning(baseChallengeSelection())

      if (!challenge) {
        throw new Error('Failed to verify tenant admin login challenge.')
      }

      return challenge
    },

    async expireChallenge(
      recordId: number,
      at: Date,
      executor: AppDatabase = db,
    ) {
      await executor
        .update(portalAdminLoginChallenges)
        .set({
          status: 'expired',
          updatedAt: at,
        })
        .where(
          and(
            eq(portalAdminLoginChallenges.id, recordId),
            eq(portalAdminLoginChallenges.tenantId, tenantId),
          ),
        )
    },

    async deleteChallenge(recordId: number, executor: AppDatabase = db) {
      await executor
        .delete(portalAdminLoginChallenges)
        .where(
          and(
            eq(portalAdminLoginChallenges.id, recordId),
            eq(portalAdminLoginChallenges.tenantId, tenantId),
          ),
        )
    },

    async markChallengeDeliverySucceeded(
      recordId: number,
      updatedAt: Date,
      executor: AppDatabase = db,
    ) {
      const [challenge] = await executor
        .update(portalAdminLoginChallenges)
        .set({
          status: 'pending',
          updatedAt,
        })
        .where(
          and(
            eq(portalAdminLoginChallenges.id, recordId),
            eq(portalAdminLoginChallenges.tenantId, tenantId),
            eq(portalAdminLoginChallenges.status, 'sending'),
          ),
        )
        .returning(baseChallengeSelection())

      return challenge ?? null
    },

    async createSession(input: CreateSessionInput, executor: AppDatabase = db) {
      const [session] = await executor
        .insert(portalAdminSessions)
        .values({
          chatwootAgentId: input.chatwootAgentId,
          email: normalizeEmail(input.email),
          expiresAt: input.expiresAt,
          lastSeenAt: input.lastSeenAt,
          role: normalizeNonEmptyString(input.role, 'role'),
          tenantId,
          tokenHash: normalizeNonEmptyString(input.tokenHash, 'tokenHash'),
        })
        .returning({
          chatwootAgentId: portalAdminSessions.chatwootAgentId,
          email: portalAdminSessions.email,
          expiresAt: portalAdminSessions.expiresAt,
          role: portalAdminSessions.role,
          sessionId: portalAdminSessions.id,
        })

      if (!session) {
        throw new Error('Failed to create tenant admin session.')
      }

      return {
        admin: {
          chatwootAgentId: session.chatwootAgentId,
          email: session.email,
          role: session.role,
        },
        expiresAt: session.expiresAt,
        sessionId: session.sessionId,
      }
    },

    async findSessionByTokenHash({ now, tokenHash }: TokenHashLookupInput) {
      const [session] = await db
        .select({
          admin: {
            chatwootAgentId: portalAdminSessions.chatwootAgentId,
            email: portalAdminSessions.email,
            role: portalAdminSessions.role,
          },
          expiresAt: portalAdminSessions.expiresAt,
          sessionId: portalAdminSessions.id,
        })
        .from(portalAdminSessions)
        .where(
          and(
            eq(portalAdminSessions.tenantId, tenantId),
            eq(portalAdminSessions.tokenHash, tokenHash),
            gt(portalAdminSessions.expiresAt, now),
          ),
        )
        .limit(1)

      return session ?? null
    },

    async touchSession({ at, sessionId }: { at: Date; sessionId: number }) {
      await db
        .update(portalAdminSessions)
        .set({
          lastSeenAt: at,
          updatedAt: at,
        })
        .where(
          and(
            eq(portalAdminSessions.id, sessionId),
            eq(portalAdminSessions.tenantId, tenantId),
          ),
        )
    },

    async deleteSessionByTokenHash(tokenHash: string) {
      await db
        .delete(portalAdminSessions)
        .where(
          and(
            eq(portalAdminSessions.tenantId, tenantId),
            eq(portalAdminSessions.tokenHash, tokenHash),
          ),
        )
    },

    async createAuditEvent(
      input: CreateAuditEventInput,
      executor: AppDatabase = db,
    ) {
      const [event] = await executor
        .insert(portalAdminAuditEvents)
        .values({
          action: normalizeNonEmptyString(input.action, 'action'),
          actorChatwootAgentId: input.actorChatwootAgentId ?? null,
          actorEmail: normalizeNullableEmail(input.actorEmail),
          metadata: normalizeAuditMetadata(input.metadata),
          outcome: normalizeNonEmptyString(input.outcome, 'outcome'),
          requestIp: normalizeNullableString(input.requestIp),
          subjectEmail: normalizeNullableEmail(input.subjectEmail),
          tenantId,
          userAgent: normalizeNullableString(input.userAgent),
        })
        .returning(baseAuditEventSelection())

      if (!event) {
        throw new Error('Failed to create tenant admin audit event.')
      }

      return event
    },
  }
}

export type TenantAdminAuthRepository = ReturnType<
  typeof createTenantAdminAuthRepository
>
