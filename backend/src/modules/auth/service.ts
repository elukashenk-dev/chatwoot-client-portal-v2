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

  return {
    async getCurrentUser(sessionToken: string): Promise<PublicPortalUser | null> {
      const resolvedAt = now()
      const session = await repository.findUserBySessionTokenHash(
        hashSessionToken(sessionToken),
        resolvedAt,
      )

      if (!session) {
        return null
      }

      await repository.touchSession(session.sessionId, resolvedAt)

      return {
        ...session.user,
        email: normalizeEmail(session.user.email),
      }
    },

    async login({
      email,
      password,
    }: {
      email: string
      password: string
    }) {
      const user = await repository.findUserByEmail(normalizeEmail(email))

      if (!user || !user.isActive) {
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль.')
      }

      const passwordMatches = await verifyPassword(password, user.passwordHash)

      if (!passwordMatches) {
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль.')
      }

      const issuedAt = now()
      const expiresAt = new Date(
        issuedAt.getTime() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
      )
      const sessionToken = createSessionToken()

      await repository.createSession({
        expiresAt,
        lastSeenAt: issuedAt,
        tokenHash: hashSessionToken(sessionToken),
        userId: user.id,
      })
      await repository.recordSuccessfulLogin(user.id, issuedAt)

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

    async logout(sessionToken: string) {
      await repository.deleteSessionByTokenHash(hashSessionToken(sessionToken))
    },
  }
}

export type AuthService = ReturnType<typeof createAuthService>
