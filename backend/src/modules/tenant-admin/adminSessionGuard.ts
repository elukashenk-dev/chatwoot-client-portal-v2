import type { FastifyReply, FastifyRequest } from 'fastify'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'
import type { TenantAdminAuthService } from './adminAuthService.js'
import {
  clearAdminSessionCookie,
  getAdminSessionToken,
} from './adminSessionCookie.js'

export function createAdminUnauthorizedError() {
  return new ApiError(
    401,
    'TENANT_ADMIN_UNAUTHORIZED',
    'Требуется вход администратора.',
  )
}

export async function requireTenantAdminSession({
  createTenantAdminAuthService,
  env,
  reply,
  request,
}: {
  createTenantAdminAuthService: (
    request: FastifyRequest,
  ) => TenantAdminAuthService
  env: AppEnv
  reply: FastifyReply
  request: FastifyRequest
}) {
  const sessionToken = getAdminSessionToken(request, env)
  const service = createTenantAdminAuthService(request)

  if (!sessionToken) {
    clearAdminSessionCookie(reply, env)
    throw createAdminUnauthorizedError()
  }

  const session = await service.getCurrentAdminSession({ sessionToken })

  if (!session) {
    clearAdminSessionCookie(reply, env)
    throw createAdminUnauthorizedError()
  }

  return session
}
