import { describe, expect, it } from 'vitest'

import { ApiError } from '../../lib/errors.js'
import {
  parseChatwootInboxUrl,
  parseTelegramBridgeSetupInput,
} from './input.js'

describe('parseChatwootInboxUrl', () => {
  it('accepts a Chatwoot inbox settings URL and returns account and inbox ids', () => {
    expect(
      parseChatwootInboxUrl(
        'https://app.lancora.ru/app/accounts/1/settings/inboxes/17',
      ),
    ).toEqual({
      accountId: 1,
      inboxId: 17,
    })
  })

  it('rejects non-HTTPS and non-inbox Chatwoot URLs', () => {
    expect(() =>
      parseChatwootInboxUrl(
        'http://app.lancora.ru/app/accounts/1/settings/inboxes/17',
      ),
    ).toThrow('Ссылка на Telegram источник должна быть HTTPS.')
    expect(() =>
      parseChatwootInboxUrl('https://app.lancora.ru/app/accounts/1/settings'),
    ).toThrow('Укажите ссылку на настройки Telegram источника.')
    expect(() => parseChatwootInboxUrl('not-a-url')).toThrow(
      'Укажите ссылку на Telegram-источник в системе поддержки.',
    )
  })
})

describe('parseTelegramBridgeSetupInput', () => {
  it('trims user input and returns normalized setup fields', () => {
    expect(
      parseTelegramBridgeSetupInput({
        chatwootInboxUrl:
          '  https://app.lancora.ru/app/accounts/1/settings/inboxes/17  ',
        telegramBotToken:
          '  1234567890:AAExampleTelegramBotTokenSecretValue  ',
      }),
    ).toEqual({
      chatwootAccountIdFromUrl: 1,
      chatwootTelegramInboxId: 17,
      telegramBotToken: '1234567890:AAExampleTelegramBotTokenSecretValue',
    })
  })

  it('rejects missing or empty Telegram bot token without echoing secrets', () => {
    expect(() =>
      parseTelegramBridgeSetupInput({
        chatwootInboxUrl:
          'https://app.lancora.ru/app/accounts/1/settings/inboxes/17',
      }),
    ).toThrow(ApiError)

    try {
      parseTelegramBridgeSetupInput({
        chatwootInboxUrl:
          'http://app.lancora.ru/app/accounts/1/settings/inboxes/17',
        telegramBotToken:
          '1234567890:AAExampleTelegramBotTokenSecretValue',
      })
    } catch (error) {
      expect(String(error)).not.toContain(
        '1234567890:AAExampleTelegramBotTokenSecretValue',
      )
    }

    expect(() =>
      parseTelegramBridgeSetupInput({
        chatwootInboxUrl:
          'https://app.lancora.ru/app/accounts/1/settings/inboxes/17',
        telegramBotToken: '   ',
      }),
    ).toThrow(ApiError)
  })
})
