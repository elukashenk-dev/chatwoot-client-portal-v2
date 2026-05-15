import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import { registerApiErrorHandler } from '../../lib/errors.js'
import { testEnv } from '../../test/appTestHelpers.js'
import type { AuthService } from '../auth/service.js'
import type { ChatContextSnapshot } from '../chat-context/service.js'
import type { TenantRequestContext } from '../tenants/service.js'
import {
  CHAT_REALTIME_MAX_SUBSCRIPTIONS_PER_KEY,
  createChatRealtimeHub,
} from './hub.js'
import { registerChatRealtimeRoutes } from './routes.js'

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

const readyContext: ChatContextSnapshot = {
  linkedContact: {
    id: 44,
  },
  primaryConversation: {
    assigneeName: null,
    id: 101,
    inboxId: 1,
    lastActivityAt: 1_776_000_000,
    status: 'open',
  },
  reason: 'none',
  result: 'ready',
}

describe('registerChatRealtimeRoutes', () => {
  it('returns 429 before opening an SSE stream when the per chat subscription cap is reached', async () => {
    const app = Fastify({ logger: false })
    const realtimeHub = createChatRealtimeHub()
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
    registerChatRealtimeRoutes(app, {
      authService,
      createChatContextService: () => ({
        getCurrentUserChatContext: vi.fn(async () => readyContext),
      }),
      env: testEnv,
      realtimeHub,
    })

    for (
      let index = 0;
      index < CHAT_REALTIME_MAX_SUBSCRIPTIONS_PER_KEY;
      index += 1
    ) {
      expect(
        realtimeHub.subscribe({
          primaryConversationId: 101,
          send: vi.fn(),
          tenantId: tenant.id,
          userId: 7,
        }).status,
      ).toBe('subscribed')
    }

    await app.ready()

    try {
      const response = await app.inject({
        headers: {
          cookie: `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie(
            'session-token',
          )}`,
        },
        method: 'GET',
        url: '/api/chat/realtime?threadId=private%3Ame',
      })

      expect(response.statusCode).toBe(429)
      expect(response.json()).toEqual({
        error: {
          code: 'CHAT_REALTIME_SUBSCRIPTION_LIMIT_EXCEEDED',
          message: 'Открыто слишком много realtime-подключений к этому чату.',
        },
      })
    } finally {
      await app.close()
    }
  })
})
