import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import { registerApiErrorHandler } from '../../lib/errors.js'
import { testEnv } from '../../test/appTestHelpers.js'
import type { PublicTenantAdmin } from '../tenant-admin/adminAuthPrimitives.js'
import type { TenantRequestContext } from '../tenants/service.js'
import { registerTelegramBridgeAdminRoutes } from './routes.js'

const admin = {
  chatwootAgentId: 42,
  email: 'admin@example.test',
  role: 'administrator',
} satisfies PublicTenantAdmin

const tenant: TenantRequestContext = {
  chatwoot: {
    accountId: 1,
    apiAccessToken: 'tenant-chatwoot-token',
    baseUrl: 'https://chatwoot.example.test',
    portalInboxId: 1,
    portalInboxIdentifier: 'portal-inbox',
    webhookSecret: 'webhook-secret',
  },
  displayName: 'Test Tenant',
  id: 7,
  isDefault: true,
  primaryDomain: 'localhost',
  publicBaseUrl: testEnv.APP_ORIGIN,
  slug: 'default',
  status: 'active',
}

function createApp({
  setupTelegramBridge = vi.fn().mockResolvedValue({
    chatwootTelegramInboxId: 17,
    displayName: 'Telegram support_bot',
    lastWebhookCheckedAt: '2026-06-25T10:00:00.000Z',
    lastWebhookHost: 'app.lancora.ru',
    lastWebhookOwner: 'telegram-bridge',
    publicKey: 'provgroup-support',
    status: 'active',
    telegramBotId: '1234567890',
    telegramBotUsername: 'support_bot',
    webhookConfigured: true,
  }),
} = {}) {
  const app = Fastify({ logger: false })

  app.register(cookie, {
    hook: 'onRequest',
    secret: testEnv.SESSION_SECRET,
  })
  app.decorateRequest('tenant', null)
  app.addHook('onRequest', async (request) => {
    request.tenant = tenant
  })
  registerApiErrorHandler(app)
  registerTelegramBridgeAdminRoutes(app, {
    createTelegramBridgeSetupService: () => ({
      setupTelegramBridge,
    }),
    createTenantAdminAuthService: () => ({
      getCurrentAdminSession: vi.fn().mockImplementation(async ({ sessionToken }) =>
        sessionToken === 'admin-session-token'
          ? {
              admin,
              expiresAt: new Date('2026-06-25T22:00:00.000Z'),
            }
          : null,
      ),
      logout: vi.fn(),
      requestAdminLoginChallenge: vi.fn(),
      verifyAdminLoginCode: vi.fn(),
    }),
    env: testEnv,
  })

  return {
    app,
    setupTelegramBridge,
  }
}

async function createSignedCookie(app: ReturnType<typeof Fastify>, name: string) {
  await app.ready()

  return `${name}=${app.signCookie('admin-session-token')}`
}

function createSetupPayload(telegramBotToken = '1234567890:AASecretBotTokenValue') {
  return {
    chatwootInboxUrl: 'https://app.lancora.ru/app/accounts/1/settings/inboxes/17',
    telegramBotToken,
  }
}

describe('registerTelegramBridgeAdminRoutes', () => {
  it('returns 401 for unauthenticated admin setup requests', async () => {
    const { app, setupTelegramBridge } = createApp()

    const response = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: createSetupPayload(),
      url: '/api/admin/integrations/telegram-bridge/setup',
    })

    expect(response.statusCode).toBe(401)
    expect(setupTelegramBridge).not.toHaveBeenCalled()
    await app.close()
  })

  it('does not accept a customer session cookie as admin authentication', async () => {
    const { app, setupTelegramBridge } = createApp()

    const response = await app.inject({
      headers: {
        cookie: await createSignedCookie(app, testEnv.SESSION_COOKIE_NAME),
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: createSetupPayload(),
      url: '/api/admin/integrations/telegram-bridge/setup',
    })

    expect(response.statusCode).toBe(401)
    expect(setupTelegramBridge).not.toHaveBeenCalled()
    await app.close()
  })

  it('rejects wrong tenant origin before setup mutation', async () => {
    const { app, setupTelegramBridge } = createApp()

    const response = await app.inject({
      headers: {
        cookie: await createSignedCookie(
          app,
          testEnv.ADMIN_SESSION_COOKIE_NAME,
        ),
        origin: 'https://evil.example.test',
      },
      method: 'POST',
      payload: createSetupPayload(),
      url: '/api/admin/integrations/telegram-bridge/setup',
    })

    expect(response.statusCode).toBe(403)
    expect(setupTelegramBridge).not.toHaveBeenCalled()
    await app.close()
  })

  it('returns safe bridge status for a valid admin setup request', async () => {
    const { app, setupTelegramBridge } = createApp()

    const response = await app.inject({
      headers: {
        cookie: await createSignedCookie(
          app,
          testEnv.ADMIN_SESSION_COOKIE_NAME,
        ),
        origin: testEnv.APP_ORIGIN,
        'user-agent': 'vitest',
      },
      method: 'POST',
      payload: createSetupPayload(),
      remoteAddress: '127.0.0.1',
      url: '/api/admin/integrations/telegram-bridge/setup',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      bridge: expect.objectContaining({
        publicKey: 'provgroup-support',
        status: 'active',
        webhookConfigured: true,
      }),
    })
    expect(setupTelegramBridge).toHaveBeenCalledWith({
      admin,
      input: {
        chatwootAccountIdFromUrl: 1,
        chatwootTelegramInboxId: 17,
        telegramBotToken: '1234567890:AASecretBotTokenValue',
      },
      requestIp: '127.0.0.1',
      userAgent: 'vitest',
    })
    expect(response.body).not.toContain('1234567890:AASecretBotTokenValue')
    await app.close()
  })

  it('returns controlled 400 for invalid input without echoing the bot token', async () => {
    const secret = '1234567890:AASecretBotTokenValue'
    const { app, setupTelegramBridge } = createApp()

    const response = await app.inject({
      headers: {
        cookie: await createSignedCookie(
          app,
          testEnv.ADMIN_SESSION_COOKIE_NAME,
        ),
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        chatwootInboxUrl: 'http://app.lancora.ru/app/accounts/1/settings/inboxes/17',
        telegramBotToken: secret,
      },
      url: '/api/admin/integrations/telegram-bridge/setup',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      error: {
        code: 'TELEGRAM_BRIDGE_SETUP_INVALID',
      },
    })
    expect(response.body).not.toContain(secret)
    expect(setupTelegramBridge).not.toHaveBeenCalled()
    await app.close()
  })
})
