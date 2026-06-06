import type { CookieSerializeOptions } from '@fastify/cookie'
import type { FastifyReply, FastifyRequest } from 'fastify'

import type { AppEnv } from '../../config/env.js'

const ADMIN_SESSION_TTL_HOURS = 12

export function getAdminSessionCookieOptions(
  env: AppEnv,
): CookieSerializeOptions {
  return {
    httpOnly: true,
    maxAge: ADMIN_SESSION_TTL_HOURS * 60 * 60,
    path: '/',
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    signed: true,
  }
}

export function clearAdminSessionCookie(reply: FastifyReply, env: AppEnv) {
  reply.clearCookie(env.ADMIN_SESSION_COOKIE_NAME, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
  })
}

export function getAdminSessionToken(request: FastifyRequest, env: AppEnv) {
  const rawCookie = request.cookies[env.ADMIN_SESSION_COOKIE_NAME]

  if (!rawCookie) {
    return null
  }

  const unsignedCookie = request.unsignCookie(rawCookie)

  if (!unsignedCookie.valid) {
    return null
  }

  return unsignedCookie.value
}
