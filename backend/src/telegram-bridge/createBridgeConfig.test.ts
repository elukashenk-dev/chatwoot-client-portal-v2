import { randomUUID } from 'node:crypto'

import { count, eq } from 'drizzle-orm'
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
  createTelegramBridgeConfig,
  parseCreateBridgeConfigArgs,
} from './createBridgeConfig.js'

const tenantSecretKey = Buffer.alloc(32, 12).toString('base64')

async function seedTenant(
  database: DatabaseClient,
  {
    slug = 'default',
    status = 'active',
  }: {
    slug?: string
    status?: 'active' | 'archived' | 'provisioning' | 'suspended'
  } = {},
) {
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
      primaryDomain: `${slug}.example.test`,
      publicBaseUrl: `https://${slug}.example.test`,
      slug,
      status,
    })
    .returning()

  if (!tenant) {
    throw new Error('Failed to seed tenant.')
  }

  return tenant
}

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

describe('parseCreateBridgeConfigArgs', () => {
  it('requires tenant, bridge key, display name, inbox id and token file or stdin', () => {
    expect(() => parseCreateBridgeConfigArgs([])).toThrow(/--tenant/)
    expect(() =>
      parseCreateBridgeConfigArgs([
        '--tenant=default',
        '--bridge-key=provgroup-support',
        '--display-name=Support',
        '--chatwoot-telegram-inbox-id=17',
      ]),
    ).toThrow(/telegram bot token/)
  })

  it('parses file/stdin secret sources without accepting raw secret argv values', () => {
    const rawTelegramBotToken =
      '1234567890:AAExampleTelegramBotTokenSecretValue'

    expect(
      parseCreateBridgeConfigArgs([
        '--tenant=default',
        '--bridge-key=provgroup-support',
        '--display-name=Support',
        '--chatwoot-telegram-inbox-id=17',
        '--telegram-bot-token-file=/run/secrets/bot-token',
        '--webhook-path-secret-file=/run/secrets/path',
        '--telegram-secret-token-file=/run/secrets/header',
      ]),
    ).toMatchObject({
      bridgeKey: 'provgroup-support',
      chatwootTelegramInboxId: 17,
      displayName: 'Support',
      telegramBotTokenFile: '/run/secrets/bot-token',
      telegramSecretTokenFile: '/run/secrets/header',
      tenantSlug: 'default',
      webhookPathSecretFile: '/run/secrets/path',
    })

    expect(() =>
      parseCreateBridgeConfigArgs([
        '--tenant=default',
        '--bridge-key=provgroup-support',
        '--display-name=Support',
        '--chatwoot-telegram-inbox-id=17',
        `--telegram-bot-token=${rawTelegramBotToken}`,
      ]),
    ).toThrow(/Unknown argument/)

    try {
      parseCreateBridgeConfigArgs([
        '--tenant=default',
        '--bridge-key=provgroup-support',
        '--display-name=Support',
        '--chatwoot-telegram-inbox-id=17',
        `--telegram-bot-token=${rawTelegramBotToken}`,
      ])
    } catch (error) {
      expect(String(error)).not.toContain(rawTelegramBotToken)
    }

    expect(() =>
      parseCreateBridgeConfigArgs([
        '--tenant=default',
        '--bridge-key=provgroup-support',
        '--display-name=Support',
        '--chatwoot-telegram-inbox-id=17',
        '--telegram-bot-token-file=/run/secrets/bot-token',
        '--telegram-bot-token-stdin',
      ]),
    ).toThrow(/only one telegram bot token source/)
  })
})

