import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { assertAllowedTenantOrigin } from '../../lib/origin.js'
import { portalPasswordSchema } from '../../lib/passwordPolicy.js'
import { getSessionCookieOptions } from '../auth/sessionCookie.js'
import type {
  RegistrationCompletedSession,
  RegistrationService,
} from './service.js'

const registerRequestBodySchema = z.strictObject({
  email: z
    .string()
    .trim()
    .min(1, 'Введите email')
    .email('Проверьте формат email'),
  fullName: z.string().trim().min(1, 'Введите имя'),
  personalDataConsentAccepted: z.literal(true),
  termsAccepted: z.literal(true),
})

const registerVerifyBodySchema = z.object({
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

const registerSetPasswordBodySchema = z.object({
  continuationToken: z
    .string()
    .trim()
    .min(32, 'Некорректное подтверждение регистрации'),
  email: z
    .string()
    .trim()
    .min(1, 'Введите email')
    .email('Проверьте формат email'),
  newPassword: portalPasswordSchema,
})

const registerSkipPasswordBodySchema = z.object({
  continuationToken: z
    .string()
    .trim()
    .min(32, 'Некорректное подтверждение регистрации'),
  email: z
    .string()
    .trim()
    .min(1, 'Введите email')
    .email('Проверьте формат email'),
})

type RegisterRegistrationRoutesOptions = {
  createRegistrationService: (request: FastifyRequest) => RegistrationService
  env: AppEnv
}

function sendRegistrationCompletionResponse({
  env,
  reply,
  result,
}: {
  env: AppEnv
  reply: FastifyReply
  result: RegistrationCompletedSession
}) {
  reply.setCookie(
    env.SESSION_COOKIE_NAME,
    result.sessionToken,
    getSessionCookieOptions(env),
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
}

export function registerRegistrationRoutes(
  app: FastifyInstance,
  { createRegistrationService, env }: RegisterRegistrationRoutesOptions,
) {
  app.post('/api/auth/register/request', async (request) => {
    assertAllowedTenantOrigin(request)

    const body = registerRequestBodySchema.parse(request.body)

    return createRegistrationService(request).requestVerification({
      email: body.email,
      fullName: body.fullName,
      legalAcceptance: {
        personalDataConsentAccepted: body.personalDataConsentAccepted,
        requestIp: request.ip,
        termsAccepted: body.termsAccepted,
        userAgent: request.headers['user-agent'] ?? null,
      },
    })
  })

  app.post('/api/auth/register/verify', async (request) => {
    assertAllowedTenantOrigin(request)

    const body = registerVerifyBodySchema.parse(request.body)

    return createRegistrationService(request).confirmVerification({
      code: body.code,
      email: body.email,
    })
  })

  app.post('/api/auth/register/set-password', async (request, reply) => {
    assertAllowedTenantOrigin(request)

    const body = registerSetPasswordBodySchema.parse(request.body)

    const result = await createRegistrationService(request).setPassword({
      continuationToken: body.continuationToken,
      email: body.email,
      ipAddress: request.ip,
      newPassword: body.newPassword,
      userAgent: request.headers['user-agent'] ?? null,
    })

    return sendRegistrationCompletionResponse({
      env,
      reply,
      result,
    })
  })

  app.post('/api/auth/register/skip-password', async (request, reply) => {
    assertAllowedTenantOrigin(request)

    const body = registerSkipPasswordBodySchema.parse(request.body)

    const result = await createRegistrationService(request).skipPassword({
      continuationToken: body.continuationToken,
      email: body.email,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    })

    return sendRegistrationCompletionResponse({
      env,
      reply,
      result,
    })
  })
}
