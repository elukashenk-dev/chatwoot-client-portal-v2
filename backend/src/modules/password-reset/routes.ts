import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { assertAllowedOrigin } from '../../lib/origin.js'
import type { PasswordResetService } from './service.js'

const passwordResetRequestBodySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Введите email')
    .email('Введите email в корректном формате'),
})

const passwordResetVerifyBodySchema = z.object({
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

const passwordResetSetPasswordBodySchema = z.object({
  continuationToken: z
    .string()
    .trim()
    .min(32, 'Некорректное подтверждение восстановления пароля'),
  email: z
    .string()
    .trim()
    .min(1, 'Введите email')
    .email('Введите email в корректном формате'),
  newPassword: z.string().min(8, 'Пароль должен содержать не менее 8 символов'),
})

type RegisterPasswordResetRoutesOptions = {
  env: AppEnv
  passwordResetService: PasswordResetService
}

export function registerPasswordResetRoutes(
  app: FastifyInstance,
  { env, passwordResetService }: RegisterPasswordResetRoutesOptions,
) {
  app.post('/api/auth/password-reset/request', async (request) => {
    assertAllowedOrigin(request, env.APP_ORIGIN)

    const body = passwordResetRequestBodySchema.parse(request.body)

    return passwordResetService.requestPasswordReset({
      email: body.email,
    })
  })

  app.post('/api/auth/password-reset/verify', async (request) => {
    assertAllowedOrigin(request, env.APP_ORIGIN)

    const body = passwordResetVerifyBodySchema.parse(request.body)

    return passwordResetService.confirmPasswordReset({
      code: body.code,
      email: body.email,
    })
  })

  app.post('/api/auth/password-reset/set-password', async (request) => {
    assertAllowedOrigin(request, env.APP_ORIGIN)

    const body = passwordResetSetPasswordBodySchema.parse(request.body)

    return passwordResetService.setPassword({
      continuationToken: body.continuationToken,
      email: body.email,
      newPassword: body.newPassword,
    })
  })
}
