import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import { registerApiErrorHandler } from '../../lib/errors.js'
import { testEnv } from '../../test/appTestHelpers.js'
import type { AuthService } from '../auth/service.js'
import type { TenantRequestContext } from '../tenants/service.js'
import { registerChatMessagesRoutes } from './routes.js'
import type { ChatMessagesService } from './service.js'

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

async function buildMediaRoutesTestApp({
  getCurrentUserChatMedia = vi.fn().mockResolvedValue({
    activeThread: {
      id: 'group:154',
      subtitle: 'Групповой чат',
      title: 'Бухгалтерия',
      type: 'group',
    },
    hasMoreOlder: false,
    items: [
      {
        attachmentId: 91,
        authorName: 'Ольга Support',
        authorRole: 'agent',
        category: 'image',
        createdAt: '2026-05-19T10:20:00.000Z',
        direction: 'incoming',
        fileSize: 2048,
        fileType: 'image',
        id: 'attachment:501:91',
        messageId: 501,
        name: 'receipt.png',
        thumbUrl: '/api/chat/threads/group%3A154/attachments/501/91/thumb',
        url: '/api/chat/threads/group%3A154/attachments/501/91',
      },
    ],
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
  }),
}: {
  getCurrentUserChatMedia?: ChatMessagesService['getCurrentUserChatMedia']
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
        getCurrentUserChatMedia,
      }) as unknown as ChatMessagesService,
    env: testEnv,
  })
  await app.ready()

  return {
    app,
    getCurrentUserChatMedia,
  }
}

describe('chat media routes', () => {
  it('returns current user media for the requested thread cursor', async () => {
    const { app, getCurrentUserChatMedia } = await buildMediaRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/threads/group%3A154/media?beforeMessageId=501',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        items: [
          {
            id: 'attachment:501:91',
            name: 'receipt.png',
            url: '/api/chat/threads/group%3A154/attachments/501/91',
          },
        ],
        result: 'ready',
      })
      expect(getCurrentUserChatMedia).toHaveBeenCalledWith({
        beforeMessageId: 501,
        threadId: 'group:154',
        userId: 7,
      })
    } finally {
      await app.close()
    }
  })

  it('passes null cursor when beforeMessageId is omitted', async () => {
    const { app, getCurrentUserChatMedia } = await buildMediaRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/threads/private%3Ame/media',
      })

      expect(response.statusCode).toBe(200)
      expect(getCurrentUserChatMedia).toHaveBeenCalledWith({
        beforeMessageId: null,
        threadId: 'private:me',
        userId: 7,
      })
    } finally {
      await app.close()
    }
  })

  it('rejects invalid media cursors before calling the service', async () => {
    const { app, getCurrentUserChatMedia } = await buildMediaRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/threads/group%3A154/media?beforeMessageId=0',
      })

      expect(response.statusCode).toBe(400)
      expect(getCurrentUserChatMedia).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })
})
