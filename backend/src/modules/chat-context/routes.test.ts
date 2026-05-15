import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import { registerApiErrorHandler } from '../../lib/errors.js'
import { testEnv } from '../../test/appTestHelpers.js'
import type { AuthService } from '../auth/service.js'
import type { TenantRequestContext } from '../tenants/service.js'
import { registerChatContextRoutes } from './routes.js'

const tenant: TenantRequestContext = {
  chatwoot: {
    accountId: 1,
    apiAccessToken: 'test-api-token',
    baseUrl: 'https://chatwoot.example.test',
    portalInboxId: 1,
    webhookSecret: 'test-webhook-secret',
  },
  displayName: 'Local Test Tenant',
  id: 1,
  isDefault: true,
  primaryDomain: 'localhost',
  publicBaseUrl: testEnv.APP_ORIGIN,
  slug: 'default',
  status: 'active',
}

function createAuthorizedCookie(app: ReturnType<typeof Fastify>) {
  return `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie('session-token')}`
}

describe('registerChatContextRoutes', () => {
  it('fails closed for company thread ids before resolving chat context', async () => {
    const app = Fastify({ logger: false })
    const chatContextService = {
      getCurrentUserChatContext: vi.fn(),
    }
    const authService = {
      getCurrentUser: vi.fn(async () => ({
        email: 'user@example.test',
        fullName: 'Portal User',
        id: 7,
      })),
    } as unknown as AuthService

    app.register(cookie, {
      hook: 'onRequest',
      secret: testEnv.SESSION_SECRET,
    })
    app.decorateRequest('tenant', null)
    app.addHook('onRequest', async (request) => {
      request.tenant = tenant
    })
    registerApiErrorHandler(app)
    registerChatContextRoutes(app, {
      authService,
      createChatContextService: () => chatContextService,
      env: testEnv,
    })
    await app.ready()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/context?threadId=company%3A154',
      })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual({
        error: {
          code: 'chat_thread_unavailable',
          message: 'Этот чат недоступен.',
        },
      })
      expect(chatContextService.getCurrentUserChatContext).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })
})
