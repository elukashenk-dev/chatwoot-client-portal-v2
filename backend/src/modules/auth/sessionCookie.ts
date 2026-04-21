import type { FastifyReply, FastifyRequest } from 'fastify'
import type { CookieSerializeOptions } from '@fastify/cookie'

import type { AppEnv } from '../../config/env.js'

export function getSessionCookieOptions(env: AppEnv): CookieSerializeOptions {
  return {
    httpOnly: true,
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
    path: '/',
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    signed: true,
  }
}

export function clearSessionCookie(reply: FastifyReply, env: AppEnv) {
  reply.clearCookie(env.SESSION_COOKIE_NAME, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
  })
}

export function getSessionToken(request: FastifyRequest, env: AppEnv) {
  const rawCookie = request.cookies[env.SESSION_COOKIE_NAME]

  if (!rawCookie) {
    return null
  }

  const unsignedCookie = request.unsignCookie(rawCookie)

  if (!unsignedCookie.valid) {
    return null
  }

  return unsignedCookie.value
}
