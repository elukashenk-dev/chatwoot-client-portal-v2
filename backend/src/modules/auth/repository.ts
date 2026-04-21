import { and, eq, gt, sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import { portalSessions, portalUsers } from '../../db/schema.js'
import { normalizeEmail } from '../../lib/email.js'

type CreateSessionInput = {
  expiresAt: Date
  lastSeenAt: Date
  tokenHash: string
  userId: number
}

type SessionUserRecord = {
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

    async deleteSessionByTokenHash(tokenHash: string) {
      await db.delete(portalSessions).where(eq(portalSessions.tokenHash, tokenHash))
    },

    async findUserByEmail(email: string) {
      const normalizedEmail = normalizeEmail(email)

      const [user] = await db
        .select()
        .from(portalUsers)
        .where(sql`lower(${portalUsers.email}) = ${normalizedEmail}`)
        .limit(1)

      return user ?? null
    },

    async findUserBySessionTokenHash(
      tokenHash: string,
      now: Date,
    ): Promise<SessionUserRecord | null> {
      const [session] = await db
        .select({
          email: portalUsers.email,
          fullName: portalUsers.fullName,
          id: portalUsers.id,
          sessionId: portalSessions.id,
        })
        .from(portalSessions)
        .innerJoin(portalUsers, eq(portalSessions.userId, portalUsers.id))
        .where(
          and(
            eq(portalSessions.tokenHash, tokenHash),
            gt(portalSessions.expiresAt, now),
            eq(portalUsers.isActive, true),
          ),
        )
        .limit(1)

      if (!session) {
        return null
      }

      return {
        sessionId: session.sessionId,
        user: {
          email: session.email,
          fullName: session.fullName,
          id: session.id,
        },
      }
    },

    async recordSuccessfulLogin(userId: number, at: Date) {
      await db
        .update(portalUsers)
        .set({
          lastLoginAt: at,
          updatedAt: at,
        })
        .where(eq(portalUsers.id, userId))
    },

    async touchSession(sessionId: number, at: Date) {
      await db
        .update(portalSessions)
        .set({
          lastSeenAt: at,
        })
        .where(eq(portalSessions.id, sessionId))
    },
  }
}
