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

export type CurrentPortalSession = PublicPortalSession & {
  sessionRefreshed: boolean
}

type CreateAuthServiceOptions = {
  db: AppDatabase
  env: AppEnv
  now?: () => Date
}

const CUSTOMER_SESSION_RENEWAL_WINDOW_DAYS = 15
const DAY_MS = 24 * 60 * 60 * 1000

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
    allowRenewal,
    sessionToken,
    tenantId,
  }: {
    allowRenewal: boolean
    sessionToken: string
    tenantId: number
  }): Promise<CurrentPortalSession | null> {
    const resolvedAt = now()
    const tokenHash = hashSessionToken(sessionToken)
    const session = await repository.findUserBySessionTokenHash({
      now: resolvedAt,
      tenantId,
      tokenHash,
    })

    if (!session) {
      return null
    }

    const user = {
      ...session.user,
      email: normalizeEmail(session.user.email),
    }

    const renewBefore = new Date(
      resolvedAt.getTime() + CUSTOMER_SESSION_RENEWAL_WINDOW_DAYS * DAY_MS,
    )
    const shouldRefreshSession =
      allowRenewal && session.expiresAt.getTime() <= renewBefore.getTime()

    if (!shouldRefreshSession) {
      return {
        expiresAt: session.expiresAt,
        sessionRefreshed: false,
        user,
      }
    }

    const refreshedExpiresAt = new Date(
      resolvedAt.getTime() + env.SESSION_TTL_DAYS * DAY_MS,
    )
    const refreshedSession = await repository.tryRefreshSession({
      at: resolvedAt,
      expiresAt: refreshedExpiresAt,
      observedExpiresAt: session.expiresAt,
      renewBefore,
      sessionId: session.sessionId,
      tenantId,
    })

    if (refreshedSession) {
      return {
        expiresAt: refreshedSession.expiresAt,
        sessionRefreshed: true,
        user,
      }
    }

    const latestSession = await repository.findUserBySessionTokenHash({
      now: resolvedAt,
      tenantId,
      tokenHash,
    })

    if (!latestSession) {
      return null
    }

    return {
      expiresAt: latestSession.expiresAt,
      sessionRefreshed: false,
      user: {
        ...latestSession.user,
        email: normalizeEmail(latestSession.user.email),
      },
    }
  }

  return {
    async getCurrentSession({
      allowRenewal = false,
      sessionToken,
      tenantId,
    }: {
      allowRenewal?: boolean
      sessionToken: string
      tenantId: number
    }) {
      return resolveCurrentSession({
        allowRenewal,
        sessionToken,
        tenantId,
      })
    },

    async getCurrentUser({
      sessionToken,
      tenantId,
    }: {
      sessionToken: string
      tenantId: number
    }): Promise<PublicPortalUser | null> {
      return (
        (await resolveCurrentSession({
          allowRenewal: false,
          sessionToken,
          tenantId,
        }))?.user ?? null
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
