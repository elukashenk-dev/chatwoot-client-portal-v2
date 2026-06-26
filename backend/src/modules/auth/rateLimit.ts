import type { FastifyInstance, FastifyRequest } from 'fastify'

import { ApiError } from '../../lib/errors.js'

const AUTH_RATE_LIMIT_CACHE_MAX = 10_000

type AuthRateLimitOptions = {
  maxRequests: number
  windowMs: number
}

type AuthRateLimitBucket = {
  count: number
  resetAt: number
}

const authRateLimitGroups = new Map<string, string>([
  ['POST /api/admin/auth/logout', 'tenant-admin-logout'],
  ['POST /api/admin/auth/request', 'tenant-admin-login-request'],
  ['POST /api/admin/auth/verify', 'tenant-admin-login-verify'],
  ['POST /api/auth/login', 'auth-login'],
  ['POST /api/auth/register/request', 'auth-registration-request'],
  ['POST /api/auth/register/verify', 'auth-registration-verify'],
  ['POST /api/auth/register/set-password', 'auth-registration-set-password'],
  ['POST /api/auth/register/skip-password', 'auth-registration-skip-password'],
  ['POST /api/auth/password-reset/request', 'auth-password-reset-request'],
  ['POST /api/auth/password-reset/verify', 'auth-password-reset-verify'],
  [
    'POST /api/auth/password-reset/set-password',
    'auth-password-reset-set-password',
  ],
  ['POST /api/auth/code-login/request', 'auth-passwordless-login-request'],
  ['POST /api/auth/code-login/verify', 'auth-passwordless-login-verify'],
  ['POST /api/auth/password-setup/request', 'auth-password-setup-request'],
  ['POST /api/auth/password-setup/verify', 'auth-password-setup-verify'],
  ['POST /api/auth/password-setup/set', 'auth-password-setup-set'],
])

function getRequestPathname(request: FastifyRequest) {
  try {
    return new URL(request.url, 'http://portal.local').pathname
  } catch {
    throw new ApiError(400, 'REQUEST_URL_INVALID', 'Некорректный URL запроса.')
  }
}

function getAuthRateLimitGroupId(request: FastifyRequest) {
  return authRateLimitGroups.get(
    `${request.method} ${getRequestPathname(request)}`,
  )
}

function getTenantRateLimitKey(request: FastifyRequest) {
  return request.tenant
    ? `tenant:${request.tenant.id}`
    : `host:${request.hostname}`
}

function getAuthRateLimitKey(request: FastifyRequest) {
  return `${getTenantRateLimitKey(request)}:ip:${request.ip}`
}

function pruneExpiredBuckets(
  buckets: Map<string, AuthRateLimitBucket>,
  now: number,
) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }
}

function trimOldestBuckets(buckets: Map<string, AuthRateLimitBucket>) {
  while (buckets.size > AUTH_RATE_LIMIT_CACHE_MAX) {
    const oldestKey = buckets.keys().next().value

    if (!oldestKey) {
      return
    }

    buckets.delete(oldestKey)
  }
}

export function registerAuthRateLimit(
  app: FastifyInstance,
  { maxRequests, windowMs }: AuthRateLimitOptions,
) {
  const buckets = new Map<string, AuthRateLimitBucket>()

  app.addHook('onRequest', async (request, reply) => {
    const groupId = getAuthRateLimitGroupId(request)

    if (!groupId) {
      return
    }

    const now = Date.now()
    const key = `${groupId}:${getAuthRateLimitKey(request)}`
    const currentBucket = buckets.get(key)
    const bucket =
      currentBucket && currentBucket.resetAt > now
        ? currentBucket
        : {
            count: 0,
            resetAt: now + windowMs,
          }

    bucket.count += 1
    buckets.set(key, bucket)

    if (buckets.size > AUTH_RATE_LIMIT_CACHE_MAX) {
      pruneExpiredBuckets(buckets, now)
      trimOldestBuckets(buckets)
    }

    if (bucket.count <= maxRequests) {
      return
    }

    reply.header(
      'Retry-After',
      Math.ceil((bucket.resetAt - now) / 1000).toString(),
    )

    throw new ApiError(
      429,
      'RATE_LIMITED',
      'Слишком много запросов. Попробуйте позже.',
    )
  })
}
