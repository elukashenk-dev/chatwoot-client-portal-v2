import { Readable } from 'node:stream'

import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import type { AppEnv } from '../../config/env.js'
import type { DatabaseClient } from '../../db/client.js'
import { portalTenants } from '../../db/schema.js'
import type { BrandingObjectStorage } from '../../integrations/object-storage/brandingStorage.js'
import { registerApiErrorHandler } from '../../lib/errors.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { createBrandingRepository } from '../branding/repository.js'
import { chatwootWebhookTestInternals } from '../chatwoot-webhooks/service.js'
import type { TenantStatus } from './repository.js'
import {
  registerTenantContext,
  registerTenantRoutes,
  type TenantPwaIconReader,
} from './routes.js'
import { decodeTenantSecretKey, encryptTenantSecret } from './secrets.js'
import type { TenantRequestContext } from './service.js'

const tenantSecretKey = Buffer.alloc(32, 5).toString('base64')

const baseTestEnv: AppEnv = {
  APP_ORIGIN: 'https://lk.default.test',
  CHAT_ATTACHMENT_PROXY_ALLOWED_ORIGINS: [],
  DATABASE_URL:
    'postgres://test:test@127.0.0.1:5432/chatwoot_client_portal_v2_test',
  DEFAULT_TENANT_SLUG: 'default',
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

async function seedTenant(
  database: DatabaseClient,
  {
    displayName,
    primaryDomain,
    publicBaseUrl,
    slug,
    status = 'active',
  }: {
    displayName: string
    primaryDomain: string
    publicBaseUrl: string
    slug: string
    status?: TenantStatus
  },
) {
  const key = decodeTenantSecretKey(tenantSecretKey)

  const [tenant] = await database.db
    .insert(portalTenants)
    .values({
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
      status,
    })
    .returning({
      id: portalTenants.id,
    })

  if (!tenant) {
    throw new Error(`Failed to seed tenant ${slug}.`)
  }

  return tenant.id
}

function createTestBrandingObjectStorage() {
  const objects = new Map<
    string,
    { body: Buffer; contentLength: number; contentType: string }
  >()

  return {
    objects,
    storage: {
      deleteObject: async ({ key }: { key: string }) => {
        objects.delete(key)
      },
      getObject: async ({ key }: { key: string }) => {
        const object = objects.get(key)

        if (!object) {
          throw new Error(`Missing object ${key}`)
        }

        return {
          body: Readable.from(object.body),
          contentLength: object.contentLength,
          contentType: object.contentType,
        }
      },
      putObject: async ({
        body,
        contentLength,
        contentType,
        key,
      }: {
        body: Buffer
        contentLength: number
        contentType: string
        key: string
      }) => {
        objects.set(key, {
          body,
          contentLength,
          contentType,
        })
      },
    } satisfies BrandingObjectStorage,
  }
}

async function createTenantApp(
  envOverrides: Partial<AppEnv> = {},
  {
    brandingObjectStorage,
  }: {
    brandingObjectStorage?: BrandingObjectStorage
  } = {},
) {
  const database = await createTestDatabase()
  const env = {
    ...baseTestEnv,
    ...envOverrides,
  } satisfies AppEnv
  const app = buildApp({
    ...(brandingObjectStorage ? { brandingObjectStorage } : {}),
    database,
    env,
  })

  const defaultTenantId = await seedTenant(database, {
    displayName: 'Default Tenant',
    primaryDomain: 'lk.default.test',
    publicBaseUrl: 'https://lk.default.test',
    slug: 'default',
  })
  const secondTenantId = await seedTenant(database, {
    displayName: 'Second Tenant',
    primaryDomain: 'lk.second.test',
    publicBaseUrl: 'https://lk.second.test',
    slug: 'second',
  })
  await app.ready()

  return {
    app,
    database,
    tenantIds: {
      default: defaultTenantId,
      second: secondTenantId,
    },
  }
}

function createSignedWebhook({
  deliveryKey = 'delivery-1',
  payload,
  secret,
}: {
  deliveryKey?: string
  payload: Record<string, unknown>
  secret: string
}) {
  const now = new Date()
  const timestamp = String(Math.floor(now.getTime() / 1000))
  const rawBody = Buffer.from(JSON.stringify(payload))

  return {
    headers: {
      'content-type': 'application/json',
      'x-chatwoot-delivery': deliveryKey,
      'x-chatwoot-signature':
        chatwootWebhookTestInternals.createSignatureDigest({
          rawBody,
          secret,
          timestamp,
        }),
      'x-chatwoot-timestamp': timestamp,
    },
    rawBody,
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
      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.headers.vary).toBe('Host')
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
  }, 30_000)

  it('serves tenant-specific PWA manifests by Host without cache storage', async () => {
    const { app } = await createTenantApp()

    try {
      const defaultResponse = await app.inject({
        headers: {
          host: 'lk.default.test',
        },
        method: 'GET',
        url: '/api/tenant/manifest.webmanifest',
      })
      const secondResponse = await app.inject({
        headers: {
          host: 'lk.second.test',
        },
        method: 'GET',
        url: '/api/tenant/manifest.webmanifest',
      })

      expect(defaultResponse.statusCode).toBe(200)
      expect(defaultResponse.headers['content-type']).toContain(
        'application/manifest+json',
      )
      expect(defaultResponse.headers['cache-control']).toBe('no-store')
      expect(defaultResponse.headers.vary).toBe('Host')
      expect(defaultResponse.json()).toMatchObject({
        display: 'standalone',
        id: 'https://lk.default.test/',
        name: 'Default Tenant Личный кабинет',
        scope: '/',
        short_name: 'Default Tenant',
        start_url: '/',
        theme_color: '#112540',
      })
      expect(defaultResponse.json().icons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sizes: '192x192',
            src: '/api/tenant/icons/icon-192.png?v=default-fallback-v1',
          }),
          expect.objectContaining({
            purpose: 'maskable',
            sizes: '512x512',
            src: '/api/tenant/icons/icon-maskable-512.png?v=default-fallback-v1',
          }),
        ]),
      )

      expect(secondResponse.statusCode).toBe(200)
      expect(secondResponse.json()).toMatchObject({
        id: 'https://lk.second.test/',
        name: 'Second Tenant Личный кабинет',
        short_name: 'Second Tenant',
      })
      expect(secondResponse.json().icons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            src: '/api/tenant/icons/icon-192.png?v=second-fallback-v1',
          }),
        ]),
      )
    } finally {
      await app.close()
    }
  }, 20_000)

  it('serves tenant-aware PWA icon redirects for manifest and iOS metadata', async () => {
    const { app } = await createTenantApp()

    try {
      const appleIconResponse = await app.inject({
        headers: {
          host: 'lk.second.test',
        },
        method: 'GET',
        url: '/api/tenant/apple-touch-icon.png',
      })
      const manifestIconResponse = await app.inject({
        headers: {
          host: 'lk.second.test',
        },
        method: 'GET',
        url: '/api/tenant/icons/icon-maskable-512.png?v=second-fallback-v1',
      })
      const missingIconResponse = await app.inject({
        headers: {
          host: 'lk.second.test',
        },
        method: 'GET',
        url: '/api/tenant/icons/not-found.png',
      })

      expect(appleIconResponse.statusCode).toBe(302)
      expect(appleIconResponse.headers.location).toBe('/apple-touch-icon.png')
      expect(appleIconResponse.headers['cache-control']).toBe('no-store')
      expect(appleIconResponse.headers.vary).toBe('Host')

      expect(manifestIconResponse.statusCode).toBe(302)
      expect(manifestIconResponse.headers.location).toBe(
        '/pwa-icons/icon-maskable-512.png',
      )
      expect(manifestIconResponse.headers['cache-control']).toBe('no-store')
      expect(manifestIconResponse.headers.vary).toBe('Host')

      expect(missingIconResponse.statusCode).toBe(404)
      expect(missingIconResponse.json()).toEqual({
        error: {
          code: 'TENANT_PWA_ICON_NOT_FOUND',
          message: 'Иконка не найдена.',
        },
      })
    } finally {
      await app.close()
    }
  }, 20_000)

  it('uses active tenant pwa icon metadata in manifest icon URLs', async () => {
    const brandingStorage = createTestBrandingObjectStorage()
    const { app, database, tenantIds } = await createTenantApp(
      {},
      {
        brandingObjectStorage: brandingStorage.storage,
      },
    )

    try {
      const repository = createBrandingRepository(database.db, {
        tenantId: tenantIds.default,
      })
      const asset = await repository.createAssetMetadata({
        byteSize: 8,
        checksumSha256: 'p'.repeat(64),
        contentHash: 'pwa-hash',
        contentType: 'image/png',
        kind: 'pwa_icon',
        objectKey: `tenants/${tenantIds.default}/branding/pwa_icon/pwa-hash/icon.png`,
        originalFilename: 'icon.png',
      })

      await repository.upsertSettings({ pwaIconAssetId: asset.id })

      const response = await app.inject({
        headers: {
          host: 'lk.default.test',
        },
        method: 'GET',
        url: '/api/tenant/manifest.webmanifest',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().icons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sizes: '192x192',
            src: `/api/tenant/icons/icon-192.png?v=default-asset-${asset.id}`,
          }),
          expect.objectContaining({
            purpose: 'maskable',
            sizes: '512x512',
            src: `/api/tenant/icons/icon-maskable-512.png?v=default-asset-${asset.id}`,
          }),
        ]),
      )
    } finally {
      await app.close()
    }
  }, 20_000)

  it('streams active tenant pwa icon content for tenant icon routes', async () => {
    const brandingStorage = createTestBrandingObjectStorage()
    const { app, database, tenantIds } = await createTenantApp(
      {},
      {
        brandingObjectStorage: brandingStorage.storage,
      },
    )

    try {
      const repository = createBrandingRepository(database.db, {
        tenantId: tenantIds.default,
      })
      const asset = await repository.createAssetMetadata({
        byteSize: 8,
        checksumSha256: 'p'.repeat(64),
        contentHash: 'pwa-hash',
        contentType: 'image/png',
        kind: 'pwa_icon',
        objectKey: `tenants/${tenantIds.default}/branding/pwa_icon/pwa-hash/icon.png`,
        originalFilename: 'icon.png',
      })

      await repository.upsertSettings({ pwaIconAssetId: asset.id })
      brandingStorage.objects.set(asset.objectKey, {
        body: Buffer.from('pwa-icon'),
        contentLength: 8,
        contentType: 'image/png',
      })

      const response = await app.inject({
        headers: {
          host: 'lk.default.test',
        },
        method: 'GET',
        url: `/api/tenant/icons/icon-512.png?v=default-asset-${asset.id}`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['cache-control']).toBe(
        'public, max-age=31536000, immutable',
      )
      expect(response.headers.vary).toBe('Host')
      expect(response.headers['content-type']).toBe('image/png')
      expect(response.headers['x-content-type-options']).toBe('nosniff')
      expect(response.body).toBe('pwa-icon')
    } finally {
      await app.close()
    }
  }, 20_000)

  it('does not stream active tenant pwa icon content for stale or missing manifest icon versions', async () => {
    const brandingStorage = createTestBrandingObjectStorage()
    const { app, database, tenantIds } = await createTenantApp(
      {},
      {
        brandingObjectStorage: brandingStorage.storage,
      },
    )

    try {
      const repository = createBrandingRepository(database.db, {
        tenantId: tenantIds.default,
      })
      const asset = await repository.createAssetMetadata({
        byteSize: 8,
        checksumSha256: 'p'.repeat(64),
        contentHash: 'pwa-hash',
        contentType: 'image/png',
        kind: 'pwa_icon',
        objectKey: `tenants/${tenantIds.default}/branding/pwa_icon/pwa-hash/icon.png`,
        originalFilename: 'icon.png',
      })

      await repository.upsertSettings({ pwaIconAssetId: asset.id })
      brandingStorage.objects.set(asset.objectKey, {
        body: Buffer.from('pwa-icon'),
        contentLength: 8,
        contentType: 'image/png',
      })

      const staleResponse = await app.inject({
        headers: {
          host: 'lk.default.test',
        },
        method: 'GET',
        url: '/api/tenant/icons/icon-512.png?v=default-asset-999999',
      })
      const missingVersionResponse = await app.inject({
        headers: {
          host: 'lk.default.test',
        },
        method: 'GET',
        url: '/api/tenant/icons/icon-512.png',
      })

      expect(staleResponse.statusCode).toBe(404)
      expect(staleResponse.headers['cache-control']).toBe('no-store')
      expect(staleResponse.body).not.toBe('pwa-icon')
      expect(missingVersionResponse.statusCode).toBe(404)
      expect(missingVersionResponse.headers['cache-control']).toBe('no-store')
      expect(missingVersionResponse.body).not.toBe('pwa-icon')
    } finally {
      await app.close()
    }
  }, 20_000)

  it('streams unversioned Apple tenant pwa icon with no-store cache headers', async () => {
    const brandingStorage = createTestBrandingObjectStorage()
    const { app, database, tenantIds } = await createTenantApp(
      {},
      {
        brandingObjectStorage: brandingStorage.storage,
      },
    )

    try {
      const repository = createBrandingRepository(database.db, {
        tenantId: tenantIds.default,
      })
      const asset = await repository.createAssetMetadata({
        byteSize: 8,
        checksumSha256: 'p'.repeat(64),
        contentHash: 'pwa-hash',
        contentType: 'image/png',
        kind: 'pwa_icon',
        objectKey: `tenants/${tenantIds.default}/branding/pwa_icon/pwa-hash/icon.png`,
        originalFilename: 'icon.png',
      })

      await repository.upsertSettings({ pwaIconAssetId: asset.id })
      brandingStorage.objects.set(asset.objectKey, {
        body: Buffer.from('pwa-icon'),
        contentLength: 8,
        contentType: 'image/png',
      })

      const response = await app.inject({
        headers: {
          host: 'lk.default.test',
        },
        method: 'GET',
        url: '/api/tenant/apple-touch-icon.png',
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.headers.vary).toBe('Host')
      expect(response.headers['x-content-type-options']).toBe('nosniff')
      expect(response.body).toBe('pwa-icon')
    } finally {
      await app.close()
    }
  }, 20_000)

  it('does not immutable-cache a pwa icon object whose asset no longer matches the validated version', async () => {
    const app = Fastify()
    const tenant = {
      chatwoot: {
        accountId: 1,
        apiAccessToken: 'token',
        baseUrl: 'https://chatwoot.example.test',
        portalInboxId: 1,
        portalInboxIdentifier: 'portal-inbox',
        webhookSecret: 'webhook-secret',
      },
      displayName: 'Default Tenant',
      id: 1,
      isDefault: true,
      primaryDomain: 'lk.default.test',
      publicBaseUrl: 'https://lk.default.test',
      slug: 'default',
      status: 'active',
    } satisfies TenantRequestContext
    const tenantsService = {
      getPublicTenantContext: (context: TenantRequestContext) => ({
        displayName: context.displayName,
        primaryDomain: context.primaryDomain,
        publicBaseUrl: context.publicBaseUrl,
        slug: context.slug,
      }),
      resolveTenantByHost: async () => tenant,
    }
    const pwaIconReader = {
      getActivePwaIconMetadata: async () => ({
        assetId: 1,
        contentType: 'image/png',
      }),
      getActivePwaIconObject: async () => ({
        assetId: 2,
        body: Readable.from(Buffer.from('new-icon')),
        contentLength: 8,
        contentType: 'image/png',
      }),
    } satisfies TenantPwaIconReader

    registerApiErrorHandler(app)
    registerTenantContext(app, { tenantsService })
    registerTenantRoutes(app, { pwaIconReader, tenantsService })

    try {
      await app.ready()

      const response = await app.inject({
        headers: {
          host: 'lk.default.test',
        },
        method: 'GET',
        url: '/api/tenant/icons/icon-512.png?v=default-asset-1',
      })

      expect(response.statusCode).toBe(404)
      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.body).not.toBe('new-icon')
    } finally {
      await app.close()
    }
  })

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

  it('blocks non-active tenants before public, auth, chat and webhook runtime', async () => {
    const { app, database } = await createTenantApp()
    const blockedStatuses: Exclude<TenantStatus, 'active'>[] = [
      'suspended',
      'provisioning',
      'archived',
    ]

    try {
      for (const status of blockedStatuses) {
        const primaryDomain = `lk.${status}.test`

        await seedTenant(database, {
          displayName: `${status} Tenant`,
          primaryDomain,
          publicBaseUrl: `https://${primaryDomain}`,
          slug: status,
          status,
        })

        const responses = await Promise.all([
          app.inject({
            headers: {
              host: primaryDomain,
            },
            method: 'GET',
            url: '/api/tenant',
          }),
          app.inject({
            headers: {
              host: primaryDomain,
              origin: `https://${primaryDomain}`,
            },
            method: 'POST',
            payload: {
              email: 'name@example.test',
              password: 'Secret123',
            },
            url: '/api/auth/login',
          }),
          app.inject({
            headers: {
              host: primaryDomain,
            },
            method: 'GET',
            url: '/api/chat/threads',
          }),
          app.inject({
            headers: {
              'content-type': 'application/json',
              host: primaryDomain,
            },
            method: 'POST',
            payload: Buffer.from('{}'),
            url: '/api/chatwoot/webhooks',
          }),
        ])

        for (const response of responses) {
          expect(response.statusCode).toBe(503)
          expect(response.json()).toEqual({
            error: {
              code: 'TENANT_RUNTIME_DISABLED',
              message: 'Личный кабинет для этого домена сейчас недоступен.',
            },
          })
        }
      }
    } finally {
      await app.close()
    }
  }, 20_000)

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

  it('allows non-default tenant customer runtime after tenant isolation phases are complete', async () => {
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

      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Неверный email или пароль.',
        },
      })
    } finally {
      await app.close()
    }
  }, 15_000)

  it('verifies Chatwoot webhooks with the current tenant secret from Host', async () => {
    const { app } = await createTenantApp()
    const payload = {
      conversation: {
        id: 101,
      },
      event: 'message_created',
      id: 501,
      private: false,
    }

    try {
      const signedWithDefaultSecret = createSignedWebhook({
        payload,
        secret: 'default:webhook-secret',
      })
      const wrongSecretResponse = await app.inject({
        headers: {
          host: 'lk.second.test',
          ...signedWithDefaultSecret.headers,
        },
        method: 'POST',
        payload: signedWithDefaultSecret.rawBody,
        url: '/api/chatwoot/webhooks',
      })

      expect(wrongSecretResponse.statusCode).toBe(401)
      expect(wrongSecretResponse.json()).toEqual({
        error: {
          code: 'chatwoot_webhook_signature_invalid',
          message: 'Chatwoot webhook signature is invalid.',
        },
      })

      const signedWithSecondSecret = createSignedWebhook({
        deliveryKey: 'delivery-2',
        payload,
        secret: 'second:webhook-secret',
      })
      const currentTenantSecretResponse = await app.inject({
        headers: {
          host: 'lk.second.test',
          ...signedWithSecondSecret.headers,
        },
        method: 'POST',
        payload: signedWithSecondSecret.rawBody,
        url: '/api/chatwoot/webhooks',
      })

      expect(currentTenantSecretResponse.statusCode).toBe(200)
      expect(currentTenantSecretResponse.json()).toEqual({
        reason: 'unmapped_conversation',
        result: 'ignored',
      })
    } finally {
      await app.close()
    }
  }, 20_000)
})
