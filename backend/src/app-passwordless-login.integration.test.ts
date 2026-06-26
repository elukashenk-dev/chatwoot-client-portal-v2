import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from './app.js'
import type { DatabaseClient } from './db/client.js'
import { portalTenants, portalUsers } from './db/schema.js'
import type { EmailMessage } from './integrations/email/smtp.js'
import { normalizeEmail } from './lib/email.js'
import { hashPassword } from './lib/password.js'
import {
  decodeTenantSecretKey,
  encryptTenantSecret,
} from './modules/tenants/secrets.js'
import { seedDefaultTenant, testEnv } from './test/appTestHelpers.js'
import { createTestDatabase } from './test/testDatabase.js'

const fixedNow = new Date('2026-04-21T12:00:00.000Z')

function createDeferred<T>() {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return {
    promise,
    reject,
    resolve,
  }
}

function extractCode(text: string) {
  const match = text.match(/\b\d{6}\b/)

  if (!match) {
    throw new Error('Expected a six-digit login code.')
  }

  return match[0]
}

function extractLatestCode(
  mock: ReturnType<typeof vi.fn<(message: EmailMessage) => Promise<void>>>,
) {
  const latestMessage = mock.mock.calls[mock.mock.calls.length - 1]?.[0]

  return extractCode(latestMessage?.text ?? '')
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

async function seedPortalUser({
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
      email: normalizeEmail(email),
      fullName: 'Portal User',
      passwordHash,
      tenantId,
    })
    .returning({ id: portalUsers.id })

  if (!user) {
    throw new Error('Failed to seed portal user.')
  }

  return user.id
}

