import { describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import type { AppEnv } from '../../config/env.js'
import type { DatabaseClient } from '../../db/client.js'
import { portalTenants } from '../../db/schema.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { decodeTenantSecretKey, encryptTenantSecret } from './secrets.js'

const tenantSecretKey = Buffer.alloc(32, 5).toString('base64')

const baseTestEnv: AppEnv = {
  APP_ORIGIN: 'https://lk.default.test',
  CHATWOOT_ACCOUNT_ID: undefined,
  CHATWOOT_API_ACCESS_TOKEN: undefined,
  CHATWOOT_BASE_URL: undefined,
  CHATWOOT_PORTAL_INBOX_ID: undefined,
  DATABASE_URL:
    'postgres://test:test@127.0.0.1:5432/chatwoot_client_portal_v2_test',
  DEFAULT_TENANT_SLUG: 'default',
  NODE_ENV: 'test',
  PORT: 3301,
  PORTAL_TRUST_PROXY: false,
  PORTAL_TENANT_SECRET_KEY: tenantSecretKey,
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

async function seedTenant(
  database: DatabaseClient,
  {
    displayName,
    primaryDomain,
    publicBaseUrl,
    slug,
  }: {
    displayName: string
    primaryDomain: string
    publicBaseUrl: string
    slug: string
  },
) {
  const key = decodeTenantSecretKey(tenantSecretKey)

  await database.db.insert(portalTenants).values({
    chatwootAccountId: 1,
    chatwootApiAccessTokenCiphertext: encryptTenantSecret(
      `${slug}:api-token`,
      key,
    ),
    chatwootBaseUrl: 'https://chatwoot.example.test',
    chatwootPortalInboxId: 1,
    chatwootWebhookSecretCiphertext: encryptTenantSecret(
      `${slug}:webhook-secret`,
      key,
    ),
    displayName,
    primaryDomain,
    publicBaseUrl,
    slug,
  })
}

async function createTenantApp(envOverrides: Partial<AppEnv> = {}) {
  const database = await createTestDatabase()
  const env = {
    ...baseTestEnv,
    ...envOverrides,
  } satisfies AppEnv
  const app = buildApp({
    database,
    env,
  })

  await seedTenant(database, {
    displayName: 'Default Tenant',
    primaryDomain: 'lk.default.test',
    publicBaseUrl: 'https://lk.default.test',
    slug: 'default',
  })
  await seedTenant(database, {
    displayName: 'Second Tenant',
    primaryDomain: 'lk.second.test',
    publicBaseUrl: 'https://lk.second.test',
    slug: 'second',
  })
  await app.ready()

  return {
    app,
    database,
  }
}

describe('tenant routes and request context', () => {
  it('resolves public tenant context by Host before auth routes', async () => {
    const { app } = await createTenantApp()

    try {
      const response = await app.inject({
        headers: {
          host: 'LK.DEFAULT.TEST:443',
        },
        method: 'GET',
        url: '/api/tenant',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        tenant: {
          displayName: 'Default Tenant',
          primaryDomain: 'lk.default.test',
          publicBaseUrl: 'https://lk.default.test',
          slug: 'default',
        },
      })
    } finally {
      await app.close()
    }
  }, 15_000)

  it('does not fallback to default tenant for unknown hosts', async () => {
    const { app } = await createTenantApp()

    try {
      const response = await app.inject({
        headers: {
          host: 'unknown.test',
        },
        method: 'GET',
        url: '/api/auth/me',
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        error: {
          code: 'TENANT_NOT_FOUND',
          message: 'Личный кабинет для этого домена не найден.',
        },
      })
    } finally {
      await app.close()
    }
  }, 15_000)

  it('uses X-Forwarded-Host only when trusted proxy mode is enabled', async () => {
    const trustedProxyApp = await createTenantApp({
      PORTAL_TRUST_PROXY: true,
    })
    const directApp = await createTenantApp({
      PORTAL_TRUST_PROXY: false,
    })

    try {
      const trustedResponse = await trustedProxyApp.app.inject({
        headers: {
          host: 'internal.local',
          'x-forwarded-host': 'lk.default.test',
        },
        method: 'GET',
        url: '/api/tenant',
      })
      const directResponse = await directApp.app.inject({
        headers: {
          host: 'internal.local',
          'x-forwarded-host': 'lk.default.test',
        },
        method: 'GET',
        url: '/api/tenant',
      })

      expect(trustedResponse.statusCode).toBe(200)
      expect(trustedResponse.json()).toMatchObject({
        tenant: {
          slug: 'default',
        },
      })
      expect(directResponse.statusCode).toBe(404)
      expect(directResponse.json()).toMatchObject({
        error: {
          code: 'TENANT_NOT_FOUND',
        },
      })
    } finally {
      await trustedProxyApp.app.close()
      await directApp.app.close()
    }
  }, 20_000)

  it('rejects tenant A origin when mutating tenant B host', async () => {
    const { app } = await createTenantApp({
      DEFAULT_TENANT_SLUG: 'second',
    })

    try {
      const response = await app.inject({
        headers: {
          host: 'lk.second.test',
          origin: 'https://lk.default.test',
        },
        method: 'POST',
        payload: {
          email: 'name@example.test',
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
    } finally {
      await app.close()
    }
  }, 15_000)

  it('hard-fails non-default tenant customer runtime until tenant isolation is complete', async () => {
    const { app } = await createTenantApp()

    try {
      const response = await app.inject({
        headers: {
          host: 'lk.second.test',
          origin: 'https://lk.second.test',
        },
        method: 'POST',
        payload: {
          email: 'name@example.test',
          password: 'Secret123',
        },
        url: '/api/auth/login',
      })

      expect(response.statusCode).toBe(503)
      expect(response.json()).toEqual({
        error: {
          code: 'TENANT_RUNTIME_NOT_READY',
          message: 'Личный кабинет для этого tenant пока не включен.',
        },
      })
    } finally {
      await app.close()
    }
  }, 15_000)
})
