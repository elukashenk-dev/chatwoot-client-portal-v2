import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseClient } from '../db/client.js'
import {
  portalTenants,
  telegramBridgeConfigs,
} from '../db/schema.js'
import { createTestDatabase } from '../test/testDatabase.js'
import {
  decodeTenantSecretKey,
  decryptTenantSecret,
  encryptTenantSecret,
} from '../modules/tenants/secrets.js'
import {
  classifyTelegramWebhookOwner,
  configureTelegramWebhook,
} from './configureWebhook.js'
import { createTelegramClient } from './telegramClient.js'

const tenantSecretKey = Buffer.alloc(32, 13).toString('base64')

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

async function seedTenant(database: DatabaseClient) {
  const key = decodeTenantSecretKey(tenantSecretKey)
  const [tenant] = await database.db
    .insert(portalTenants)
    .values({
      chatwootAccountId: 3,
      chatwootApiAccessTokenCiphertext: encryptTenantSecret(
        'chatwoot-runtime-token',
        key,
      ),
      chatwootBaseUrl: 'https://chatwoot.example.test',
      chatwootPortalInboxId: 1,
      chatwootWebhookSecretCiphertext: encryptTenantSecret(
        'webhook-secret',
        key,
      ),
      displayName: 'Default',
      primaryDomain: 'default.example.test',
      publicBaseUrl: 'https://default.example.test',
      slug: 'default',
      status: 'active',
    })
    .returning()

  if (!tenant) {
    throw new Error('Failed to seed tenant.')
  }

  return tenant
}

async function seedBridgeConfig(database: DatabaseClient) {
  const tenant = await seedTenant(database)
  const key = decodeTenantSecretKey(tenantSecretKey)
  const [config] = await database.db
    .insert(telegramBridgeConfigs)
    .values({
      chatwootTelegramInboxId: 17,
      displayName: 'Support',
      id: randomUUID(),
      publicKey: 'provgroup-support',
      status: 'rotating',
      telegramBotId: '1234567890',
      telegramBotTokenCiphertext: encryptTenantSecret(
        '1234567890:AAExampleTelegramBotTokenSecretValue',
        key,
      ),
      telegramBotUsername: 'support_bot',
      telegramSecretTokenCiphertext: encryptTenantSecret('header-secret', key),
      telegramWebhookPathSecretCiphertext: encryptTenantSecret(
        'path-secret',
        key,
      ),
      tenantId: tenant.id,
    })
    .returning()

  if (!config) {
    throw new Error('Failed to seed config.')
  }

  return config
}

describe('createTelegramClient service messages', () => {
  it('sends phone prompt with request_contact keyboard and configured text responses', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () =>
      createJsonResponse({
        ok: true,
        result: {},
      }),
    )
    const client = createTelegramClient({
      botToken: '1234567890:AAExampleTelegramBotTokenSecretValue',
      fetchFn,
      requestTimeoutMs: 15_000,
    })

    await client.sendPhonePrompt(77, 'Send phone')
    await client.sendPhoneLinked(77, 'Linked')
    await client.sendPhoneNotFound(77, 'Not found')

    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      new URL(
        'https://api.telegram.org/bot1234567890:AAExampleTelegramBotTokenSecretValue/sendMessage',
      ),
      expect.objectContaining({
        body: JSON.stringify({
          chat_id: 77,
          reply_markup: {
            keyboard: [[{ request_contact: true, text: 'Отправить телефон' }]],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
          text: 'Send phone',
        }),
        method: 'POST',
      }),
    )
    expect(JSON.parse(String(fetchFn.mock.calls[1]?.[1]?.body))).toMatchObject({
      chat_id: 77,
      text: 'Linked',
    })
    expect(JSON.parse(String(fetchFn.mock.calls[2]?.[1]?.body))).toMatchObject({
      chat_id: 77,
      text: 'Not found',
    })
  })
})

describe('classifyTelegramWebhookOwner', () => {
  it('classifies empty, Chatwoot-native, bridge and unknown webhook owners', () => {
    expect(
      classifyTelegramWebhookOwner({
        publicBaseUrl: 'https://app.lancora.ru',
        webhookInfo: {
          url: '',
        },
      }),
    ).toBe('empty')
    expect(
      classifyTelegramWebhookOwner({
        publicBaseUrl: 'https://app.lancora.ru',
        webhookInfo: {
          url: 'https://app.lancora.ru/webhooks/telegram/token',
        },
      }),
    ).toBe('chatwoot-native')
    expect(
      classifyTelegramWebhookOwner({
        publicBaseUrl: 'https://app.lancora.ru',
        webhookInfo: {
          url: 'https://app.lancora.ru/telegram-bridge/prov/path-secret',
        },
      }),
    ).toBe('telegram-bridge')
    expect(
      classifyTelegramWebhookOwner({
        publicBaseUrl: 'https://app.lancora.ru',
        webhookInfo: {
          url: 'https://other.example.test/telegram-bridge/prov/path-secret',
        },
      }),
    ).toBe('unknown')
  })
})

