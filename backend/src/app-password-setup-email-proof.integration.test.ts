import { createHash } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from './app.js'
import type { DatabaseClient } from './db/client.js'
import {
  portalLegalAcceptances,
  portalLegalDocuments,
  portalSessions,
  portalUsers,
} from './db/schema.js'
import type { EmailMessage } from './integrations/email/smtp.js'
import { normalizeEmail } from './lib/email.js'
import { seedDefaultTenant, testEnv } from './test/appTestHelpers.js'
import {
  extractCode,
  waitForMockCall,
} from './test/passwordlessLoginTestHelpers.js'
import { createTestDatabase } from './test/testDatabase.js'

const fixedNow = new Date('2026-04-21T12:00:00.000Z')

async function seedPasswordlessUser({
  database,
  email,
  tenantId,
}: {
  database: DatabaseClient
  email: string
  tenantId: number
}) {
  const [user] = await database.db
    .insert(portalUsers)
    .values({
      email,
      fullName: 'Portal User',
      passwordHash: null,
      tenantId,
    })
    .returning({ id: portalUsers.id })

  if (!user) {
    throw new Error('Failed to seed portal user.')
  }

  return user
}

async function seedCurrentLegalAcceptance({
  database,
  email,
  portalUserId,
  tenantId,
}: {
  database: DatabaseClient
  email: string
  portalUserId: number
  tenantId: number
}) {
  const sourceSha256 = createHash('sha256')
    .update('password-setup-email-proof-legal-doc')
    .digest('hex')

  await database.db.insert(portalLegalDocuments).values([
    {
      bodyText: 'Legal document text for customer access.',
      documentType: 'terms',
      sourceByteSize: 64,
      sourceContentType: 'text/plain',
      sourceFileName: 'terms.txt',
      sourceSha256,
      tenantId,
      title: 'Пользовательское соглашение',
      version: 'terms-v1',
    },
    {
      bodyText: 'Legal document text for customer access.',
      documentType: 'privacy',
      sourceByteSize: 64,
      sourceContentType: 'text/plain',
      sourceFileName: 'privacy.txt',
      sourceSha256,
      tenantId,
      title: 'Политика обработки персональных данных',
      version: 'privacy-v1',
    },
  ])

  await database.db.insert(portalLegalAcceptances).values({
    acceptedAt: fixedNow,
    email: normalizeEmail(email),
    personalDataConsentAccepted: true,
    portalUserId,
    privacyPolicyVersion: 'privacy-v1',
    purpose: 'customer_access',
    requestIp: '203.0.113.10',
    tenantId,
    termsAccepted: true,
    termsVersion: 'terms-v1',
    userAgent: 'Vitest',
  })
}

async function seedSession({
  database,
  emailProofExpiresAt,
  tenantId,
  userId,
}: {
  database: DatabaseClient
  emailProofExpiresAt: Date
  tenantId: number
  userId: number
}) {
  const sessionToken = `stale-proof-session-${userId}`

  await database.db.insert(portalSessions).values({
    emailProofExpiresAt,
    expiresAt: new Date(fixedNow.getTime() + 60 * 60_000),
    lastSeenAt: fixedNow,
    tenantId,
    tokenHash: createHash('sha256').update(sessionToken).digest('hex'),
    userId,
  })

  return sessionToken
}

describe('password setup email proof integration', () => {
  let app: ReturnType<typeof buildApp>
  let database: DatabaseClient
  let sendEmail: ReturnType<
    typeof vi.fn<(message: EmailMessage) => Promise<void>>
  >
  let tenantId: number

  beforeEach(async () => {
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
      now: () => fixedNow,
    })
    await app.ready()
  })

  afterEach(async () => {
    if (app) {
      await app.close()
    }
  })

  it('uses a fresh email-code login proof to open first-password setup without another code email', async () => {
    const user = await seedPasswordlessUser({
      database,
      email: 'fresh-proof@company.ru',
      tenantId,
    })
    await seedCurrentLegalAcceptance({
      database,
      email: 'fresh-proof@company.ru',
      portalUserId: user.id,
      tenantId,
    })

    const loginRequest = await app.inject({
      headers: { origin: testEnv.APP_ORIGIN },
      method: 'POST',
      payload: { email: 'fresh-proof@company.ru' },
      url: '/api/auth/code-login/request',
    })
    expect(loginRequest.statusCode).toBe(200)
    await waitForMockCall(sendEmail, 1)

    const loginCode = extractCode(sendEmail.mock.calls[0]?.[0].text ?? '')
    const loginVerify = await app.inject({
      headers: { origin: testEnv.APP_ORIGIN },
      method: 'POST',
      payload: {
        code: loginCode,
        email: 'fresh-proof@company.ru',
      },
      url: '/api/auth/code-login/verify',
    })
    expect(loginVerify.statusCode).toBe(200)

    const sessionCookie = loginVerify.cookies.find(
      (cookie) => cookie.name === testEnv.SESSION_COOKIE_NAME,
    )
    const cookieHeader = `${testEnv.SESSION_COOKIE_NAME}=${
      sessionCookie?.value ?? ''
    }`
    const setupRequest = await app.inject({
      headers: {
        cookie: cookieHeader,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {},
      url: '/api/auth/password-setup/request',
    })

    expect(setupRequest.statusCode).toBe(200)
    expect(setupRequest.json()).toEqual({
      continuationExpiresInSeconds: 900,
      continuationToken: expect.any(String),
      email: 'fresh-proof@company.ru',
      nextStep: 'set_password',
      purpose: 'password_setup',
      result: 'password_setup_verified',
    })
    expect(sendEmail).toHaveBeenCalledTimes(1)

    const setResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        continuationToken: setupRequest.json().continuationToken,
        newPassword: 'PortalPass123',
      },
      url: '/api/auth/password-setup/set',
    })

    expect(setResponse.statusCode).toBe(200)
    expect(setResponse.json()).toMatchObject({
      nextStep: 'chat',
      purpose: 'password_setup',
      result: 'password_setup_completed',
      user: {
        id: user.id,
        passwordConfigured: true,
      },
    })
  })

  it('falls back to an email-code setup challenge when the email proof is stale', async () => {
    const user = await seedPasswordlessUser({
      database,
      email: 'stale-proof@company.ru',
      tenantId,
    })
    const sessionToken = await seedSession({
      database,
      emailProofExpiresAt: new Date(fixedNow.getTime() - 1),
      tenantId,
      userId: user.id,
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

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      email: 'stale-proof@company.ru',
      expiresInSeconds: 900,
      nextStep: 'verify_code',
      purpose: 'password_setup',
      resendAvailableInSeconds: 60,
      result: 'password_setup_requested',
    })
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringMatching(/\b\d{6}\b/),
        to: 'stale-proof@company.ru',
      }),
    )
  })
})
