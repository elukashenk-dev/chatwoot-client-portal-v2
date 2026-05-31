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
    getCurrentUserChatAttachment: vi.fn(),
    getCurrentUserChatMessageAvatar: vi.fn(),
    getCurrentUserChatMedia: vi.fn().mockResolvedValue({
      activeThread: null,
      hasMoreOlder: false,
      items: [],
      nextOlderCursor: null,
      reason: 'thread_access_denied',
      result: 'not_ready',
    }),
    getCurrentUserChatSearch: vi.fn().mockResolvedValue({
      activeThread: null,
      hasMoreOlder: false,
      items: [],
      nextOlderCursor: null,
      query: '',
      reason: 'thread_access_denied',
      result: 'not_ready',
    }),
    getCurrentUserChatMessageContext: vi.fn().mockResolvedValue({
      activeThread: null,
      earlierCursor: null,
      hasMoreEarlier: false,
      hasMoreLater: false,
      laterCursor: null,
      messages: [],
      reason: 'thread_access_denied',
      result: 'not_ready',
      targetMessageId: 1,
    }),
    getCurrentUserThreadAvatar: vi.fn(),
    getCurrentUserChatMessages: vi.fn().mockResolvedValue({
      activeThread: null,
      hasMoreOlder: false,
      messages: [],
      nextOlderCursor: null,
      reason: 'thread_access_denied',
      result: 'not_ready',
    }),
    sendCurrentUserAttachmentMessage: vi.fn().mockResolvedValue({
      activeThread: null,
      reason: 'thread_access_denied',
      result: 'not_ready',
      sentMessage: null,
    }),
    sendCurrentUserTextMessage: vi.fn().mockResolvedValue({
      activeThread: null,
      reason: 'thread_access_denied',
      result: 'not_ready',
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
  it('defaults message history to the private thread during rollout', async () => {
    const { app, chatMessagesService } = await buildMessagesRoutesTestApp({
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
        url: '/api/chat/messages',
      })

      expect(response.statusCode).toBe(200)
      expect(
        chatMessagesService.getCurrentUserChatMessages,
      ).toHaveBeenCalledWith({
        beforeMessageId: null,
        threadId: 'private:me',
        userId: 7,
      })
    } finally {
      await app.close()
    }
  })

  it('passes group history thread ids to the chat message service', async () => {
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
        url: '/api/chat/messages?threadId=group%3A154',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        activeThread: null,
        hasMoreOlder: false,
        messages: [],
        nextOlderCursor: null,
        reason: 'thread_access_denied',
        result: 'not_ready',
      })
      expect(chatSendRateLimiter.consume).not.toHaveBeenCalled()
      expect(
        chatMessagesService.getCurrentUserChatMessages,
      ).toHaveBeenCalledWith({
        beforeMessageId: null,
        threadId: 'group:154',
        userId: 7,
      })
    } finally {
      await app.close()
    }
  })

  it('passes group text sends to the chat message service after rate limiting', async () => {
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
          clientMessageKey: 'portal-send:group-text',
          content: 'Здравствуйте',
          threadId: 'group:154',
        },
        url: '/api/chat/messages',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        activeThread: null,
        reason: 'thread_access_denied',
        result: 'not_ready',
        sentMessage: null,
      })
      expect(chatSendRateLimiter.consume).toHaveBeenCalledWith({
        kind: 'text',
        tenantId: tenant.id,
        threadId: 'group:154',
        userId: 7,
      })
      expect(
        chatMessagesService.sendCurrentUserTextMessage,
      ).toHaveBeenCalledWith({
        clientMessageKey: 'portal-send:group-text',
        content: 'Здравствуйте',
        replyToMessageId: null,
        threadId: 'group:154',
        userId: 7,
      })
    } finally {
      await app.close()
    }
  })

  it('requires threadId for text sends', async () => {
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
          clientMessageKey: 'portal-send:missing-thread',
          content: 'Здравствуйте',
        },
        url: '/api/chat/messages',
      })

      expect(response.statusCode).toBe(400)
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

  it('requires threadId for attachment sends', async () => {
    const { app, chatMessagesService, chatSendRateLimiter } =
      await buildMessagesRoutesTestApp({
        rateLimitResult: {
          status: 'allowed',
        },
      })
    const multipart = createMultipartAttachmentPayload({
      clientMessageKey: 'portal-send:missing-thread-attachment',
      fileContent: Buffer.from('%PDF-1.7\n'),
      fileName: 'invoice.pdf',
      mimeType: 'application/pdf',
      threadId: '',
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

      expect(response.statusCode).toBe(400)
      expect(chatSendRateLimiter.consume).not.toHaveBeenCalled()
      expect(
        chatMessagesService.sendCurrentUserAttachmentMessage,
      ).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('passes group attachment sends to the chat message service after rate limiting', async () => {
    const { app, chatMessagesService, chatSendRateLimiter } =
      await buildMessagesRoutesTestApp({
        rateLimitResult: {
          status: 'allowed',
        },
      })
    const multipart = createMultipartAttachmentPayload({
      clientMessageKey: 'portal-send:group-attachment',
      fileContent: Buffer.from('%PDF-1.7\n'),
      fileName: 'invoice.pdf',
      mimeType: 'application/pdf',
      threadId: 'group:154',
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

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        activeThread: null,
        reason: 'thread_access_denied',
        result: 'not_ready',
        sentMessage: null,
      })
      expect(chatSendRateLimiter.consume).toHaveBeenCalledWith({
        kind: 'attachment',
        tenantId: tenant.id,
        threadId: 'group:154',
        userId: 7,
      })
      expect(
        chatMessagesService.sendCurrentUserAttachmentMessage,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          clientMessageKey: 'portal-send:group-attachment',
          content: null,
          replyToMessageId: null,
          threadId: 'group:154',
          userId: 7,
        }),
      )
    } finally {
      await app.close()
    }
  })
})
