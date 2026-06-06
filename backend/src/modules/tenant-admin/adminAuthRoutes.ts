import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'
import { assertAllowedTenantOrigin } from '../../lib/origin.js'
import { requireTenantContext } from '../tenants/routes.js'
import type { TenantAdminAuthService } from './adminAuthService.js'
import {
  clearAdminSessionCookie,
  getAdminSessionCookieOptions,
  getAdminSessionToken,
} from './adminSessionCookie.js'

const requestAdminLoginBodySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Введите email')
    .email('Проверьте формат email'),
})

const verifyAdminLoginBodySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Введите код из 6 цифр'),
  email: z
    .string()
    .trim()
    .min(1, 'Введите email')
    .email('Проверьте формат email'),
})

type RegisterTenantAdminAuthRoutesOptions = {
  createTenantAdminAuthService: (
    request: FastifyRequest,
  ) => TenantAdminAuthService
  env: AppEnv
}

function getUserAgent(request: FastifyRequest) {
  const userAgent = request.headers['user-agent']

  return typeof userAgent === 'string' ? userAgent : null
}

function getRequestMetadata(request: FastifyRequest) {
  return {
    requestIp: request.ip || null,
    userAgent: getUserAgent(request),
  }
}

function formatAdminSessionResponse(
  session: Awaited<
    ReturnType<TenantAdminAuthService['getCurrentAdminSession']>
  >,
) {
  if (!session) {
    return null
  }

  return {
    admin: session.admin,
    session: {
      expiresAt: session.expiresAt.toISOString(),
    },
  }
}

function createAdminUnauthorizedError() {
  return new ApiError(
    401,
    'TENANT_ADMIN_UNAUTHORIZED',
    'Требуется вход администратора.',
  )
}

export function registerTenantAdminAuthRoutes(
  app: FastifyInstance,
  { createTenantAdminAuthService, env }: RegisterTenantAdminAuthRoutesOptions,
) {
  app.post('/api/admin/auth/request', async (request) => {
    assertAllowedTenantOrigin(request)
    requireTenantContext(request)

    const body = requestAdminLoginBodySchema.parse(request.body)
    const service = createTenantAdminAuthService(request)

    return service.requestAdminLoginChallenge({
      email: body.email,
      ...getRequestMetadata(request),
    })
  })

  app.post('/api/admin/auth/verify', async (request, reply) => {
    assertAllowedTenantOrigin(request)
    requireTenantContext(request)

    const body = verifyAdminLoginBodySchema.parse(request.body)
    const service = createTenantAdminAuthService(request)
    const verified = await service.verifyAdminLoginCode({
      code: body.code,
      email: body.email,
      ...getRequestMetadata(request),
    })

    reply.setCookie(
      env.ADMIN_SESSION_COOKIE_NAME,
      verified.sessionToken,
      getAdminSessionCookieOptions(env),
    )

    return {
      admin: verified.admin,
      session: {
        expiresAt: verified.expiresAt.toISOString(),
      },
    }
  })

  app.get('/api/admin/auth/me', async (request, reply) => {
    const sessionToken = getAdminSessionToken(request, env)
    const service = createTenantAdminAuthService(request)

    if (!sessionToken) {
      clearAdminSessionCookie(reply, env)
      throw createAdminUnauthorizedError()
    }

    const session = formatAdminSessionResponse(
      await service.getCurrentAdminSession({ sessionToken }),
    )

    if (!session) {
      clearAdminSessionCookie(reply, env)
      throw createAdminUnauthorizedError()
    }

    return session
  })

  app.post('/api/admin/auth/logout', async (request, reply) => {
    assertAllowedTenantOrigin(request)
    requireTenantContext(request)

    const sessionToken = getAdminSessionToken(request, env)
    const service = createTenantAdminAuthService(request)

    if (sessionToken) {
      await service.logout({
        sessionToken,
        ...getRequestMetadata(request),
      })
    }

    clearAdminSessionCookie(reply, env)
    reply.status(204).send()
  })
}
