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

const passwordlessLoginAcceptLegalBodySchema = z.object({
  continuationToken: z
    .string()
    .trim()
    .min(32, 'Некорректное подтверждение входа'),
  email: z
    .string()
    .trim()
    .min(1, 'Введите email')
    .email('Проверьте формат email'),
  personalDataConsentAccepted: z.literal(true),
  termsAccepted: z.literal(true),
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
    const result = await createPasswordlessLoginService(
      request,
    ).verifyLoginCode({
      code: body.code,
      email: body.email,
    })

    if (result.nextStep === 'accept_legal') {
      request.log.debug(
        {
          tenantId: tenant.id,
        },
        'Customer passwordless code login requires legal acceptance.',
      )

      return result
    }

    reply.setCookie(
      env.SESSION_COOKIE_NAME,
      result.sessionToken,
      getSessionCookieOptions(env),
    )

    request.log.debug(
      {
        tenantId: tenant.id,
        userId: result.user.id,
      },
      'Customer passwordless code login verified.',
    )

    return {
      nextStep: result.nextStep,
      purpose: result.purpose,
      result: result.result,
      session: {
        expiresAt: result.session.expiresAt.toISOString(),
      },
      user: result.user,
    }
  })

  app.post('/api/auth/code-login/accept-legal', async (request, reply) => {
    assertAllowedTenantOrigin(request)

    const body = passwordlessLoginAcceptLegalBodySchema.parse(request.body)
    const tenant = requireTenantContext(request)
    const result = await createPasswordlessLoginService(request).acceptLegal({
      continuationToken: body.continuationToken,
      email: body.email,
      ipAddress: request.ip,
      personalDataConsentAccepted: body.personalDataConsentAccepted,
      termsAccepted: body.termsAccepted,
      userAgent: request.headers['user-agent'] ?? null,
    })

    reply.setCookie(
      env.SESSION_COOKIE_NAME,
      result.sessionToken,
      getSessionCookieOptions(env),
    )

    request.log.debug(
      {
        tenantId: tenant.id,
        userId: result.user.id,
      },
      'Customer passwordless legal acceptance completed.',
    )

    return {
      nextStep: result.nextStep,
      purpose: result.purpose,
      result: result.result,
      session: {
        expiresAt: result.session.expiresAt.toISOString(),
      },
      user: result.user,
    }
  })
}
