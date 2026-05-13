import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'
import type { AuthService } from '../auth/service.js'
import { resolveAuthenticatedPortalUser } from '../chat-context/routes.js'
import type { ChatContextService } from '../chat-context/service.js'
import { requireTenantContext } from '../tenants/routes.js'
import type { ChatRealtimeEvent, ChatRealtimeHub } from './hub.js'

const chatRealtimeQuerySchema = z.object({
  primaryConversationId: z.coerce.number().int().positive(),
})

type RegisterChatRealtimeRoutesOptions = {
  authService: AuthService
  createChatContextService: (
    request: FastifyRequest,
  ) => Pick<ChatContextService, 'getCurrentUserChatContext'>
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
    createChatContextService,
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
    const tenant = requireTenantContext(request)
    const context = await createChatContextService(
      request,
    ).getCurrentUserChatContext({
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

    const subscriptionResult = realtimeHub.subscribe({
      primaryConversationId: context.primaryConversation.id,
      send: (event) => {
        writeSseEvent(reply.raw, event)
      },
      tenantId: tenant.id,
      userId: user.id,
    })

    if (subscriptionResult.status === 'limit_exceeded') {
      throw new ApiError(
        429,
        'CHAT_REALTIME_SUBSCRIPTION_LIMIT_EXCEEDED',
        'Открыто слишком много realtime-подключений к этому чату.',
      )
    }

    let keepaliveTimer: NodeJS.Timeout | null = null
    const cleanup = () => {
      if (keepaliveTimer) {
        clearInterval(keepaliveTimer)
      }

      subscriptionResult.unsubscribe()
    }

    request.raw.on('close', cleanup)

    reply.hijack()
    reply.raw.writeHead(200, {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    })
    reply.raw.write(': connected\n\n')

    keepaliveTimer = setInterval(() => {
      reply.raw.write(': keepalive\n\n')
    }, 25_000)
  })
}
