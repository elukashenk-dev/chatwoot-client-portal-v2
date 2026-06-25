import { describe, expect, it } from 'vitest'

import {
  createBridgeHealthVerifier,
  parseChatwootTelegramInboxResponse,
} from './serviceFactory.js'

describe('parseChatwootTelegramInboxResponse', () => {
  it('accepts a Telegram inbox with bot_name metadata', () => {
    expect(
      parseChatwootTelegramInboxResponse(
        {
          channel: {
            bot_name: 'support_bot',
          },
          channel_type: 'Channel::Telegram',
          id: 17,
        },
        17,
      ),
    ).toEqual({
      botName: 'support_bot',
      id: 17,
    })
  })

  it('rejects an inbox response for a different id', () => {
    expect(() =>
      parseChatwootTelegramInboxResponse(
        {
          channel: {
            bot_name: 'support_bot',
          },
          channel_type: 'Channel::Telegram',
          id: 18,
        },
        17,
      ),
    ).toThrow(/Telegram источник не найден/)
  })

  it('rejects non-Telegram inboxes', () => {
    expect(() =>
      parseChatwootTelegramInboxResponse(
        {
          channel_type: 'Channel::WebWidget',
          id: 17,
        },
        17,
      ),
    ).toThrow(/не является Telegram/)
  })

  it('rejects Telegram inboxes without bot_name', () => {
    expect(() =>
      parseChatwootTelegramInboxResponse(
        {
          channel: {},
          channel_type: 'Channel::Telegram',
          id: 17,
        },
        17,
      ),
    ).toThrow(/bot_name/)
  })
})

describe('createBridgeHealthVerifier', () => {
  it('checks the public bridge health endpoint before setup mutation', async () => {
    const requestedUrls: string[] = []
    const verifyBridgeHealth = createBridgeHealthVerifier({
      fetchFn: async (input) => {
        requestedUrls.push(String(input))

        return new Response('ok', { status: 200 })
      },
      publicBaseUrl: 'https://app.lancora.ru/',
      requestTimeoutMs: 1000,
    })

    await expect(verifyBridgeHealth()).resolves.toBeUndefined()
    expect(requestedUrls).toEqual([
      'https://app.lancora.ru/telegram-bridge/health',
    ])
  })

  it('rejects a failing public bridge health endpoint', async () => {
    const verifyBridgeHealth = createBridgeHealthVerifier({
      fetchFn: async () => new Response('nope', { status: 503 }),
      publicBaseUrl: 'https://app.lancora.ru',
      requestTimeoutMs: 1000,
    })

    await expect(verifyBridgeHealth()).rejects.toThrow(/health check failed/)
  })
})
