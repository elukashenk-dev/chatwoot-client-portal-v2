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

async function buildAttachmentProxyRoutesTestApp({
  getCurrentUserChatAttachment = vi.fn().mockResolvedValue({
    body: new Response('file-bytes').body,
    headers: new Headers({
      'content-disposition': 'inline; filename="receipt.png"',
      'content-length': '10',
      'content-type': 'image/png',
      'set-cookie': 'leaked=1',
    }),
    status: 206,
  }),
  getCurrentUserChatMessageAvatar = vi.fn().mockResolvedValue({
    body: new Response('avatar-bytes').body,
    headers: new Headers({
      'content-length': '12',
      'content-type': 'image/png',
      'set-cookie': 'leaked=1',
    }),
    status: 200,
  }),
  getCurrentUserThreadAvatar = vi.fn().mockResolvedValue({
    body: new Response('thread-avatar-bytes').body,
    headers: new Headers({
      'content-type': 'image/png',
    }),
    status: 200,
  }),
}: {
  getCurrentUserChatAttachment?: ChatMessagesService['getCurrentUserChatAttachment']
  getCurrentUserChatMessageAvatar?: ChatMessagesService['getCurrentUserChatMessageAvatar']
  getCurrentUserThreadAvatar?: ChatMessagesService['getCurrentUserThreadAvatar']
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
        getCurrentUserChatAttachment,
        getCurrentUserChatMessageAvatar,
        getCurrentUserThreadAvatar,
      }) as unknown as ChatMessagesService,
    env: testEnv,
  })
  await app.ready()

  return {
    app,
    getCurrentUserChatAttachment,
    getCurrentUserChatMessageAvatar,
    getCurrentUserThreadAvatar,
  }
}

describe('chat attachment proxy routes', () => {
  it('streams original attachment content through the message service', async () => {
    const { app, getCurrentUserChatAttachment } =
      await buildAttachmentProxyRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
          range: 'bytes=0-99',
        },
        method: 'GET',
        url: '/api/chat/threads/group%3A154/attachments/501/91',
      })

      expect(response.statusCode).toBe(206)
      expect(response.payload).toBe('file-bytes')
      expect(response.headers['content-type']).toBe('image/png')
      expect(response.headers['content-disposition']).toBe(
        'inline; filename="receipt.png"',
      )
      expect(response.headers['cache-control']).toBe('private, no-store')
      expect(response.headers['set-cookie']).toBeUndefined()
      expect(getCurrentUserChatAttachment).toHaveBeenCalledWith({
        attachmentId: 91,
        messageId: 501,
        rangeHeader: 'bytes=0-99',
        threadId: 'group:154',
        userId: 7,
        variant: 'original',
      })
    } finally {
      await app.close()
    }
  })

  it('streams agent avatar content through the message service', async () => {
    const { app, getCurrentUserChatMessageAvatar } =
      await buildAttachmentProxyRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/threads/private%3Ame/messages/502/avatar',
      })

      expect(response.statusCode).toBe(200)
      expect(response.payload).toBe('avatar-bytes')
      expect(response.headers['content-type']).toBe('image/png')
      expect(response.headers['cache-control']).toBe('private, no-store')
      expect(response.headers['set-cookie']).toBeUndefined()
      expect(getCurrentUserChatMessageAvatar).toHaveBeenCalledWith({
        messageId: 502,
        threadId: 'private:me',
        userId: 7,
      })
    } finally {
      await app.close()
    }
  })

  it('streams thread avatar content through the message service', async () => {
    const { app, getCurrentUserThreadAvatar } =
      await buildAttachmentProxyRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/threads/group%3A154/avatar',
      })

      expect(response.statusCode).toBe(200)
      expect(response.payload).toBe('thread-avatar-bytes')
      expect(response.headers['content-type']).toBe('image/png')
      expect(response.headers['cache-control']).toBe('private, no-store')
      expect(getCurrentUserThreadAvatar).toHaveBeenCalledWith({
        threadId: 'group:154',
        userId: 7,
      })
    } finally {
      await app.close()
    }
  })

  it('does not forward public upstream cache headers for protected attachments', async () => {
    const { app } = await buildAttachmentProxyRoutesTestApp({
      getCurrentUserChatAttachment: vi.fn().mockResolvedValue({
        body: new Response('file-bytes').body,
        headers: new Headers({
          'cache-control': 'public, max-age=31536000',
          'content-type': 'image/png',
        }),
        status: 200,
      }),
    })

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/threads/group%3A154/attachments/501/91',
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['cache-control']).toBe('private, no-store')
    } finally {
      await app.close()
    }
  })

  it('does not forward compressed upstream content length metadata', async () => {
    const { app } = await buildAttachmentProxyRoutesTestApp({
      getCurrentUserChatAttachment: vi.fn().mockResolvedValue({
        body: new Response('decompressed-file-bytes').body,
        headers: new Headers({
          'content-encoding': 'gzip',
          'content-length': '53',
          'content-type': 'text/plain',
        }),
        status: 200,
      }),
    })

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/threads/group%3A154/attachments/501/91',
      })

      expect(response.statusCode).toBe(200)
      expect(response.payload).toBe('decompressed-file-bytes')
      expect(response.headers['content-length']).toBeUndefined()
    } finally {
      await app.close()
    }
  })

  it('passes thumbnail requests to the message service as thumb variant', async () => {
    const { app, getCurrentUserChatAttachment } =
      await buildAttachmentProxyRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/threads/group%3A154/attachments/501/91/thumb',
      })

      expect(response.statusCode).toBe(206)
      expect(getCurrentUserChatAttachment).toHaveBeenCalledWith({
        attachmentId: 91,
        messageId: 501,
        rangeHeader: null,
        threadId: 'group:154',
        userId: 7,
        variant: 'thumb',
      })
    } finally {
      await app.close()
    }
  })

  it('rejects invalid attachment identifiers before calling the service', async () => {
    const { app, getCurrentUserChatAttachment } =
      await buildAttachmentProxyRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/threads/group%3A154/attachments/0/91',
      })

      expect(response.statusCode).toBe(400)
      expect(getCurrentUserChatAttachment).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })
})
