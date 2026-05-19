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
}: {
  getCurrentUserChatAttachment?: ChatMessagesService['getCurrentUserChatAttachment']
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
      }) as unknown as ChatMessagesService,
    env: testEnv,
  })
  await app.ready()

  return {
    app,
    getCurrentUserChatAttachment,
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
