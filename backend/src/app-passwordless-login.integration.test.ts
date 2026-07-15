import { createHash } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from './app.js'
import type { DatabaseClient } from './db/client.js'
import {
  portalLegalAcceptances,
  portalLegalDocuments,
  portalSessions,
  portalTenants,
  portalUserContactLinks,
  portalUsers,
} from './db/schema.js'
import type { EmailMessage } from './integrations/email/smtp.js'
import { normalizeEmail } from './lib/email.js'
import { hashPassword } from './lib/password.js'
import {
  decodeTenantSecretKey,
  encryptTenantSecret,
} from './modules/tenants/secrets.js'
import { seedDefaultTenant, testEnv } from './test/appTestHelpers.js'
import {
  createChatwootFetchWithContacts,
  createDeferred,
  createWrongCode,
  extractLatestCode,
  type ChatwootTestContact,
  waitForMockCall,
} from './test/passwordlessLoginTestHelpers.js'
import { createTestDatabase } from './test/testDatabase.js'

const fixedNow = new Date('2026-04-21T12:00:00.000Z')

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
  isActive = true,
  passwordHash,
  tenantId,
}: {
  database: DatabaseClient
  email: string
  isActive?: boolean
  passwordHash: string | null
  tenantId: number
}) {
  const [user] = await database.db
    .insert(portalUsers)
    .values({
      email: normalizeEmail(email),
      fullName: 'Portal User',
      isActive,
      passwordHash,
      tenantId,
    })
    .returning({ id: portalUsers.id })

  if (!user) {
    throw new Error('Failed to seed portal user.')
  }

  return user.id
}

async function seedActiveLegalDocuments({
  database,
  tenantId,
}: {
  database: DatabaseClient
  tenantId: number
}) {
  const baseInput = {
    bodyText: 'Legal document text for customer access.',
    sourceByteSize: 64,
    sourceContentType: 'text/plain',
    sourceSha256: createHash('sha256').update('legal-doc').digest('hex'),
    tenantId,
  }

  await database.db.insert(portalLegalDocuments).values([
    {
      ...baseInput,
      documentType: 'terms',
      sourceFileName: 'terms.txt',
      title: 'Пользовательское соглашение',
      version: 'terms-v1',
    },
    {
      ...baseInput,
      documentType: 'privacy',
      sourceFileName: 'privacy.txt',
      title: 'Политика обработки персональных данных',
      version: 'privacy-v1',
    },
  ])
}

async function seedCustomerAccessAcceptance({
  database,
  email,
  portalUserId,
  privacyPolicyVersion = 'privacy-v1',
  tenantId,
  termsVersion = 'terms-v1',
}: {
  database: DatabaseClient
  email: string
  portalUserId: number
  privacyPolicyVersion?: string
  tenantId: number
  termsVersion?: string
}) {
  await database.db.insert(portalLegalAcceptances).values({
    acceptedAt: fixedNow,
    email: normalizeEmail(email),
    personalDataConsentAccepted: true,
    portalUserId,
    privacyPolicyVersion,
    purpose: 'customer_access',
    requestIp: '203.0.113.10',
    tenantId,
    termsAccepted: true,
    termsVersion,
    userAgent: 'Vitest',
  })
}

