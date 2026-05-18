import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import type { MockedFunction } from 'vitest'

import { registerApiErrorHandler, ApiError } from '../../lib/errors.js'
import { testEnv } from '../../test/appTestHelpers.js'
import type { AuthService } from '../auth/service.js'
import type { TenantRequestContext } from '../tenants/service.js'
import { registerChatThreadsRoutes } from './routes.js'
import type { ChatThreadsService } from './service.js'

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

type ListCurrentUserThreads = ChatThreadsService['listCurrentUserThreads']

async function buildThreadsRoutesTestApp({
  listCurrentUserThreads = vi.fn<ListCurrentUserThreads>().mockResolvedValue({
    activeThreadId: 'private:me',
    threads: [],
  }),
}: {
  listCurrentUserThreads?: MockedFunction<ListCurrentUserThreads>
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
  registerChatThreadsRoutes(app, {
    authService,
    createChatThreadsService: () => ({
      listCurrentUserThreads,
    }),
    env: testEnv,
  })
  await app.ready()

  return {
    app,
    listCurrentUserThreads,
  }
}

describe('registerChatThreadsRoutes', () => {
  it('returns current user chat threads', async () => {
    const { app, listCurrentUserThreads } = await buildThreadsRoutesTestApp({
      listCurrentUserThreads: vi.fn().mockResolvedValue({
        activeThreadId: 'private:me',
        threads: [
          {
            id: 'private:me',
            subtitle: 'Только вы и поддержка',
            title: 'Личный чат',
            type: 'private',
          },
          {
            id: 'group:154',
            subtitle: 'Групповой чат',
            title: 'ООО "Ромашка"',
            type: 'group',
          },
        ],
      }),
    })

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/threads',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        activeThreadId: 'private:me',
        threads: [
          {
            id: 'private:me',
            subtitle: 'Только вы и поддержка',
            title: 'Личный чат',
            type: 'private',
          },
          {
            id: 'group:154',
            subtitle: 'Групповой чат',
            title: 'ООО "Ромашка"',
            type: 'group',
          },
        ],
      })
      expect(listCurrentUserThreads).toHaveBeenCalledWith({
        userId: 7,
      })
    } finally {
      await app.close()
    }
  })

  it('returns controlled configuration errors from the thread service', async () => {
    const { app } = await buildThreadsRoutesTestApp({
      listCurrentUserThreads: vi
        .fn()
        .mockRejectedValue(
          new ApiError(
            403,
            'portal_client_group_contact_ids_invalid',
            'Доступ к порталу настроен некорректно. Обратитесь в поддержку.',
          ),
        ),
    })

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/threads',
      })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual({
        error: {
          code: 'portal_client_group_contact_ids_invalid',
          message:
            'Доступ к порталу настроен некорректно. Обратитесь в поддержку.',
        },
      })
    } finally {
      await app.close()
    }
  })

  it('returns controlled person-contact authority errors from the thread service', async () => {
    const { app } = await buildThreadsRoutesTestApp({
      listCurrentUserThreads: vi
        .fn()
        .mockRejectedValue(
          new ApiError(
            403,
            'portal_contact_disabled',
            'Доступ к порталу настроен некорректно. Обратитесь в поддержку.',
          ),
        ),
    })

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/threads',
      })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual({
        error: {
          code: 'portal_contact_disabled',
          message:
            'Доступ к порталу настроен некорректно. Обратитесь в поддержку.',
        },
      })
    } finally {
      await app.close()
    }
  })
})
