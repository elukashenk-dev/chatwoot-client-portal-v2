import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from './app.js'
import type { DatabaseClient } from './db/client.js'
import { portalAdminAuditEvents, portalTenants } from './db/schema.js'
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

function createAgentsFetch() {
  return vi.fn<typeof fetch>(async (requestUrl) => {
    const url = new URL(String(requestUrl))

    if (url.pathname === '/api/v1/accounts/1/agents') {
      return new Response(
        JSON.stringify([
          {
            account_id: 1,
            confirmed: true,
            email: 'admin@example.test',
            id: 11,
            role: 'administrator',
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

async function createAdminCookie({
  app,
  sentEmails,
}: {
  app: ReturnType<typeof buildApp>
  sentEmails: EmailMessage[]
}) {
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

  expect(verifyResponse.statusCode).toBe(200)
  expect(adminCookie).toBeDefined()

  return `${testEnv.ADMIN_SESSION_COOKIE_NAME}=${adminCookie?.value ?? ''}`
}

describe('buildApp branding integration', () => {
  let app: ReturnType<typeof buildApp>
  let database: DatabaseClient
  let sentEmails: EmailMessage[]

  beforeEach(async () => {
    database = await createTestDatabase()
    const tenantId = await seedDefaultTenant(database)
    await storeAdminVerificationToken({ database, tenantId })
    sentEmails = []
    app = buildApp({
      chatwootFetchFn: createAgentsFetch(),
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
  }, 15_000)

  afterEach(async () => {
    await app.close()
  })

  it('returns public branding for the current tenant host', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/branding',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      branding: expect.objectContaining({
        portalName: 'Local Test Tenant',
        supportLabel: 'Команда Local Test Tenant',
      }),
    })
  })

  it('requires admin session for admin branding writes', async () => {
    const response = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'PATCH',
      payload: {
        portalName: 'Новый портал',
      },
      url: '/api/admin/branding',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('TENANT_ADMIN_UNAUTHORIZED')
  })

  it('updates branding through an authenticated admin session and writes audit event', async () => {
    const cookieHeader = await createAdminCookie({ app, sentEmails })

    const updateResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
        origin: testEnv.APP_ORIGIN,
      },
      method: 'PATCH',
      payload: {
        colors: {
          primary: '#123456',
        },
        portalName: 'Новый портал',
      },
      url: '/api/admin/branding',
    })

    expect(updateResponse.statusCode).toBe(200)
    expect(updateResponse.json()).toEqual({
      branding: expect.objectContaining({
        colors: expect.objectContaining({
          primary: '#123456',
        }),
        portalName: 'Новый портал',
      }),
    })

    const publicResponse = await app.inject({
      method: 'GET',
      url: '/api/branding',
    })

    expect(publicResponse.statusCode).toBe(200)
    expect(publicResponse.json()).toEqual({
      branding: expect.objectContaining({
        colors: expect.objectContaining({
          primary: '#123456',
        }),
        portalName: 'Новый портал',
      }),
    })

    const auditEvents = await database.db
      .select({
        action: portalAdminAuditEvents.action,
        actorEmail: portalAdminAuditEvents.actorEmail,
        outcome: portalAdminAuditEvents.outcome,
      })
      .from(portalAdminAuditEvents)
      .where(eq(portalAdminAuditEvents.action, 'branding_settings_updated'))

    expect(auditEvents).toEqual([
      {
        action: 'branding_settings_updated',
        actorEmail: 'admin@example.test',
        outcome: 'success',
      },
    ])
  })
})
