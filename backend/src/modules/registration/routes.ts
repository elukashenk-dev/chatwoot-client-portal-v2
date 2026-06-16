import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { assertAllowedTenantOrigin } from '../../lib/origin.js'
import { portalPasswordSchema } from '../../lib/passwordPolicy.js'
import type { RegistrationService } from './service.js'

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

type RegisterRegistrationRoutesOptions = {
  createRegistrationService: (request: FastifyRequest) => RegistrationService
}

export function registerRegistrationRoutes(
  app: FastifyInstance,
  { createRegistrationService }: RegisterRegistrationRoutesOptions,
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

  app.post('/api/auth/register/set-password', async (request) => {
    assertAllowedTenantOrigin(request)

    const body = registerSetPasswordBodySchema.parse(request.body)

    return createRegistrationService(request).setPassword({
      continuationToken: body.continuationToken,
      email: body.email,
      newPassword: body.newPassword,
    })
  })
}
