import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'
import { assertAllowedTenantOrigin } from '../../lib/origin.js'
import { requireTenantContext } from '../tenants/routes.js'
import type { AuthService } from './service.js'
import {
  clearSessionCookie,
  getSessionCookieOptions,
  getSessionToken,
} from './sessionCookie.js'

const loginBodySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Введите email')
    .email('Проверьте формат email'),
  password: z.string().refine((value) => value.trim().length > 0, {
    message: 'Введите пароль',
  }),
})

type RegisterAuthRoutesOptions = {
  authService: AuthService
  env: AppEnv
}

export function registerAuthRoutes(
  app: FastifyInstance,
  { authService, env }: RegisterAuthRoutesOptions,
) {
  app.post('/api/auth/login', async (request, reply) => {
    assertAllowedTenantOrigin(request)

    const body = loginBodySchema.parse(request.body)
    const tenant = requireTenantContext(request)
    const session = await authService.login({
      ...body,
      tenantId: tenant.id,
    })

    reply.setCookie(
      env.SESSION_COOKIE_NAME,
      session.sessionToken,
      getSessionCookieOptions(env),
    )

    return {
      session: {
        expiresAt: session.expiresAt.toISOString(),
      },
      user: session.user,
    }
  })

  app.post('/api/auth/logout', async (request, reply) => {
    assertAllowedTenantOrigin(request)

    const sessionToken = getSessionToken(request, env)
    const tenant = requireTenantContext(request)

    if (sessionToken) {
      await authService.logout({
        sessionToken,
        tenantId: tenant.id,
      })
    }

    clearSessionCookie(reply, env)

    reply.status(204).send()
  })

  app.get('/api/auth/me', async (request, reply) => {
    const sessionToken = getSessionToken(request, env)
    const tenant = requireTenantContext(request)

    if (!sessionToken) {
      clearSessionCookie(reply, env)
      throw new ApiError(401, 'UNAUTHORIZED', 'Требуется вход.')
    }

    const session = await authService.getCurrentSession({
      sessionToken,
      tenantId: tenant.id,
    })

    if (!session) {
      clearSessionCookie(reply, env)
      throw new ApiError(401, 'UNAUTHORIZED', 'Требуется вход.')
    }

    return {
      session: {
        expiresAt: session.expiresAt.toISOString(),
      },
      user: session.user,
    }
  })
}
