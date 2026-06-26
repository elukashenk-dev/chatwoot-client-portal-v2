import { createHash } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'
import type { DatabaseClient } from './db/client.js'
import {
  portalLegalAcceptances,
  portalUserContactLinks,
  portalUsers,
  verificationRecords,
} from './db/schema.js'
import { hashPassword } from './lib/password.js'
import { seedDefaultTenant, testEnv } from './test/appTestHelpers.js'
import { createTestDatabase } from './test/testDatabase.js'

async function unavailableChatwootFetch(): Promise<Response> {
  throw new Error('Chatwoot is intentionally unavailable in this test.')
}

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000)
}

async function seedRegistrationAcceptance({
  database,
  email,
  tenantId,
}: {
  database: DatabaseClient
  email: string
  tenantId: number
}) {
  await database.db.insert(portalLegalAcceptances).values({
    email,
    personalDataConsentAccepted: true,
    privacyPolicyVersion: 'privacy-upload-v9',
    purpose: 'registration',
    requestIp: '203.0.113.10',
    tenantId,
    termsAccepted: true,
    termsVersion: 'terms-upload-v7',
    userAgent: 'Mozilla/5.0',
  })
}

describe('registration completion app integration', () => {
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

  it('rate limits repeated registration skip-password attempts', async () => {
    const responses = []
    for (let attempt = 0; attempt < 6; attempt += 1) {
      responses.push(
        await app.inject({
          headers: {
            origin: testEnv.APP_ORIGIN,
          },
          method: 'POST',
          payload: {
            continuationToken: 'missing-continuation-token-for-rate-limit',
            email: 'missing@company.ru',
          },
          url: '/api/auth/register/skip-password',
        }),
      )
    }

    expect(
      responses.slice(0, 5).map((response) => response.statusCode),
    ).toEqual([409, 409, 409, 409, 409])
    expect(responses[5]?.statusCode).toBe(429)
    expect(responses[5]?.json()).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Слишком много запросов. Попробуйте позже.',
      },
    })
  })

  it('completes registration set-password and creates a portal user session', async () => {
    await seedRegistrationAcceptance({
      database,
      email: 'name@company.ru',
      tenantId,
    })
    await database.db.insert(verificationRecords).values({
      attemptsCount: 0,
      chatwootContactId: 44,
      codeHash: await hashPassword('123456'),
      continuationTokenExpiresAt: minutesFromNow(15),
      continuationTokenHash: createHash('sha256')
        .update('continuation-token-for-registration-completion')
        .digest('hex'),
      email: 'name@company.ru',
      expiresAt: minutesFromNow(15),
      fullName: 'Portal User',
      lastSentAt: minutesFromNow(-1),
      maxAttempts: 5,
      purpose: 'registration',
      resendCount: 0,
      resendNotBefore: minutesFromNow(1),
      status: 'verified',
      tenantId,
      verifiedAt: minutesFromNow(-1),
    })

    const response = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        continuationToken: 'continuation-token-for-registration-completion',
        email: 'name@company.ru',
        newPassword: 'PortalPass123',
      },
      url: '/api/auth/register/set-password',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      nextStep: 'chat',
      purpose: 'registration',
      result: 'registration_completed',
      session: {
        expiresAt: expect.any(String),
      },
      user: {
        email: 'name@company.ru',
        fullName: 'Portal User',
        id: expect.any(Number),
        passwordConfigured: true,
      },
    })
    expect(
      response.cookies.some(
        (cookie) => cookie.name === testEnv.SESSION_COOKIE_NAME,
      ),
    ).toBe(true)

    const [contactLink] = await database.db
      .select({
        chatwootContactId: portalUserContactLinks.chatwootContactId,
      })
      .from(portalUserContactLinks)

    expect(contactLink).toEqual({
      chatwootContactId: 44,
    })
    const [linkedAcceptance] = await database.db
      .select({
        portalUserId: portalLegalAcceptances.portalUserId,
      })
      .from(portalLegalAcceptances)

    expect(linkedAcceptance?.portalUserId).toBe(response.json().user.id)

    const reusedResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        continuationToken: 'continuation-token-for-registration-completion',
        email: 'name@company.ru',
        newPassword: 'PortalPass123',
      },
      url: '/api/auth/register/set-password',
    })

    expect(reusedResponse.statusCode).toBe(409)
    expect(reusedResponse.json()).toMatchObject({
      error: {
        code: 'REGISTRATION_VERIFICATION_NOT_FOUND_OR_INVALIDATED',
      },
    })
  })

  it('completes registration without a password and authenticates the user', async () => {
    await seedRegistrationAcceptance({
      database,
      email: 'skip@company.ru',
      tenantId,
    })
    await database.db.insert(verificationRecords).values({
      attemptsCount: 0,
      chatwootContactId: 45,
      codeHash: await hashPassword('123456'),
      continuationTokenExpiresAt: minutesFromNow(15),
      continuationTokenHash: createHash('sha256')
        .update('continuation-token-for-registration-skip')
        .digest('hex'),
      email: 'skip@company.ru',
      expiresAt: minutesFromNow(15),
      fullName: 'Skip User',
      lastSentAt: minutesFromNow(-1),
      maxAttempts: 5,
      purpose: 'registration',
      resendCount: 0,
      resendNotBefore: minutesFromNow(1),
      status: 'verified',
      tenantId,
      verifiedAt: minutesFromNow(-1),
    })

    const response = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        continuationToken: 'continuation-token-for-registration-skip',
        email: 'skip@company.ru',
      },
      url: '/api/auth/register/skip-password',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      nextStep: 'chat',
      purpose: 'registration',
      result: 'registration_completed',
      session: {
        expiresAt: expect.any(String),
      },
      user: {
        email: 'skip@company.ru',
        fullName: 'Skip User',
        id: expect.any(Number),
        passwordConfigured: false,
      },
    })
    const sessionCookie = response.cookies.find(
      (cookie) => cookie.name === testEnv.SESSION_COOKIE_NAME,
    )

    expect(sessionCookie).toBeDefined()

    const [createdUser] = await database.db
      .select({
        id: portalUsers.id,
        passwordHash: portalUsers.passwordHash,
      })
      .from(portalUsers)
      .where(eq(portalUsers.email, 'skip@company.ru'))

    expect(createdUser).toEqual({
      id: response.json().user.id,
      passwordHash: null,
    })

    const meResponse = await app.inject({
      headers: {
        cookie: `${testEnv.SESSION_COOKIE_NAME}=${sessionCookie?.value ?? ''}`,
      },
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(meResponse.statusCode).toBe(200)
    expect(meResponse.json().user).toMatchObject({
      email: 'skip@company.ru',
      passwordConfigured: false,
    })

    const reusedResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        continuationToken: 'continuation-token-for-registration-skip',
        email: 'skip@company.ru',
      },
      url: '/api/auth/register/skip-password',
    })

    expect(reusedResponse.statusCode).toBe(409)
    expect(reusedResponse.json()).toMatchObject({
      error: {
        code: 'REGISTRATION_VERIFICATION_NOT_FOUND_OR_INVALIDATED',
      },
    })
  })
})