describe('createTelegramBridgeConfig', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  it('stores bot token, path secret and header secret encrypted after verifying Chatwoot inbox and Telegram identity', async () => {
    await seedTenant(database)
    const fetchChatwoot = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        bot_name: 'support_bot',
        channel_type: 'Channel::Telegram',
        id: 17,
      }),
    )
    const getTelegramBotIdentity = vi.fn().mockResolvedValue({
      id: '1234567890',
      username: 'support_bot',
    })

    const result = await createTelegramBridgeConfig({
      chatwootTelegramInboxId: 17,
      db: database.db,
      displayName: 'Support Bot',
      fetchChatwoot,
      getTelegramBotIdentity,
      generateSecret: vi
        .fn()
        .mockReturnValueOnce('generated-path-secret')
        .mockReturnValueOnce('generated-header-secret'),
      publicKey: 'provgroup-support',
      telegramBotToken: '1234567890:AAExampleTelegramBotTokenSecretValue',
      tenantSecretKey,
      tenantSlug: 'default',
    })

    expect(result).toMatchObject({
      publicKey: 'provgroup-support',
      status: 'rotating',
      telegramBotId: '1234567890',
      telegramBotUsername: 'support_bot',
    })
    expect(fetchChatwoot).toHaveBeenCalledWith(
      new URL('https://chatwoot.example.test/api/v1/accounts/3/inboxes/17'),
      expect.objectContaining({
        headers: expect.objectContaining({
          api_access_token: 'chatwoot-runtime-token',
        }),
        method: 'GET',
      }),
    )
    expect(getTelegramBotIdentity).toHaveBeenCalledWith(
      '1234567890:AAExampleTelegramBotTokenSecretValue',
    )

    const [row] = await database.db.select().from(telegramBridgeConfigs)
    const key = decodeTenantSecretKey(tenantSecretKey)

    expect(row).toBeDefined()
    if (!row) {
      throw new Error('Expected telegram bridge config row.')
    }

    expect(row).toMatchObject({
      chatwootTelegramInboxId: 17,
      displayName: 'Support Bot',
      publicKey: 'provgroup-support',
      status: 'rotating',
      telegramBotId: '1234567890',
      telegramBotUsername: 'support_bot',
    })
    expect(
      decryptTenantSecret(row.telegramBotTokenCiphertext, key),
    ).toBe('1234567890:AAExampleTelegramBotTokenSecretValue')
    expect(
      decryptTenantSecret(row.telegramWebhookPathSecretCiphertext, key),
    ).toBe('generated-path-secret')
    expect(
      decryptTenantSecret(row.telegramSecretTokenCiphertext, key),
    ).toBe('generated-header-secret')
  })

  it('rejects inactive tenants before storing bridge config', async () => {
    await seedTenant(database, {
      status: 'suspended',
    })

    await expect(
      createTelegramBridgeConfig({
        chatwootTelegramInboxId: 17,
        db: database.db,
        displayName: 'Support Bot',
        fetchChatwoot: vi.fn(),
        getTelegramBotIdentity: vi.fn(),
        publicKey: 'provgroup-support',
        telegramBotToken: '1234567890:AAExampleTelegramBotTokenSecretValue',
        tenantSecretKey,
        tenantSlug: 'default',
      }),
    ).rejects.toThrow(/active tenant/)

    await expect(
      database.db.select({ total: count() }).from(telegramBridgeConfigs),
    ).resolves.toEqual([{ total: 0 }])
  })

  it('rejects missing, non-Telegram or mismatched Chatwoot inboxes before storing', async () => {
    await seedTenant(database)

    for (const response of [
      createJsonResponse({ error: 'not found' }, 404),
      createJsonResponse({
        bot_name: 'support_bot',
        channel_type: 'Channel::Api',
        id: 17,
      }),
      createJsonResponse({
        bot_name: 'other_bot',
        channel_type: 'Channel::Telegram',
        id: 17,
      }),
    ]) {
      await expect(
        createTelegramBridgeConfig({
          chatwootTelegramInboxId: 17,
          db: database.db,
          displayName: 'Support Bot',
          fetchChatwoot: vi.fn<typeof fetch>().mockResolvedValue(response),
          getTelegramBotIdentity: vi.fn().mockResolvedValue({
            id: '1234567890',
            username: 'support_bot',
          }),
          publicKey: randomUUID(),
          telegramBotToken: '1234567890:AAExampleTelegramBotTokenSecretValue',
          tenantSecretKey,
          tenantSlug: 'default',
        }),
      ).rejects.toThrow(/Telegram inbox/)
    }
  })

  it('rejects a Telegram bot id already bound to another non-archived config', async () => {
    const tenant = await seedTenant(database)
    const key = decodeTenantSecretKey(tenantSecretKey)
    await database.db.insert(telegramBridgeConfigs).values({
      chatwootTelegramInboxId: 99,
      displayName: 'Existing',
      id: randomUUID(),
      publicKey: 'existing',
      status: 'active',
      telegramBotId: '1234567890',
      telegramBotTokenCiphertext: encryptTenantSecret('old-token', key),
      telegramBotUsername: 'support_bot',
      telegramSecretTokenCiphertext: encryptTenantSecret('old-header', key),
      telegramWebhookPathSecretCiphertext: encryptTenantSecret('old-path', key),
      tenantId: tenant.id,
    })

    await expect(
      createTelegramBridgeConfig({
        chatwootTelegramInboxId: 17,
        db: database.db,
        displayName: 'Support Bot',
        fetchChatwoot: vi.fn<typeof fetch>().mockResolvedValue(
          createJsonResponse({
            bot_name: 'support_bot',
            channel_type: 'Channel::Telegram',
            id: 17,
          }),
        ),
        getTelegramBotIdentity: vi.fn().mockResolvedValue({
          id: '1234567890',
          username: 'support_bot',
        }),
        publicKey: 'provgroup-support',
        telegramBotToken: '1234567890:AAExampleTelegramBotTokenSecretValue',
        tenantSecretKey,
        tenantSlug: 'default',
      }),
    ).rejects.toThrow(/already used/)

    const rows = await database.db
      .select()
      .from(telegramBridgeConfigs)
      .where(eq(telegramBridgeConfigs.publicKey, 'provgroup-support'))
    expect(rows).toEqual([])
  })
})
