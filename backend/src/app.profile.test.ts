import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'
import type { DatabaseClient } from './db/client.js'
import { portalUsers } from './db/schema.js'
import { hashPassword } from './lib/password.js'
import { seedDefaultTenant, testEnv } from './test/appTestHelpers.js'
import { createTestDatabase } from './test/testDatabase.js'

async function unavailableChatwootFetch(): Promise<Response> {
  throw new Error('Chatwoot is intentionally unavailable in this test.')
}

describe('buildApp profile routes', () => {
  let app: ReturnType<typeof buildApp>
  let database: DatabaseClient
  let tenantId: number

  beforeEach(async () => {
    database = await createTestDatabase()
    tenantId = await seedDefaultTenant(database)
    app = buildApp({
      chatwootFetchFn: unavailableChatwootFetch,
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

  it('returns controlled profile data for an authenticated user without a Chatwoot contact link', async () => {
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
    const cookieHeader = `${testEnv.SESSION_COOKIE_NAME}=${sessionCookie?.value ?? ''}`

    const profileResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
      },
      method: 'GET',
      url: '/api/profile',
    })

    expect(profileResponse.statusCode).toBe(200)
    expect(profileResponse.json()).toEqual({
      avatarUrl: null,
      email: 'name@company.ru',
      fullName: 'Portal User',
      phoneNumber: null,
      reason: 'contact_unavailable',
      result: 'unavailable',
    })
  })
})
