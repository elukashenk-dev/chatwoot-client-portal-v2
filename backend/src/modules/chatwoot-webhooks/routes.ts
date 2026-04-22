import type { FastifyInstance, FastifyRequest } from 'fastify'

import { ApiError } from '../../lib/errors.js'
import type { ChatwootWebhookService } from './service.js'

type RawBodyRequest = FastifyRequest & {
  rawBody?: Buffer
}

type RegisterChatwootWebhookRoutesOptions = {
  chatwootWebhookService: ChatwootWebhookService
}

const CHATWOOT_WEBHOOK_PATHS = [
  '/api/chatwoot/webhooks',
  '/api/integrations/chatwoot/webhooks/account',
]

function parseJsonRawBody(rawBody: Buffer) {
  try {
    return JSON.parse(rawBody.toString('utf8')) as unknown
  } catch {
    throw new ApiError(
      400,
      'chatwoot_webhook_json_invalid',
      'Chatwoot webhook JSON is invalid.',
    )
  }
}

export function registerChatwootWebhookRoutes(
  app: FastifyInstance,
  { chatwootWebhookService }: RegisterChatwootWebhookRoutesOptions,
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
          'Chatwoot webhook body is required.',
        )
      }

      return chatwootWebhookService.handleWebhook({
        headers: request.headers,
        payload: request.body,
        rawBody,
      })
    }

    for (const path of CHATWOOT_WEBHOOK_PATHS) {
      webhookApp.post(path, handleWebhookRequest)
    }
  })
}
