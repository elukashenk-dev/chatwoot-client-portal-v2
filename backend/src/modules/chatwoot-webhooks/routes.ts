import type { FastifyInstance, FastifyRequest } from 'fastify'

import { ApiError } from '../../lib/errors.js'
import type { ChatwootWebhookService } from './service.js'

type RawBodyRequest = FastifyRequest & {
  rawBody?: Buffer
}

type RegisterChatwootWebhookRoutesOptions = {
  chatwootWebhookService?: ChatwootWebhookService
  createChatwootWebhookService?: (
    request: FastifyRequest,
  ) => ChatwootWebhookService
}

const CHATWOOT_WEBHOOK_PATH = '/api/chatwoot/webhooks'

function parseJsonRawBody(rawBody: Buffer) {
  try {
    return JSON.parse(rawBody.toString('utf8')) as unknown
  } catch {
    throw new ApiError(
      400,
      'chatwoot_webhook_json_invalid',
      'JSON webhook системы поддержки некорректен.',
    )
  }
}

export function registerChatwootWebhookRoutes(
  app: FastifyInstance,
  {
    chatwootWebhookService,
    createChatwootWebhookService,
  }: RegisterChatwootWebhookRoutesOptions,
) {
  app.register(async (webhookApp) => {
    webhookApp.removeContentTypeParser('application/json')
    webhookApp.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (request, body, done) => {
        const rawBody = Buffer.isBuffer(body)
          ? body
          : Buffer.from(String(body ?? ''), 'utf8')
        const rawBodyRequest = request as RawBodyRequest

        rawBodyRequest.rawBody = rawBody

        try {
          done(null, parseJsonRawBody(rawBody))
        } catch (error) {
          done(error as Error)
        }
      },
    )

    const handleWebhookRequest = async (request: FastifyRequest) => {
      const rawBody = (request as RawBodyRequest).rawBody

      if (!rawBody) {
        throw new ApiError(
          400,
          'chatwoot_webhook_body_required',
          'Тело webhook системы поддержки обязательно.',
        )
      }

      const resolvedWebhookService =
        createChatwootWebhookService?.(request) ?? chatwootWebhookService

      if (!resolvedWebhookService) {
        throw new ApiError(
          500,
          'chatwoot_webhook_service_missing',
          'Сервис webhook системы поддержки недоступен.',
        )
      }

      return resolvedWebhookService.handleWebhook({
        headers: request.headers,
        payload: request.body,
        rawBody,
      })
    }

    webhookApp.post(CHATWOOT_WEBHOOK_PATH, handleWebhookRequest)
  })
}
