import { createHash } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from './app.js'
import type { DatabaseClient } from './db/client.js'
import {
  portalSessions,
  portalTenants,
  portalUsers,
  verificationRecords,
} from './db/schema.js'
import {
  SmtpEmailDeliveryError,
  type EmailMessage,
} from './integrations/email/smtp.js'
import { hashPassword, verifyPassword } from './lib/password.js'
import {
  decodeTenantSecretKey,
  encryptTenantSecret,
} from './modules/tenants/secrets.js'
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

function extractLatestSetupCode(
  mock: ReturnType<typeof vi.fn<(message: EmailMessage) => Promise<void>>>,
) {
  const latestMessage = mock.mock.calls[mock.mock.calls.length - 1]?.[0]

  return extractSetupCode(latestMessage?.text ?? '')
}

function createWrongCode(code: string) {
  return code === '000000' ? '111111' : '000000'
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

function getTestTenantSecretKey() {
  if (!testEnv.PORTAL_TENANT_SECRET_KEY) {
    throw new Error('PORTAL_TENANT_SECRET_KEY is required for this test.')
  }

  return testEnv.PORTAL_TENANT_SECRET_KEY
}

async function seedSecondTenant(database: DatabaseClient) {
  const key = decodeTenantSecretKey(getTestTenantSecretKey())

  const [tenant] = await database.db
    .insert(portalTenants)
    .values({
      chatwootAccountId: 2,
      chatwootApiAccessTokenCiphertext: encryptTenantSecret(
        'tenant-b-runtime-token',
        key,
      ),
      chatwootBaseUrl: 'https://chatwoot.example.test',
      chatwootPortalInboxId: 1,
      chatwootWebhookSecretCiphertext: encryptTenantSecret(
        'tenant-b-webhook-secret',
        key,
      ),
      displayName: 'Tenant B',
      primaryDomain: 'tenant-b.example.test',
      publicBaseUrl: 'https://tenant-b.example.test',
      slug: 'tenant-b',
    })
    .returning({ id: portalTenants.id })

  if (!tenant) {
    throw new Error('Failed to seed tenant B.')
  }

  return tenant.id
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

  it('rejects unauthenticated password-setup requests without sending email', async () => {
    const response = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {},
      url: '/api/auth/password-setup/request',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      error: {
        code: 'UNAUTHORIZED',
      },
    })
    expect(sendEmail).not.toHaveBeenCalled()
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

  it('rejects wrong, expired, replayed, and tenant-mismatched password-setup codes', async () => {
    const { sessionToken: wrongCodeSessionToken } = await seedPortalUserSession(
      {
        database,
        email: 'wrong-code@company.ru',
        passwordHash: null,
        tenantId,
      },
    )
    const wrongCodeCookie = `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie(
      wrongCodeSessionToken,
    )}`
    const wrongCodeRequest = await app.inject({
      headers: {
        cookie: wrongCodeCookie,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {},
      url: '/api/auth/password-setup/request',
    })
    expect(wrongCodeRequest.statusCode).toBe(200)
    const validCode = extractLatestSetupCode(sendEmail)

    const wrongCodeResponse = await app.inject({
      headers: {
        cookie: wrongCodeCookie,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code: createWrongCode(validCode),
      },
      url: '/api/auth/password-setup/verify',
    })

    expect(wrongCodeResponse.statusCode).toBe(400)
    expect(wrongCodeResponse.json()).toMatchObject({
      error: {
        code: 'PASSWORD_SETUP_INVALID_CODE',
      },
    })

    currentTime = fixedNow
    const { sessionToken: expiredCodeSessionToken } =
      await seedPortalUserSession({
        database,
        email: 'expired-code@company.ru',
        passwordHash: null,
        tenantId,
      })
    const expiredCodeCookie = `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie(
      expiredCodeSessionToken,
    )}`
    const expiredCodeRequest = await app.inject({
      headers: {
        cookie: expiredCodeCookie,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {},
      url: '/api/auth/password-setup/request',
    })
    expect(expiredCodeRequest.statusCode).toBe(200)
    const expiredCode = extractLatestSetupCode(sendEmail)

    currentTime = minutesFromNow(16)
    const expiredCodeResponse = await app.inject({
      headers: {
        cookie: expiredCodeCookie,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code: expiredCode,
      },
      url: '/api/auth/password-setup/verify',
    })

    expect(expiredCodeResponse.statusCode).toBe(410)
    expect(expiredCodeResponse.json()).toMatchObject({
      error: {
        code: 'PASSWORD_SETUP_CODE_EXPIRED',
      },
    })

    currentTime = fixedNow
    const { sessionToken: replaySessionToken } = await seedPortalUserSession({
      database,
      email: 'replay-code@company.ru',
      passwordHash: null,
      tenantId,
    })
    const replayCookie = `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie(
      replaySessionToken,
    )}`
    const replayRequest = await app.inject({
      headers: {
        cookie: replayCookie,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {},
      url: '/api/auth/password-setup/request',
    })
    expect(replayRequest.statusCode).toBe(200)
    const replayCode = extractLatestSetupCode(sendEmail)
    const firstReplayResponse = await app.inject({
      headers: {
        cookie: replayCookie,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code: replayCode,
      },
      url: '/api/auth/password-setup/verify',
    })
    expect(firstReplayResponse.statusCode).toBe(200)

    const secondReplayResponse = await app.inject({
      headers: {
        cookie: replayCookie,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code: replayCode,
      },
      url: '/api/auth/password-setup/verify',
    })

    expect(secondReplayResponse.statusCode).toBe(409)
    expect(secondReplayResponse.json()).toMatchObject({
      error: {
        code: 'PASSWORD_SETUP_NOT_FOUND_OR_INVALIDATED',
      },
    })

    const secondTenantId = await seedSecondTenant(database)
    const { sessionToken: tenantACodeSessionToken } =
      await seedPortalUserSession({
        database,
        email: 'tenant-code@company.ru',
        passwordHash: null,
        tenantId,
      })
    const tenantACodeCookie = `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie(
      tenantACodeSessionToken,
    )}`
    const tenantACodeRequest = await app.inject({
      headers: {
        cookie: tenantACodeCookie,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {},
      url: '/api/auth/password-setup/request',
    })
    expect(tenantACodeRequest.statusCode).toBe(200)
    const tenantACode = extractLatestSetupCode(sendEmail)
    const { sessionToken: tenantBSessionToken } = await seedPortalUserSession({
      database,
      email: 'tenant-code@company.ru',
      passwordHash: null,
      tenantId: secondTenantId,
    })
    const tenantBResponse = await app.inject({
      headers: {
        cookie: `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie(
          tenantBSessionToken,
        )}`,
        host: 'tenant-b.example.test',
        origin: 'https://tenant-b.example.test',
      },
      method: 'POST',
      payload: {
        code: tenantACode,
      },
      url: '/api/auth/password-setup/verify',
    })

    expect(tenantBResponse.statusCode).toBe(409)
    expect(tenantBResponse.json()).toMatchObject({
      error: {
        code: 'PASSWORD_SETUP_NOT_FOUND_OR_INVALIDATED',
      },
    })
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

  it('rejects missing, wrong, expired, and tenant-mismatched password-setup continuation tokens', async () => {
    const { sessionToken: missingTokenSessionToken } =
      await seedPortalUserSession({
        database,
        email: 'missing-token@company.ru',
        passwordHash: null,
        tenantId,
      })
    const missingTokenResponse = await app.inject({
      headers: {
        cookie: `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie(
          missingTokenSessionToken,
        )}`,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        newPassword: 'PortalPass123',
      },
      url: '/api/auth/password-setup/set',
    })

    expect(missingTokenResponse.statusCode).toBe(400)
    expect(missingTokenResponse.json()).toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
      },
    })

    currentTime = fixedNow
    const { sessionToken: wrongTokenSessionToken } =
      await seedPortalUserSession({
        database,
        email: 'wrong-token@company.ru',
        passwordHash: null,
        tenantId,
      })
    const wrongTokenCookie = `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie(
      wrongTokenSessionToken,
    )}`
    const wrongTokenRequest = await app.inject({
      headers: {
        cookie: wrongTokenCookie,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {},
      url: '/api/auth/password-setup/request',
    })
    expect(wrongTokenRequest.statusCode).toBe(200)
    const wrongTokenCode = extractLatestSetupCode(sendEmail)
    const wrongTokenVerify = await app.inject({
      headers: {
        cookie: wrongTokenCookie,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code: wrongTokenCode,
      },
      url: '/api/auth/password-setup/verify',
    })
    expect(wrongTokenVerify.statusCode).toBe(200)

    const wrongTokenResponse = await app.inject({
      headers: {
        cookie: wrongTokenCookie,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        continuationToken: 'wrong-continuation-token-with-valid-length-000000',
        newPassword: 'PortalPass123',
      },
      url: '/api/auth/password-setup/set',
    })

    expect(wrongTokenResponse.statusCode).toBe(409)
    expect(wrongTokenResponse.json()).toMatchObject({
      error: {
        code: 'PASSWORD_SETUP_CONTINUATION_INVALID',
      },
    })

    const { sessionToken: expiredTokenSessionToken } =
      await seedPortalUserSession({
        database,
        email: 'expired-token@company.ru',
        passwordHash: null,
        tenantId,
      })
    const expiredTokenCookie = `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie(
      expiredTokenSessionToken,
    )}`
    const expiredTokenRequest = await app.inject({
      headers: {
        cookie: expiredTokenCookie,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {},
      url: '/api/auth/password-setup/request',
    })
    expect(expiredTokenRequest.statusCode).toBe(200)
    const expiredTokenCode = extractLatestSetupCode(sendEmail)
    const expiredTokenVerify = await app.inject({
      headers: {
        cookie: expiredTokenCookie,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code: expiredTokenCode,
      },
      url: '/api/auth/password-setup/verify',
    })
    expect(expiredTokenVerify.statusCode).toBe(200)

    currentTime = minutesFromNow(16)
    const expiredTokenResponse = await app.inject({
      headers: {
        cookie: expiredTokenCookie,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        continuationToken: expiredTokenVerify.json().continuationToken,
        newPassword: 'PortalPass123',
      },
      url: '/api/auth/password-setup/set',
    })

    expect(expiredTokenResponse.statusCode).toBe(409)
    expect(expiredTokenResponse.json()).toMatchObject({
      error: {
        code: 'PASSWORD_SETUP_VERIFICATION_REQUIRED',
      },
    })

    currentTime = fixedNow
    const secondTenantId = await seedSecondTenant(database)
    const { sessionToken: tenantATokenSessionToken } =
      await seedPortalUserSession({
        database,
        email: 'tenant-token@company.ru',
        passwordHash: null,
        tenantId,
      })
    const tenantATokenCookie = `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie(
      tenantATokenSessionToken,
    )}`
    const tenantATokenRequest = await app.inject({
      headers: {
        cookie: tenantATokenCookie,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {},
      url: '/api/auth/password-setup/request',
    })
    expect(tenantATokenRequest.statusCode).toBe(200)
    const tenantATokenCode = extractLatestSetupCode(sendEmail)
    const tenantATokenVerify = await app.inject({
      headers: {
        cookie: tenantATokenCookie,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code: tenantATokenCode,
      },
      url: '/api/auth/password-setup/verify',
    })
    expect(tenantATokenVerify.statusCode).toBe(200)

    const { sessionToken: tenantBSessionToken } = await seedPortalUserSession({
      database,
      email: 'tenant-token@company.ru',
      passwordHash: null,
      tenantId: secondTenantId,
    })
    const tenantBResponse = await app.inject({
      headers: {
        cookie: `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie(
          tenantBSessionToken,
        )}`,
        host: 'tenant-b.example.test',
        origin: 'https://tenant-b.example.test',
      },
      method: 'POST',
      payload: {
        continuationToken: tenantATokenVerify.json().continuationToken,
        newPassword: 'PortalPass123',
      },
      url: '/api/auth/password-setup/set',
    })

    expect(tenantBResponse.statusCode).toBe(409)
    expect(tenantBResponse.json()).toMatchObject({
      error: {
        code: 'PASSWORD_SETUP_VERIFICATION_REQUIRED',
      },
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
