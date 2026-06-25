import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from './app.js'
import type { DatabaseClient } from './db/client.js'
import { portalTenants, telegramBridgeConfigs } from './db/schema.js'
import type { EmailMessage } from './integrations/email/smtp.js'
import {
  decodeTenantSecretKey,
  encryptTenantSecret,
} from './modules/tenants/secrets.js'
import {
  seedDefaultTenant,
  testEnv,
} from './test/appTestHelpers.js'
import { createTestDatabase } from './test/testDatabase.js'

const fixedNow = new Date('2026-06-25T12:00:00.000Z')

function extractCode(message: EmailMessage | undefined) {
  const code = message?.text.match(/\b\d{6}\b/)?.[0]

  if (!code) {
    throw new Error('Expected admin email to contain a six digit code.')
  }

  return code
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
  token,
}: {
  database: DatabaseClient
  tenantId: number
  token: string
}) {
  const key = decodeTenantSecretKey(getTestTenantSecretKey())

  await database.db
    .update(portalTenants)
    .set({
      chatwootAdminVerificationTokenCiphertext: encryptTenantSecret(token, key),
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

async function createAdminCookie({
  app,
  sentEmails,
}: {
  app: FastifyInstance
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

function createChatwootFetch() {
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

    if (url.pathname === '/api/v1/accounts/1/inboxes/17') {
      return new Response(
        JSON.stringify({
          bot_name: 'support_bot',
          channel_type: 'Channel::Telegram',
          id: 17,
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      )
    }

    return new Response(JSON.stringify({ error: 'unexpected path' }), {
      headers: {
        'content-type': 'application/json',
      },
      status: 404,
    })
  })
}

function createTelegramFetch() {
  let webhookUrl = ''

  return vi.fn<typeof fetch>(async (requestUrl, init) => {
    const url = new URL(String(requestUrl))

    if (
      url.origin === testEnv.APP_ORIGIN &&
      url.pathname === '/telegram-bridge/health'
    ) {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      })
    }

    const method = url.pathname.split('/').at(-1)

    if (method === 'getMe') {
      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            id: 1234567890,
            username: 'support_bot',
          },
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      )
    }

    if (method === 'getWebhookInfo') {
      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            url: webhookUrl,
          },
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      )
    }

    if (method === 'setWebhook') {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        url?: string
      }

      webhookUrl = body.url ?? ''

      return new Response(JSON.stringify({ ok: true, result: true }), {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      })
    }

    return new Response(JSON.stringify({ ok: false }), {
      headers: {
        'content-type': 'application/json',
      },
      status: 404,
    })
  })
}

describe('Telegram bridge admin app routes', () => {
  let app: FastifyInstance
  let chatwootFetch: ReturnType<typeof createChatwootFetch>
  let database: DatabaseClient
  let sentEmails: EmailMessage[]
  let telegramFetch: ReturnType<typeof createTelegramFetch>

  beforeEach(async () => {
    database = await createTestDatabase()
    const tenantId = await seedDefaultTenant(database)
    await storeAdminVerificationToken({
      database,
      tenantId,
      token: 'test-admin-verification-token',
    })
    await seedSecondTenant(database)
    chatwootFetch = createChatwootFetch()
    telegramFetch = createTelegramFetch()
    sentEmails = []
    app = buildApp({
      chatwootFetchFn: chatwootFetch,
      database,
      emailDelivery: {
        send: vi.fn(async (message: EmailMessage) => {
          sentEmails.push(message)
        }),
      },
      env: testEnv,
      now: () => fixedNow,
      telegramFetchFn: telegramFetch,
    })
  })

  afterEach(async () => {
    await app.close()
  })

  it('registers the protected tenant admin setup route', async () => {
    const response = await app.inject({
      headers: {
        host: 'localhost',
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        chatwootInboxUrl:
          'https://app.lancora.ru/app/accounts/1/settings/inboxes/17',
        telegramBotToken: '1234567890:AASecretBotTokenValue',
      },
      url: '/api/admin/integrations/telegram-bridge/setup',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      error: {
        code: 'TENANT_ADMIN_UNAUTHORIZED',
      },
    })
  })

  it('sets up a bridge through the authenticated app route and rejects another tenant account URL', async () => {
    const adminCookie = await createAdminCookie({ app, sentEmails })

    const response = await app.inject({
      headers: {
        cookie: adminCookie,
        host: 'localhost',
        origin: testEnv.APP_ORIGIN,
        'user-agent': 'vitest',
      },
      method: 'POST',
      payload: {
        chatwootInboxUrl:
          'https://app.lancora.ru/app/accounts/1/settings/inboxes/17',
        telegramBotToken: '1234567890:AASecretBotTokenValue',
      },
      remoteAddress: '127.0.0.1',
      url: '/api/admin/integrations/telegram-bridge/setup',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      bridge: expect.objectContaining({
        publicKey: expect.any(String),
        status: 'active',
        telegramBotId: '1234567890',
        telegramBotUsername: 'support_bot',
        webhookConfigured: true,
      }),
    })
    expect(response.body).not.toContain('1234567890:AASecretBotTokenValue')
    expect(chatwootFetch).toHaveBeenCalledWith(
      new URL('https://chatwoot.example.test/api/v1/accounts/1/inboxes/17'),
      expect.objectContaining({
        method: 'GET',
      }),
    )
    expect(telegramFetch).toHaveBeenCalledWith(
      new URL(
        'https://api.telegram.org/bot1234567890:AASecretBotTokenValue/setWebhook',
      ),
      expect.objectContaining({
        method: 'POST',
      }),
    )

    const [bridgeConfig] = await database.db
      .select({
        chatwootTelegramInboxId: telegramBridgeConfigs.chatwootTelegramInboxId,
        status: telegramBridgeConfigs.status,
        telegramBotId: telegramBridgeConfigs.telegramBotId,
      })
      .from(telegramBridgeConfigs)

    expect(bridgeConfig).toEqual({
      chatwootTelegramInboxId: 17,
      status: 'active',
      telegramBotId: '1234567890',
    })

    const mismatchResponse = await app.inject({
      headers: {
        cookie: adminCookie,
        host: 'localhost',
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        chatwootInboxUrl:
          'https://app.lancora.ru/app/accounts/2/settings/inboxes/18',
        telegramBotToken: '2234567890:AAOtherTenantSecretBotTokenValue',
      },
      url: '/api/admin/integrations/telegram-bridge/setup',
    })

    expect(mismatchResponse.statusCode).toBe(400)
    expect(mismatchResponse.json()).toMatchObject({
      error: {
        code: 'TELEGRAM_BRIDGE_SETUP_FAILED',
      },
    })
    expect(mismatchResponse.body).not.toContain(
      '2234567890:AAOtherTenantSecretBotTokenValue',
    )
    expect(chatwootFetch).not.toHaveBeenCalledWith(
      new URL('https://chatwoot.example.test/api/v1/accounts/2/inboxes/18'),
      expect.anything(),
    )
  })
})
