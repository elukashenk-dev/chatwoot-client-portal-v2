import type { FastifyRequest } from 'fastify'

import { ApiError } from './errors.js'

function normalizeOrigin(value: string | undefined) {
  if (!value) {
    return null
  }

  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function isAllowedOrigin(
  originHeader: string | undefined,
  expectedOrigin: string,
) {
  const requestOrigin =
    typeof originHeader === 'string' ? normalizeOrigin(originHeader) : null
  const normalizedExpectedOrigin = normalizeOrigin(expectedOrigin)

  return Boolean(
    requestOrigin &&
      normalizedExpectedOrigin &&
      requestOrigin === normalizedExpectedOrigin,
  )
}

export function assertAllowedOrigin(
  request: FastifyRequest,
  expectedOrigin: string,
) {
  const originHeader = request.headers.origin

  if (!isAllowedOrigin(originHeader, expectedOrigin)) {
    throw new ApiError(
      403,
      'FORBIDDEN_ORIGIN',
      'Недопустимый источник запроса.',
    )
  }
}

export function assertAllowedTenantOrigin(request: FastifyRequest) {
  const tenant = request.tenant

  if (!tenant) {
    throw new ApiError(
      500,
      'TENANT_CONTEXT_MISSING',
      'Tenant context is missing.',
    )
  }

  assertAllowedOrigin(request, tenant.publicBaseUrl)
}
