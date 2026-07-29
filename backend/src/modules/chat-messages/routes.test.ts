import { Readable } from 'node:stream'

import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import { registerApiErrorHandler } from '../../lib/errors.js'
import {
  createMultipartAttachmentsPayload,
  testEnv,
} from '../../test/appTestHelpers.js'
import type { AuthService } from '../auth/service.js'
import type { TenantRequestContext } from '../tenants/service.js'
import {
  createChatAttachmentUploadAdmission,
  type ChatAttachmentUploadAdmission,
} from './attachmentUploadAdmission.js'
import { registerChatMessagesRoutes } from './routes.js'

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

async function buildMessagesRoutesTestApp({
  attachmentUploadAdmission,
  rateLimitResult,
}: {
  attachmentUploadAdmission?: ChatAttachmentUploadAdmission
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
    consumeAttachmentUpload: vi.fn().mockResolvedValue(rateLimitResult),
  }
  const chatMessagesService = {
    getCurrentUserChatAttachment: vi.fn(),
    getCurrentUserChatMessageAvatar: vi.fn(),
    getCurrentUserGroupParticipantAvatar: vi.fn(),
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
    ...(attachmentUploadAdmission ? { attachmentUploadAdmission } : {}),
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

function createDeferredAttachmentResult() {
  let resolve!: (value: {
    activeThread: null
    reason: 'thread_access_denied'
    result: 'not_ready'
    sentMessage: null
  }) => void
  const promise = new Promise<{
    activeThread: null
    reason: 'thread_access_denied'
    result: 'not_ready'
    sentMessage: null
  }>((resolvePromise) => {
    resolve = resolvePromise
  })

  return {
    promise,
    resolve,
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
    const multipart = createMultipartAttachmentsPayload({
      attachments: [
        {
          fileContent: Buffer.from('%PDF-1.7\n'),
          fileName: 'invoice.pdf',
          mimeType: 'application/pdf',
        },
      ],
      clientMessageKey: 'portal-send:limited-attachment',
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
        url: '/api/chat/messages/attachments',
      })

      expect(response.statusCode).toBe(429)
      expect(response.headers['retry-after']).toBe('60')
      expect(chatSendRateLimiter.consumeAttachmentUpload).toHaveBeenCalledWith({
        tenantId: tenant.id,
        userId: 7,
      })
      expect(
        chatMessagesService.sendCurrentUserAttachmentMessage,
      ).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it.each([
    {
      code: 'attachment_required',
      createMultipart: () =>
        createMultipartAttachmentsPayload({
          attachments: [],
          clientMessageKey: 'portal-send:no-attachments',
          threadId: 'private:me',
        }),
      name: 'zero files',
      statusCode: 400,
    },
    {
      code: 'attachment_count_exceeded',
      createMultipart: () =>
        createMultipartAttachmentsPayload({
          attachments: Array.from({ length: 6 }, (_, index) => ({
            fileContent: Buffer.from(`file-${index}`),
            fileName: `file-${index}.txt`,
            mimeType: 'text/plain',
          })),
          clientMessageKey: 'portal-send:too-many-attachments',
          threadId: 'private:me',
        }),
      name: 'six files',
      statusCode: 400,
    },
    {
      code: 'attachment_batch_too_large',
      createMultipart: () =>
        createMultipartAttachmentsPayload({
          attachments: [
            {
              fileContent: Buffer.alloc(40 * 1024 * 1024),
              fileName: 'large.zip',
              mimeType: 'application/zip',
            },
            {
              fileContent: Buffer.alloc(1),
              fileName: 'overflow.txt',
              mimeType: 'text/plain',
            },
          ],
          clientMessageKey: 'portal-send:aggregate-overflow',
          threadId: 'private:me',
        }),
      name: 'more than 40 MiB in aggregate',
      statusCode: 413,
    },
    {
      code: 'attachment_field_required',
      createMultipart: () => {
        const multipart = createMultipartAttachmentsPayload({
          attachments: [
            {
              fileContent: Buffer.from('file'),
              fileName: 'file.txt',
              mimeType: 'text/plain',
            },
          ],
          clientMessageKey: 'portal-send:wrong-file-field',
          threadId: 'private:me',
        })

        return {
          ...multipart,
          payload: Buffer.from(
            multipart.payload
              .toString('latin1')
              .replace('name="attachments"', 'name="attachment"'),
            'latin1',
          ),
        }
      },
      name: 'the singular file field',
      statusCode: 400,
    },
  ])(
    'rejects $name with a controlled attachment error',
    async ({ code, createMultipart, statusCode }) => {
      const { app, chatMessagesService } = await buildMessagesRoutesTestApp({
        rateLimitResult: {
          status: 'allowed',
        },
      })
      const multipart = createMultipart()

      try {
        const response = await app.inject({
          headers: {
            'content-type': multipart.contentType,
            cookie: createAuthorizedCookie(app),
            origin: testEnv.APP_ORIGIN,
          },
          method: 'POST',
          payload: multipart.payload,
          url: '/api/chat/messages/attachments',
        })

        expect(response.statusCode).toBe(statusCode)
        expect(response.json()).toMatchObject({
          error: {
            code,
          },
        })
        expect(
          chatMessagesService.sendCurrentUserAttachmentMessage,
        ).not.toHaveBeenCalled()
      } finally {
        await app.close()
      }
    },
  )

  it('returns 429 without reading a limited attachment request body', async () => {
    const { app, chatMessagesService, chatSendRateLimiter } =
      await buildMessagesRoutesTestApp({
        rateLimitResult: {
          retryAfterSeconds: 60,
          status: 'limited',
        },
      })
    let bodyReadCount = 0
    const unreadableBody = new Readable({
      read() {
        bodyReadCount += 1
        this.destroy(new Error('Attachment request body was read.'))
      },
    })

    try {
      const response = await app.inject({
        headers: {
          'content-type':
            'multipart/form-data; boundary=----portal-unreadable-boundary',
          cookie: createAuthorizedCookie(app),
          origin: testEnv.APP_ORIGIN,
        },
        method: 'POST',
        payload: unreadableBody,
        url: '/api/chat/messages/attachments',
      })

      expect(response.statusCode).toBe(429)
      expect(response.headers['retry-after']).toBe('60')
      expect(bodyReadCount).toBe(0)
      expect(chatSendRateLimiter.consumeAttachmentUpload).toHaveBeenCalledWith({
        tenantId: tenant.id,
        userId: 7,
      })
      expect(
        chatMessagesService.sendCurrentUserAttachmentMessage,
      ).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('rejects excess active uploads without reading them and releases capacity', async () => {
    const attachmentUploadAdmission = createChatAttachmentUploadAdmission({
      maxActiveUploads: 2,
    })
    const { app, chatMessagesService } = await buildMessagesRoutesTestApp({
      attachmentUploadAdmission,
      rateLimitResult: {
        status: 'allowed',
      },
    })
    const firstSend = createDeferredAttachmentResult()
    const secondSend = createDeferredAttachmentResult()
    chatMessagesService.sendCurrentUserAttachmentMessage
      .mockImplementationOnce(() => firstSend.promise)
      .mockImplementationOnce(() => secondSend.promise)
    const firstMultipart = createMultipartAttachmentsPayload({
      attachments: [
        {
          fileContent: Buffer.from('%PDF-1.7\nfirst'),
          fileName: 'first.pdf',
          mimeType: 'application/pdf',
        },
      ],
      clientMessageKey: 'portal-send:first-active-upload',
      threadId: 'private:me',
    })
    const secondMultipart = createMultipartAttachmentsPayload({
      attachments: [
        {
          fileContent: Buffer.from('%PDF-1.7\nsecond'),
          fileName: 'second.pdf',
          mimeType: 'application/pdf',
        },
      ],
      clientMessageKey: 'portal-send:second-active-upload',
      threadId: 'private:me',
    })
    const firstResponsePromise = app.inject({
      headers: {
        'content-type': firstMultipart.contentType,
        cookie: createAuthorizedCookie(app),
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: firstMultipart.payload,
      url: '/api/chat/messages/attachments',
    })
    const secondResponsePromise = app.inject({
      headers: {
        'content-type': secondMultipart.contentType,
        cookie: createAuthorizedCookie(app),
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: secondMultipart.payload,
      url: '/api/chat/messages/attachments',
    })

    try {
      await vi.waitFor(() => {
        expect(
          chatMessagesService.sendCurrentUserAttachmentMessage,
        ).toHaveBeenCalledTimes(2)
      })

      let rejectedBodyReadCount = 0
      const unreadableBody = new Readable({
        read() {
          rejectedBodyReadCount += 1
          this.destroy(new Error('Rejected attachment body was read.'))
        },
      })
      const rejectedResponse = await app.inject({
        headers: {
          'content-type':
            'multipart/form-data; boundary=----portal-busy-boundary',
          cookie: createAuthorizedCookie(app),
          origin: testEnv.APP_ORIGIN,
        },
        method: 'POST',
        payload: unreadableBody,
        url: '/api/chat/messages/attachments',
      })

      expect(rejectedResponse.statusCode).toBe(503)
      expect(rejectedResponse.headers['retry-after']).toBe('1')
      expect(rejectedBodyReadCount).toBe(0)

      const completedResult = {
        activeThread: null,
        reason: 'thread_access_denied' as const,
        result: 'not_ready' as const,
        sentMessage: null,
      }
      firstSend.resolve(completedResult)
      secondSend.resolve(completedResult)

      const [firstResponse, secondResponse] = await Promise.all([
        firstResponsePromise,
        secondResponsePromise,
      ])

      expect(firstResponse.statusCode).toBe(200)
      expect(secondResponse.statusCode).toBe(200)

      const nextMultipart = createMultipartAttachmentsPayload({
        attachments: [
          {
            fileContent: Buffer.from('%PDF-1.7\nnext'),
            fileName: 'next.pdf',
            mimeType: 'application/pdf',
          },
        ],
        clientMessageKey: 'portal-send:next-upload-after-release',
        threadId: 'private:me',
      })
      const nextResponse = await app.inject({
        headers: {
          'content-type': nextMultipart.contentType,
          cookie: createAuthorizedCookie(app),
          origin: testEnv.APP_ORIGIN,
        },
        method: 'POST',
        payload: nextMultipart.payload,
        url: '/api/chat/messages/attachments',
      })

      expect(nextResponse.statusCode).toBe(200)
    } finally {
      firstSend.resolve({
        activeThread: null,
        reason: 'thread_access_denied',
        result: 'not_ready',
        sentMessage: null,
      })
      secondSend.resolve({
        activeThread: null,
        reason: 'thread_access_denied',
        result: 'not_ready',
        sentMessage: null,
      })
      await app.close()
    }
  })

  it('releases upload admission after an aborted multipart stream', async () => {
    const attachmentUploadAdmission = createChatAttachmentUploadAdmission({
      maxActiveUploads: 1,
    })
    const { app } = await buildMessagesRoutesTestApp({
      attachmentUploadAdmission,
      rateLimitResult: {
        status: 'allowed',
      },
    })
    let bodyReadCount = 0
    const abortedBody = new Readable({
      read() {
        bodyReadCount += 1
        this.push(
          Buffer.from(
            '------portal-aborted-boundary\r\nContent-Disposition: form-data; name="attachments"; filename="partial.txt"\r\nContent-Type: text/plain\r\n\r\npartial',
          ),
        )
        this.destroy(new Error('Simulated attachment upload abort.'))
      },
    })

    try {
      await app
        .inject({
          headers: {
            'content-type':
              'multipart/form-data; boundary=----portal-aborted-boundary',
            cookie: createAuthorizedCookie(app),
            origin: testEnv.APP_ORIGIN,
          },
          method: 'POST',
          payload: abortedBody,
          url: '/api/chat/messages/attachments',
        })
        .catch(() => undefined)

      expect(bodyReadCount).toBeGreaterThan(0)

      await vi.waitFor(() => {
        const releaseProbe = attachmentUploadAdmission.tryAcquire()

        expect(releaseProbe).toBeTypeOf('function')
        releaseProbe?.()
      })

      const nextMultipart = createMultipartAttachmentsPayload({
        attachments: [
          {
            fileContent: Buffer.from('next'),
            fileName: 'next.txt',
            mimeType: 'text/plain',
          },
        ],
        clientMessageKey: 'portal-send:after-abort',
        threadId: 'private:me',
      })
      const nextResponse = await app.inject({
        headers: {
          'content-type': nextMultipart.contentType,
          cookie: createAuthorizedCookie(app),
          origin: testEnv.APP_ORIGIN,
        },
        method: 'POST',
        payload: nextMultipart.payload,
        url: '/api/chat/messages/attachments',
      })

      expect(nextResponse.statusCode).toBe(200)
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
    const multipart = createMultipartAttachmentsPayload({
      attachments: [
        {
          fileContent: Buffer.from('%PDF-1.7\n'),
          fileName: 'invoice.pdf',
          mimeType: 'application/pdf',
        },
      ],
      clientMessageKey: 'portal-send:missing-thread-attachment',
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
        url: '/api/chat/messages/attachments',
      })

      expect(response.statusCode).toBe(400)
      expect(chatSendRateLimiter.consume).not.toHaveBeenCalled()
      expect(chatSendRateLimiter.consumeAttachmentUpload).toHaveBeenCalledWith({
        tenantId: tenant.id,
        userId: 7,
      })
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
    const multipart = createMultipartAttachmentsPayload({
      attachments: [
        {
          fileContent: Buffer.from('%PDF-1.7\n'),
          fileName: 'invoice.pdf',
          mimeType: 'application/pdf',
        },
        {
          fileContent: Buffer.from('notes'),
          fileName: 'notes.txt',
          mimeType: 'text/plain',
        },
      ],
      clientMessageKey: 'portal-send:group-attachment',
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
        url: '/api/chat/messages/attachments',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        activeThread: null,
        reason: 'thread_access_denied',
        result: 'not_ready',
        sentMessage: null,
      })
      expect(chatSendRateLimiter.consumeAttachmentUpload).toHaveBeenCalledWith({
        tenantId: tenant.id,
        userId: 7,
      })
      expect(
        chatMessagesService.sendCurrentUserAttachmentMessage,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            expect.objectContaining({ fileName: 'invoice.pdf' }),
            expect.objectContaining({ fileName: 'notes.txt' }),
          ],
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

  it('does not retain the old singular attachment route', async () => {
    const { app } = await buildMessagesRoutesTestApp({
      rateLimitResult: {
        status: 'allowed',
      },
    })
    const multipart = createMultipartAttachmentsPayload({
      attachments: [
        {
          fileContent: Buffer.from('file'),
          fileName: 'file.txt',
          mimeType: 'text/plain',
        },
      ],
      clientMessageKey: 'portal-send:old-route',
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

      expect(response.statusCode).toBe(404)
    } finally {
      await app.close()
    }
  })
})
