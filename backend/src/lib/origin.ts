import type { FastifyRequest } from 'fastify'

import { ApiError } from './errors.js'

export function assertAllowedOrigin(
  request: FastifyRequest,
  expectedOrigin: string,
) {
  if (request.headers.origin !== expectedOrigin) {
    throw new ApiError(
      403,
      'FORBIDDEN_ORIGIN',
      'Недопустимый источник запроса.',
    )
  }
}
