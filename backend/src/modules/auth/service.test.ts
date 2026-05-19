import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AppEnv } from '../../config/env.js'
import type { DatabaseClient } from '../../db/client.js'
import { hashPassword } from '../../lib/password.js'
import { createPortalUsersRepository } from '../portal-users/repository.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { createAuthService } from './service.js'

const testEnv: AppEnv = {
  APP_ORIGIN: 'http://127.0.0.1:5173',
  CHATWOOT_ACCOUNT_ID: undefined,
  CHATWOOT_API_ACCESS_TOKEN: undefined,
  CHATWOOT_BASE_URL: undefined,
  CHATWOOT_PORTAL_INBOX_ID: undefined,
  CHAT_ATTACHMENT_PROXY_ALLOWED_ORIGINS: [],
  DATABASE_URL:
    'postgres://test:test@127.0.0.1:5432/chatwoot_client_portal_v2_test',
  NODE_ENV: 'test',
  PORT: 3301,
  AUTH_RATE_LIMIT_MAX: 5,
  AUTH_RATE_LIMIT_WINDOW_MS: 60_000,
  PORTAL_TRUST_PROXY: false,
  PORTAL_TENANT_SECRET_KEY: Buffer.alloc(32, 8).toString('base64'),
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

describe('auth service tenant scope', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  it('keeps same-email login and sessions isolated by tenant', async () => {
    const tenantA = await seedTestTenant(database.db, {
      primaryDomain: 'tenant-a.localhost',
      slug: 'tenant-a',
    })
    const tenantB = await seedTestTenant(database.db, {
      primaryDomain: 'tenant-b.localhost',
      slug: 'tenant-b',
    })
    const portalUsersRepository = createPortalUsersRepository(database.db)
    const authService = createAuthService({
      db: database.db,
      env: testEnv,
      now: () => new Date('2026-04-21T12:00:00.000Z'),
    })

    await portalUsersRepository.create({
      email: 'Name@Company.RU',
      fullName: 'Tenant A User',
      passwordHash: await hashPassword('TenantA123'),
      tenantId: tenantA.id,
    })
    await portalUsersRepository.create({
      email: 'name@company.ru',
      fullName: 'Tenant B User',
      passwordHash: await hashPassword('TenantB123'),
      tenantId: tenantB.id,
    })

    const tenantASession = await authService.login({
      email: 'name@company.ru',
      password: 'TenantA123',
      tenantId: tenantA.id,
    })
    const tenantBSession = await authService.login({
      email: 'name@company.ru',
      password: 'TenantB123',
      tenantId: tenantB.id,
    })

    await expect(
      authService.login({
        email: 'name@company.ru',
        password: 'TenantA123',
        tenantId: tenantB.id,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      statusCode: 401,
    })
    expect(tenantASession.user).toMatchObject({
      email: 'name@company.ru',
      fullName: 'Tenant A User',
    })
    expect(tenantBSession.user).toMatchObject({
      email: 'name@company.ru',
      fullName: 'Tenant B User',
    })
    expect(
      await authService.getCurrentUser({
        sessionToken: tenantASession.sessionToken,
        tenantId: tenantA.id,
      }),
    ).toMatchObject({
      email: 'name@company.ru',
      fullName: 'Tenant A User',
    })
    expect(
      await authService.getCurrentUser({
        sessionToken: tenantASession.sessionToken,
        tenantId: tenantB.id,
      }),
    ).toBeNull()

    await authService.logout({
      sessionToken: tenantASession.sessionToken,
      tenantId: tenantB.id,
    })

    expect(
      await authService.getCurrentUser({
        sessionToken: tenantASession.sessionToken,
        tenantId: tenantA.id,
      }),
    ).toMatchObject({
      email: 'name@company.ru',
      fullName: 'Tenant A User',
    })
  })
})
