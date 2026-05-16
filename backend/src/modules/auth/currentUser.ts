import type { FastifyReply, FastifyRequest } from 'fastify'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'
import { requireTenantContext } from '../tenants/routes.js'
import type { AuthService, PublicPortalUser } from './service.js'
import { clearSessionCookie, getSessionToken } from './sessionCookie.js'

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
