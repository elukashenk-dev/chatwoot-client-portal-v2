import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { assertAllowedOrigin } from '../../lib/origin.js'
import type { RegistrationService } from './service.js'

const registerRequestBodySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Введите email')
    .email('Введите email в корректном формате'),
  fullName: z.string().trim().min(1, 'Введите имя'),
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
    .email('Введите email в корректном формате'),
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
    .email('Введите email в корректном формате'),
  newPassword: z
    .string()
    .min(8, 'Пароль должен содержать не менее 8 символов')
    .regex(/[A-Za-zА-Яа-яЁё]/, 'Пароль должен содержать букву')
    .regex(/\d/, 'Пароль должен содержать цифру'),
})

type RegisterRegistrationRoutesOptions = {
  env: AppEnv
  registrationService: RegistrationService
}

export function registerRegistrationRoutes(
  app: FastifyInstance,
  { env, registrationService }: RegisterRegistrationRoutesOptions,
) {
  app.post('/api/auth/register/request', async (request) => {
    assertAllowedOrigin(request, env.APP_ORIGIN)

    const body = registerRequestBodySchema.parse(request.body)

    return registrationService.requestVerification({
      email: body.email,
      fullName: body.fullName,
    })
  })

  app.post('/api/auth/register/verify', async (request) => {
    assertAllowedOrigin(request, env.APP_ORIGIN)

    const body = registerVerifyBodySchema.parse(request.body)

    return registrationService.confirmVerification({
      code: body.code,
      email: body.email,
    })
  })

  app.post('/api/auth/register/set-password', async (request) => {
    assertAllowedOrigin(request, env.APP_ORIGIN)

    const body = registerSetPasswordBodySchema.parse(request.body)

    return registrationService.setPassword({
      continuationToken: body.continuationToken,
      email: body.email,
      newPassword: body.newPassword,
    })
  })
}
