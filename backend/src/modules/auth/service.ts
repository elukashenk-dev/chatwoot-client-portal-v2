import { createHash, randomBytes } from 'node:crypto'

import type { AppEnv } from '../../config/env.js'
import type { AppDatabase } from '../../db/client.js'
import { normalizeEmail } from '../../lib/email.js'
import { ApiError } from '../../lib/errors.js'
import { verifyPassword as defaultVerifyPasswordHash } from '../../lib/password.js'
import { createAuthRepository } from './repository.js'

export type PublicPortalUser = {
  email: string
  fullName: string | null
  id: number
  passwordConfigured: boolean
}

export type AuthenticatedPortalUser = PublicPortalUser

export type PublicPortalSession = {
  expiresAt: Date
  user: AuthenticatedPortalUser
}

export type CurrentPortalSession = PublicPortalSession & {
  sessionRefreshed: boolean
}

type CreateAuthServiceOptions = {
  db: AppDatabase
  env: AppEnv
  now?: () => Date
  verifyPasswordHash?: typeof defaultVerifyPasswordHash
}

const CUSTOMER_SESSION_RENEWAL_WINDOW_DAYS = 15
const DAY_MS = 24 * 60 * 60 * 1000
const INVALID_LOGIN_PASSWORD_HASH =
  'scrypt:000102030405060708090a0b0c0d0e0f:da6b73b8aeff9c8a6b973893c438b1ffcc8fad638b85fa6ec06db474a5b6c7850781fb3f7696c60f2209c3bbf51a6b4a3d51c544c0827d4f199fd247f442b973'

type AuthenticatedPortalUserRecord = {
  email: string
  fullName: string | null
  id: number
  passwordConfigured: boolean
}

function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function toAuthenticatedPortalUser(
  user: AuthenticatedPortalUserRecord,
): AuthenticatedPortalUser {
  return {
    email: normalizeEmail(user.email),
    fullName: user.fullName,
    id: user.id,
    passwordConfigured: user.passwordConfigured,
  }
}

export function createAuthService({
  db,
  env,
  now = () => new Date(),
  verifyPasswordHash = defaultVerifyPasswordHash,
}: CreateAuthServiceOptions) {
  const repository = createAuthRepository(db)

  async function issueSessionForUser({
    executor,
    tenantId,
    user,
    userId,
  }: {
    executor?: AppDatabase
    ipAddress?: string | null
    tenantId: number
    user?: AuthenticatedPortalUserRecord
    userAgent?: string | null
    userId: number
  }) {
    const sessionUser =
      user ??
      (await repository.findActiveUserById({
        ...(executor ? { executor } : {}),
        tenantId,
        userId,
      }))

    if (!sessionUser) {
      throw new ApiError(
        401,
        'INVALID_CREDENTIALS',
        'Неверный email или пароль.',
      )
    }

    const issuedAt = now()
    const expiresAt = new Date(
      issuedAt.getTime() + env.SESSION_TTL_DAYS * DAY_MS,
    )
    const sessionToken = createSessionToken()

    await repository.createSession({
      expiresAt,
      lastSeenAt: issuedAt,
      tenantId,
      tokenHash: hashSessionToken(sessionToken),
      userId: sessionUser.id,
    }, executor)
    await repository.recordSuccessfulLogin({
      at: issuedAt,
      ...(executor ? { executor } : {}),
      tenantId,
      userId: sessionUser.id,
    })

    return {
      session: {
        expiresAt,
      },
      sessionToken,
      user: toAuthenticatedPortalUser(sessionUser),
    }
  }

  function createInvalidCredentialsError() {
    return new ApiError(
      401,
      'INVALID_CREDENTIALS',
      'Неверный email или пароль.',
    )
  }

  async function rejectInvalidLogin(password: string): Promise<never> {
    await verifyPasswordHash(password, INVALID_LOGIN_PASSWORD_HASH)
    throw createInvalidCredentialsError()
  }

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

    const user = toAuthenticatedPortalUser(session.user)

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
        ...toAuthenticatedPortalUser(latestSession.user),
      },
    }
  }

  return {
    issueSessionForUser,

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
    }): Promise<AuthenticatedPortalUser | null> {
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
        return rejectInvalidLogin(password)
      }

      if (user.passwordHash === null) {
        return rejectInvalidLogin(password)
      }

      const passwordMatches = await verifyPasswordHash(
        password,
        user.passwordHash,
      )

      if (!passwordMatches) {
        throw createInvalidCredentialsError()
      }

      const issuedSession = await issueSessionForUser({
        tenantId,
        user,
        userId: user.id,
      })

      return {
        ...issuedSession,
        expiresAt: issuedSession.session.expiresAt,
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
