import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from './app.js'
import type { DatabaseClient } from './db/client.js'
import {
  portalAdminAuditEvents,
  portalLegalDocuments,
  portalTenants,
} from './db/schema.js'
import type { EmailMessage } from './integrations/email/smtp.js'
import {
  decodeTenantSecretKey,
  encryptTenantSecret,
} from './modules/tenants/secrets.js'
import {
  createMultipartBrandingAssetPayload,
  seedDefaultTenant,
  testEnv,
} from './test/appTestHelpers.js'
import { createTestDatabase } from './test/testDatabase.js'

const fixedNow = new Date('2026-06-18T10:20:30.000Z')

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

describe('buildApp legal document integration', () => {
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

  it('uploads terms through an authenticated same-origin admin request and exposes the public document', async () => {
    const cookieHeader = await createAdminCookie({ app, sentEmails })
    const multipart = createMultipartBrandingAssetPayload({
      fieldName: 'document',
      fileContent: Buffer.from('Legal terms text for public rendering.'),
      fileName: 'terms.txt',
      mimeType: 'text/plain',
    })

    const uploadResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
        origin: testEnv.APP_ORIGIN,
        'content-type': multipart.contentType,
      },
      method: 'POST',
      payload: multipart.payload,
      url: '/api/admin/legal-documents/terms',
    })

    expect(uploadResponse.statusCode).toBe(200)
    expect(uploadResponse.json()).toEqual({
      document: expect.objectContaining({
        bodyCharacterCount: 38,
        documentType: 'terms',
        sourceFileName: 'terms.txt',
        title: 'Пользовательское соглашение',
        version: expect.stringMatching(
          /^20260618T102030000Z-[a-f0-9]{16}-[a-f0-9]{8}$/u,
        ),
      }),
    })

    const publicResponse = await app.inject({
      method: 'GET',
      url: '/api/legal-documents/terms',
    })

    expect(publicResponse.statusCode).toBe(200)
    expect(publicResponse.json()).toEqual({
      document: {
        bodyText: 'Legal terms text for public rendering.',
        documentType: 'terms',
        title: 'Пользовательское соглашение',
        version: uploadResponse.json().document.version,
      },
    })

    const adminSummaryResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
      },
      method: 'GET',
      url: '/api/admin/legal-documents',
    })

    expect(adminSummaryResponse.statusCode).toBe(200)
    expect(adminSummaryResponse.json()).toEqual({
      documents: {
        privacy: null,
        terms: expect.objectContaining({
          sourceFileName: 'terms.txt',
          version: uploadResponse.json().document.version,
        }),
      },
    })

    const auditEvents = await database.db
      .select()
      .from(portalAdminAuditEvents)
      .where(eq(portalAdminAuditEvents.action, 'legal_document_uploaded'))

    expect(auditEvents).toHaveLength(1)
  }, 15_000)

  it('rejects admin legal document uploads from a foreign origin before storing', async () => {
    const cookieHeader = await createAdminCookie({ app, sentEmails })
    const multipart = createMultipartBrandingAssetPayload({
      fieldName: 'document',
      fileContent: Buffer.from('Legal terms text for rejected upload.'),
      fileName: 'terms.txt',
      mimeType: 'text/plain',
    })

    const response = await app.inject({
      headers: {
        cookie: cookieHeader,
        origin: 'https://evil.example.test',
        'content-type': multipart.contentType,
      },
      method: 'POST',
      payload: multipart.payload,
      url: '/api/admin/legal-documents/terms',
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('FORBIDDEN_ORIGIN')

    const storedDocuments = await database.db
      .select()
      .from(portalLegalDocuments)

    expect(storedDocuments).toHaveLength(0)
  }, 15_000)
})
