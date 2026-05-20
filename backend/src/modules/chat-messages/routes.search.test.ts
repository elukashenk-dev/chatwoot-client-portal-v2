import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import { registerApiErrorHandler } from '../../lib/errors.js'
import { testEnv } from '../../test/appTestHelpers.js'
import type { AuthService } from '../auth/service.js'
import type { TenantRequestContext } from '../tenants/service.js'
import { registerChatMessagesRoutes } from './routes.js'
import type { ChatMessagesService } from './service.js'

const privateThread = {
  id: 'private:me',
  subtitle: 'Только вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} as const

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

async function buildSearchRoutesTestApp({
  getCurrentUserChatSearch = vi.fn().mockResolvedValue({
    activeThread: privateThread,
    hasMoreOlder: false,
    items: [
      {
        afterSnippet: null,
        authorName: 'Ольга Support',
        authorRole: 'agent',
        beforeSnippet: null,
        content: 'Договор готов к подписанию.',
        createdAt: '2026-05-20T08:20:00.000Z',
        direction: 'incoming',
        id: 'message:204',
        matchRanges: [{ start: 0, end: 7 }],
        messageId: 204,
      },
    ],
    nextOlderCursor: null,
    query: 'договор',
    reason: 'none',
    result: 'ready',
  }),
}: {
  getCurrentUserChatSearch?: ChatMessagesService['getCurrentUserChatSearch']
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
  registerChatMessagesRoutes(app, {
    authService,
    chatSendRateLimiter: {
      consume: vi.fn(),
    },
    createChatMessagesService: () =>
      ({
        getCurrentUserChatSearch,
      }) as unknown as ChatMessagesService,
    env: testEnv,
  })
  await app.ready()

  return {
    app,
    getCurrentUserChatSearch,
  }
}

describe('chat search routes', () => {
  it('requires authentication for chat search', async () => {
    const { app, getCurrentUserChatSearch } = await buildSearchRoutesTestApp()

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/chat/threads/private%3Ame/search?q=%D0%B4%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80',
      })

      expect(response.statusCode).toBe(401)
      expect(getCurrentUserChatSearch).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('passes thread id, query, cursor, and user id to the service', async () => {
    const getCurrentUserChatSearch = vi.fn().mockResolvedValue({
      activeThread: privateThread,
      hasMoreOlder: true,
      items: [],
      nextOlderCursor: 205,
      query: 'договор',
      reason: 'none',
      result: 'ready',
    })
    const { app } = await buildSearchRoutesTestApp({
      getCurrentUserChatSearch,
    })

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/threads/group%3A154/search?q=%20%D0%B4%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80%20&beforeMessageId=205',
      })

      expect(response.statusCode).toBe(200)
      expect(getCurrentUserChatSearch).toHaveBeenCalledWith({
        beforeMessageId: 205,
        query: 'договор',
        threadId: 'group:154',
        userId: 7,
      })
    } finally {
      await app.close()
    }
  })

  it('rejects a too-short query before calling the service', async () => {
    const { app, getCurrentUserChatSearch } = await buildSearchRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/threads/private%3Ame/search?q=a',
      })

      expect(response.statusCode).toBe(400)
      expect(getCurrentUserChatSearch).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('rejects invalid cursors before calling the service', async () => {
    const { app, getCurrentUserChatSearch } = await buildSearchRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/threads/private%3Ame/search?q=%D0%B4%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80&beforeMessageId=-1',
      })

      expect(response.statusCode).toBe(400)
      expect(getCurrentUserChatSearch).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })
})
