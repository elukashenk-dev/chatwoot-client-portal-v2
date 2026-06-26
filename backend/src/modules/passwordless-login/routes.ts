import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { assertAllowedTenantOrigin } from '../../lib/origin.js'
import { getSessionCookieOptions } from '../auth/sessionCookie.js'
import { requireTenantContext } from '../tenants/routes.js'
import type { PasswordlessLoginService } from './service.js'

const passwordlessLoginRequestBodySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Введите email')
    .email('Проверьте формат email'),
})

const passwordlessLoginVerifyBodySchema = z.object({
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

type RegisterPasswordlessLoginRoutesOptions = {
  createPasswordlessLoginService: (
    request: FastifyRequest,
  ) => PasswordlessLoginService
  env: AppEnv
}

export function registerPasswordlessLoginRoutes(
  app: FastifyInstance,
  { createPasswordlessLoginService, env }: RegisterPasswordlessLoginRoutesOptions,
) {
  app.post('/api/auth/code-login/request', async (request) => {
    assertAllowedTenantOrigin(request)

    const body = passwordlessLoginRequestBodySchema.parse(request.body)

    return createPasswordlessLoginService(request).requestLoginCode({
      email: body.email,
    })
  })

  app.post('/api/auth/code-login/verify', async (request, reply) => {
    assertAllowedTenantOrigin(request)

    const body = passwordlessLoginVerifyBodySchema.parse(request.body)
    const tenant = requireTenantContext(request)
    const session = await createPasswordlessLoginService(
      request,
    ).verifyLoginCode({
      code: body.code,
      email: body.email,
    })

    reply.setCookie(
      env.SESSION_COOKIE_NAME,
      session.sessionToken,
      getSessionCookieOptions(env),
    )

    request.log.debug(
      {
        tenantId: tenant.id,
        userId: session.user.id,
      },
      'Customer passwordless code login verified.',
    )

    return {
      nextStep: session.nextStep,
      purpose: session.purpose,
      result: session.result,
      session: {
        expiresAt: session.session.expiresAt.toISOString(),
      },
      user: session.user,
    }
  })
}
