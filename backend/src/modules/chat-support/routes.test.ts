import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import type { MockedFunction } from 'vitest'

import { registerApiErrorHandler } from '../../lib/errors.js'
import { testEnv } from '../../test/appTestHelpers.js'
import type { AuthService } from '../auth/service.js'
import type { TenantRequestContext } from '../tenants/service.js'
import { registerChatSupportRoutes } from './routes.js'
import type { ChatSupportAvailabilityService } from './service.js'

const tenant: TenantRequestContext = {
  chatwoot: {
    accountId: 1,
    apiAccessToken: 'test-api-token',
    baseUrl: 'https://chatwoot.example.test',
    portalInboxIdentifier: null,
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

async function buildSupportRoutesTestApp({
  getSupportAvailability = vi.fn().mockResolvedValue({
    currentStatus: 'online',
    outOfOfficeMessage: null,
    reason: 'none',
    result: 'ready',
    workingHours: {
      enabled: false,
      isWithinWorkingHours: null,
      rows: [],
      timezone: 'UTC',
    },
  }),
}: {
  getSupportAvailability?: MockedFunction<
    ChatSupportAvailabilityService['getSupportAvailability']
  >
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
  registerChatSupportRoutes(app, {
    authService,
    createChatSupportAvailabilityService: () => ({
      getSupportAvailability,
    }),
    env: testEnv,
  })
  await app.ready()

  return {
    app,
    getSupportAvailability,
  }
}

describe('registerChatSupportRoutes', () => {
  it('returns authenticated support availability', async () => {
    const { app, getSupportAvailability } = await buildSupportRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/support-availability',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        currentStatus: 'online',
        result: 'ready',
      })
      expect(response.json()).not.toHaveProperty('agentStatus')
      expect(getSupportAvailability).toHaveBeenCalledTimes(1)
    } finally {
      await app.close()
    }
  })

  it('requires an authenticated portal session', async () => {
    const { app, getSupportAvailability } = await buildSupportRoutesTestApp()

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/chat/support-availability',
      })

      expect(response.statusCode).toBe(401)
      expect(getSupportAvailability).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })
})
