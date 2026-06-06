import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import { portalTenants } from '../../db/schema.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import {
  decodeTenantSecretKey,
  encryptTenantSecret,
} from '../tenants/secrets.js'
import {
  createTenantAdminAuthRepository,
  TenantAdminAuditMetadataError,
} from './adminAuthRepository.js'

const tenantSecretKey = Buffer.alloc(32, 9).toString('base64')

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

describe('tenant admin auth repository', () => {
  let database: DatabaseClient
  let tenantId: number
  let otherTenantId: number

  const now = new Date('2026-06-06T12:00:00.000Z')
  const expiresAt = new Date('2026-06-06T12:15:00.000Z')
  const resendNotBefore = new Date('2026-06-06T12:01:00.000Z')

  beforeEach(async () => {
    database = await createTestDatabase()
    tenantId = await seedTenant(database, 'tenant-a')
    otherTenantId = await seedTenant(database, 'tenant-b')
  })

  afterEach(async () => {
    await database.close()
  })

  it('creates and loads the latest tenant-scoped admin challenge by normalized email', async () => {
    const repository = createTenantAdminAuthRepository(database.db, {
      tenantId,
    })

    const challenge = await repository.createPendingChallenge({
      chatwootAgentId: 11,
      codeHash: 'code-hash',
      email: ' Admin@Example.test ',
      expiresAt,
      lastSentAt: now,
      resendNotBefore,
      role: 'administrator',
    })

    expect(challenge).toMatchObject({
      attemptsCount: 0,
      chatwootAgentId: 11,
      codeHash: 'code-hash',
      email: 'admin@example.test',
      maxAttempts: 5,
      role: 'administrator',
      status: 'pending',
    })

    await expect(
      repository.findLatestPendingChallengeByEmail('ADMIN@example.test'),
    ).resolves.toMatchObject({
      email: 'admin@example.test',
      id: challenge.id,
    })
  })

  it('keeps pending admin challenges isolated by tenant', async () => {
    const repository = createTenantAdminAuthRepository(database.db, {
      tenantId,
    })
    const otherTenantRepository = createTenantAdminAuthRepository(database.db, {
      tenantId: otherTenantId,
    })

    await repository.createPendingChallenge({
      chatwootAgentId: 11,
      codeHash: 'tenant-a-code-hash',
      email: 'admin@example.test',
      expiresAt,
      lastSentAt: now,
      resendNotBefore,
      role: 'administrator',
    })

    await expect(
      otherTenantRepository.findLatestPendingChallengeByEmail(
        'admin@example.test',
      ),
    ).resolves.toBeNull()
  })

  it('creates a tenant-scoped admin session and does not resolve it for another tenant', async () => {
    const repository = createTenantAdminAuthRepository(database.db, {
      tenantId,
    })
    const otherTenantRepository = createTenantAdminAuthRepository(database.db, {
      tenantId: otherTenantId,
    })

    await repository.createSession({
      chatwootAgentId: 11,
      email: ' Admin@Example.test ',
      expiresAt,
      lastSeenAt: now,
      role: 'administrator',
      tokenHash: 'session-token-hash',
    })

    await expect(
      repository.findSessionByTokenHash({
        now,
        tokenHash: 'session-token-hash',
      }),
    ).resolves.toMatchObject({
      admin: {
        chatwootAgentId: 11,
        email: 'admin@example.test',
        role: 'administrator',
      },
    })

    await expect(
      otherTenantRepository.findSessionByTokenHash({
        now,
        tokenHash: 'session-token-hash',
      }),
    ).resolves.toBeNull()
  })

  it('writes safe tenant-scoped audit events', async () => {
    const repository = createTenantAdminAuthRepository(database.db, {
      tenantId,
    })

    const event = await repository.createAuditEvent({
      action: 'admin_login_verified',
      actorChatwootAgentId: 11,
      actorEmail: ' Admin@Example.test ',
      metadata: {
        reason: 'code_match',
      },
      outcome: 'success',
      requestIp: '127.0.0.1',
      subjectEmail: ' ADMIN@example.test ',
      userAgent: 'vitest',
    })

    expect(event).toMatchObject({
      action: 'admin_login_verified',
      actorChatwootAgentId: 11,
      actorEmail: 'admin@example.test',
      outcome: 'success',
      subjectEmail: 'admin@example.test',
      tenantId,
    })
    expect(event.metadata).toEqual({ reason: 'code_match' })
  })

  it('rejects audit metadata that could store admin auth secrets', async () => {
    const repository = createTenantAdminAuthRepository(database.db, {
      tenantId,
    })

    await expect(
      repository.createAuditEvent({
        action: 'admin_login_verified',
        actorChatwootAgentId: 11,
        actorEmail: 'admin@example.test',
        metadata: {
          nested: {
            session_token: 'secret-session-token',
          },
        },
        outcome: 'success',
        requestIp: '127.0.0.1',
        subjectEmail: 'admin@example.test',
        userAgent: 'vitest',
      }),
    ).rejects.toThrow(TenantAdminAuditMetadataError)
  })
})
