import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { resolveAuthenticatedPortalUser } from '../auth/currentUser.js'
import type { AuthService } from '../auth/service.js'
import {
  ATTACHMENT_PROXY_CACHE_CONTROL,
  copyAttachmentProxyHeaders,
  getRangeHeader,
} from './attachmentProxyHeaders.js'
import type { ChatAttachmentProxyVariant, ChatMessagesService } from './service.js'

const publicThreadIdSchema = z.string().trim().min(1).max(80)

const attachmentProxyParamsSchema = z
  .object({
    attachmentId: z.coerce.number().int().positive(),
    messageId: z.coerce.number().int().positive(),
    threadId: publicThreadIdSchema,
  })
  .strict()

type RegisterChatAttachmentProxyRoutesOptions = {
  authService: AuthService
  createChatMessagesService: (request: FastifyRequest) => ChatMessagesService
  env: AppEnv
}

async function sendAttachmentProxy({
  authService,
  createChatMessagesService,
  env,
  reply,
  request,
  variant,
}: RegisterChatAttachmentProxyRoutesOptions & {
  reply: FastifyReply
  request: FastifyRequest
  variant: ChatAttachmentProxyVariant
}) {
  const user = await resolveAuthenticatedPortalUser({
    authService,
    env,
    reply,
    request,
  })
  const params = attachmentProxyParamsSchema.parse(request.params)
  const attachment = await createChatMessagesService(
    request,
  ).getCurrentUserChatAttachment({
    attachmentId: params.attachmentId,
    messageId: params.messageId,
    rangeHeader: getRangeHeader(request),
    threadId: params.threadId,
    userId: user.id,
    variant,
  })

  copyAttachmentProxyHeaders({
    headers: attachment.headers,
    reply,
  })
  reply.header('cache-control', ATTACHMENT_PROXY_CACHE_CONTROL)
  reply.code(attachment.status)

  if (!attachment.body) {
    return reply.send()
  }

  return reply.send(Readable.fromWeb(attachment.body as NodeReadableStream))
}

export function registerChatAttachmentProxyRoutes(
  app: FastifyInstance,
  options: RegisterChatAttachmentProxyRoutesOptions,
) {
  app.get(
    '/api/chat/threads/:threadId/attachments/:messageId/:attachmentId',
    async (request, reply) =>
      sendAttachmentProxy({
        ...options,
        reply,
        request,
        variant: 'original',
      }),
  )

  app.get(
    '/api/chat/threads/:threadId/attachments/:messageId/:attachmentId/thumb',
    async (request, reply) =>
      sendAttachmentProxy({
        ...options,
        reply,
        request,
        variant: 'thumb',
      }),
  )
}
