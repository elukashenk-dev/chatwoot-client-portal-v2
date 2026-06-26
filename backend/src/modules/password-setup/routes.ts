import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { assertAllowedTenantOrigin } from '../../lib/origin.js'
import { portalPasswordSchema } from '../../lib/passwordPolicy.js'
import { resolveAuthenticatedPortalUser } from '../auth/currentUser.js'
import { getSessionCookieOptions } from '../auth/sessionCookie.js'
import type { AuthService } from '../auth/service.js'
import type {
  PasswordSetupCompletedSession,
  PasswordSetupService,
} from './service.js'

const passwordSetupRequestBodySchema = z.strictObject({})

const passwordSetupVerifyBodySchema = z.strictObject({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Введите код из 6 цифр'),
})

const passwordSetupSetBodySchema = z.strictObject({
  continuationToken: z
    .string()
    .trim()
    .min(32, 'Некорректное подтверждение создания пароля'),
  newPassword: portalPasswordSchema,
})

type RegisterPasswordSetupRoutesOptions = {
  authService: AuthService
  createPasswordSetupService: (request: FastifyRequest) => PasswordSetupService
  env: AppEnv
}

async function resolvePasswordSetupScope({
  authService,
  env,
  reply,
  request,
}: {
  authService: AuthService
  env: AppEnv
  reply: FastifyReply
  request: FastifyRequest
}) {
  const user = await resolveAuthenticatedPortalUser({
    authService,
    env,
    reply,
    request,
  })

  return {
    email: user.email,
    userId: user.id,
  }
}

function sendPasswordSetupCompletionResponse({
  env,
  reply,
  result,
}: {
  env: AppEnv
  reply: FastifyReply
  result: PasswordSetupCompletedSession
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

export function registerPasswordSetupRoutes(
  app: FastifyInstance,
  {
    authService,
    createPasswordSetupService,
    env,
  }: RegisterPasswordSetupRoutesOptions,
) {
  app.post('/api/auth/password-setup/request', async (request, reply) => {
    assertAllowedTenantOrigin(request)

    const scope = await resolvePasswordSetupScope({
      authService,
      env,
      reply,
      request,
    })
    passwordSetupRequestBodySchema.parse(request.body ?? {})

    return createPasswordSetupService(request).requestPasswordSetup(scope)
  })

  app.post('/api/auth/password-setup/verify', async (request, reply) => {
    assertAllowedTenantOrigin(request)

    const scope = await resolvePasswordSetupScope({
      authService,
      env,
      reply,
      request,
    })
    const body = passwordSetupVerifyBodySchema.parse(request.body)

    return createPasswordSetupService(request).confirmPasswordSetup({
      ...scope,
      code: body.code,
    })
  })

  app.post('/api/auth/password-setup/set', async (request, reply) => {
    assertAllowedTenantOrigin(request)

    const scope = await resolvePasswordSetupScope({
      authService,
      env,
      reply,
      request,
    })
    const body = passwordSetupSetBodySchema.parse(request.body)
    const result = await createPasswordSetupService(request).setPassword({
      ...scope,
      continuationToken: body.continuationToken,
      newPassword: body.newPassword,
    })

    return sendPasswordSetupCompletionResponse({
      env,
      reply,
      result,
    })
  })
}
