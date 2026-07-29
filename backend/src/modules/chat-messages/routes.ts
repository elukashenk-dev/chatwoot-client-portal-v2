import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'
import { assertAllowedTenantOrigin } from '../../lib/origin.js'
import { resolveAuthenticatedPortalUser } from '../auth/currentUser.js'
import type { AuthService } from '../auth/service.js'
import { PRIVATE_CHAT_THREAD_ID } from '../chat-threads/privateThread.js'
import { requireTenantContext } from '../tenants/routes.js'
import {
  CHAT_ATTACHMENT_REQUEST_MAX_BYTES,
  parseAttachmentUploads,
} from './attachmentMultipart.js'
import {
  createChatAttachmentUploadAdmission,
  type ChatAttachmentUploadAdmission,
} from './attachmentUploadAdmission.js'
import { registerChatAttachmentProxyRoutes } from './attachmentProxyRoutes.js'
import { registerChatAvatarProxyRoutes } from './avatarProxyRoutes.js'
import { registerChatMessageContextRoutes } from './contextRoutes.js'
import type { ChatSendRateLimiter } from './rateLimit.js'
import type { ChatMessagesService } from './service.js'

const publicThreadIdSchema = z.string().trim().min(1).max(80)

const chatMessagesQuerySchema = z
  .object({
    beforeMessageId: z.coerce.number().int().positive().optional(),
    threadId: publicThreadIdSchema.optional(),
  })
  .strict()

const threadParamsSchema = z.object({ threadId: publicThreadIdSchema }).strict()

const chatMediaQuerySchema = z
  .object({
    beforeMessageId: z.coerce.number().int().positive().optional(),
  })
  .strict()

const chatSearchQuerySchema = z
  .object({
    beforeMessageId: z.coerce.number().int().positive().optional(),
    q: z.string().trim().min(2).max(80),
  })
  .strict()

const sendChatMessageBodySchema = z
  .object({
    clientMessageKey: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1, 'Введите сообщение.').max(4000),
    replyToMessageId: z.number().int().positive().optional(),
    threadId: publicThreadIdSchema,
  })
  .strict()

type RegisterChatMessagesRoutesOptions = {
  attachmentUploadAdmission?: ChatAttachmentUploadAdmission
  authService: AuthService
  chatSendRateLimiter: ChatSendRateLimiter
  createChatMessagesService: (request: FastifyRequest) => ChatMessagesService
  env: AppEnv
}

function acquireAttachmentUploadAdmission({
  attachmentUploadAdmission,
  reply,
}: {
  attachmentUploadAdmission: ChatAttachmentUploadAdmission
  reply: {
    header: (name: string, value: string) => unknown
  }
}) {
  const release = attachmentUploadAdmission.tryAcquire()

  if (release) {
    return release
  }

  reply.header('Retry-After', '1')

  throw new ApiError(
    503,
    'CHAT_ATTACHMENT_UPLOAD_BUSY',
    'Сервер занят загрузкой файлов. Попробуйте ещё раз.',
  )
}

async function enforceTextSendRateLimit({
  chatSendRateLimiter,
  reply,
  request,
  threadId,
  userId,
}: {
  chatSendRateLimiter: ChatSendRateLimiter
  reply: {
    header: (name: string, value: string) => unknown
  }
  request: FastifyRequest
  threadId: string
  userId: number
}) {
  const tenant = requireTenantContext(request)
  const rateLimit = await chatSendRateLimiter.consume({
    kind: 'text',
    tenantId: tenant.id,
    threadId,
    userId,
  })

  if (rateLimit.status === 'allowed') {
    return
  }

  reply.header('Retry-After', String(rateLimit.retryAfterSeconds))

  throw new ApiError(
    429,
    'CHAT_SEND_RATE_LIMITED',
    'Слишком много сообщений. Попробуйте позже.',
  )
}

