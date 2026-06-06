import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import { portalTenants } from '../../db/schema.js'
import {
  type EmailMessage,
  SmtpEmailDeliveryError,
} from '../../integrations/email/smtp.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import {
  decodeTenantSecretKey,
  encryptTenantSecret,
} from '../tenants/secrets.js'
import { createTenantAdminAuthRepository } from './adminAuthRepository.js'
import { createTenantAdminAuthService } from './adminAuthService.js'

const tenantSecretKey = Buffer.alloc(32, 10).toString('base64')
const fixedNow = new Date('2026-06-06T12:00:00.000Z')

async function seedTenant(database: DatabaseClient, slug: string) {
  const key = decodeTenantSecretKey(tenantSecretKey)

  const [tenant] = await database.db
    .insert(portalTenants)
    .values({
      chatwootAccountId: slug === 'tenant-a' ? 1 : 2,
      chatwootApiAccessTokenCiphertext: encryptTenantSecret(
        `${slug}-runtime-token`,
        key,
      ),
      chatwootBaseUrl: 'https://chatwoot.example.test',
      chatwootPortalInboxId: 1,
      chatwootWebhookSecretCiphertext: encryptTenantSecret(
        `${slug}-webhook-secret`,
        key,
      ),
      displayName: slug,
      primaryDomain: `${slug}.example.test`,
      publicBaseUrl: `https://${slug}.example.test`,
      slug,
    })
    .returning({ id: portalTenants.id })

  if (!tenant) {
    throw new Error('Failed to seed tenant.')
  }

  return tenant.id
}

function extractCode(message: EmailMessage | undefined) {
  const code = message?.text.match(/\b\d{6}\b/)?.[0]

  if (!code) {
    throw new Error('Expected email message to contain a six digit code.')
  }

  return code
}

function createVerificationServiceMock() {
  return {
    verifyTenantAdminEmail: vi.fn(async () => ({
      agent: {
        accountId: 1,
        email: 'admin@example.test',
        id: 11,
        role: 'administrator',
      },
      result: 'eligible' as const,
    })),
  }
}

