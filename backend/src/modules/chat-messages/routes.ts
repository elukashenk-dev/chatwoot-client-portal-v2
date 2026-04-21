import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import type { AuthService } from '../auth/service.js'
import { resolveAuthenticatedPortalUser } from '../chat-context/routes.js'
import type { ChatMessagesService } from './service.js'

const chatMessagesQuerySchema = z.object({
  beforeMessageId: z.coerce.number().int().positive().optional(),
  primaryConversationId: z.coerce.number().int().positive().optional(),
})

type RegisterChatMessagesRoutesOptions = {
  authService: AuthService
  chatMessagesService: ChatMessagesService
  env: AppEnv
}

export function registerChatMessagesRoutes(
  app: FastifyInstance,
  { authService, chatMessagesService, env }: RegisterChatMessagesRoutesOptions,
) {
  app.get('/api/chat/messages', async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const query = chatMessagesQuerySchema.parse(request.query)

    return chatMessagesService.getCurrentUserChatMessages({
      beforeMessageId: query.beforeMessageId ?? null,
      primaryConversationId: query.primaryConversationId ?? null,
      userId: user.id,
    })
  })
}
