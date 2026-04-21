import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'
import type { AuthService, PublicPortalUser } from '../auth/service.js'
import { clearSessionCookie, getSessionToken } from '../auth/sessionCookie.js'
import type { ChatContextService } from './service.js'

const chatContextQuerySchema = z.object({
  primaryConversationId: z.coerce.number().int().positive().optional(),
})

type RegisterChatContextRoutesOptions = {
  authService: AuthService
  chatContextService: ChatContextService
  env: AppEnv
}

export async function resolveAuthenticatedPortalUser({
  authService,
  env,
  reply,
  request,
}: {
  authService: AuthService
  env: AppEnv
  reply: FastifyReply
  request: FastifyRequest
}): Promise<PublicPortalUser> {
  const sessionToken = getSessionToken(request, env)

  if (!sessionToken) {
    clearSessionCookie(reply, env)
    throw new ApiError(401, 'UNAUTHORIZED', 'Требуется вход.')
  }

  const user = await authService.getCurrentUser(sessionToken)

  if (!user) {
    clearSessionCookie(reply, env)
    throw new ApiError(401, 'UNAUTHORIZED', 'Требуется вход.')
  }

  return user
}

export function registerChatContextRoutes(
  app: FastifyInstance,
  { authService, chatContextService, env }: RegisterChatContextRoutesOptions,
) {
  app.get('/api/chat/context', async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const query = chatContextQuerySchema.parse(request.query)

    return chatContextService.getCurrentUserChatContext({
      selectedPrimaryConversationId: query.primaryConversationId ?? null,
      userId: user.id,
    })
  })
}