describe('passwordless code login app integration', () => {
  let app: ReturnType<typeof buildApp>
  let database: DatabaseClient
  let sendEmail: ReturnType<
    typeof vi.fn<(message: EmailMessage) => Promise<void>>
  >
  let tenantId: number
  let currentNow: Date

  beforeEach(async () => {
    currentNow = fixedNow
    database = await createTestDatabase()
    tenantId = await seedDefaultTenant(database)
    sendEmail = vi
      .fn<(message: EmailMessage) => Promise<void>>()
      .mockResolvedValue(undefined)
    app = buildApp({
      database,
      emailDelivery: {
        send: sendEmail,
      },
      env: testEnv,
      now: () => currentNow,
    })
    await app.ready()
  })

  afterEach(async () => {
    if (app) {
      await app.close()
    }
  })

  it('authenticates a passwordless user with an email code and normal customer session', async () => {
    const userId = await seedPortalUser({
      database,
      email: 'Passwordless@Company.RU',
      passwordHash: null,
      tenantId,
    })

    const requestResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'passwordless@company.ru',
      },
      url: '/api/auth/code-login/request',
    })

    expect(requestResponse.statusCode).toBe(200)
    expect(requestResponse.json()).toEqual({
      accepted: true,
      email: 'passwordless@company.ru',
      expiresInSeconds: 900,
      nextStep: 'verify_code',
      purpose: 'passwordless_login',
      resendAvailableInSeconds: 60,
      result: 'passwordless_login_requested',
    })

    await waitForMockCall(sendEmail, 1)
    expect(sendEmail.mock.calls[0]?.[0]).toMatchObject({
      subject: 'Код входа в Client Portal',
      to: 'passwordless@company.ru',
    })

    const code = extractLatestCode(sendEmail)
    const verifyResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code,
        email: 'passwordless@company.ru',
      },
      url: '/api/auth/code-login/verify',
    })

    expect(verifyResponse.statusCode).toBe(200)
    expect(verifyResponse.json()).toEqual({
      nextStep: 'chat',
      purpose: 'passwordless_login',
      result: 'passwordless_login_completed',
      session: {
        expiresAt: '2026-05-21T12:00:00.000Z',
      },
      user: {
        email: 'passwordless@company.ru',
        fullName: 'Portal User',
        id: userId,
        passwordConfigured: false,
      },
    })

    const sessionCookie = verifyResponse.cookies.find(
      (cookie) => cookie.name === testEnv.SESSION_COOKIE_NAME,
    )
    expect(sessionCookie).toBeDefined()
    expect(sessionCookie?.httpOnly).toBe(true)

    const meResponse = await app.inject({
      headers: {
        cookie: `${testEnv.SESSION_COOKIE_NAME}=${sessionCookie?.value ?? ''}`,
      },
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(meResponse.statusCode).toBe(200)
    expect(meResponse.json().user).toEqual({
      email: 'passwordless@company.ru',
      fullName: 'Portal User',
      id: userId,
      passwordConfigured: false,
    })
  })

  it('allows configured-password users to enter by email code without submitting a password', async () => {
    await seedPortalUser({
      database,
      email: 'Configured@Company.RU',
      passwordHash: await hashPassword('Secret123'),
      tenantId,
    })

    await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'configured@company.ru',
      },
      url: '/api/auth/code-login/request',
    })

    await waitForMockCall(sendEmail, 1)
    const verifyResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code: extractLatestCode(sendEmail),
        email: 'configured@company.ru',
      },
      url: '/api/auth/code-login/verify',
    })

    expect(verifyResponse.statusCode).toBe(200)
    expect(verifyResponse.json().user.passwordConfigured).toBe(true)
    expect(
      verifyResponse.cookies.some(
        (cookie) => cookie.name === testEnv.SESSION_COOKIE_NAME,
      ),
    ).toBe(true)
  })

  it('does not let stale failed delivery cleanup invalidate a newer login code', async () => {
    const firstDelivery = createDeferred<void>()
    sendEmail.mockReset()
    sendEmail
      .mockImplementationOnce(() => firstDelivery.promise)
      .mockResolvedValueOnce(undefined)

    await seedPortalUser({
      database,
      email: 'passwordless@company.ru',
      passwordHash: null,
      tenantId,
    })

    await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'passwordless@company.ru',
      },
      url: '/api/auth/code-login/request',
    })
    await waitForMockCall(sendEmail, 1)

    currentNow = new Date(fixedNow.getTime() + 61_000)
    await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'passwordless@company.ru',
      },
      url: '/api/auth/code-login/request',
    })
    await waitForMockCall(sendEmail, 2)

    const latestCode = extractLatestCode(sendEmail)
    firstDelivery.reject(new Error('SMTP delivery failed after resend.'))
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25)
    })

    const verifyResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code: latestCode,
        email: 'passwordless@company.ru',
      },
      url: '/api/auth/code-login/verify',
    })

    expect(verifyResponse.statusCode).toBe(200)
    expect(verifyResponse.json().user.passwordConfigured).toBe(false)
  })

  it('does not reveal missing users during request and never sends them a code', async () => {
    const requestResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'missing@company.ru',
      },
      url: '/api/auth/code-login/request',
    })

    expect(requestResponse.statusCode).toBe(200)
    expect(requestResponse.json()).toMatchObject({
      accepted: true,
      email: 'missing@company.ru',
      nextStep: 'verify_code',
      purpose: 'passwordless_login',
      result: 'passwordless_login_requested',
    })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('rejects wrong, replayed, and tenant-mismatched login codes without issuing a session', async () => {
    await seedPortalUser({
      database,
      email: 'TenantA@Company.RU',
      passwordHash: null,
      tenantId,
    })
    await seedSecondTenant(database)

    await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'tenanta@company.ru',
      },
      url: '/api/auth/code-login/request',
    })
    await waitForMockCall(sendEmail, 1)
    const code = extractLatestCode(sendEmail)

    const wrongCodeResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code: createWrongCode(code),
        email: 'tenanta@company.ru',
      },
      url: '/api/auth/code-login/verify',
    })
    expect(wrongCodeResponse.statusCode).toBe(400)
    expect(wrongCodeResponse.cookies).toHaveLength(0)

    const tenantMismatchResponse = await app.inject({
      headers: {
        host: 'tenant-b.example.test',
        origin: 'https://tenant-b.example.test',
      },
      method: 'POST',
      payload: {
        code,
        email: 'tenanta@company.ru',
      },
      url: '/api/auth/code-login/verify',
    })
    expect(tenantMismatchResponse.statusCode).toBe(409)
    expect(tenantMismatchResponse.cookies).toHaveLength(0)

    const verifiedResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code,
        email: 'tenanta@company.ru',
      },
      url: '/api/auth/code-login/verify',
    })
    expect(verifiedResponse.statusCode).toBe(200)

    const replayedResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code,
        email: 'tenanta@company.ru',
      },
      url: '/api/auth/code-login/verify',
    })
    expect(replayedResponse.statusCode).toBe(409)
    expect(replayedResponse.cookies).toHaveLength(0)
  })

  it('rate limits repeated passwordless code-login requests and verifications', async () => {
    const requestResponses = []
    for (let attempt = 0; attempt < 6; attempt += 1) {
      requestResponses.push(
        await app.inject({
          headers: {
            origin: testEnv.APP_ORIGIN,
          },
          method: 'POST',
          payload: {
            email: 'missing@company.ru',
          },
          url: '/api/auth/code-login/request',
        }),
      )
    }

    expect(
      requestResponses.slice(0, 5).map((response) => response.statusCode),
    ).toEqual([200, 200, 200, 200, 200])
    expect(requestResponses[5]?.statusCode).toBe(429)

    const verifyResponses = []
    for (let attempt = 0; attempt < 6; attempt += 1) {
      verifyResponses.push(
        await app.inject({
          headers: {
            origin: testEnv.APP_ORIGIN,
            'x-forwarded-for': '203.0.113.24',
          },
          method: 'POST',
          payload: {
            code: '000000',
            email: 'missing@company.ru',
          },
          url: '/api/auth/code-login/verify',
        }),
      )
    }

    expect(
      verifyResponses.slice(0, 5).map((response) => response.statusCode),
    ).toEqual([400, 400, 400, 400, 409])
    expect(verifyResponses[5]?.statusCode).toBe(429)
  })
})
