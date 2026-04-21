import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'
import { assertAllowedOrigin } from '../../lib/origin.js'
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
    .email('Введите email в корректном формате'),
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
    assertAllowedOrigin(request, env.APP_ORIGIN)

    const body = loginBodySchema.parse(request.body)
    const session = await authService.login(body)

    reply.setCookie(
      env.SESSION_COOKIE_NAME,
      session.sessionToken,
      getSessionCookieOptions(env),
    )

    return {
      user: session.user,
    }
  })

  app.post('/api/auth/logout', async (request, reply) => {
    assertAllowedOrigin(request, env.APP_ORIGIN)

    const sessionToken = getSessionToken(request, env)

    if (sessionToken) {
      await authService.logout(sessionToken)
    }

    clearSessionCookie(reply, env)

    reply.status(204).send()
  })

  app.get('/api/auth/me', async (request, reply) => {
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

    return {
      user,
    }
  })
}
