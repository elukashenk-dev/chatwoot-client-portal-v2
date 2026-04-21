import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { assertAllowedOrigin } from '../../lib/origin.js'
import type { AuthService } from '../auth/service.js'
import { resolveAuthenticatedPortalUser } from '../chat-context/routes.js'
import type { ChatMessagesService } from './service.js'

const chatMessagesQuerySchema = z.object({
  beforeMessageId: z.coerce.number().int().positive().optional(),
  primaryConversationId: z.coerce.number().int().positive().optional(),
})

const sendChatMessageBodySchema = z.object({
  clientMessageKey: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1, 'Введите сообщение.').max(4000),
  primaryConversationId: z.number().int().positive().optional(),
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

  app.post('/api/chat/messages', async (request, reply) => {
    assertAllowedOrigin(request, env.APP_ORIGIN)

    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const body = sendChatMessageBodySchema.parse(request.body)

    return chatMessagesService.sendCurrentUserTextMessage({
      clientMessageKey: body.clientMessageKey,
      content: body.content,
      primaryConversationId: body.primaryConversationId ?? null,
      userId: user.id,
    })
  })
}
