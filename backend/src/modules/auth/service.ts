import { createHash, randomBytes } from 'node:crypto'

import type { AppEnv } from '../../config/env.js'
import type { AppDatabase } from '../../db/client.js'
import { normalizeEmail } from '../../lib/email.js'
import { ApiError } from '../../lib/errors.js'
import { verifyPassword } from '../../lib/password.js'
import { createAuthRepository } from './repository.js'

export type PublicPortalUser = {
  email: string
  fullName: string | null
  id: number
}

export type PublicPortalSession = {
  expiresAt: Date
  user: PublicPortalUser
}

type CreateAuthServiceOptions = {
  db: AppDatabase
  env: AppEnv
  now?: () => Date
}

function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function createAuthService({
  db,
  env,
  now = () => new Date(),
}: CreateAuthServiceOptions) {
  const repository = createAuthRepository(db)

  async function resolveCurrentSession({
    sessionToken,
    tenantId,
  }: {
    sessionToken: string
    tenantId: number
  }): Promise<PublicPortalSession | null> {
    const resolvedAt = now()
    const session = await repository.findUserBySessionTokenHash({
      now: resolvedAt,
      tenantId,
      tokenHash: hashSessionToken(sessionToken),
    })

    if (!session) {
      return null
    }

    await repository.touchSession({
      at: resolvedAt,
      sessionId: session.sessionId,
      tenantId,
    })

    return {
      expiresAt: session.expiresAt,
      user: {
        ...session.user,
        email: normalizeEmail(session.user.email),
      },
    }
  }

  return {
    async getCurrentSession(input: { sessionToken: string; tenantId: number }) {
      return resolveCurrentSession(input)
    },

    async getCurrentUser({
      sessionToken,
      tenantId,
    }: {
      sessionToken: string
      tenantId: number
    }): Promise<PublicPortalUser | null> {
      return (
        (await resolveCurrentSession({ sessionToken, tenantId }))?.user ?? null
      )
    },

    async login({
      email,
      password,
      tenantId,
    }: {
      email: string
      password: string
      tenantId: number
    }) {
      const user = await repository.findUserByEmail({
        email: normalizeEmail(email),
        tenantId,
      })

      if (!user || !user.isActive) {
        throw new ApiError(
          401,
          'INVALID_CREDENTIALS',
          'Неверный email или пароль.',
        )
      }

      const passwordMatches = await verifyPassword(password, user.passwordHash)

      if (!passwordMatches) {
        throw new ApiError(
          401,
          'INVALID_CREDENTIALS',
          'Неверный email или пароль.',
        )
      }

      const issuedAt = now()
      const expiresAt = new Date(
        issuedAt.getTime() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
      )
      const sessionToken = createSessionToken()

      await repository.createSession({
        expiresAt,
        lastSeenAt: issuedAt,
        tenantId,
        tokenHash: hashSessionToken(sessionToken),
        userId: user.id,
      })
      await repository.recordSuccessfulLogin({
        at: issuedAt,
        tenantId,
        userId: user.id,
      })

      return {
        expiresAt,
        sessionToken,
        user: {
          email: normalizeEmail(user.email),
          fullName: user.fullName,
          id: user.id,
        } satisfies PublicPortalUser,
      }
    },

    async logout({
      sessionToken,
      tenantId,
    }: {
      sessionToken: string
      tenantId: number
    }) {
      await repository.deleteSessionByTokenHash({
        tenantId,
        tokenHash: hashSessionToken(sessionToken),
      })
    },
  }
}

export type AuthService = ReturnType<typeof createAuthService>
