import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { resolveAuthenticatedPortalUser } from '../auth/currentUser.js'
import type { AuthService } from '../auth/service.js'
import type { ChatThreadsService } from './service.js'

type RegisterChatThreadsRoutesOptions = {
  authService: AuthService
  createChatThreadsService: (
    request: FastifyRequest,
  ) => Pick<
    ChatThreadsService,
    'getCurrentUserThreadInfo' | 'listCurrentUserThreads'
  >
  env: AppEnv
}

const publicThreadIdSchema = z.string().trim().min(1).max(80)

const chatThreadInfoParamsSchema = z
  .object({
    threadId: publicThreadIdSchema,
  })
  .strict()

export function registerChatThreadsRoutes(
  app: FastifyInstance,
  {
    authService,
    createChatThreadsService,
    env,
  }: RegisterChatThreadsRoutesOptions,
) {
  app.get('/api/chat/threads/:threadId/info', async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const params = chatThreadInfoParamsSchema.parse(request.params)

    return createChatThreadsService(request).getCurrentUserThreadInfo({
      threadId: params.threadId,
      userId: user.id,
    })
  })

  app.get('/api/chat/threads', async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })

    return createChatThreadsService(request).listCurrentUserThreads({
      userId: user.id,
    })
  })
}
