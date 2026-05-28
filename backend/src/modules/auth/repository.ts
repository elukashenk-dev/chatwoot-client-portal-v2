import { and, eq, gt, sql } from 'drizzle-orm'

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
  }
}

export function createAuthRepository(db: AppDatabase) {
  return {
    async createSession(input: CreateSessionInput) {
      await db.insert(portalSessions).values(input)
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
        .select()
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
        },
      }
    },

    async recordSuccessfulLogin({
      at,
      tenantId,
      userId,
    }: {
      at: Date
      tenantId: number
      userId: number
    }) {
      await db
        .update(portalUsers)
        .set({
          lastLoginAt: at,
          updatedAt: at,
        })
        .where(
          and(eq(portalUsers.id, userId), eq(portalUsers.tenantId, tenantId)),
        )
    },

    async touchSession({
      at,
      sessionId,
      tenantId,
    }: {
      at: Date
      sessionId: number
      tenantId: number
    }) {
      await db
        .update(portalSessions)
        .set({
          lastSeenAt: at,
        })
        .where(
          and(
            eq(portalSessions.id, sessionId),
            eq(portalSessions.tenantId, tenantId),
          ),
        )
    },
  }
}
