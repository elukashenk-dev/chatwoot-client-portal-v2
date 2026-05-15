import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import { registerApiErrorHandler } from '../../lib/errors.js'
import {
  createMultipartAttachmentPayload,
  testEnv,
} from '../../test/appTestHelpers.js'
import type { AuthService } from '../auth/service.js'
import type { TenantRequestContext } from '../tenants/service.js'
import { registerChatMessagesRoutes } from './routes.js'

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

async function buildMessagesRoutesTestApp({
  rateLimitResult,
}: {
  rateLimitResult:
    | {
        status: 'allowed'
      }
    | {
        retryAfterSeconds: number
        status: 'limited'
      }
}) {
  const app = Fastify({ logger: false })
  const chatSendRateLimiter = {
    consume: vi.fn().mockResolvedValue(rateLimitResult),
  }
  const chatMessagesService = {
    getCurrentUserChatMessages: vi.fn(),
    sendCurrentUserAttachmentMessage: vi.fn().mockResolvedValue({
      activeThread: null,
      linkedContact: null,
      reason: 'chatwoot_unavailable',
      result: 'unavailable',
      sentMessage: null,
    }),
    sendCurrentUserTextMessage: vi.fn().mockResolvedValue({
      activeThread: null,
      linkedContact: null,
      reason: 'chatwoot_unavailable',
      result: 'unavailable',
      sentMessage: null,
    }),
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
  app.register(multipart)
  app.decorateRequest('tenant', null)
  app.addHook('onRequest', async (request) => {
    request.tenant = tenant
  })
  registerApiErrorHandler(app)
  registerChatMessagesRoutes(app, {
    authService,
    chatSendRateLimiter,
    createChatMessagesService: () => chatMessagesService,
    env: testEnv,
  })
  await app.ready()

  return {
    app,
    chatMessagesService,
    chatSendRateLimiter,
  }
}

describe('registerChatMessagesRoutes', () => {
  it('fails closed for company history thread ids before calling the chat message service', async () => {
    const { app, chatMessagesService, chatSendRateLimiter } =
      await buildMessagesRoutesTestApp({
        rateLimitResult: {
          status: 'allowed',
        },
      })

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/messages?threadId=company%3A154',
      })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual({
        error: {
          code: 'chat_thread_unavailable',
          message: 'Этот чат недоступен.',
        },
      })
      expect(chatSendRateLimiter.consume).not.toHaveBeenCalled()
      expect(
        chatMessagesService.getCurrentUserChatMessages,
      ).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('fails closed for company text sends before rate limit and service calls', async () => {
    const { app, chatMessagesService, chatSendRateLimiter } =
      await buildMessagesRoutesTestApp({
        rateLimitResult: {
          status: 'allowed',
        },
      })

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
          origin: testEnv.APP_ORIGIN,
        },
        method: 'POST',
        payload: {
          clientMessageKey: 'portal-send:company-text',
          content: 'Здравствуйте',
          threadId: 'company:154',
        },
        url: '/api/chat/messages',
      })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual({
        error: {
          code: 'chat_thread_unavailable',
          message: 'Этот чат недоступен.',
        },
      })
      expect(chatSendRateLimiter.consume).not.toHaveBeenCalled()
      expect(
        chatMessagesService.sendCurrentUserTextMessage,
      ).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('returns 429 for limited text sends before calling the chat message service', async () => {
    const { app, chatMessagesService, chatSendRateLimiter } =
      await buildMessagesRoutesTestApp({
        rateLimitResult: {
          retryAfterSeconds: 60,
          status: 'limited',
        },
      })

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
          origin: testEnv.APP_ORIGIN,
        },
        method: 'POST',
        payload: {
          clientMessageKey: 'portal-send:limited-text',
          content: 'Здравствуйте',
          threadId: 'private:me',
        },
        url: '/api/chat/messages',
      })

      expect(response.statusCode).toBe(429)
      expect(response.headers['retry-after']).toBe('60')
      expect(response.json()).toEqual({
        error: {
          code: 'CHAT_SEND_RATE_LIMITED',
          message: 'Слишком много сообщений. Попробуйте позже.',
        },
      })
      expect(chatSendRateLimiter.consume).toHaveBeenCalledWith({
        kind: 'text',
        tenantId: tenant.id,
        threadId: 'private:me',
        userId: 7,
      })
      expect(
        chatMessagesService.sendCurrentUserTextMessage,
      ).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('returns 429 for limited attachment sends before calling the chat message service', async () => {
    const { app, chatMessagesService, chatSendRateLimiter } =
      await buildMessagesRoutesTestApp({
        rateLimitResult: {
          retryAfterSeconds: 60,
          status: 'limited',
        },
      })
    const multipart = createMultipartAttachmentPayload({
      clientMessageKey: 'portal-send:limited-attachment',
      fileContent: Buffer.from('%PDF-1.7\n'),
      fileName: 'invoice.pdf',
      mimeType: 'application/pdf',
      threadId: 'private:me',
    })

    try {
      const response = await app.inject({
        headers: {
          'content-type': multipart.contentType,
          cookie: createAuthorizedCookie(app),
          origin: testEnv.APP_ORIGIN,
        },
        method: 'POST',
        payload: multipart.payload,
        url: '/api/chat/messages/attachment',
      })

      expect(response.statusCode).toBe(429)
      expect(response.headers['retry-after']).toBe('60')
      expect(chatSendRateLimiter.consume).toHaveBeenCalledWith({
        kind: 'attachment',
        tenantId: tenant.id,
        threadId: 'private:me',
        userId: 7,
      })
      expect(
        chatMessagesService.sendCurrentUserAttachmentMessage,
      ).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('fails closed for company attachment sends before rate limit and service calls', async () => {
    const { app, chatMessagesService, chatSendRateLimiter } =
      await buildMessagesRoutesTestApp({
        rateLimitResult: {
          status: 'allowed',
        },
      })
    const multipart = createMultipartAttachmentPayload({
      clientMessageKey: 'portal-send:company-attachment',
      fileContent: Buffer.from('%PDF-1.7\n'),
      fileName: 'invoice.pdf',
      mimeType: 'application/pdf',
      threadId: 'company:154',
    })

    try {
      const response = await app.inject({
        headers: {
          'content-type': multipart.contentType,
          cookie: createAuthorizedCookie(app),
          origin: testEnv.APP_ORIGIN,
        },
        method: 'POST',
        payload: multipart.payload,
        url: '/api/chat/messages/attachment',
      })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual({
        error: {
          code: 'chat_thread_unavailable',
          message: 'Этот чат недоступен.',
        },
      })
      expect(chatSendRateLimiter.consume).not.toHaveBeenCalled()
      expect(
        chatMessagesService.sendCurrentUserAttachmentMessage,
      ).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })
})