describe('passwordless code login app integration', () => {
  let app: ReturnType<typeof buildApp>
  let database: DatabaseClient
  let sendEmail: ReturnType<
    typeof vi.fn<(message: EmailMessage) => Promise<void>>
  >
  let chatwootFetch: ReturnType<typeof createChatwootFetchWithContacts>
  let chatwootContacts: ChatwootTestContact[]
  let tenantId: number
  let currentNow: Date

  beforeEach(async () => {
    currentNow = fixedNow
    chatwootContacts = []
    database = await createTestDatabase()
    tenantId = await seedDefaultTenant(database)
    sendEmail = vi
      .fn<(message: EmailMessage) => Promise<void>>()
      .mockResolvedValue(undefined)
    chatwootFetch = createChatwootFetchWithContacts(() => chatwootContacts)
    app = buildApp({
      chatwootFetchFn: chatwootFetch,
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
    await seedActiveLegalDocuments({ database, tenantId })
    await seedCustomerAccessAcceptance({
      database,
      email: 'Passwordless@Company.RU',
      portalUserId: userId,
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
    const userId = await seedPortalUser({
      database,
      email: 'Configured@Company.RU',
      passwordHash: await hashPassword('Secret123'),
      tenantId,
    })
    await seedActiveLegalDocuments({ database, tenantId })
    await seedCustomerAccessAcceptance({
      database,
      email: 'Configured@Company.RU',
      portalUserId: userId,
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

  it('requires current legal acceptance before issuing a session to an existing user', async () => {
    const userId = await seedPortalUser({
      database,
      email: 'StaleLegal@Company.RU',
      passwordHash: null,
      tenantId,
    })
    await seedActiveLegalDocuments({ database, tenantId })
    await seedCustomerAccessAcceptance({
      database,
      email: 'StaleLegal@Company.RU',
      portalUserId: userId,
      privacyPolicyVersion: 'privacy-old',
      tenantId,
      termsVersion: 'terms-old',
    })

    await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'stalelegal@company.ru',
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
        email: 'stalelegal@company.ru',
      },
      url: '/api/auth/code-login/verify',
    })

    expect(verifyResponse.statusCode).toBe(200)
    expect(verifyResponse.json()).toEqual({
      continuationExpiresInSeconds: 900,
      continuationToken: expect.any(String),
      email: 'stalelegal@company.ru',
      nextStep: 'accept_legal',
      purpose: 'passwordless_login',
      result: 'legal_acceptance_required',
    })
    expect(verifyResponse.cookies).toHaveLength(0)

    const [session] = await database.db
      .select({ id: portalSessions.id })
      .from(portalSessions)
      .where(eq(portalSessions.tenantId, tenantId))
    expect(session).toBeUndefined()
  })

  it('does not let stale failed delivery cleanup invalidate a newer login code', async () => {
    const firstDelivery = createDeferred<void>()
    sendEmail.mockReset()
    sendEmail
      .mockImplementationOnce(() => firstDelivery.promise)
      .mockResolvedValueOnce(undefined)

    const userId = await seedPortalUser({
      database,
      email: 'passwordless@company.ru',
      passwordHash: null,
      tenantId,
    })
    await seedActiveLegalDocuments({ database, tenantId })
    await seedCustomerAccessAcceptance({
      database,
      email: 'passwordless@company.ru',
      portalUserId: userId,
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

  it('requires legal acceptance after code verification for an eligible Chatwoot contact without portal user', async () => {
    chatwootContacts = [
      {
        email: 'FirstAccess@Company.RU',
        id: 77,
        name: 'First Access',
      },
    ]

    const requestResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'firstaccess@company.ru',
      },
      url: '/api/auth/code-login/request',
    })

    expect(requestResponse.statusCode).toBe(200)
    await waitForMockCall(sendEmail, 1)

    const verifyResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code: extractLatestCode(sendEmail),
        email: 'firstaccess@company.ru',
      },
      url: '/api/auth/code-login/verify',
    })

    expect(verifyResponse.statusCode).toBe(200)
    expect(verifyResponse.json()).toEqual({
      continuationExpiresInSeconds: 900,
      continuationToken: expect.any(String),
      email: 'firstaccess@company.ru',
      nextStep: 'accept_legal',
      purpose: 'passwordless_login',
      result: 'legal_acceptance_required',
    })
    expect(verifyResponse.cookies).toHaveLength(0)

    const [createdUser] = await database.db
      .select({ id: portalUsers.id })
      .from(portalUsers)
      .where(eq(portalUsers.email, 'firstaccess@company.ru'))
    expect(createdUser).toBeUndefined()
  })

  it('does not look up Chatwoot again while a first-access code is in resend cooldown', async () => {
    chatwootContacts = [
      {
        email: 'Cooldown@Company.RU',
        id: 771,
        name: 'Cooldown Contact',
      },
    ]

    const firstResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'cooldown@company.ru',
      },
      url: '/api/auth/code-login/request',
    })
    expect(firstResponse.statusCode).toBe(200)
    await waitForMockCall(sendEmail, 1)
    expect(chatwootFetch).toHaveBeenCalledTimes(1)

    const secondResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'cooldown@company.ru',
      },
      url: '/api/auth/code-login/request',
    })

    expect(secondResponse.statusCode).toBe(200)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(chatwootFetch).toHaveBeenCalledTimes(1)
  })

  it('does not provision or email an inactive portal user through first access', async () => {
    await seedPortalUser({
      database,
      email: 'Disabled@Company.RU',
      isActive: false,
      passwordHash: null,
      tenantId,
    })
    chatwootContacts = [
      {
        email: 'Disabled@Company.RU',
        id: 772,
        name: 'Disabled Contact',
      },
    ]

    const requestResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'disabled@company.ru',
      },
      url: '/api/auth/code-login/request',
    })

    expect(requestResponse.statusCode).toBe(200)
    expect(requestResponse.json()).toMatchObject({
      accepted: true,
      email: 'disabled@company.ru',
      nextStep: 'verify_code',
      purpose: 'passwordless_login',
      result: 'passwordless_login_requested',
    })
    expect(chatwootFetch).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()

    const users = await database.db
      .select({ id: portalUsers.id })
      .from(portalUsers)
      .where(eq(portalUsers.email, 'disabled@company.ru'))
    expect(users).toHaveLength(1)
  })

  it('accepts legal continuation and creates a passwordless portal user session for a Chatwoot contact', async () => {
    await seedActiveLegalDocuments({ database, tenantId })
    chatwootContacts = [
      {
        customAttributes: {
          portal_enabled: true,
        },
        email: 'FirstAccess@Company.RU',
        id: 77,
        name: 'First Access',
      },
    ]

    await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'firstaccess@company.ru',
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
        email: 'firstaccess@company.ru',
      },
      url: '/api/auth/code-login/verify',
    })
    const continuationToken = verifyResponse.json().continuationToken

    const legalResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
        'user-agent': 'Vitest Browser',
      },
      method: 'POST',
      payload: {
        continuationToken,
        email: 'firstaccess@company.ru',
        personalDataConsentAccepted: true,
        termsAccepted: true,
      },
      url: '/api/auth/code-login/accept-legal',
    })

    expect(legalResponse.statusCode).toBe(200)
    expect(legalResponse.json()).toEqual({
      nextStep: 'chat',
      purpose: 'passwordless_login',
      result: 'passwordless_login_completed',
      session: {
        expiresAt: '2026-05-21T12:00:00.000Z',
      },
      user: {
        email: 'firstaccess@company.ru',
        fullName: 'First Access',
        id: expect.any(Number),
        passwordConfigured: false,
      },
    })
    const sessionCookie = legalResponse.cookies.find(
      (cookie) => cookie.name === testEnv.SESSION_COOKIE_NAME,
    )

    expect(sessionCookie).toBeDefined()

    const [createdUser] = await database.db
      .select({
        id: portalUsers.id,
        passwordHash: portalUsers.passwordHash,
      })
      .from(portalUsers)
      .where(eq(portalUsers.email, 'firstaccess@company.ru'))
    expect(createdUser).toEqual({
      id: legalResponse.json().user.id,
      passwordHash: null,
    })

    const [contactLink] = await database.db
      .select({
        chatwootContactId: portalUserContactLinks.chatwootContactId,
        userId: portalUserContactLinks.userId,
      })
      .from(portalUserContactLinks)
      .where(eq(portalUserContactLinks.tenantId, tenantId))
    expect(contactLink).toEqual({
      chatwootContactId: 77,
      userId: legalResponse.json().user.id,
    })

    const [legalAcceptance] = await database.db
      .select({
        email: portalLegalAcceptances.email,
        personalDataConsentAccepted:
          portalLegalAcceptances.personalDataConsentAccepted,
        portalUserId: portalLegalAcceptances.portalUserId,
        privacyPolicyVersion: portalLegalAcceptances.privacyPolicyVersion,
        purpose: portalLegalAcceptances.purpose,
        termsAccepted: portalLegalAcceptances.termsAccepted,
        termsVersion: portalLegalAcceptances.termsVersion,
      })
      .from(portalLegalAcceptances)
      .where(eq(portalLegalAcceptances.tenantId, tenantId))

    expect(legalAcceptance).toEqual({
      email: 'firstaccess@company.ru',
      personalDataConsentAccepted: true,
      portalUserId: legalResponse.json().user.id,
      privacyPolicyVersion: 'privacy-v1',
      purpose: 'customer_access',
      termsAccepted: true,
      termsVersion: 'terms-v1',
    })

    const cookieHeader = `${testEnv.SESSION_COOKIE_NAME}=${
      sessionCookie?.value ?? ''
    }`
    const threadsResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
      },
      method: 'GET',
      url: '/api/chat/threads',
    })

    expect(threadsResponse.statusCode).toBe(200)
    expect(threadsResponse.json()).toMatchObject({
      activeThreadId: 'private:me',
      threads: [
        {
          id: 'private:me',
          type: 'private',
        },
      ],
    })

    const messagesResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
      },
      method: 'GET',
      url: '/api/chat/messages?threadId=private%3Ame',
    })

    expect(messagesResponse.statusCode).toBe(200)
    expect(messagesResponse.json()).toMatchObject({
      activeThread: {
        id: 'private:me',
        type: 'private',
      },
      reason: 'conversation_missing',
      result: 'not_ready',
    })

    const reusedResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        continuationToken,
        email: 'firstaccess@company.ru',
        personalDataConsentAccepted: true,
        termsAccepted: true,
      },
      url: '/api/auth/code-login/accept-legal',
    })
    expect(reusedResponse.statusCode).toBe(409)
  })

  it('does not create a first-access portal user when legal documents are missing', async () => {
    chatwootContacts = [
      {
        email: 'MissingDocs@Company.RU',
        id: 88,
        name: 'Missing Docs',
      },
    ]

    await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'missingdocs@company.ru',
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
        email: 'missingdocs@company.ru',
      },
      url: '/api/auth/code-login/verify',
    })

    const legalResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        continuationToken: verifyResponse.json().continuationToken,
        email: 'missingdocs@company.ru',
        personalDataConsentAccepted: true,
        termsAccepted: true,
      },
      url: '/api/auth/code-login/accept-legal',
    })

    expect(legalResponse.statusCode).toBe(503)
    expect(legalResponse.json()).toMatchObject({
      error: {
        code: 'LEGAL_DOCUMENTS_NOT_CONFIGURED',
      },
    })

    const [createdUser] = await database.db
      .select({ id: portalUsers.id })
      .from(portalUsers)
      .where(eq(portalUsers.email, 'missingdocs@company.ru'))
    expect(createdUser).toBeUndefined()

    const [contactLink] = await database.db
      .select({ id: portalUserContactLinks.id })
      .from(portalUserContactLinks)
      .where(
        and(
          eq(portalUserContactLinks.tenantId, tenantId),
          eq(portalUserContactLinks.chatwootContactId, 88),
        ),
      )
    expect(contactLink).toBeUndefined()

    const [session] = await database.db
      .select({ id: portalSessions.id })
      .from(portalSessions)
      .where(eq(portalSessions.tenantId, tenantId))
    expect(session).toBeUndefined()
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
    const userId = await seedPortalUser({
      database,
      email: 'TenantA@Company.RU',
      passwordHash: null,
      tenantId,
    })
    await seedActiveLegalDocuments({ database, tenantId })
    await seedCustomerAccessAcceptance({
      database,
      email: 'TenantA@Company.RU',
      portalUserId: userId,
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
