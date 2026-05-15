import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { AppEnv } from '../../config/env.js'
import type { AuthService } from '../auth/service.js'
import { resolveAuthenticatedPortalUser } from '../chat-context/routes.js'
import type { ChatThreadsService } from './service.js'

type RegisterChatThreadsRoutesOptions = {
  authService: AuthService
  createChatThreadsService: (
    request: FastifyRequest,
  ) => Pick<ChatThreadsService, 'listCurrentUserThreads'>
  env: AppEnv
}

export function registerChatThreadsRoutes(
  app: FastifyInstance,
  {
    authService,
    createChatThreadsService,
    env,
  }: RegisterChatThreadsRoutesOptions,
) {
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
