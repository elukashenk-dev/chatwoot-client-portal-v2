import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'
import type { AuthService, PublicPortalUser } from '../auth/service.js'
import { clearSessionCookie, getSessionToken } from '../auth/sessionCookie.js'
import { requireTenantContext } from '../tenants/routes.js'
import {
  assertPrivateChatThreadId,
  mapPublicChatContextSnapshot,
  PRIVATE_CHAT_THREAD_ID,
} from '../chat-threads/privateThread.js'
import type { ChatContextService } from './service.js'

const chatContextQuerySchema = z
  .object({
    threadId: z.literal(PRIVATE_CHAT_THREAD_ID).optional(),
  })
  .strict()

type RegisterChatContextRoutesOptions = {
  authService: AuthService
  createChatContextService: (request: FastifyRequest) => ChatContextService
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

  const tenant = requireTenantContext(request)
  const user = await authService.getCurrentUser({
    sessionToken,
    tenantId: tenant.id,
  })

  if (!user) {
    clearSessionCookie(reply, env)
    throw new ApiError(401, 'UNAUTHORIZED', 'Требуется вход.')
  }

  return user
}

export function registerChatContextRoutes(
  app: FastifyInstance,
  {
    authService,
    createChatContextService,
    env,
  }: RegisterChatContextRoutesOptions,
) {
  app.get('/api/chat/context', async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const query = chatContextQuerySchema.parse(request.query)
    const threadId = query.threadId ?? PRIVATE_CHAT_THREAD_ID
    assertPrivateChatThreadId(threadId)

    const context = await createChatContextService(
      request,
    ).getCurrentUserChatContext({
      selectedPrimaryConversationId: null,
      userId: user.id,
    })

    return mapPublicChatContextSnapshot(context)
  })
}
