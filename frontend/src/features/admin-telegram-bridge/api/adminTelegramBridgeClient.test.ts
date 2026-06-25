import { afterEach, describe, expect, it, vi } from 'vitest'

import { AdminApiClientError } from '../../admin-auth/api/adminAuthClient'
import {
  setupTelegramBridge,
  type TelegramBridgeAdminSetupResponse,
} from './adminTelegramBridgeClient'

const bridgeResponse = {
  bridge: {
    chatwootTelegramInboxId: 17,
    displayName: 'Telegram support_bot',
    lastWebhookCheckedAt: '2026-06-25T10:00:00.000Z',
    lastWebhookHost: 'app.lancora.ru',
    lastWebhookOwner: 'telegram-bridge',
    publicKey: 'provgroup-support',
    status: 'active',
    telegramBotId: '1234567890',
    telegramBotUsername: 'support_bot',
    webhookConfigured: true,
  },
} satisfies TelegramBridgeAdminSetupResponse

function mockJsonResponse(payload: unknown, status = 200) {
  return {
    headers: new Headers({ 'content-type': 'application/json' }),
    json: vi.fn().mockResolvedValue(payload),
    ok: status >= 200 && status < 300,
    status,
  }
}

describe('adminTelegramBridgeClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('posts setup input to the tenant admin bridge setup API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockJsonResponse(bridgeResponse)),
    )

    await expect(
      setupTelegramBridge({
        chatwootInboxUrl:
          'https://app.lancora.ru/app/accounts/1/settings/inboxes/17',
        telegramBotToken: '1234567890:AASecretBotTokenValue',
      }),
    ).resolves.toEqual(bridgeResponse)

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/integrations/telegram-bridge/setup',
      expect.objectContaining({
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    )

    const init = vi.mocked(fetch).mock.calls[0]?.[1]

    expect(JSON.parse(String(init?.body))).toEqual({
      chatwootInboxUrl:
        'https://app.lancora.ru/app/accounts/1/settings/inboxes/17',
      telegramBotToken: '1234567890:AASecretBotTokenValue',
    })
  })

  it.each([
    [400, 'Проверьте ссылку на источник и токен Telegram бота.'],
    [401, 'Войдите в админ-консоль заново.'],
    [403, 'Запрос отклонен для этого портала.'],
    [409, 'Этот Telegram бот или источник уже подключен.'],
    [502, 'Не удалось связаться с Telegram или Chatwoot.'],
  ])('maps HTTP %i to a short safe Russian message', async (status, message) => {
    const secret = '1234567890:AASecretBotTokenValue'

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse(
          {
            error: {
              code: 'UPSTREAM_ERROR',
              message: `Backend error leaked ${secret}`,
            },
          },
          status,
        ),
      ),
    )

    await expect(
      setupTelegramBridge({
        chatwootInboxUrl:
          'https://app.lancora.ru/app/accounts/1/settings/inboxes/17',
        telegramBotToken: secret,
      }),
    ).rejects.toMatchObject({
      message,
      statusCode: status,
    })

    await expect(
      setupTelegramBridge({
        chatwootInboxUrl:
          'https://app.lancora.ru/app/accounts/1/settings/inboxes/17',
        telegramBotToken: secret,
      }),
    ).rejects.not.toThrow(secret)
  })

  it('surfaces network failures without echoing the submitted token', async () => {
    const secret = '1234567890:AASecretBotTokenValue'

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(secret)))

    await expect(
      setupTelegramBridge({
        chatwootInboxUrl:
          'https://app.lancora.ru/app/accounts/1/settings/inboxes/17',
        telegramBotToken: secret,
      }),
    ).rejects.toEqual(
      new AdminApiClientError({
        message: 'Мы не смогли выполнить запрос. Попробуйте еще раз чуть позже.',
        statusCode: 0,
      }),
    )
  })
})
