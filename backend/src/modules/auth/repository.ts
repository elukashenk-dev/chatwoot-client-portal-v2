import { and, eq, gt, lte, sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import { portalSessions, portalUsers } from '../../db/schema.js'
import { normalizeEmail } from '../../lib/email.js'

type CreateSessionInput = {
  expiresAt: Date
  lastSeenAt: Date
  tenantId: number
  tokenHash: string
  userId: number
}

type TenantEmailScope = {
  email: string
  tenantId: number
}

type TenantTokenScope = {
  tenantId: number
  tokenHash: string
}

type SessionUserRecord = {
  expiresAt: Date
  sessionId: number
  user: {
    email: string
    fullName: string | null
    id: number
    passwordConfigured: boolean
  }
}

type RefreshSessionInput = {
  at: Date
  expiresAt: Date
  observedExpiresAt: Date
  renewBefore: Date
  sessionId: number
  tenantId: number
}

export function createAuthRepository(db: AppDatabase) {
  return {
    async createSession(input: CreateSessionInput, executor: AppDatabase = db) {
      await executor.insert(portalSessions).values(input)
    },

    async deleteSessionByTokenHash({ tenantId, tokenHash }: TenantTokenScope) {
      await db
        .delete(portalSessions)
        .where(
          and(
            eq(portalSessions.tenantId, tenantId),
            eq(portalSessions.tokenHash, tokenHash),
          ),
        )
    },

    async findUserByEmail({ email, tenantId }: TenantEmailScope) {
      const normalizedEmail = normalizeEmail(email)

      const [user] = await db
        .select({
          email: portalUsers.email,
          fullName: portalUsers.fullName,
          id: portalUsers.id,
          isActive: portalUsers.isActive,
          passwordConfigured: sql<boolean>`${portalUsers.passwordHash} is not null`,
          passwordHash: portalUsers.passwordHash,
        })
        .from(portalUsers)
        .where(
          and(
            eq(portalUsers.tenantId, tenantId),
            sql`lower(${portalUsers.email}) = ${normalizedEmail}`,
          ),
        )
        .limit(1)

      return user ?? null
    },

    async findActiveUserById({
      executor = db,
      tenantId,
      userId,
    }: {
      executor?: AppDatabase
      tenantId: number
      userId: number
    }) {
      const [user] = await executor
        .select({
          email: portalUsers.email,
          fullName: portalUsers.fullName,
          id: portalUsers.id,
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

    async findUserBySessionTokenHash({
      now,
      tenantId,
      tokenHash,
    }: TenantTokenScope & { now: Date }): Promise<SessionUserRecord | null> {
      const [session] = await db
        .select({
          email: portalUsers.email,
          expiresAt: portalSessions.expiresAt,
          fullName: portalUsers.fullName,
          id: portalUsers.id,
          passwordConfigured: sql<boolean>`${portalUsers.passwordHash} is not null`,
          sessionId: portalSessions.id,
        })
        .from(portalSessions)
        .innerJoin(portalUsers, eq(portalSessions.userId, portalUsers.id))
        .where(
          and(
            eq(portalSessions.tenantId, tenantId),
            eq(portalSessions.tokenHash, tokenHash),
            gt(portalSessions.expiresAt, now),
            eq(portalUsers.tenantId, tenantId),
            eq(portalUsers.isActive, true),
          ),
        )
        .limit(1)

      if (!session) {
        return null
      }

      return {
        expiresAt: session.expiresAt,
        sessionId: session.sessionId,
        user: {
          email: session.email,
          fullName: session.fullName,
          id: session.id,
          passwordConfigured: session.passwordConfigured,
        },
      }
    },

    async recordSuccessfulLogin({
      at,
      executor = db,
      tenantId,
      userId,
    }: {
      at: Date
      executor?: AppDatabase
      tenantId: number
      userId: number
    }) {
      await executor
        .update(portalUsers)
        .set({
          lastLoginAt: at,
          updatedAt: at,
        })
        .where(
          and(eq(portalUsers.id, userId), eq(portalUsers.tenantId, tenantId)),
        )
    },

    async tryRefreshSession({
      at,
      expiresAt,
      observedExpiresAt,
      renewBefore,
      sessionId,
      tenantId,
    }: RefreshSessionInput): Promise<{ expiresAt: Date } | null> {
      const [updated] = await db
        .update(portalSessions)
        .set({
          expiresAt,
          lastSeenAt: at,
        })
        .where(
          and(
            eq(portalSessions.id, sessionId),
            eq(portalSessions.tenantId, tenantId),
            eq(portalSessions.expiresAt, observedExpiresAt),
            gt(portalSessions.expiresAt, at),
            lte(portalSessions.expiresAt, renewBefore),
          ),
        )
        .returning({
          expiresAt: portalSessions.expiresAt,
        })

      return updated ?? null
    },
  }
}
