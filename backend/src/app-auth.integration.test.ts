import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'
import type { DatabaseClient } from './db/client.js'
import { portalUsers } from './db/schema.js'
import { hashPassword } from './lib/password.js'
import { seedDefaultTenant, testEnv } from './test/appTestHelpers.js'
import { createTestDatabase } from './test/testDatabase.js'

describe('buildApp auth integration', () => {
  let app: ReturnType<typeof buildApp>
  let database: DatabaseClient
  let tenantId: number

  beforeEach(async () => {
    database = await createTestDatabase()
    tenantId = await seedDefaultTenant(database)
    app = buildApp({
      database,
      env: testEnv,
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
      user: {
        email: 'name@company.ru',
        fullName: 'Portal User',
        id: 1,
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
      user: {
        email: 'name@company.ru',
        fullName: 'Portal User',
        id: 1,
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
})
