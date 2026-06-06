import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from './app.js'
import type { DatabaseClient } from './db/client.js'
import { portalTenants } from './db/schema.js'
import type { EmailMessage } from './integrations/email/smtp.js'
import {
  decodeTenantSecretKey,
  encryptTenantSecret,
} from './modules/tenants/secrets.js'
import { seedDefaultTenant, testEnv } from './test/appTestHelpers.js'
import { createTestDatabase } from './test/testDatabase.js'

const fixedNow = new Date('2026-06-06T12:00:00.000Z')

function extractCode(message: EmailMessage | undefined) {
  const code = message?.text.match(/\b\d{6}\b/)?.[0]

  if (!code) {
    throw new Error('Expected email message to contain a six digit code.')
  }

  return code
}

function createAgentsFetch(getRole: () => 'administrator' | 'agent') {
  return vi.fn<typeof fetch>(async (requestUrl) => {
    const url = new URL(String(requestUrl))
    const role = getRole()

    if (url.pathname === '/api/v1/accounts/1/agents') {
      return new Response(
        JSON.stringify([
          {
            account_id: 1,
            confirmed: true,
            email:
              role === 'administrator'
                ? 'admin@example.test'
                : 'agent@example.test',
            id: role === 'administrator' ? 11 : 12,
            role,
          },
        ]),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      )
    }

    return new Response(JSON.stringify({ error: 'unexpected path' }), {
      status: 404,
    })
  })
}

function getTestTenantSecretKey() {
  if (!testEnv.PORTAL_TENANT_SECRET_KEY) {
    throw new Error('PORTAL_TENANT_SECRET_KEY is required for this test.')
  }

  return testEnv.PORTAL_TENANT_SECRET_KEY
}

async function storeAdminVerificationToken({
  database,
  tenantId,
}: {
  database: DatabaseClient
  tenantId: number
}) {
  const key = decodeTenantSecretKey(getTestTenantSecretKey())

  await database.db
    .update(portalTenants)
    .set({
      chatwootAdminVerificationTokenCiphertext: encryptTenantSecret(
        'test-admin-verification-token',
        key,
      ),
    })
    .where(eq(portalTenants.id, tenantId))
}

async function seedSecondTenant(database: DatabaseClient) {
  const key = decodeTenantSecretKey(getTestTenantSecretKey())

  const [tenant] = await database.db
    .insert(portalTenants)
    .values({
      chatwootAccountId: 2,
      chatwootAdminVerificationTokenCiphertext: encryptTenantSecret(
        'tenant-b-admin-verification-token',
        key,
      ),
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

describe('buildApp tenant admin auth integration', () => {
  let app: ReturnType<typeof buildApp>
  let database: DatabaseClient
  let role: 'administrator' | 'agent'
  let sentEmails: EmailMessage[]
  let tenantId: number

  beforeEach(async () => {
    database = await createTestDatabase()
    tenantId = await seedDefaultTenant(database)
    await storeAdminVerificationToken({ database, tenantId })
    role = 'administrator'
    sentEmails = []
    app = buildApp({
      chatwootFetchFn: createAgentsFetch(() => role),
      database,
      emailDelivery: {
        send: vi.fn(async (message: EmailMessage) => {
          sentEmails.push(message)
        }),
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

  it('requests an admin code, verifies it, resolves current admin, and logs out without customer session', async () => {
    const requestResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'admin@example.test',
      },
      url: '/api/admin/auth/request',
    })

    expect(requestResponse.statusCode).toBe(200)
    expect(requestResponse.json()).toMatchObject({
      delivery: 'sent',
      email: 'admin@example.test',
      nextStep: 'verify_code',
      purpose: 'tenant_admin_login',
      result: 'admin_login_challenge_requested',
    })
    expect(sentEmails).toHaveLength(1)

    const verifyResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code: extractCode(sentEmails[0]),
        email: 'admin@example.test',
      },
      url: '/api/admin/auth/verify',
    })

    expect(verifyResponse.statusCode).toBe(200)
    expect(verifyResponse.json()).toEqual({
      admin: {
        chatwootAgentId: 11,
        email: 'admin@example.test',
        role: 'administrator',
      },
      session: {
        expiresAt: '2026-06-07T00:00:00.000Z',
      },
    })

    const adminCookie = verifyResponse.cookies.find(
      (cookie) => cookie.name === testEnv.ADMIN_SESSION_COOKIE_NAME,
    )

    expect(adminCookie).toBeDefined()
    expect(adminCookie?.httpOnly).toBe(true)
    expect(
      verifyResponse.cookies.find(
        (cookie) => cookie.name === testEnv.SESSION_COOKIE_NAME,
      ),
    ).toBeUndefined()

    const cookieHeader = `${testEnv.ADMIN_SESSION_COOKIE_NAME}=${
      adminCookie?.value ?? ''
    }`
    const meResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
      },
      method: 'GET',
      url: '/api/admin/auth/me',
    })

    expect(meResponse.statusCode).toBe(200)
    expect(meResponse.json()).toEqual({
      admin: {
        chatwootAgentId: 11,
        email: 'admin@example.test',
        role: 'administrator',
      },
      session: {
        expiresAt: '2026-06-07T00:00:00.000Z',
      },
    })

    const logoutResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      url: '/api/admin/auth/logout',
    })

    expect(logoutResponse.statusCode).toBe(204)

    const meAfterLogoutResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
      },
      method: 'GET',
      url: '/api/admin/auth/me',
    })

    expect(meAfterLogoutResponse.statusCode).toBe(401)
    expect(meAfterLogoutResponse.json()).toEqual({
      error: {
        code: 'TENANT_ADMIN_UNAUTHORIZED',
        message: 'Требуется вход администратора.',
      },
    })
  })

  it('rejects an agent email and does not send a code', async () => {
    role = 'agent'

    const response = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'agent@example.test',
      },
      url: '/api/admin/auth/request',
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: {
        code: 'TENANT_ADMIN_NOT_ELIGIBLE',
        message: 'Нет прав администратора для этого портала.',
      },
    })
    expect(sentEmails).toHaveLength(0)
  })

  it('does not resolve a tenant A admin cookie on tenant B host', async () => {
    await seedSecondTenant(database)

    const requestResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'admin@example.test',
      },
      url: '/api/admin/auth/request',
    })

    expect(requestResponse.statusCode).toBe(200)

    const verifyResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        code: extractCode(sentEmails[0]),
        email: 'admin@example.test',
      },
      url: '/api/admin/auth/verify',
    })
    const adminCookie = verifyResponse.cookies.find(
      (cookie) => cookie.name === testEnv.ADMIN_SESSION_COOKIE_NAME,
    )

    const meOnTenantBResponse = await app.inject({
      headers: {
        cookie: `${testEnv.ADMIN_SESSION_COOKIE_NAME}=${
          adminCookie?.value ?? ''
        }`,
        host: 'tenant-b.example.test',
      },
      method: 'GET',
      url: '/api/admin/auth/me',
    })

    expect(meOnTenantBResponse.statusCode).toBe(401)
  })
})
