import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppEnv } from '../../config/env.js'
import type { DatabaseClient } from '../../db/client.js'
import { portalSessions } from '../../db/schema.js'
import { hashPassword } from '../../lib/password.js'
import { createPortalUsersRepository } from '../portal-users/repository.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { createAuthService } from './service.js'

const testEnv: AppEnv = {
  APP_ORIGIN: 'http://127.0.0.1:5173',
  CHAT_ATTACHMENT_PROXY_ALLOWED_ORIGINS: [],
  DATABASE_URL:
    'postgres://test:test@127.0.0.1:5432/chatwoot_client_portal_v2_test',
  NODE_ENV: 'test',
  PORT: 3301,
  AUTH_RATE_LIMIT_MAX: 5,
  AUTH_RATE_LIMIT_WINDOW_MS: 60_000,
  BRANDING_ASSET_STORAGE_ACCESS_KEY_ID: undefined,
  BRANDING_ASSET_STORAGE_BUCKET: undefined,
  BRANDING_ASSET_STORAGE_ENDPOINT: undefined,
  BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE: true,
  BRANDING_ASSET_STORAGE_REGION: 'us-east-1',
  BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY: undefined,
  ADMIN_SESSION_COOKIE_NAME: 'portal_admin_session',
  PORTAL_TRUST_PROXY: false,
  PORTAL_TENANT_SECRET_KEY: Buffer.alloc(32, 8).toString('base64'),
  SESSION_COOKIE_NAME: 'portal_session',
  SESSION_SECRET: 'test-session-secret-with-at-least-thirty-two-characters',
  SESSION_TTL_DAYS: 30,
  TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS: 10_000,
  SMTP_FROM: undefined,
  SMTP_HOST: undefined,
  SMTP_PASS: undefined,
  SMTP_PORT: 1025,
  SMTP_SECURE: false,
  SMTP_USER: undefined,
  PUSH_SUBSCRIPTION_ALLOWED_ORIGINS: [
    'https://fcm.googleapis.com',
    'https://updates.push.services.mozilla.com',
    'https://web.push.apple.com',
  ],
  PUSH_VAPID_KEY_ID: undefined,
  PUSH_VAPID_PRIVATE_KEY: undefined,
  PUSH_VAPID_PUBLIC_KEY: undefined,
  PUSH_VAPID_SUBJECT: undefined,
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
    let currentTime = new Date('2026-04-21T12:00:00.000Z')
    const authService = createAuthService({
      db: database.db,
      env: testEnv,
      now: () => currentTime,
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
    expect(tenantASession.expiresAt.toISOString()).toBe(
      '2026-05-21T12:00:00.000Z',
    )
    expect(tenantBSession.user).toMatchObject({
      email: 'name@company.ru',
      fullName: 'Tenant B User',
    })
    await expect(
      authService.getCurrentSession({
        sessionToken: tenantASession.sessionToken,
        tenantId: tenantA.id,
      }),
    ).resolves.toMatchObject({
      expiresAt: new Date('2026-05-21T12:00:00.000Z'),
      user: {
        email: 'name@company.ru',
        fullName: 'Tenant A User',
      },
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

    currentTime = new Date('2026-05-10T09:30:00.000Z')
    const sessionBeforeUserLookup = await readOnlySession(database, tenantA.id)

    await expect(
      authService.getCurrentUser({
        sessionToken: tenantASession.sessionToken,
        tenantId: tenantA.id,
      }),
    ).resolves.toMatchObject({
      email: 'name@company.ru',
      fullName: 'Tenant A User',
    })

    await expect(readOnlySession(database, tenantA.id)).resolves.toMatchObject({
      expiresAt: sessionBeforeUserLookup.expiresAt,
      lastSeenAt: sessionBeforeUserLookup.lastSeenAt,
    })
  })

  it('rejects password login for users without a configured password hash', async () => {
    const tenant = await seedTestTenant(database.db)
    const portalUsersRepository = createPortalUsersRepository(database.db)
    const authService = createAuthService({
      db: database.db,
      env: testEnv,
      now: () => new Date('2026-04-21T12:00:00.000Z'),
    })

    await portalUsersRepository.create({
      email: 'passwordless@company.ru',
      fullName: 'Passwordless User',
      passwordHash: null,
      tenantId: tenant.id,
    })

    await expect(
      authService.login({
        email: 'passwordless@company.ru',
        password: 'Secret123',
        tenantId: tenant.id,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Неверный email или пароль.',
      statusCode: 401,
    })
  })

  it('uses password verification work for generic invalid login states', async () => {
    const tenant = await seedTestTenant(database.db)
    const portalUsersRepository = createPortalUsersRepository(database.db)
    const verifyPasswordHash = vi.fn().mockResolvedValue(false)
    const authService = createAuthService({
      db: database.db,
      env: testEnv,
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      verifyPasswordHash,
    })

    await portalUsersRepository.create({
      email: 'inactive@company.ru',
      fullName: 'Inactive User',
      isActive: false,
      passwordHash: await hashPassword('Secret123'),
      tenantId: tenant.id,
    })
    await portalUsersRepository.create({
      email: 'passwordless@company.ru',
      fullName: 'Passwordless User',
      passwordHash: null,
      tenantId: tenant.id,
    })

    for (const email of [
      'missing@company.ru',
      'inactive@company.ru',
      'passwordless@company.ru',
    ]) {
      await expect(
        authService.login({
          email,
          password: 'Secret123',
          tenantId: tenant.id,
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
        statusCode: 401,
      })
    }

    expect(verifyPasswordHash).toHaveBeenCalledTimes(3)
    expect(verifyPasswordHash.mock.calls.map(([password]) => password)).toEqual(
      ['Secret123', 'Secret123', 'Secret123'],
    )
    expect(
      new Set(verifyPasswordHash.mock.calls.map(([, hash]) => hash)).size,
    ).toBe(1)
    expect(verifyPasswordHash.mock.calls[0]?.[1]).toMatch(/^scrypt:/)
    await expect(readOptionalSession(database, tenant.id)).resolves.toBeNull()
  })

  it('renews customer session only inside the renewal window when renewal is allowed', async () => {
    const tenant = await seedTestTenant(database.db)
    const portalUsersRepository = createPortalUsersRepository(database.db)
    let currentTime = new Date('2026-04-21T12:00:00.000Z')
    const authService = createAuthService({
      db: database.db,
      env: testEnv,
      now: () => currentTime,
    })

    await portalUsersRepository.create({
      email: 'name@company.ru',
      fullName: 'Portal User',
      passwordHash: await hashPassword('Secret123'),
      tenantId: tenant.id,
    })

    const loginSession = await authService.login({
      email: 'name@company.ru',
      password: 'Secret123',
      tenantId: tenant.id,
    })

    expect(loginSession.expiresAt.toISOString()).toBe(
      '2026-05-21T12:00:00.000Z',
    )

    currentTime = new Date('2026-04-22T09:30:00.000Z')
    await expect(
      authService.getCurrentSession({
        allowRenewal: true,
        sessionToken: loginSession.sessionToken,
        tenantId: tenant.id,
      }),
    ).resolves.toMatchObject({
      expiresAt: new Date('2026-05-21T12:00:00.000Z'),
      sessionRefreshed: false,
    })
    await expect(readOnlySession(database, tenant.id)).resolves.toMatchObject({
      expiresAt: new Date('2026-05-21T12:00:00.000Z'),
      lastSeenAt: new Date('2026-04-21T12:00:00.000Z'),
    })

    currentTime = new Date('2026-05-10T09:30:00.000Z')
    await expect(
      authService.getCurrentSession({
        allowRenewal: false,
        sessionToken: loginSession.sessionToken,
        tenantId: tenant.id,
      }),
    ).resolves.toMatchObject({
      expiresAt: new Date('2026-05-21T12:00:00.000Z'),
      sessionRefreshed: false,
    })
    await expect(readOnlySession(database, tenant.id)).resolves.toMatchObject({
      expiresAt: new Date('2026-05-21T12:00:00.000Z'),
      lastSeenAt: new Date('2026-04-21T12:00:00.000Z'),
    })

    await expect(
      authService.getCurrentSession({
        allowRenewal: true,
        sessionToken: loginSession.sessionToken,
        tenantId: tenant.id,
      }),
    ).resolves.toMatchObject({
      expiresAt: new Date('2026-06-09T09:30:00.000Z'),
      sessionRefreshed: true,
    })
    await expect(readOnlySession(database, tenant.id)).resolves.toMatchObject({
      expiresAt: new Date('2026-06-09T09:30:00.000Z'),
      lastSeenAt: new Date('2026-05-10T09:30:00.000Z'),
    })
  })

  it('deduplicates concurrent renewal attempts for the same observed expiry', async () => {
    const tenant = await seedTestTenant(database.db)
    const portalUsersRepository = createPortalUsersRepository(database.db)
    let currentTime = new Date('2026-04-21T12:00:00.000Z')
    const authService = createAuthService({
      db: database.db,
      env: testEnv,
      now: () => currentTime,
    })

    await portalUsersRepository.create({
      email: 'name@company.ru',
      fullName: 'Portal User',
      passwordHash: await hashPassword('Secret123'),
      tenantId: tenant.id,
    })

    const loginSession = await authService.login({
      email: 'name@company.ru',
      password: 'Secret123',
      tenantId: tenant.id,
    })

    currentTime = new Date('2026-05-10T09:30:00.000Z')
    const renewalResults = await Promise.all([
      authService.getCurrentSession({
        allowRenewal: true,
        sessionToken: loginSession.sessionToken,
        tenantId: tenant.id,
      }),
      authService.getCurrentSession({
        allowRenewal: true,
        sessionToken: loginSession.sessionToken,
        tenantId: tenant.id,
      }),
    ])

    expect(
      renewalResults.filter((session) => session?.sessionRefreshed).length,
    ).toBeLessThanOrEqual(1)
    expect(
      renewalResults.map((session) => session?.expiresAt.toISOString()),
    ).toEqual([
      '2026-06-09T09:30:00.000Z',
      '2026-06-09T09:30:00.000Z',
    ])
    await expect(readOnlySession(database, tenant.id)).resolves.toMatchObject({
      expiresAt: new Date('2026-06-09T09:30:00.000Z'),
      lastSeenAt: new Date('2026-05-10T09:30:00.000Z'),
    })
  })
})

async function readOnlySession(database: DatabaseClient, tenantId: number) {
  const [session] = await database.db
    .select()
    .from(portalSessions)
    .where(eq(portalSessions.tenantId, tenantId))
    .limit(1)

  if (!session) {
    throw new Error(`Expected session for tenant ${tenantId}.`)
  }

  return session
}

async function readOptionalSession(database: DatabaseClient, tenantId: number) {
  const [session] = await database.db
    .select()
    .from(portalSessions)
    .where(eq(portalSessions.tenantId, tenantId))
    .limit(1)

  return session ?? null
}
