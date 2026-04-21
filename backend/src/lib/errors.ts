import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'

type ApiErrorPayload = {
  error: {
    code: string
    details?: unknown
    message: string
  }
}

export class ApiError extends Error {
  readonly code: string
  readonly details?: unknown
  readonly statusCode: number

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message)

    this.name = 'ApiError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export function registerApiErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      const payload: ApiErrorPayload = {
        error: {
          code: error.code,
          message: error.message,
        },
      }

      if (error.details !== undefined) {
        payload.error.details = error.details
      }

      return reply.status(error.statusCode).send(payload)
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_REQUEST',
          message: error.issues[0]?.message ?? 'Некорректный запрос.',
        },
      })
    }

    request.log.error(error)

    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Внутренняя ошибка сервера.',
      },
    })
  })
}