describe('createTenantAdminAuthService', () => {
  let database: DatabaseClient
  let tenantId: number
  let otherTenantId: number

  beforeEach(async () => {
    database = await createTestDatabase()
    tenantId = await seedTenant(database, 'tenant-a')
    otherTenantId = await seedTenant(database, 'tenant-b')
  })

  afterEach(async () => {
    await database.close()
  })

  it('requests a challenge only after current tenant admin verification succeeds', async () => {
    const emailDelivery = {
      send: vi.fn(async (message: EmailMessage) => {
        void message
      }),
    }
    const tenantAdminVerificationService = createVerificationServiceMock()
    const service = createTenantAdminAuthService({
      emailDelivery,
      now: () => fixedNow,
      repository: createTenantAdminAuthRepository(database.db, { tenantId }),
      tenantAdminVerificationService,
      tenantId,
    })

    await expect(
      service.requestAdminLoginChallenge({
        email: ' Admin@Example.test ',
        requestIp: '127.0.0.1',
        userAgent: 'vitest',
      }),
    ).resolves.toMatchObject({
      delivery: 'sent',
      email: 'admin@example.test',
      expiresInSeconds: 900,
      nextStep: 'verify_code',
      purpose: 'tenant_admin_login',
      resendAvailableInSeconds: 60,
      result: 'admin_login_challenge_requested',
    })
    expect(
      tenantAdminVerificationService.verifyTenantAdminEmail,
    ).toHaveBeenCalledWith({
      email: 'admin@example.test',
      tenantId,
    })
    expect(emailDelivery.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Код входа администратора Client Portal',
        to: 'admin@example.test',
      }),
    )
  })

  it('does not send a code when the email is not a confirmed Chatwoot administrator', async () => {
    const emailDelivery = {
      send: vi.fn(async (message: EmailMessage) => {
        void message
      }),
    }
    const tenantAdminVerificationService = {
      verifyTenantAdminEmail: vi.fn(async () => ({
        result: 'not_eligible' as const,
      })),
    }
    const service = createTenantAdminAuthService({
      emailDelivery,
      now: () => fixedNow,
      repository: createTenantAdminAuthRepository(database.db, { tenantId }),
      tenantAdminVerificationService,
      tenantId,
    })

    await expect(
      service.requestAdminLoginChallenge({
        email: 'agent@example.test',
        requestIp: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({
      code: 'TENANT_ADMIN_NOT_ELIGIBLE',
      statusCode: 403,
    })
    expect(emailDelivery.send).not.toHaveBeenCalled()
  })

  it('verifies a valid code and creates a resolvable admin session', async () => {
    const emailDelivery = {
      send: vi.fn(async (message: EmailMessage) => {
        void message
      }),
    }
    const service = createTenantAdminAuthService({
      emailDelivery,
      now: () => fixedNow,
      repository: createTenantAdminAuthRepository(database.db, { tenantId }),
      tenantAdminVerificationService: createVerificationServiceMock(),
      tenantId,
    })

    await service.requestAdminLoginChallenge({
      email: 'admin@example.test',
      requestIp: null,
      userAgent: null,
    })
    const code = extractCode(emailDelivery.send.mock.calls[0]?.[0])

    const verified = await service.verifyAdminLoginCode({
      code,
      email: 'admin@example.test',
      requestIp: null,
      userAgent: null,
    })

    expect(verified).toMatchObject({
      admin: {
        chatwootAgentId: 11,
        email: 'admin@example.test',
        role: 'administrator',
      },
      expiresAt: new Date('2026-06-07T00:00:00.000Z'),
      sessionToken: expect.any(String),
    })
    await expect(
      service.getCurrentAdminSession({
        sessionToken: verified.sessionToken,
      }),
    ).resolves.toMatchObject({
      admin: {
        chatwootAgentId: 11,
        email: 'admin@example.test',
        role: 'administrator',
      },
      expiresAt: new Date('2026-06-07T00:00:00.000Z'),
    })
  })

  it('keeps the previous pending code when resend delivery fails', async () => {
    let currentNow = fixedNow
    const sentEmails: EmailMessage[] = []
    const emailDelivery = {
      send: vi.fn(async (message: EmailMessage) => {
        sentEmails.push(message)

        if (sentEmails.length === 2) {
          throw new SmtpEmailDeliveryError()
        }
      }),
    }
    const service = createTenantAdminAuthService({
      emailDelivery,
      now: () => currentNow,
      repository: createTenantAdminAuthRepository(database.db, { tenantId }),
      tenantAdminVerificationService: createVerificationServiceMock(),
      tenantId,
    })

    await service.requestAdminLoginChallenge({
      email: 'admin@example.test',
      requestIp: null,
      userAgent: null,
    })
    const originalCode = extractCode(sentEmails[0])
    currentNow = new Date(fixedNow.getTime() + 61_000)

    await expect(
      service.requestAdminLoginChallenge({
        email: 'admin@example.test',
        requestIp: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({
      code: 'TENANT_ADMIN_DELIVERY_UNAVAILABLE',
      statusCode: 503,
    })

    await expect(
      service.verifyAdminLoginCode({
        code: originalCode,
        email: 'admin@example.test',
        requestIp: null,
        userAgent: null,
      }),
    ).resolves.toMatchObject({
      admin: {
        chatwootAgentId: 11,
        email: 'admin@example.test',
        role: 'administrator',
      },
    })
  })

  it('rejects cross-tenant verification by using the repository tenant scope', async () => {
    const emailDelivery = {
      send: vi.fn(async (message: EmailMessage) => {
        void message
      }),
    }
    const tenantAService = createTenantAdminAuthService({
      emailDelivery,
      now: () => fixedNow,
      repository: createTenantAdminAuthRepository(database.db, { tenantId }),
      tenantAdminVerificationService: createVerificationServiceMock(),
      tenantId,
    })
    const tenantBService = createTenantAdminAuthService({
      emailDelivery,
      now: () => fixedNow,
      repository: createTenantAdminAuthRepository(database.db, {
        tenantId: otherTenantId,
      }),
      tenantAdminVerificationService: createVerificationServiceMock(),
      tenantId: otherTenantId,
    })

    await tenantAService.requestAdminLoginChallenge({
      email: 'admin@example.test',
      requestIp: null,
      userAgent: null,
    })
    const code = extractCode(emailDelivery.send.mock.calls[0]?.[0])

    await expect(
      tenantBService.verifyAdminLoginCode({
        code,
        email: 'admin@example.test',
        requestIp: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({
      code: 'TENANT_ADMIN_CHALLENGE_NOT_FOUND_OR_INVALIDATED',
      statusCode: 409,
    })
  })
})
