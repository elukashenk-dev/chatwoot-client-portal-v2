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
} from './attachmentProxyHeaders.js'
import type {
  ChatAttachmentProxyResponse,
  ChatMessagesService,
} from './service.js'

const publicThreadIdSchema = z.string().trim().min(1).max(80)

const messageAvatarParamsSchema = z
  .object({
    messageId: z.coerce.number().int().positive(),
    threadId: publicThreadIdSchema,
  })
  .strict()

const participantAvatarParamsSchema = z
  .object({
    participantUserId: z.coerce.number().int().positive(),
    threadId: publicThreadIdSchema,
  })
  .strict()

const threadParamsSchema = z.object({ threadId: publicThreadIdSchema }).strict()

type RegisterChatAvatarProxyRoutesOptions = {
  authService: AuthService
  createChatMessagesService: (request: FastifyRequest) => ChatMessagesService
  env: AppEnv
}

async function sendAvatarProxy({
  avatar,
  reply,
}: {
  avatar: ChatAttachmentProxyResponse
  reply: FastifyReply
}) {
  copyAttachmentProxyHeaders({
    headers: avatar.headers,
    reply,
  })
  reply.header('cache-control', ATTACHMENT_PROXY_CACHE_CONTROL)
  reply.code(avatar.status)

  if (!avatar.body) {
    return reply.send()
  }

  return reply.send(Readable.fromWeb(avatar.body as NodeReadableStream))
}

export function registerChatAvatarProxyRoutes(
  app: FastifyInstance,
  {
    authService,
    createChatMessagesService,
    env,
  }: RegisterChatAvatarProxyRoutesOptions,
) {
  app.get(
    '/api/chat/threads/:threadId/messages/:messageId/avatar',
    async (request, reply) => {
      const user = await resolveAuthenticatedPortalUser({
        authService,
        env,
        reply,
        request,
      })
      const params = messageAvatarParamsSchema.parse(request.params)
      const avatar = await createChatMessagesService(
        request,
      ).getCurrentUserChatMessageAvatar({
        messageId: params.messageId,
        threadId: params.threadId,
        userId: user.id,
      })

      return sendAvatarProxy({ avatar, reply })
    },
  )

  app.get(
    '/api/chat/threads/:threadId/participants/:participantUserId/avatar',
    async (request, reply) => {
      const user = await resolveAuthenticatedPortalUser({
        authService,
        env,
        reply,
        request,
      })
      const params = participantAvatarParamsSchema.parse(request.params)
      const avatar = await createChatMessagesService(
        request,
      ).getCurrentUserGroupParticipantAvatar({
        participantUserId: params.participantUserId,
        threadId: params.threadId,
        userId: user.id,
      })

      return sendAvatarProxy({ avatar, reply })
    },
  )

  app.get('/api/chat/threads/:threadId/avatar', async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const params = threadParamsSchema.parse(request.params)
    const avatar = await createChatMessagesService(
      request,
    ).getCurrentUserThreadAvatar({
      threadId: params.threadId,
      userId: user.id,
    })

    return sendAvatarProxy({ avatar, reply })
  })
}
