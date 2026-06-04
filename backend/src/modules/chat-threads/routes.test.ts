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

type ListCurrentUserThreads = ChatThreadsService['listCurrentUserThreads']
type GetCurrentUserThreadInfo = ChatThreadsService['getCurrentUserThreadInfo']

async function buildThreadsRoutesTestApp({
  getCurrentUserThreadInfo = vi
    .fn<GetCurrentUserThreadInfo>()
    .mockResolvedValue({
      accessLabel: '',
      activeThread: null,
      curatorName: null,
      lastActivityAt: null,
      participants: [],
      reason: 'thread_invalid',
      result: 'not_ready',
      startedAt: null,
      supportLabel: 'Команда Local Test Tenant',
      threadTypeLabel: null,
    }),
  listCurrentUserThreads = vi.fn<ListCurrentUserThreads>().mockResolvedValue({
    activeThreadId: 'private:me',
    threads: [],
    totalUnreadCount: 0,
  }),
}: {
  getCurrentUserThreadInfo?: MockedFunction<GetCurrentUserThreadInfo>
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
      getCurrentUserThreadInfo,
      listCurrentUserThreads,
    }),
    env: testEnv,
  })
  await app.ready()

  return {
    app,
    getCurrentUserThreadInfo,
    listCurrentUserThreads,
  }
}

describe('registerChatThreadsRoutes', () => {
  it('returns current user chat thread info', async () => {
    const getCurrentUserThreadInfo = vi.fn().mockResolvedValue({
      accessLabel: 'Вы и поддержка',
      activeThread: {
        id: 'private:me',
        subtitle: 'Вы и поддержка',
        title: 'Личный чат',
        type: 'private',
      },
      curatorName: 'Анна Маттина',
      lastActivityAt: '2026-05-19T00:00:00.000Z',
      participants: [],
      reason: 'none',
      result: 'ready',
      startedAt: '2026-05-18T00:00:00.000Z',
      supportLabel: 'Команда Local Test Tenant',
      threadTypeLabel: 'Личный',
    })
    const { app } = await buildThreadsRoutesTestApp({
      getCurrentUserThreadInfo,
    })

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/threads/private%3Ame/info',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        curatorName: 'Анна Маттина',
        threadTypeLabel: 'Личный',
      })
      expect(getCurrentUserThreadInfo).toHaveBeenCalledWith({
        threadId: 'private:me',
        userId: 7,
      })
    } finally {
      await app.close()
    }
  })

  it('returns current user chat threads', async () => {
    const { app, listCurrentUserThreads } = await buildThreadsRoutesTestApp({
      listCurrentUserThreads: vi.fn().mockResolvedValue({
        activeThreadId: 'private:me',
        threads: [
          {
            avatarUrl: '/api/tenant/icons/icon-192.png',
            id: 'private:me',
            subtitle: 'Вы и поддержка',
            title: 'Личный чат',
            type: 'private',
            unreadCount: 2,
          },
          {
            avatarUrl: null,
            id: 'group:154',
            subtitle: 'Групповой чат',
            title: 'ООО "Ромашка"',
            type: 'group',
            unreadCount: 3,
          },
        ],
        totalUnreadCount: 5,
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
            avatarUrl: '/api/tenant/icons/icon-192.png',
            id: 'private:me',
            subtitle: 'Вы и поддержка',
            title: 'Личный чат',
            type: 'private',
            unreadCount: 2,
          },
          {
            avatarUrl: null,
            id: 'group:154',
            subtitle: 'Групповой чат',
            title: 'ООО "Ромашка"',
            type: 'group',
            unreadCount: 3,
          },
        ],
        totalUnreadCount: 5,
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
