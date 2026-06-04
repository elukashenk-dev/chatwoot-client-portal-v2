import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { resolveAuthenticatedPortalUser } from '../auth/currentUser.js'
import type { AuthService } from '../auth/service.js'
import type { ChatPresenceService } from './service.js'

type RegisterChatPresenceRoutesOptions = {
  authService: AuthService
  createChatPresenceService: (
    request: FastifyRequest,
  ) => Pick<
    ChatPresenceService,
    'markCurrentUserThreadRead' | 'setCurrentUserThreadTyping'
  >
  env: AppEnv
}

const publicThreadIdSchema = z.string().trim().min(1).max(80)

const chatThreadReadParamsSchema = z
  .object({
    threadId: publicThreadIdSchema,
  })
  .strict()

const chatThreadTypingBodySchema = z
  .object({
    typingStatus: z.enum(['off', 'on']),
  })
  .strict()

export function registerChatPresenceRoutes(
  app: FastifyInstance,
  {
    authService,
    createChatPresenceService,
    env,
  }: RegisterChatPresenceRoutesOptions,
) {
  app.post('/api/chat/threads/:threadId/read', async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const params = chatThreadReadParamsSchema.parse(request.params)

    await createChatPresenceService(request).markCurrentUserThreadRead({
      threadId: params.threadId,
      userId: user.id,
    })

    return reply.status(204).send()
  })

  app.post('/api/chat/threads/:threadId/typing', async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const params = chatThreadReadParamsSchema.parse(request.params)
    const body = chatThreadTypingBodySchema.parse(request.body)

    await createChatPresenceService(request).setCurrentUserThreadTyping({
      threadId: params.threadId,
      typingStatus: body.typingStatus,
      userId: user.id,
    })

    return reply.status(204).send()
  })
}
