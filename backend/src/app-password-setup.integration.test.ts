import { createHash } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from './app.js'
import type { DatabaseClient } from './db/client.js'
import {
  portalSessions,
  portalUsers,
  verificationRecords,
} from './db/schema.js'
import {
  SmtpEmailDeliveryError,
  type EmailMessage,
} from './integrations/email/smtp.js'
import { hashPassword, verifyPassword } from './lib/password.js'
import { seedDefaultTenant, testEnv } from './test/appTestHelpers.js'
import { createTestDatabase } from './test/testDatabase.js'

const fixedNow = new Date('2026-04-21T12:00:00.000Z')

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return {
    promise,
    reject,
    resolve,
  }
}

function extractSetupCode(text: string) {
  const match = text.match(/\b\d{6}\b/)

  if (!match) {
    throw new Error('Expected a six-digit password setup code.')
  }

  return match[0]
}

async function waitForMockCall(
  mock: ReturnType<typeof vi.fn>,
  callCount: number,
) {
  let lastCallCount = 0

  for (let attempt = 0; attempt < 100; attempt += 1) {
    lastCallCount = mock.mock.calls.length

    if (lastCallCount >= callCount) {
      return
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25)
    })
  }

  throw new Error(`Expected ${callCount} mock calls, saw ${lastCallCount}.`)
}

function minutesFromNow(minutes: number) {
  return new Date(fixedNow.getTime() + minutes * 60_000)
}

async function seedPortalUserSession({
  database,
  email,
  passwordHash,
  tenantId,
}: {
  database: DatabaseClient
  email: string
  passwordHash: string | null
  tenantId: number
}) {
  const [user] = await database.db
    .insert(portalUsers)
    .values({
      email,
      fullName: 'Portal User',
      passwordHash,
      tenantId,
    })
    .returning({
      id: portalUsers.id,
    })

  if (!user) {
    throw new Error('Failed to seed portal user.')
  }

  const sessionToken = `session-token-${user.id}`
  await database.db.insert(portalSessions).values({
    expiresAt: minutesFromNow(60),
    lastSeenAt: fixedNow,
    tenantId,
    tokenHash: createHash('sha256').update(sessionToken).digest('hex'),
    userId: user.id,
  })

  return {
    cookie: `${testEnv.SESSION_COOKIE_NAME}=`,
    sessionToken,
    userId: user.id,
  }
}

