import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { registerApiErrorHandler } from '../../lib/errors.js'
import { registerChatwootWebhookRoutes } from './routes.js'
import type { ChatwootWebhookService } from './service.js'

describe('registerChatwootWebhookRoutes', () => {
  let app: ReturnType<typeof Fastify>
  let handleWebhook: ReturnType<
    typeof vi.fn<ChatwootWebhookService['handleWebhook']>
  >

  beforeEach(async () => {
    app = Fastify()
    handleWebhook = vi
      .fn<ChatwootWebhookService['handleWebhook']>()
      .mockResolvedValue({
        deliveredClients: 0,
        result: 'accepted',
      })

    registerApiErrorHandler(app)
    registerChatwootWebhookRoutes(app, {
      chatwootWebhookService: {
        handleWebhook,
      },
    })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('passes the parsed JSON payload and exact raw body to the webhook service', async () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        event: 'message_created',
        id: 501,
      }),
    )

    const response = await app.inject({
      headers: {
        'content-type': 'application/json',
        'x-chatwoot-delivery': 'delivery-1',
      },
      method: 'POST',
      payload: rawBody,
      url: '/api/chatwoot/webhooks',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      deliveredClients: 0,
      result: 'accepted',
    })
    expect(handleWebhook).toHaveBeenCalledWith({
      headers: expect.objectContaining({
        'x-chatwoot-delivery': 'delivery-1',
      }),
      payload: {
        event: 'message_created',
        id: 501,
      },
      rawBody,
    })
  })

  it('keeps the documented integrations webhook path as a compatible callback URL', async () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        event: 'message_created',
        id: 502,
      }),
    )

    const response = await app.inject({
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
      payload: rawBody,
      url: '/api/integrations/chatwoot/webhooks/account',
    })

    expect(response.statusCode).toBe(200)
    expect(handleWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          event: 'message_created',
          id: 502,
        },
        rawBody,
      }),
    )
  })

  it('rejects malformed webhook JSON with a controlled error', async () => {
    const response = await app.inject({
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
      payload: '{"event":',
      url: '/api/chatwoot/webhooks',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: {
        code: 'chatwoot_webhook_json_invalid',
        message: 'Chatwoot webhook JSON is invalid.',
      },
    })
    expect(handleWebhook).not.toHaveBeenCalled()
  })
})
