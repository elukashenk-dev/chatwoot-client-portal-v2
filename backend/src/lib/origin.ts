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

export function assertAllowedOrigin(
  request: FastifyRequest,
  expectedOrigin: string,
) {
  const originHeader = request.headers.origin
  const requestOrigin =
    typeof originHeader === 'string' ? normalizeOrigin(originHeader) : null
  const normalizedExpectedOrigin = normalizeOrigin(expectedOrigin)

  if (
    !requestOrigin ||
    !normalizedExpectedOrigin ||
    requestOrigin !== normalizedExpectedOrigin
  ) {
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
