import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import { registerApiErrorHandler } from '../../lib/errors.js'
import { testEnv } from '../../test/appTestHelpers.js'
import type { AuthService } from '../auth/service.js'
import type { TenantRequestContext } from '../tenants/service.js'
import { registerChatPresenceRoutes } from './routes.js'
import type { ChatPresenceService } from './service.js'

type MarkCurrentUserThreadRead =
  ChatPresenceService['markCurrentUserThreadRead']

const tenant: TenantRequestContext = {
  chatwoot: {
    accountId: 1,
    apiAccessToken: 'test-api-token',
    baseUrl: 'https://chatwoot.example.test',
    portalInboxIdentifier: 'api-inbox-token',
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

async function buildPresenceRoutesTestApp({
  markCurrentUserThreadRead = vi
    .fn<MarkCurrentUserThreadRead>()
    .mockResolvedValue({ result: 'synced' }),
}: {
  markCurrentUserThreadRead?: ReturnType<typeof vi.fn<MarkCurrentUserThreadRead>>
} = {}) {
  const app = Fastify({ logger: false })
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
  registerChatPresenceRoutes(app, {
    authService,
    createChatPresenceService: () => ({
      markCurrentUserThreadRead,
    }),
    env: testEnv,
  })
  await app.ready()

  return {
    app,
    markCurrentUserThreadRead,
  }
}

describe('registerChatPresenceRoutes', () => {
  it('marks an authenticated thread read and returns no content', async () => {
    const { app, markCurrentUserThreadRead } =
      await buildPresenceRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'POST',
        url: '/api/chat/threads/private%3Ame/read',
      })

      expect(response.statusCode).toBe(204)
      expect(markCurrentUserThreadRead).toHaveBeenCalledWith({
        threadId: 'private:me',
        userId: 7,
      })
    } finally {
      await app.close()
    }
  })

  it('returns no content when read sync is unavailable', async () => {
    const { app, markCurrentUserThreadRead } =
      await buildPresenceRoutesTestApp({
        markCurrentUserThreadRead: vi.fn().mockResolvedValue({
          reason: 'chatwoot_unavailable',
          result: 'unavailable',
        }),
      })

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'POST',
        url: '/api/chat/threads/private%3Ame/read',
      })

      expect(response.statusCode).toBe(204)
      expect(markCurrentUserThreadRead).toHaveBeenCalledTimes(1)
    } finally {
      await app.close()
    }
  })

  it('requires an authenticated portal session', async () => {
    const { app, markCurrentUserThreadRead } =
      await buildPresenceRoutesTestApp()

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat/threads/private%3Ame/read',
      })

      expect(response.statusCode).toBe(401)
      expect(markCurrentUserThreadRead).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })
})
