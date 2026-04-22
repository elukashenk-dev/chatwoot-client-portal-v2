import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'
import type { AuthService } from '../auth/service.js'
import { resolveAuthenticatedPortalUser } from '../chat-context/routes.js'
import type { ChatContextService } from '../chat-context/service.js'
import type { ChatRealtimeEvent, ChatRealtimeHub } from './hub.js'

const chatRealtimeQuerySchema = z.object({
  primaryConversationId: z.coerce.number().int().positive(),
})

type RegisterChatRealtimeRoutesOptions = {
  authService: AuthService
  chatContextService: Pick<ChatContextService, 'getCurrentUserChatContext'>
  env: AppEnv
  realtimeHub: ChatRealtimeHub
}

function writeSseEvent(
  response: NodeJS.WritableStream,
  event: ChatRealtimeEvent,
) {
  response.write(`event: ${event.type}\n`)
  response.write(`data: ${JSON.stringify(event.data)}\n\n`)
}

export function registerChatRealtimeRoutes(
  app: FastifyInstance,
  {
    authService,
    chatContextService,
    env,
    realtimeHub,
  }: RegisterChatRealtimeRoutesOptions,
) {
  app.get('/api/chat/realtime', async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const query = chatRealtimeQuerySchema.parse(request.query)
    const context = await chatContextService.getCurrentUserChatContext({
      selectedPrimaryConversationId: query.primaryConversationId,
      userId: user.id,
    })

    if (context.result !== 'ready' || !context.primaryConversation) {
      throw new ApiError(
        409,
        'chat_realtime_not_ready',
        'Realtime доступен только для готового чата.',
      )
    }

    if (context.primaryConversation.id !== query.primaryConversationId) {
      throw new ApiError(
        409,
        'chat_realtime_conversation_mismatch',
        'Realtime conversation не совпадает с основным чатом.',
      )
    }

    reply.hijack()
    reply.raw.writeHead(200, {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    })
    reply.raw.write(': connected\n\n')

    const unsubscribe = realtimeHub.subscribe({
      primaryConversationId: context.primaryConversation.id,
      send: (event) => {
        writeSseEvent(reply.raw, event)
      },
      userId: user.id,
    })
    const keepaliveTimer = setInterval(() => {
      reply.raw.write(': keepalive\n\n')
    }, 25_000)

    request.raw.on('close', () => {
      clearInterval(keepaliveTimer)
      unsubscribe()
    })
  })
}
