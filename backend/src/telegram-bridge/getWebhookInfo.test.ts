import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { count } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseClient } from '../db/client.js'
import {
  portalTenants,
  telegramBridgeConfigs,
} from '../db/schema.js'
import { createTestDatabase } from '../test/testDatabase.js'
import {
  decodeTenantSecretKey,
  encryptTenantSecret,
} from '../modules/tenants/secrets.js'
import {
  getSafeTelegramWebhookInfo,
  parseGetWebhookInfoArgs,
  runGetWebhookInfoCli,
} from './getWebhookInfo.js'

const tenantSecretKey = Buffer.alloc(32, 14).toString('base64')

async function seedBridgeConfig(database: DatabaseClient) {
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

  await database.db.insert(telegramBridgeConfigs).values({
    chatwootTelegramInboxId: 17,
    displayName: 'Support',
    id: randomUUID(),
    publicKey: 'provgroup-support',
    status: 'active',
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
}

describe('parseGetWebhookInfoArgs', () => {
  it('accepts either a bridge key or a pre-configuration token source', () => {
    expect(parseGetWebhookInfoArgs(['--bridge-key=provgroup-support'])).toEqual({
      bridgeKey: 'provgroup-support',
    })
    expect(
      parseGetWebhookInfoArgs(['--telegram-bot-token-file=/run/secrets/token']),
    ).toEqual({
      telegramBotTokenFile: '/run/secrets/token',
    })
    expect(parseGetWebhookInfoArgs(['--telegram-bot-token-stdin'])).toEqual({
      telegramBotTokenStdin: true,
    })
  })

  it('rejects raw token argv values and conflicting token sources', () => {
    const rawTelegramBotToken =
      '1234567890:AAExampleTelegramBotTokenSecretValue'

    expect(() =>
      parseGetWebhookInfoArgs([
        `--telegram-bot-token=${rawTelegramBotToken}`,
      ]),
    ).toThrow(/Unknown argument/)

    try {
      parseGetWebhookInfoArgs([`--telegram-bot-token=${rawTelegramBotToken}`])
    } catch (error) {
      expect(String(error)).not.toContain(rawTelegramBotToken)
    }

    expect(() =>
      parseGetWebhookInfoArgs([
        '--bridge-key=provgroup-support',
        '--telegram-bot-token-stdin',
      ]),
    ).toThrow(/either --bridge-key or one token source/)
  })
})

describe('getSafeTelegramWebhookInfo', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  it('uses decrypted config token and masks token-bearing webhook status', async () => {
    await seedBridgeConfig(database)
    const telegramClientFactory = vi.fn().mockReturnValue({
      getWebhookInfo: vi.fn().mockResolvedValue({
        last_error_message:
          'Failed https://app.example.test/webhooks/telegram/1234567890:AAExampleTelegramBotTokenSecretValue',
        pending_update_count: 4,
        url: 'https://app.example.test/webhooks/telegram/1234567890:AAExampleTelegramBotTokenSecretValue',
      }),
    })

    const result = await getSafeTelegramWebhookInfo({
      db: database.db,
      publicBaseUrl: 'https://app.example.test',
      publicKey: 'provgroup-support',
      telegramClientFactory,
      tenantSecretKey,
    })

    expect(result).toEqual({
      lastErrorMessage:
        'Failed https://app.example.test/webhooks/telegram/[redacted]',
      owner: 'chatwoot-native',
      pendingUpdateCount: 4,
      url: 'https://app.example.test/webhooks/telegram/[redacted]',
    })
    expect(telegramClientFactory).toHaveBeenCalledWith(
      '1234567890:AAExampleTelegramBotTokenSecretValue',
    )
  })

  it('supports pre-configuration webhook info from file or stdin without creating config rows', async () => {
    const directory = join(tmpdir(), `telegram-webhook-info-${Date.now()}`)
    await mkdir(directory, {
      recursive: true,
    })
    const tokenPath = join(directory, 'token.txt')
    await writeFile(
      tokenPath,
      '1234567890:AAExampleTelegramBotTokenSecretValue',
    )
    const telegramClientFactory = vi.fn().mockReturnValue({
      getWebhookInfo: vi.fn().mockResolvedValue({
        pending_update_count: 0,
        url: 'https://app.example.test/telegram-bridge/prov/path',
      }),
    })

    await expect(
      getSafeTelegramWebhookInfo({
        publicBaseUrl: 'https://app.example.test',
        telegramBotTokenFile: tokenPath,
        telegramClientFactory,
      }),
    ).resolves.toMatchObject({
      owner: 'telegram-bridge',
      url: 'https://app.example.test/telegram-bridge/[redacted]',
    })

    await expect(
      getSafeTelegramWebhookInfo({
        publicBaseUrl: 'https://app.example.test',
        readStdin: async () =>
          '1234567890:AAExampleTelegramBotTokenSecretValue',
        telegramBotTokenStdin: true,
        telegramClientFactory,
      }),
    ).resolves.toMatchObject({
      owner: 'telegram-bridge',
    })

    await expect(
      database.db.select({ total: count() }).from(telegramBridgeConfigs),
    ).resolves.toEqual([{ total: 0 }])
  })
})

describe('runGetWebhookInfoCli', () => {
  it('does not require database env for pre-configuration token-file checks', async () => {
    const directory = join(tmpdir(), `telegram-webhook-cli-${Date.now()}`)
    await mkdir(directory, {
      recursive: true,
    })
    const tokenPath = join(directory, 'token.txt')
    await writeFile(
      tokenPath,
      '1234567890:AAExampleTelegramBotTokenSecretValue',
    )
    const createDatabaseClient = vi.fn()
    const getSafeWebhookInfo = vi.fn().mockResolvedValue({
      owner: 'empty',
      pendingUpdateCount: 0,
      url: '',
    })
    const writeOutput = vi.fn()

    await expect(
      runGetWebhookInfoCli([`--telegram-bot-token-file=${tokenPath}`], {
        createDatabaseClient,
        getSafeTelegramWebhookInfo: getSafeWebhookInfo,
        rawEnv: {
          TELEGRAM_BRIDGE_PUBLIC_BASE_URL: 'https://app.example.test',
        },
        writeOutput,
      }),
    ).resolves.toEqual({
      owner: 'empty',
      pendingUpdateCount: 0,
      url: '',
    })

    expect(createDatabaseClient).not.toHaveBeenCalled()
    expect(getSafeWebhookInfo).toHaveBeenCalledWith({
      publicBaseUrl: 'https://app.example.test',
      requestTimeoutMs: 10_000,
      telegramBotTokenFile: tokenPath,
    })
    expect(writeOutput).toHaveBeenCalledWith(
      JSON.stringify(
        {
          owner: 'empty',
          pendingUpdateCount: 0,
          url: '',
        },
        null,
        2,
      ),
    )
  })
})