describe('configureTelegramWebhook', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  it('calls getWebhookInfo before setWebhook, stores safe owner metadata and activates the config after confirmation', async () => {
    const config = await seedBridgeConfig(database)
    const telegramClient = {
      getWebhookInfo: vi
        .fn()
        .mockResolvedValueOnce({
          pendingUpdateCount: 2,
          url: 'https://app.lancora.ru/webhooks/telegram/old-token',
        })
        .mockResolvedValueOnce({
          pendingUpdateCount: 0,
          url: 'https://app.lancora.ru/telegram-bridge/provgroup-support/path-secret',
        }),
      setWebhook: vi.fn().mockResolvedValue(undefined),
    }

    await expect(
      configureTelegramWebhook({
        db: database.db,
        publicBaseUrl: 'https://app.lancora.ru/',
        publicKey: 'provgroup-support',
        telegramClient,
        tenantSecretKey,
      }),
    ).resolves.toMatchObject({
      status: 'active',
      webhookUrlHost: 'app.lancora.ru',
    })

    expect(
      telegramClient.getWebhookInfo.mock.invocationCallOrder[0],
    ).toBeLessThan(telegramClient.setWebhook.mock.invocationCallOrder[0] ?? 0)
    expect(telegramClient.setWebhook).toHaveBeenCalledWith({
      allowed_updates: ['message'],
      drop_pending_updates: false,
      secret_token: 'header-secret',
      url: 'https://app.lancora.ru/telegram-bridge/provgroup-support/path-secret',
    })

    const [row] = await database.db
      .select()
      .from(telegramBridgeConfigs)
      .where(eq(telegramBridgeConfigs.id, config.id))
    expect(row).toMatchObject({
      lastWebhookHost: 'app.lancora.ru',
      lastWebhookOwner: 'chatwoot-native',
      status: 'active',
    })
  })

  it('rejects unknown current webhook owner unless explicit override is passed', async () => {
    await seedBridgeConfig(database)
    const telegramClient = {
      getWebhookInfo: vi.fn().mockResolvedValue({
        url: 'https://unknown.example.test/hook',
      }),
      setWebhook: vi.fn(),
    }

    await expect(
      configureTelegramWebhook({
        db: database.db,
        publicBaseUrl: 'https://app.lancora.ru',
        publicKey: 'provgroup-support',
        telegramClient,
        tenantSecretKey,
      }),
    ).rejects.toThrow(/unknown webhook owner/)
    expect(telegramClient.setWebhook).not.toHaveBeenCalled()

    telegramClient.getWebhookInfo.mockReset()
    telegramClient.getWebhookInfo
      .mockResolvedValueOnce({
        url: 'https://unknown.example.test/hook',
      })
      .mockResolvedValueOnce({
        url: 'https://app.lancora.ru/telegram-bridge/provgroup-support/path-secret',
      })

    await expect(
      configureTelegramWebhook({
        allowUnknownOwner: true,
        db: database.db,
        publicBaseUrl: 'https://app.lancora.ru',
        publicKey: 'provgroup-support',
        telegramClient,
        tenantSecretKey,
      }),
    ).resolves.toMatchObject({
      status: 'active',
    })
  })

  it('never exposes decrypted secrets in returned status', async () => {
    await seedBridgeConfig(database)

    const result = await configureTelegramWebhook({
      db: database.db,
      publicBaseUrl: 'https://app.lancora.ru',
      publicKey: 'provgroup-support',
      telegramClient: {
        getWebhookInfo: vi
          .fn()
          .mockResolvedValueOnce({ url: '' })
          .mockResolvedValueOnce({
            url: 'https://app.lancora.ru/telegram-bridge/provgroup-support/path-secret',
          }),
        setWebhook: vi.fn(),
      },
      tenantSecretKey,
    })

    expect(JSON.stringify(result)).not.toContain('path-secret')
    expect(JSON.stringify(result)).not.toContain('header-secret')
    expect(JSON.stringify(result)).not.toContain(
      '1234567890:AAExampleTelegramBotTokenSecretValue',
    )

    const [row] = await database.db.select().from(telegramBridgeConfigs)
    const key = decodeTenantSecretKey(tenantSecretKey)

    expect(row).toBeDefined()
    if (!row) {
      throw new Error('Expected telegram bridge config row.')
    }

    expect(decryptTenantSecret(row.telegramSecretTokenCiphertext, key)).toBe(
      'header-secret',
    )
  })
})
