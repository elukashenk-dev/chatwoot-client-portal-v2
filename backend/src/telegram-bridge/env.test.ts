import { describe, expect, it } from 'vitest'

import { loadTelegramBridgeEnv } from './env.js'

const baseRawEnv = {
  DATABASE_URL:
    'postgres://test:test@127.0.0.1:5432/chatwoot_client_portal_v2_test',
  PORTAL_TENANT_SECRET_KEY: Buffer.alloc(32, 11).toString('base64'),
  TELEGRAM_BRIDGE_PORT: '3401',
  TELEGRAM_BRIDGE_PUBLIC_BASE_URL: 'https://bridge.example.test/',
} satisfies NodeJS.ProcessEnv

describe('loadTelegramBridgeEnv', () => {
  it('parses valid bridge config and normalizes the public base URL', () => {
    const env = loadTelegramBridgeEnv({
      ...baseRawEnv,
      TELEGRAM_BRIDGE_MAX_BODY_BYTES: '2048',
      TELEGRAM_BRIDGE_PHONE_LINKED_TEXT: ' Linked ',
      TELEGRAM_BRIDGE_PHONE_NOT_FOUND_TEXT: ' Not found ',
      TELEGRAM_BRIDGE_PHONE_PROMPT_TEXT: ' Prompt ',
      TELEGRAM_BRIDGE_PROCESSING_STALE_MS: '300000',
      TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS: '5000',
    })

    expect(env).toMatchObject({
      DATABASE_URL: baseRawEnv.DATABASE_URL,
      PORTAL_TENANT_SECRET_KEY: baseRawEnv.PORTAL_TENANT_SECRET_KEY,
      TELEGRAM_BRIDGE_MAX_BODY_BYTES: 2048,
      TELEGRAM_BRIDGE_PHONE_LINKED_TEXT: 'Linked',
      TELEGRAM_BRIDGE_PHONE_NOT_FOUND_TEXT: 'Not found',
      TELEGRAM_BRIDGE_PHONE_PROMPT_TEXT: 'Prompt',
      TELEGRAM_BRIDGE_PORT: 3401,
      TELEGRAM_BRIDGE_PROCESSING_STALE_MS: 300_000,
      TELEGRAM_BRIDGE_PUBLIC_BASE_URL: 'https://bridge.example.test',
      TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS: 5_000,
    })
  })

  it('uses conservative defaults for optional bridge runtime settings', () => {
    const env = loadTelegramBridgeEnv(baseRawEnv)

    expect(env.TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS).toBe(10_000)
    expect(env.TELEGRAM_BRIDGE_MAX_BODY_BYTES).toBe(1_048_576)
    expect(env.TELEGRAM_BRIDGE_PROCESSING_STALE_MS).toBe(600_000)
    expect(env.TELEGRAM_BRIDGE_PHONE_PROMPT_TEXT).toBe(
      'Пожалуйста, отправьте номер телефона кнопкой ниже, чтобы мы могли найти ваш контакт.',
    )
    expect(env.TELEGRAM_BRIDGE_PHONE_NOT_FOUND_TEXT).toBe(
      'Не удалось найти контакт с этим номером. Проверьте номер или напишите менеджеру.',
    )
    expect(env.TELEGRAM_BRIDGE_PHONE_LINKED_TEXT).toBe(
      'Спасибо, контакт найден. Теперь можете отправить сообщение.',
    )
  })

  it('rejects missing required bridge config values', () => {
    expect(() =>
      loadTelegramBridgeEnv({
        DATABASE_URL: baseRawEnv.DATABASE_URL,
        PORTAL_TENANT_SECRET_KEY: baseRawEnv.PORTAL_TENANT_SECRET_KEY,
        TELEGRAM_BRIDGE_PORT: baseRawEnv.TELEGRAM_BRIDGE_PORT,
      }),
    ).toThrow(/TELEGRAM_BRIDGE_PUBLIC_BASE_URL/)

    expect(() =>
      loadTelegramBridgeEnv({
        PORTAL_TENANT_SECRET_KEY: baseRawEnv.PORTAL_TENANT_SECRET_KEY,
        TELEGRAM_BRIDGE_PORT: baseRawEnv.TELEGRAM_BRIDGE_PORT,
        TELEGRAM_BRIDGE_PUBLIC_BASE_URL:
          baseRawEnv.TELEGRAM_BRIDGE_PUBLIC_BASE_URL,
      }),
    ).toThrow(/DATABASE_URL/)

    expect(() =>
      loadTelegramBridgeEnv({
        DATABASE_URL: baseRawEnv.DATABASE_URL,
        PORTAL_TENANT_SECRET_KEY: baseRawEnv.PORTAL_TENANT_SECRET_KEY,
        TELEGRAM_BRIDGE_PUBLIC_BASE_URL:
          baseRawEnv.TELEGRAM_BRIDGE_PUBLIC_BASE_URL,
      }),
    ).toThrow(/TELEGRAM_BRIDGE_PORT/)
  })

  it('rejects invalid URLs, positive integers, and empty secret strings', () => {
    expect(() =>
      loadTelegramBridgeEnv({
        ...baseRawEnv,
        TELEGRAM_BRIDGE_PUBLIC_BASE_URL: 'not-a-url',
      }),
    ).toThrow(/TELEGRAM_BRIDGE_PUBLIC_BASE_URL/)

    expect(() =>
      loadTelegramBridgeEnv({
        ...baseRawEnv,
        TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS: '0',
      }),
    ).toThrow(/TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS/)

    expect(() =>
      loadTelegramBridgeEnv({
        ...baseRawEnv,
        PORTAL_TENANT_SECRET_KEY: '',
      }),
    ).toThrow(/PORTAL_TENANT_SECRET_KEY/)
  })

  it('does not expose removed single-tenant bridge env values', () => {
    const env = loadTelegramBridgeEnv({
      ...baseRawEnv,
      TELEGRAM_BRIDGE_CHATWOOT_ACCOUNT_ID: '1',
      TELEGRAM_BRIDGE_CHATWOOT_API_ACCESS_TOKEN: 'chatwoot-token',
      TELEGRAM_BRIDGE_CHATWOOT_TELEGRAM_INBOX_ID: '17',
      TELEGRAM_BRIDGE_TELEGRAM_BOT_TOKEN:
        '1234567890:AAExampleTelegramBotTokenSecretValue',
    })

    expect('TELEGRAM_BRIDGE_CHATWOOT_ACCOUNT_ID' in env).toBe(false)
    expect('TELEGRAM_BRIDGE_CHATWOOT_API_ACCESS_TOKEN' in env).toBe(false)
    expect('TELEGRAM_BRIDGE_CHATWOOT_TELEGRAM_INBOX_ID' in env).toBe(false)
    expect('TELEGRAM_BRIDGE_TELEGRAM_BOT_TOKEN' in env).toBe(false)
  })
})
