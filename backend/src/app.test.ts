import { createHash } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'
import type { AppEnv } from './config/env.js'
import type { DatabaseClient } from './db/client.js'
import {
  portalSessions,
  portalUserContactLinks,
  portalUsers,
  verificationRecords,
} from './db/schema.js'
import { hashPassword } from './lib/password.js'
import { createTestDatabase } from './test/testDatabase.js'

const testEnv: AppEnv = {
  APP_ORIGIN: 'http://127.0.0.1:5173',
  CHATWOOT_ACCOUNT_ID: undefined,
  CHATWOOT_API_ACCESS_TOKEN: undefined,
  CHATWOOT_BASE_URL: undefined,
  CHATWOOT_PORTAL_INBOX_ID: undefined,
  DATABASE_URL:
    'postgres://test:test@127.0.0.1:5432/chatwoot_client_portal_v2_test',
  NODE_ENV: 'test',
  PORT: 3301,
  SESSION_COOKIE_NAME: 'portal_session',
  SESSION_SECRET: 'test-session-secret-with-at-least-thirty-two-characters',
  SESSION_TTL_DAYS: 14,
  SMTP_FROM: undefined,
  SMTP_HOST: undefined,
  SMTP_PASS: undefined,
  SMTP_PORT: 1025,
  SMTP_SECURE: false,
  SMTP_USER: undefined,
}

async function waitForBackgroundTasks() {
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
  await Promise.resolve()
}

describe('buildApp', () => {
  let app: ReturnType<typeof buildApp>
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
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
      url: '/api/chat/messages',
    })

    expect(contextResponse.statusCode).toBe(200)
    expect(contextResponse.json()).toEqual({
      linkedContact: null,
      primaryConversation: null,
      reason: 'contact_link_missing',
      result: 'not_ready',
    })
    expect(messagesResponse.statusCode).toBe(200)
    expect(messagesResponse.json()).toEqual({
      hasMoreOlder: false,
      linkedContact: null,
      messages: [],
      nextOlderCursor: null,
      primaryConversation: null,
      reason: 'contact_link_missing',
      result: 'not_ready',
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
      expiresAt: new Date('2026-04-21T13:00:00.000Z'),
      fullName: 'Portal User',
      lastSentAt: new Date('2026-04-21T12:00:00.000Z'),
      maxAttempts: 5,
      purpose: 'registration',
      resendCount: 0,
      resendNotBefore: new Date('2026-04-21T12:01:00.000Z'),
      status: 'pending',
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
      continuationTokenExpiresAt: new Date('2026-04-21T13:00:00.000Z'),
      continuationTokenHash: createHash('sha256')
        .update('continuation-token-for-registration-completion')
        .digest('hex'),
      email: 'name@company.ru',
      expiresAt: new Date('2026-04-21T13:00:00.000Z'),
      fullName: 'Portal User',
      lastSentAt: new Date('2026-04-21T12:00:00.000Z'),
      maxAttempts: 5,
      purpose: 'registration',
      resendCount: 0,
      resendNotBefore: new Date('2026-04-21T12:01:00.000Z'),
      status: 'verified',
      verifiedAt: new Date('2026-04-21T12:10:00.000Z'),
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
      expiresAt: new Date('2026-04-21T13:00:00.000Z'),
      lastSentAt: new Date('2026-04-21T12:00:00.000Z'),
      maxAttempts: 5,
      portalUserId: 1,
      purpose: 'password_reset',
      resendCount: 0,
      resendNotBefore: new Date('2026-04-21T12:01:00.000Z'),
      status: 'pending',
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
})
