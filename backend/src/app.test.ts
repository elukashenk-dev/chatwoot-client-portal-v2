import { createHash } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'
import type { DatabaseClient } from './db/client.js'
import {
  portalSessions,
  portalUserContactLinks,
  portalUsers,
  verificationRecords,
} from './db/schema.js'
import { hashPassword } from './lib/password.js'
import {
  createMultipartAttachmentPayload,
  seedDefaultTenant,
  testEnv,
} from './test/appTestHelpers.js'
import { createTestDatabase } from './test/testDatabase.js'

async function waitForBackgroundTasks() {
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
  await Promise.resolve()
}

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000)
}

describe('buildApp', () => {
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

  it('returns a health payload', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      app: 'chatwoot-client-portal-v2',
      environment: 'test',
      status: 'ok',
    })
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

    const cookieHeader = `${testEnv.SESSION_COOKIE_NAME}=${sessionCookie?.value ?? ''}`

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

  it('returns controlled chat read states for an authenticated user without a Chatwoot contact link', async () => {
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

    const contextResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
      },
      method: 'GET',
      url: '/api/chat/context',
    })
    const messagesResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
      },
      method: 'GET',
      url: '/api/chat/messages?threadId=private%3Ame',
    })

    expect(contextResponse.statusCode).toBe(200)
    expect(contextResponse.json()).toEqual({
      activeThread: null,
      linkedContact: null,
      reason: 'chatwoot_unavailable',
      result: 'unavailable',
    })
    expect(messagesResponse.statusCode).toBe(200)
    expect(messagesResponse.json()).toEqual({
      hasMoreOlder: false,
      activeThread: null,
      linkedContact: null,
      messages: [],
      nextOlderCursor: null,
      reason: 'chatwoot_unavailable',
      result: 'unavailable',
    })
  })

  it('returns a controlled send state for an authenticated user without a Chatwoot contact link', async () => {
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

    const response = await app.inject({
      headers: {
        cookie: cookieHeader,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        clientMessageKey: 'portal-send:test-key',
        content: 'Здравствуйте',
        replyToMessageId: 10,
        threadId: 'private:me',
      },
      url: '/api/chat/messages',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      activeThread: null,
      linkedContact: null,
      reason: 'chatwoot_unavailable',
      result: 'unavailable',
      sentMessage: null,
    })
  })

  it('returns a controlled attachment send state for an authenticated user without a Chatwoot contact link', async () => {
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
    const multipart = createMultipartAttachmentPayload({
      clientMessageKey: 'portal-send:attachment-key',
      content: 'Подпись к файлу',
      fileContent: Buffer.from('%PDF-1.7\n'),
      fileName: 'invoice.pdf',
      mimeType: 'application/pdf',
      replyToMessageId: 10,
      threadId: 'private:me',
    })

    const response = await app.inject({
      headers: {
        'content-type': multipart.contentType,
        cookie: cookieHeader,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: multipart.payload,
      url: '/api/chat/messages/attachment',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      activeThread: null,
      linkedContact: null,
      reason: 'chatwoot_unavailable',
      result: 'unavailable',
      sentMessage: null,
    })
  })

  it('rejects legacy public primaryConversationId selectors', async () => {
    await database.db.insert(portalUsers).values({
      email: 'legacy-selector@company.ru',
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
        email: 'legacy-selector@company.ru',
        password: 'Secret123',
      },
      url: '/api/auth/login',
    })
    const sessionCookie = loginResponse.cookies.find(
      (cookie) => cookie.name === testEnv.SESSION_COOKIE_NAME,
    )
    const cookieHeader = `${testEnv.SESSION_COOKIE_NAME}=${sessionCookie?.value ?? ''}`

    const contextResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
      },
      method: 'GET',
      url: '/api/chat/context?primaryConversationId=101',
    })
    const messagesResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
      },
      method: 'GET',
      url: '/api/chat/messages?primaryConversationId=101',
    })
    const sendResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        clientMessageKey: 'portal-send:legacy-key',
        content: 'Здравствуйте',
        primaryConversationId: 101,
        threadId: 'private:me',
      },
      url: '/api/chat/messages',
    })
    const realtimeResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
      },
      method: 'GET',
      url: '/api/chat/realtime?primaryConversationId=101',
    })

    for (const response of [
      contextResponse,
      messagesResponse,
      sendResponse,
      realtimeResponse,
    ]) {
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({
        error: {
          code: 'INVALID_REQUEST',
        },
      })
    }
  })

  it('accepts attachment requests larger than Fastify default body limit', async () => {
    await database.db.insert(portalUsers).values({
      email: 'large-file@company.ru',
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
        email: 'large-file@company.ru',
        password: 'Secret123',
      },
      url: '/api/auth/login',
    })
    const sessionCookie = loginResponse.cookies.find(
      (cookie) => cookie.name === testEnv.SESSION_COOKIE_NAME,
    )
    const cookieHeader = `${testEnv.SESSION_COOKIE_NAME}=${sessionCookie?.value ?? ''}`
    const multipart = createMultipartAttachmentPayload({
      clientMessageKey: 'portal-send:large-attachment-key',
      fileContent: Buffer.alloc(1024 * 1024 + 64 * 1024, 0x25),
      fileName: 'large-invoice.pdf',
      mimeType: 'application/pdf',
      threadId: 'private:me',
    })

    const response = await app.inject({
      headers: {
        'content-type': multipart.contentType,
        cookie: cookieHeader,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: multipart.payload,
      url: '/api/chat/messages/attachment',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      reason: 'chatwoot_unavailable',
      result: 'unavailable',
      sentMessage: null,
    })
  })

  it('rejects oversized attachment multipart fields before chat send', async () => {
    await database.db.insert(portalUsers).values({
      email: 'large-caption@company.ru',
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
        email: 'large-caption@company.ru',
        password: 'Secret123',
      },
      url: '/api/auth/login',
    })
    const sessionCookie = loginResponse.cookies.find(
      (cookie) => cookie.name === testEnv.SESSION_COOKIE_NAME,
    )
    const cookieHeader = `${testEnv.SESSION_COOKIE_NAME}=${sessionCookie?.value ?? ''}`
    const multipart = createMultipartAttachmentPayload({
      clientMessageKey: 'portal-send:large-caption-key',
      content: 'x'.repeat(17_000),
      fileContent: Buffer.from('%PDF-1.7\n'),
      fileName: 'invoice.pdf',
      mimeType: 'application/pdf',
      threadId: 'private:me',
    })

    const response = await app.inject({
      headers: {
        'content-type': multipart.contentType,
        cookie: cookieHeader,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: multipart.payload,
      url: '/api/chat/messages/attachment',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: {
        code: 'attachment_field_too_large',
        message: 'Поле вложения слишком длинное.',
      },
    })
  })

  it('returns unauthorized for a tampered session cookie', async () => {
    const response = await app.inject({
      headers: {
        cookie: `${testEnv.SESSION_COOKIE_NAME}=not-a-valid-signed-cookie`,
      },
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Требуется вход.',
      },
    })
  })

  it('allows logout without an existing session', async () => {
    const response = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      url: '/api/auth/logout',
    })

    expect(response.statusCode).toBe(204)
  })

  it('rejects inactive portal users during login', async () => {
    await database.db.insert(portalUsers).values({
      email: 'inactive@company.ru',
      isActive: false,
      passwordHash: await hashPassword('Secret123'),
      tenantId,
    })

    const response = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'inactive@company.ru',
        password: 'Secret123',
      },
      url: '/api/auth/login',
    })

    expect(response.statusCode).toBe(401)
    expect(response.cookies).toHaveLength(0)
    expect(response.json()).toEqual({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Неверный email или пароль.',
      },
    })
  })

  it('rejects an otherwise valid session after the stored session expires', async () => {
    await database.db.insert(portalUsers).values({
      email: 'name@company.ru',
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

    await database.db.update(portalSessions).set({
      expiresAt: new Date(Date.now() - 1000),
    })

    const response = await app.inject({
      headers: {
        cookie: cookieHeader,
      },
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Требуется вход.',
      },
    })
  })

  it('rejects invalid credentials without creating a session', async () => {
    await database.db.insert(portalUsers).values({
      email: 'name@company.ru',
      passwordHash: await hashPassword('Secret123'),
      tenantId,
    })

    const response = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'name@company.ru',
        password: 'WrongSecret',
      },
      url: '/api/auth/login',
    })

    expect(response.statusCode).toBe(401)
    expect(response.cookies).toHaveLength(0)
    expect(response.json()).toEqual({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Неверный email или пароль.',
      },
    })
  })

  it('rate limits repeated login attempts for the same tenant client', async () => {
    const responses = []
    for (let attempt = 0; attempt < 6; attempt += 1) {
      responses.push(
        await app.inject({
          headers: {
            origin: testEnv.APP_ORIGIN,
          },
          method: 'POST',
          payload: {
            email: 'missing@company.ru',
            password: 'WrongSecret',
          },
          url: '/api/auth/login',
        }),
      )
    }

    expect(responses.slice(0, 5).map((response) => response.statusCode)).toEqual([
      401, 401, 401, 401, 401,
    ])
    expect(responses[5]?.statusCode).toBe(429)
    expect(responses[5]?.headers['retry-after']).toBeDefined()
    expect(responses[5]?.json()).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Слишком много запросов. Попробуйте позже.',
      },
    })
  })

  it('rate limits repeated registration verification attempts', async () => {
    const responses = []
    for (let attempt = 0; attempt < 6; attempt += 1) {
      responses.push(
        await app.inject({
          headers: {
            origin: testEnv.APP_ORIGIN,
          },
          method: 'POST',
          payload: {
            code: '000000',
            email: 'missing@company.ru',
          },
          url: '/api/auth/register/verify',
        }),
      )
    }

    expect(responses.slice(0, 5).map((response) => response.statusCode)).toEqual(
      [409, 409, 409, 409, 409],
    )
    expect(responses[5]?.statusCode).toBe(429)
    expect(responses[5]?.json()).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Слишком много запросов. Попробуйте позже.',
      },
    })
  })

  it('rate limits repeated password reset requests', async () => {
    const responses = []
    for (let attempt = 0; attempt < 6; attempt += 1) {
      responses.push(
        await app.inject({
          headers: {
            origin: testEnv.APP_ORIGIN,
          },
          method: 'POST',
          payload: {
            email: 'missing@company.ru',
          },
          url: '/api/auth/password-reset/request',
        }),
      )
    }

    expect(responses.slice(0, 5).map((response) => response.statusCode)).toEqual(
      [200, 200, 200, 200, 200],
    )
    expect(responses[5]?.statusCode).toBe(429)
    expect(responses[5]?.json()).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Слишком много запросов. Попробуйте позже.',
      },
    })

    await waitForBackgroundTasks()
  })

  it('rejects mutating auth requests from an unexpected origin', async () => {
    const response = await app.inject({
      headers: {
        origin: 'http://127.0.0.1:9999',
      },
      method: 'POST',
      payload: {
        email: 'name@company.ru',
        password: 'Secret123',
      },
      url: '/api/auth/login',
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: {
        code: 'FORBIDDEN_ORIGIN',
        message: 'Недопустимый источник запроса.',
      },
    })
  })

  it('confirms a pending registration verification and returns a continuation token', async () => {
    await database.db.insert(verificationRecords).values({
      attemptsCount: 0,
      chatwootContactId: 44,
      codeHash: await hashPassword('123456'),
      email: 'name@company.ru',
      expiresAt: minutesFromNow(15),
      fullName: 'Portal User',
      lastSentAt: minutesFromNow(-1),
      maxAttempts: 5,
      purpose: 'registration',
      resendCount: 0,
      resendNotBefore: minutesFromNow(1),
      status: 'pending',
      tenantId,
    })

    const response = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code: '123456',
        email: 'name@company.ru',
      },
      url: '/api/auth/register/verify',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      continuationToken: expect.any(String),
      continuationExpiresInSeconds: 900,
      email: 'name@company.ru',
      nextStep: 'set_password',
      purpose: 'registration',
      result: 'verification_confirmed',
    })
  })

  it('completes registration set-password and creates a portal user', async () => {
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
      email: 'name@company.ru',
      nextStep: 'login',
      purpose: 'registration',
      result: 'registration_completed',
    })

    const loginResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'name@company.ru',
        password: 'PortalPass123',
      },
      url: '/api/auth/login',
    })

    expect(loginResponse.statusCode).toBe(200)

    const [contactLink] = await database.db
      .select({
        chatwootContactId: portalUserContactLinks.chatwootContactId,
      })
      .from(portalUserContactLinks)

    expect(contactLink).toEqual({
      chatwootContactId: 44,
    })
  })

  it('accepts password reset requests without disclosing account existence', async () => {
    await database.db.insert(portalUsers).values({
      email: 'name@company.ru',
      fullName: 'Portal User',
      passwordHash: await hashPassword('OldPass123'),
      tenantId,
    })

    const existingUserResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'name@company.ru',
      },
      url: '/api/auth/password-reset/request',
    })

    const missingUserResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'missing@company.ru',
      },
      url: '/api/auth/password-reset/request',
    })

    expect(existingUserResponse.statusCode).toBe(200)
    expect(missingUserResponse.statusCode).toBe(200)
    expect(existingUserResponse.json()).toMatchObject({
      accepted: true,
      nextStep: 'verify_code',
      purpose: 'password_reset',
      result: 'password_reset_requested',
    })
    expect(missingUserResponse.json()).toMatchObject({
      accepted: true,
      nextStep: 'verify_code',
      purpose: 'password_reset',
      result: 'password_reset_requested',
    })

    await waitForBackgroundTasks()
  })

  it('verifies password reset and accepts only the new password after completion', async () => {
    await database.db.insert(portalUsers).values({
      email: 'name@company.ru',
      fullName: 'Portal User',
      passwordHash: await hashPassword('OldPass123'),
      tenantId,
    })

    const preResetLoginResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'name@company.ru',
        password: 'OldPass123',
      },
      url: '/api/auth/login',
    })
    const preResetSessionCookie = preResetLoginResponse.cookies.find(
      (cookie) => cookie.name === testEnv.SESSION_COOKIE_NAME,
    )
    const preResetCookieHeader = `${testEnv.SESSION_COOKIE_NAME}=${preResetSessionCookie?.value ?? ''}`

    expect(preResetLoginResponse.statusCode).toBe(200)
    expect(preResetSessionCookie).toBeDefined()

    await database.db.insert(verificationRecords).values({
      attemptsCount: 0,
      codeHash: await hashPassword('123456'),
      email: 'name@company.ru',
      expiresAt: minutesFromNow(15),
      lastSentAt: minutesFromNow(-1),
      maxAttempts: 5,
      portalUserId: 1,
      purpose: 'password_reset',
      resendCount: 0,
      resendNotBefore: minutesFromNow(1),
      status: 'pending',
      tenantId,
    })

    const verifyResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code: '123456',
        email: 'name@company.ru',
      },
      url: '/api/auth/password-reset/verify',
    })

    expect(verifyResponse.statusCode).toBe(200)
    expect(verifyResponse.json()).toEqual({
      continuationToken: expect.any(String),
      continuationExpiresInSeconds: 900,
      email: 'name@company.ru',
      nextStep: 'set_password',
      purpose: 'password_reset',
      result: 'password_reset_verified',
    })

    const setPasswordResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        continuationToken: verifyResponse.json().continuationToken,
        email: 'name@company.ru',
        newPassword: 'NewPass123',
      },
      url: '/api/auth/password-reset/set-password',
    })

    expect(setPasswordResponse.statusCode).toBe(200)
    expect(setPasswordResponse.json()).toEqual({
      email: 'name@company.ru',
      nextStep: 'login',
      purpose: 'password_reset',
      result: 'password_reset_completed',
    })

    const oldSessionResponse = await app.inject({
      headers: {
        cookie: preResetCookieHeader,
      },
      method: 'GET',
      url: '/api/auth/me',
    })
    const remainingSessions = await database.db.select().from(portalSessions)

    expect(oldSessionResponse.statusCode).toBe(401)
    expect(remainingSessions).toHaveLength(0)

    const oldPasswordLoginResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'name@company.ru',
        password: 'OldPass123',
      },
      url: '/api/auth/login',
    })
    const newPasswordLoginResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'name@company.ru',
        password: 'NewPass123',
      },
      url: '/api/auth/login',
    })

    expect(oldPasswordLoginResponse.statusCode).toBe(401)
    expect(newPasswordLoginResponse.statusCode).toBe(200)
  })

  it('rejects weak passwords in password reset set-password route validation', async () => {
    await database.db.insert(portalUsers).values({
      email: 'name@company.ru',
      fullName: 'Portal User',
      passwordHash: await hashPassword('OldPass123'),
      tenantId,
    })

    const continuationToken = 'continuation-token-for-password-reset-completion'

    await database.db.insert(verificationRecords).values({
      attemptsCount: 0,
      codeHash: await hashPassword('123456'),
      continuationTokenExpiresAt: minutesFromNow(15),
      continuationTokenHash: createHash('sha256')
        .update(continuationToken)
        .digest('hex'),
      email: 'name@company.ru',
      expiresAt: minutesFromNow(15),
      lastSentAt: minutesFromNow(-1),
      maxAttempts: 5,
      portalUserId: 1,
      purpose: 'password_reset',
      resendCount: 0,
      resendNotBefore: minutesFromNow(1),
      status: 'verified',
      tenantId,
      verifiedAt: minutesFromNow(-1),
    })

    for (const { message, newPassword } of [
      {
        message: 'Пароль должен содержать букву',
        newPassword: '12345678',
      },
      {
        message: 'Пароль должен содержать цифру',
        newPassword: 'Password',
      },
    ]) {
      const response = await app.inject({
        headers: {
          origin: testEnv.APP_ORIGIN,
        },
        method: 'POST',
        payload: {
          continuationToken,
          email: 'name@company.ru',
          newPassword,
        },
        url: '/api/auth/password-reset/set-password',
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({
        error: {
          code: 'INVALID_REQUEST',
          message,
        },
      })
    }
  })
})
