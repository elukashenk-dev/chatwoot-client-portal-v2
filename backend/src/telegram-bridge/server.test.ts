import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildTelegramBridgeApp,
  createTelegramBridgeServiceTextsFromEnv,
} from './server.js'
import type {
  HandleTelegramUpdateInput,
  TelegramBridgeResult,
} from './service.js'

const telegramSecretHeader = 'x-telegram-bot-api-secret-token'

function telegramUpdate(updateId = 1001) {
  return {
    message: {
      chat: {
        id: 77,
        type: 'private',
      },
      message_id: 5,
      text: 'hello',
    },
    update_id: updateId,
  }
}

describe('buildTelegramBridgeApp', () => {
  let app: ReturnType<typeof buildTelegramBridgeApp>
  let handleTelegramUpdate: ReturnType<
    typeof vi.fn<
      (input: HandleTelegramUpdateInput) => Promise<TelegramBridgeResult>
    >
  >

  beforeEach(async () => {
    handleTelegramUpdate = vi.fn().mockResolvedValue({
      kind: 'accepted',
    })
    app = buildTelegramBridgeApp({
      handleTelegramUpdate,
      logger: false,
      maxBodyBytes: 128,
    })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('returns health status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/telegram-bridge/health',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: 'ok',
    })
  })

  it('requires both bridge key and webhook path secret in the exact route', async () => {
    const response = await app.inject({
      headers: {
        [telegramSecretHeader]: 'header-secret',
        'content-type': 'application/json',
      },
      method: 'POST',
      payload: telegramUpdate(),
      url: '/telegram-bridge/tenant-a-support',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      error: {
        code: 'not_found',
        message: 'Not found.',
      },
    })
    expect(handleTelegramUpdate).not.toHaveBeenCalled()
  })

  it('returns generic 403 before body parsing when Telegram secret header is missing', async () => {
    const response = await app.inject({
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
      payload: '{"update_id":',
      url: '/telegram-bridge/tenant-a-support/path-secret',
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: {
        code: 'forbidden',
        message: 'Forbidden.',
      },
    })
    expect(handleTelegramUpdate).not.toHaveBeenCalled()
  })

  it('maps wrong path secrets to generic 404 and wrong Telegram secrets to generic 403', async () => {
    handleTelegramUpdate
      .mockResolvedValueOnce({
        kind: 'ignored',
        reason: 'unauthorized',
      })
      .mockResolvedValueOnce({
        kind: 'ignored',
        reason: 'forbidden',
      })

    const wrongPathResponse = await app.inject({
      headers: {
        [telegramSecretHeader]: 'header-secret',
        'content-type': 'application/json',
      },
      method: 'POST',
      payload: telegramUpdate(1002),
      url: '/telegram-bridge/tenant-a-support/wrong-path-secret',
    })
    const wrongHeaderResponse = await app.inject({
      headers: {
        [telegramSecretHeader]: 'wrong-header-secret',
        'content-type': 'application/json',
      },
      method: 'POST',
      payload: telegramUpdate(1003),
      url: '/telegram-bridge/tenant-a-support/path-secret',
    })

    expect(wrongPathResponse.statusCode).toBe(404)
    expect(wrongPathResponse.json()).toEqual({
      error: {
        code: 'not_found',
        message: 'Not found.',
      },
    })
    expect(wrongHeaderResponse.statusCode).toBe(403)
    expect(wrongHeaderResponse.json()).toEqual({
      error: {
        code: 'forbidden',
        message: 'Forbidden.',
      },
    })
  })

  it('rejects non-JSON and oversized JSON requests before calling the handler', async () => {
    const nonJsonResponse = await app.inject({
      headers: {
        [telegramSecretHeader]: 'header-secret',
        'content-type': 'text/plain',
      },
      method: 'POST',
      payload: 'hello',
      url: '/telegram-bridge/tenant-a-support/path-secret',
    })
    const oversizedResponse = await app.inject({
      headers: {
        [telegramSecretHeader]: 'header-secret',
        'content-type': 'application/json',
      },
      method: 'POST',
      payload: {
        message: {
          chat: {
            id: 77,
            type: 'private',
          },
          text: 'x'.repeat(256),
        },
        update_id: 1004,
      },
      url: '/telegram-bridge/tenant-a-support/path-secret',
    })

    expect(nonJsonResponse.statusCode).toBe(415)
    expect(nonJsonResponse.json()).toEqual({
      error: {
        code: 'unsupported_media_type',
        message: 'Unsupported media type.',
      },
    })
    expect(oversizedResponse.statusCode).toBe(413)
    expect(oversizedResponse.json()).toEqual({
      error: {
        code: 'payload_too_large',
        message: 'Payload too large.',
      },
    })
    expect(handleTelegramUpdate).not.toHaveBeenCalled()
  })

  it('passes valid Telegram updates to the bridge handler', async () => {
    const update = telegramUpdate(1005)
    const response = await app.inject({
      headers: {
        [telegramSecretHeader]: 'header-secret',
        'content-type': 'application/json',
      },
      method: 'POST',
      payload: update,
      url: '/telegram-bridge/tenant-a-support/path-secret',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      result: 'accepted',
    })
    expect(handleTelegramUpdate).toHaveBeenCalledWith({
      bridgeKey: 'tenant-a-support',
      telegramSecretToken: 'header-secret',
      update,
      webhookPathSecret: 'path-secret',
    })
  })

  it('maps ignored and duplicate updates to 200', async () => {
    handleTelegramUpdate
      .mockResolvedValueOnce({
        kind: 'ignored',
        reason: 'disabled',
      })
      .mockResolvedValueOnce({
        kind: 'duplicate',
      })

    const ignoredResponse = await app.inject({
      headers: {
        [telegramSecretHeader]: 'header-secret',
        'content-type': 'application/json',
      },
      method: 'POST',
      payload: telegramUpdate(1006),
      url: '/telegram-bridge/tenant-a-support/path-secret',
    })
    const duplicateResponse = await app.inject({
      headers: {
        [telegramSecretHeader]: 'header-secret',
        'content-type': 'application/json',
      },
      method: 'POST',
      payload: telegramUpdate(1007),
      url: '/telegram-bridge/tenant-a-support/path-secret',
    })

    expect(ignoredResponse.statusCode).toBe(200)
    expect(ignoredResponse.json()).toEqual({
      result: 'ignored',
    })
    expect(duplicateResponse.statusCode).toBe(200)
    expect(duplicateResponse.json()).toEqual({
      result: 'duplicate',
    })
  })

  it('maps retryable failures to their service status code', async () => {
    handleTelegramUpdate
      .mockResolvedValueOnce({
        kind: 'retryable_failure',
        reason: 'bridge_processing_failed',
        statusCode: 500,
      })
      .mockResolvedValueOnce({
        kind: 'retryable_failure',
        reason: 'update_in_progress',
        statusCode: 503,
      })

    const failedResponse = await app.inject({
      headers: {
        [telegramSecretHeader]: 'header-secret',
        'content-type': 'application/json',
      },
      method: 'POST',
      payload: telegramUpdate(1008),
      url: '/telegram-bridge/tenant-a-support/path-secret',
    })
    const inProgressResponse = await app.inject({
      headers: {
        [telegramSecretHeader]: 'header-secret',
        'content-type': 'application/json',
      },
      method: 'POST',
      payload: telegramUpdate(1009),
      url: '/telegram-bridge/tenant-a-support/path-secret',
    })

    expect(failedResponse.statusCode).toBe(500)
    expect(failedResponse.json()).toEqual({
      result: 'retryable_failure',
    })
    expect(inProgressResponse.statusCode).toBe(503)
    expect(inProgressResponse.json()).toEqual({
      result: 'retryable_failure',
    })
  })

  it('maps bridge phone-flow environment text into service text options', () => {
    expect(
      createTelegramBridgeServiceTextsFromEnv({
        TELEGRAM_BRIDGE_PHONE_LINKED_TEXT: 'ENV LINKED',
        TELEGRAM_BRIDGE_PHONE_NOT_FOUND_TEXT: 'ENV NOT FOUND',
        TELEGRAM_BRIDGE_PHONE_PROMPT_TEXT: 'ENV PROMPT',
      }),
    ).toEqual({
      phoneLinked: 'ENV LINKED',
      phoneNotFound: 'ENV NOT FOUND',
      phonePrompt: 'ENV PROMPT',
    })
  })
})