describe('password setup app integration', () => {
  let app: ReturnType<typeof buildApp>
  let currentTime: Date
  let database: DatabaseClient
  let sendEmail: ReturnType<
    typeof vi.fn<(message: EmailMessage) => Promise<void>>
  >
  let tenantId: number

  beforeEach(async () => {
    database = await createTestDatabase()
    tenantId = await seedDefaultTenant(database)
    currentTime = fixedNow
    sendEmail = vi
      .fn<(message: EmailMessage) => Promise<void>>()
      .mockResolvedValue(undefined)
    app = buildApp({
      database,
      emailDelivery: {
        send: sendEmail,
      },
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

  it('rejects password-setup requests that try to submit a target email', async () => {
    const { sessionToken } = await seedPortalUserSession({
      database,
      email: 'owner@company.ru',
      passwordHash: null,
      tenantId,
    })

    const response = await app.inject({
      headers: {
        cookie: `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie(sessionToken)}`,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'attacker@company.ru',
      },
      url: '/api/auth/password-setup/request',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
      },
    })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('does not let stale failed delivery cleanup delete a newer setup code', async () => {
    const firstDelivery = createDeferred<void>()
    sendEmail
      .mockImplementationOnce(() => firstDelivery.promise)
      .mockResolvedValue(undefined)
    const { sessionToken, userId } = await seedPortalUserSession({
      database,
      email: 'race@company.ru',
      passwordHash: null,
      tenantId,
    })
    const cookieHeader = `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie(
      sessionToken,
    )}`

    const firstRequest = Promise.resolve().then(() =>
      app.inject({
        headers: {
          cookie: cookieHeader,
          origin: testEnv.APP_ORIGIN,
        },
        method: 'POST',
        payload: {},
        url: '/api/auth/password-setup/request',
      }),
    )
    await waitForMockCall(sendEmail, 1)

    currentTime = new Date('2026-04-21T12:01:01.000Z')

    const secondResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {},
      url: '/api/auth/password-setup/request',
    })
    await waitForMockCall(sendEmail, 2)

    expect(secondResponse.statusCode).toBe(200)
    const secondCode = extractSetupCode(sendEmail.mock.calls[1]?.[0].text ?? '')

    firstDelivery.reject(new SmtpEmailDeliveryError('First delivery failed.'))
    const firstResponse = await firstRequest

    expect(firstResponse.statusCode).toBe(503)

    const [latestRecord] = await database.db
      .select({
        codeHash: verificationRecords.codeHash,
        status: verificationRecords.status,
      })
      .from(verificationRecords)
      .where(
        and(
          eq(verificationRecords.tenantId, tenantId),
          eq(verificationRecords.purpose, 'password_setup'),
          eq(verificationRecords.portalUserId, userId),
        ),
      )

    expect(latestRecord?.status).toBe('pending')
    await expect(
      verifyPassword(secondCode, latestRecord?.codeHash ?? ''),
    ).resolves.toBe(true)
  })

  it('sets the first password after email-code proof and rotates the session', async () => {
    const { sessionToken, userId } = await seedPortalUserSession({
      database,
      email: 'Name@Company.RU',
      passwordHash: null,
      tenantId,
    })
    const cookieHeader = `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie(
      sessionToken,
    )}`

    const requestResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {},
      url: '/api/auth/password-setup/request',
    })

    expect(requestResponse.statusCode).toBe(200)
    expect(requestResponse.json()).toEqual({
      email: 'name@company.ru',
      expiresInSeconds: 900,
      nextStep: 'verify_code',
      purpose: 'password_setup',
      resendAvailableInSeconds: 60,
      result: 'password_setup_requested',
    })
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringMatching(/\b\d{6}\b/),
        to: 'name@company.ru',
      }),
    )

    const code = extractSetupCode(sendEmail.mock.calls[0]?.[0].text ?? '')
    const verifyResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code,
      },
      url: '/api/auth/password-setup/verify',
    })

    expect(verifyResponse.statusCode).toBe(200)
    expect(verifyResponse.json()).toEqual({
      continuationExpiresInSeconds: 900,
      continuationToken: expect.any(String),
      email: 'name@company.ru',
      nextStep: 'set_password',
      purpose: 'password_setup',
      result: 'password_setup_verified',
    })

    const setResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        continuationToken: verifyResponse.json().continuationToken,
        newPassword: 'PortalPass123',
      },
      url: '/api/auth/password-setup/set',
    })

    expect(setResponse.statusCode).toBe(200)
    expect(setResponse.json()).toEqual({
      nextStep: 'chat',
      purpose: 'password_setup',
      result: 'password_setup_completed',
      session: {
        expiresAt: '2026-05-21T12:00:00.000Z',
      },
      user: {
        email: 'name@company.ru',
        fullName: 'Portal User',
        id: userId,
        passwordConfigured: true,
      },
    })
    const sessionCookie = setResponse.cookies.find(
      (cookie) => cookie.name === testEnv.SESSION_COOKIE_NAME,
    )

    expect(sessionCookie).toBeDefined()

    const [updatedUser] = await database.db
      .select({
        passwordHash: portalUsers.passwordHash,
      })
      .from(portalUsers)
      .where(eq(portalUsers.id, userId))

    expect(updatedUser?.passwordHash).toEqual(expect.any(String))
    await expect(
      verifyPassword('PortalPass123', updatedUser?.passwordHash ?? ''),
    ).resolves.toBe(true)

    const [setupRecord] = await database.db
      .select({
        status: verificationRecords.status,
      })
      .from(verificationRecords)
      .where(
        and(
          eq(verificationRecords.tenantId, tenantId),
          eq(verificationRecords.purpose, 'password_setup'),
          eq(verificationRecords.portalUserId, userId),
        ),
      )

    expect(setupRecord?.status).toBe('consumed')

    const oldSessionResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
      },
      method: 'GET',
      url: '/api/auth/me',
    })
    expect(oldSessionResponse.statusCode).toBe(401)

    const newSessionResponse = await app.inject({
      headers: {
        cookie: `${testEnv.SESSION_COOKIE_NAME}=${sessionCookie?.value ?? ''}`,
      },
      method: 'GET',
      url: '/api/auth/me',
    })
    expect(newSessionResponse.statusCode).toBe(200)
    expect(newSessionResponse.json().user).toMatchObject({
      email: 'name@company.ru',
      passwordConfigured: true,
    })
  })

  it('rejects first-password setup for users who already have a password', async () => {
    const { sessionToken } = await seedPortalUserSession({
      database,
      email: 'ready@company.ru',
      passwordHash: await hashPassword('OldPass123'),
      tenantId,
    })

    const response = await app.inject({
      headers: {
        cookie: `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie(sessionToken)}`,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {},
      url: '/api/auth/password-setup/request',
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({
      error: {
        code: 'PASSWORD_ALREADY_SET',
        message: 'Пароль уже задан.',
      },
    })
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