async function enforceAttachmentUploadRateLimit({
  chatSendRateLimiter,
  reply,
  request,
  userId,
}: {
  chatSendRateLimiter: ChatSendRateLimiter
  reply: {
    header: (name: string, value: string) => unknown
  }
  request: FastifyRequest
  userId: number
}) {
  const tenant = requireTenantContext(request)
  const rateLimit = await chatSendRateLimiter.consumeAttachmentUpload({
    tenantId: tenant.id,
    userId,
  })

  if (rateLimit.status === 'allowed') {
    return
  }

  reply.header('Retry-After', String(rateLimit.retryAfterSeconds))

  throw new ApiError(
    429,
    'CHAT_SEND_RATE_LIMITED',
    'Слишком много сообщений. Попробуйте позже.',
  )
}

export function registerChatMessagesRoutes(
  app: FastifyInstance,
  {
    attachmentUploadAdmission = createChatAttachmentUploadAdmission(),
    authService,
    chatSendRateLimiter,
    createChatMessagesService,
    env,
  }: RegisterChatMessagesRoutesOptions,
) {
  registerChatAttachmentProxyRoutes(app, {
    authService,
    createChatMessagesService,
    env,
  })

  registerChatAvatarProxyRoutes(app, {
    authService,
    createChatMessagesService,
    env,
  })

  app.get('/api/chat/threads/:threadId/media', async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const params = threadParamsSchema.parse(request.params)
    const query = chatMediaQuerySchema.parse(request.query)

    return createChatMessagesService(request).getCurrentUserChatMedia({
      beforeMessageId: query.beforeMessageId ?? null,
      threadId: params.threadId,
      userId: user.id,
    })
  })

  app.get('/api/chat/threads/:threadId/search', async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const params = threadParamsSchema.parse(request.params)
    const query = chatSearchQuerySchema.parse(request.query)

    return createChatMessagesService(request).getCurrentUserChatSearch({
      beforeMessageId: query.beforeMessageId ?? null,
      query: query.q,
      threadId: params.threadId,
      userId: user.id,
    })
  })

  registerChatMessageContextRoutes(app, {
    authService,
    createChatMessagesService,
    env,
  })

  app.get('/api/chat/messages', async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const query = chatMessagesQuerySchema.parse(request.query)

    return createChatMessagesService(request).getCurrentUserChatMessages({
      beforeMessageId: query.beforeMessageId ?? null,
      threadId: query.threadId ?? PRIVATE_CHAT_THREAD_ID,
      userId: user.id,
    })
  })

  app.post('/api/chat/messages', async (request, reply) => {
    assertAllowedTenantOrigin(request)

    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const body = sendChatMessageBodySchema.parse(request.body)

    await enforceTextSendRateLimit({
      chatSendRateLimiter,
      reply,
      request,
      threadId: body.threadId,
      userId: user.id,
    })

    return createChatMessagesService(request).sendCurrentUserTextMessage({
      clientMessageKey: body.clientMessageKey,
      content: body.content,
      replyToMessageId: body.replyToMessageId ?? null,
      threadId: body.threadId,
      userId: user.id,
    })
  })

  app.post(
    '/api/chat/messages/attachments',
    {
      bodyLimit: CHAT_ATTACHMENT_REQUEST_MAX_BYTES,
    },
    async (request, reply) => {
      assertAllowedTenantOrigin(request)

      const user = await resolveAuthenticatedPortalUser({
        authService,
        env,
        reply,
        request,
      })
      const releaseUploadAdmission = acquireAttachmentUploadAdmission({
        attachmentUploadAdmission,
        reply,
      })

      try {
        await enforceAttachmentUploadRateLimit({
          chatSendRateLimiter,
          reply,
          request,
          userId: user.id,
        })

        const upload = await parseAttachmentUploads(app, request)

        return await createChatMessagesService(
          request,
        ).sendCurrentUserAttachmentMessage({
          attachments: upload.attachments,
          clientMessageKey: upload.clientMessageKey,
          content: upload.content,
          replyToMessageId: upload.replyToMessageId,
          threadId: upload.threadId,
          userId: user.id,
        })
      } finally {
        releaseUploadAdmission()
      }
    },
  )
}
