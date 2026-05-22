import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { AppEnv } from '../../config/env.js'
import { resolveAuthenticatedPortalUser } from '../auth/currentUser.js'
import type { AuthService } from '../auth/service.js'
import type { ChatSupportAvailabilityService } from './service.js'

type RegisterChatSupportRoutesOptions = {
  authService: AuthService
  createChatSupportAvailabilityService: (
    request: FastifyRequest,
  ) => Pick<ChatSupportAvailabilityService, 'getSupportAvailability'>
  env: AppEnv
}

export function registerChatSupportRoutes(
  app: FastifyInstance,
  {
    authService,
    createChatSupportAvailabilityService,
    env,
  }: RegisterChatSupportRoutesOptions,
) {
  app.get('/api/chat/support-availability', async (request, reply) => {
    await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })

    return createChatSupportAvailabilityService(
      request,
    ).getSupportAvailability()
  })
}
