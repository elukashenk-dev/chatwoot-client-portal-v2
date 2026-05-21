import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { resolveAuthenticatedPortalUser } from '../auth/currentUser.js'
import type { AuthService } from '../auth/service.js'
import type { ChatMessagesService } from './service.js'

const publicThreadIdSchema = z.string().trim().min(1).max(80)

const chatMessageContextParamsSchema = z
  .object({ threadId: publicThreadIdSchema })
  .strict()

const chatMessageContextQuerySchema = z
  .object({
    cursor: z.coerce.number().int().positive().optional(),
    direction: z.enum(['earlier', 'initial', 'later']).optional(),
    messageId: z.coerce.number().int().positive(),
  })
  .strict()

type RegisterChatMessageContextRoutesOptions = {
  authService: AuthService
  createChatMessagesService: (request: FastifyRequest) => ChatMessagesService
  env: AppEnv
}

export function registerChatMessageContextRoutes(
  app: FastifyInstance,
  {
    authService,
    createChatMessagesService,
    env,
  }: RegisterChatMessageContextRoutesOptions,
) {
  app.get(
    '/api/chat/threads/:threadId/messages/context',
    async (request, reply) => {
      const user = await resolveAuthenticatedPortalUser({
        authService,
        env,
        reply,
        request,
      })
      const params = chatMessageContextParamsSchema.parse(request.params)
      const query = chatMessageContextQuerySchema.parse(request.query)

      return createChatMessagesService(
        request,
      ).getCurrentUserChatMessageContext({
        cursorMessageId: query.cursor ?? null,
        direction: query.direction ?? 'initial',
        messageId: query.messageId,
        threadId: params.threadId,
        userId: user.id,
      })
    },
  )
}
