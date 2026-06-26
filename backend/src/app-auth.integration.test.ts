import { createHash } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { buildApp } from './app.js'
import type { DatabaseClient } from './db/client.js'
import { portalSessions, portalUsers } from './db/schema.js'
import { hashPassword } from './lib/password.js'
import { seedDefaultTenant, testEnv } from './test/appTestHelpers.js'
import { createTestDatabase } from './test/testDatabase.js'

const fixedNow = new Date('2026-04-21T12:00:00.000Z')

describe('buildApp auth integration', () => {
  let app: ReturnType<typeof buildApp>
  let database: DatabaseClient
  let currentTime: Date
  let tenantId: number

  beforeEach(async () => {
    database = await createTestDatabase()
    tenantId = await seedDefaultTenant(database)
    currentTime = fixedNow
    app = buildApp({
      database,
      env: testEnv,
      now: () => currentTime,
    })
    await app.ready()
  })

  afterEach(async () => {
    if (app) {
      await app.close()
    }
  })

  it('creates a signed session on login, resolves /api/auth/me, and logs out', async () => {
    await database.db.insert(portalUsers).values({
      email: 'Name@Company.RU',
      fullName: 'Portal User',
      passwordHash: await hashPassword('Secret123'),
      tenantId,
    })

    const loginResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'name@company.ru',
        password: 'Secret123',
      },
      url: '/api/auth/login',
    })

    expect(loginResponse.statusCode).toBe(200)
    expect(loginResponse.json()).toEqual({
      session: {
        expiresAt: '2026-05-21T12:00:00.000Z',
      },
      user: {
        email: 'name@company.ru',
        fullName: 'Portal User',
        id: 1,
        passwordConfigured: true,
      },
    })

    const sessionCookie = loginResponse.cookies.find(
      (cookie) => cookie.name === testEnv.SESSION_COOKIE_NAME,
    )

    expect(sessionCookie).toBeDefined()
    expect(sessionCookie?.httpOnly).toBe(true)

    const cookieHeader = `${testEnv.SESSION_COOKIE_NAME}=${
      sessionCookie?.value ?? ''
    }`
    const meResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
      },
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(meResponse.statusCode).toBe(200)
    expect(meResponse.json()).toEqual({
      session: {
        expiresAt: '2026-05-21T12:00:00.000Z',
      },
      user: {
        email: 'name@company.ru',
        fullName: 'Portal User',
        id: 1,
        passwordConfigured: true,
      },
    })

    const logoutResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      url: '/api/auth/logout',
    })

    expect(logoutResponse.statusCode).toBe(204)

    const meAfterLogoutResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
      },
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(meAfterLogoutResponse.statusCode).toBe(401)
    expect(meAfterLogoutResponse.json()).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Требуется вход.',
      },
    })
  })

  it('reports passwordless users without allowing password login state leaks', async () => {
    const [user] = await database.db
      .insert(portalUsers)
      .values({
        email: 'Passwordless@Company.RU',
        fullName: 'Passwordless User',
        passwordHash: null,
        tenantId,
      })
      .returning({ id: portalUsers.id })

    if (!user) {
      throw new Error('Failed to seed passwordless portal user.')
    }

    const loginResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'passwordless@company.ru',
        password: 'Secret123',
      },
      url: '/api/auth/login',
    })

    expect(loginResponse.statusCode).toBe(401)
    expect(loginResponse.json()).toEqual({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Неверный email или пароль.',
      },
    })

    const sessionToken = 'passwordless-session-token'
    await database.db.insert(portalSessions).values({
      expiresAt: new Date('2026-05-21T12:00:00.000Z'),
      lastSeenAt: fixedNow,
      tenantId,
      tokenHash: hashSessionToken(sessionToken),
      userId: user.id,
    })

    const meResponse = await app.inject({
      headers: {
        cookie: `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie(sessionToken)}`,
      },
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(meResponse.statusCode).toBe(200)
    expect(meResponse.json()).toEqual({
      session: {
        expiresAt: '2026-05-21T12:00:00.000Z',
      },
      user: {
        email: 'passwordless@company.ru',
        fullName: 'Passwordless User',
        id: user.id,
        passwordConfigured: false,
      },
    })
  })

  it('refreshes /api/auth/me only for explicit same-tenant renewal checks', async () => {
    await database.db.insert(portalUsers).values({
      email: 'Name@Company.RU',
      fullName: 'Portal User',
      passwordHash: await hashPassword('Secret123'),
      tenantId,
    })

    const loginResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'name@company.ru',
        password: 'Secret123',
      },
      url: '/api/auth/login',
    })
    const sessionCookie = loginResponse.cookies.find(
      (cookie) => cookie.name === testEnv.SESSION_COOKIE_NAME,
    )
    const cookieHeader = `${testEnv.SESSION_COOKIE_NAME}=${
      sessionCookie?.value ?? ''
    }`

    currentTime = new Date('2026-05-10T09:30:00.000Z')
    const sessionBeforeChecks = await readOnlySession(database, tenantId)

    const noIntentResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
      },
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(noIntentResponse.statusCode).toBe(200)
    expect(noIntentResponse.cookies).toHaveLength(0)
    expect(noIntentResponse.json().session.expiresAt).toBe(
      '2026-05-21T12:00:00.000Z',
    )
    await expect(readOnlySession(database, tenantId)).resolves.toMatchObject({
      expiresAt: sessionBeforeChecks.expiresAt,
      lastSeenAt: sessionBeforeChecks.lastSeenAt,
    })

    const crossSiteResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
        'sec-fetch-site': 'cross-site',
        'x-portal-session-check': '1',
      },
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(crossSiteResponse.statusCode).toBe(200)
    expect(crossSiteResponse.cookies).toHaveLength(0)
    await expect(readOnlySession(database, tenantId)).resolves.toMatchObject({
      expiresAt: sessionBeforeChecks.expiresAt,
      lastSeenAt: sessionBeforeChecks.lastSeenAt,
    })

    const foreignOriginResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
        origin: 'https://other.example.test',
        'x-portal-session-check': '1',
      },
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(foreignOriginResponse.statusCode).toBe(200)
    expect(foreignOriginResponse.cookies).toHaveLength(0)
    await expect(readOnlySession(database, tenantId)).resolves.toMatchObject({
      expiresAt: sessionBeforeChecks.expiresAt,
      lastSeenAt: sessionBeforeChecks.lastSeenAt,
    })

    const renewalResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
        origin: testEnv.APP_ORIGIN,
        'x-portal-session-check': '1',
      },
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(renewalResponse.statusCode).toBe(200)
    expect(renewalResponse.json().session.expiresAt).toBe(
      '2026-06-09T09:30:00.000Z',
    )
    expect(
      renewalResponse.cookies.some(
        (cookie) => cookie.name === testEnv.SESSION_COOKIE_NAME,
      ),
    ).toBe(true)
    await expect(readOnlySession(database, tenantId)).resolves.toMatchObject({
      expiresAt: new Date('2026-06-09T09:30:00.000Z'),
      lastSeenAt: new Date('2026-05-10T09:30:00.000Z'),
    })
  })
})

async function readOnlySession(database: DatabaseClient, tenantId: number) {
  const [session] = await database.db
    .select()
    .from(portalSessions)
    .where(eq(portalSessions.tenantId, tenantId))
    .limit(1)

  if (!session) {
    throw new Error(`Expected session for tenant ${tenantId}.`)
  }

  return session
}

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
