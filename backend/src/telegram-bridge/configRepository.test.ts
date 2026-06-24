import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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
import { createTelegramBridgeConfigRepository } from './configRepository.js'

const tenantSecretKey = Buffer.alloc(32, 11).toString('base64')

async function seedTenant(
  database: DatabaseClient,
  {
    chatwootAccountId,
    slug,
    status = 'active',
  }: {
    chatwootAccountId: number
    slug: string
    status?: 'active' | 'archived' | 'provisioning' | 'suspended'
  },
) {
  const key = decodeTenantSecretKey(tenantSecretKey)
  const [tenant] = await database.db
    .insert(portalTenants)
    .values({
      chatwootAccountId,
      chatwootApiAccessTokenCiphertext: encryptTenantSecret(
        `${slug}-chatwoot-runtime-token`,
        key,
      ),
      chatwootBaseUrl: `https://${slug}.chatwoot.example.test/`,
      chatwootPortalInboxId: 5,
      chatwootWebhookSecretCiphertext: encryptTenantSecret(
        `${slug}-webhook-secret`,
        key,
      ),
      displayName: slug,
      primaryDomain: `${slug}.example.test`,
      publicBaseUrl: `https://${slug}.example.test`,
      slug,
      status,
    })
    .returning({ id: portalTenants.id })

  if (!tenant) {
    throw new Error('Failed to seed tenant.')
  }

  return tenant.id
}

async function seedBridgeConfig(
  database: DatabaseClient,
  {
    chatwootTelegramInboxId = 17,
    publicKey,
    status = 'active',
    telegramBotId,
    tenantId,
  }: {
    chatwootTelegramInboxId?: number
    publicKey: string
    status?: 'active' | 'archived' | 'disabled' | 'rotating'
    telegramBotId: string
    tenantId: number
  },
) {
  const key = decodeTenantSecretKey(tenantSecretKey)
  const [config] = await database.db
    .insert(telegramBridgeConfigs)
    .values({
      chatwootTelegramInboxId,
      displayName: `${publicKey} bridge`,
      id: randomUUID(),
      publicKey,
      status,
      telegramBotId,
      telegramBotTokenCiphertext: encryptTenantSecret(
        `${publicKey}-bot-token`,
        key,
      ),
      telegramBotUsername: `${publicKey}_bot`,
      telegramSecretTokenCiphertext: encryptTenantSecret(
        `${publicKey}-header-secret`,
        key,
      ),
      telegramWebhookPathSecretCiphertext: encryptTenantSecret(
        `${publicKey}-path-secret`,
        key,
      ),
      tenantId,
    })
    .returning()

  if (!config) {
    throw new Error('Failed to seed Telegram bridge config.')
  }

  return config
}

describe('createTelegramBridgeConfigRepository', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  it('resolves an active bridge config by public key and path secret', async () => {
    const tenantId = await seedTenant(database, {
      chatwootAccountId: 101,
      slug: 'tenant-a',
    })
    const config = await seedBridgeConfig(database, {
      publicKey: 'tenant-a-support',
      telegramBotId: '111',
      tenantId,
    })

    const repository = createTelegramBridgeConfigRepository(database.db, {
      tenantSecretKey,
    })

    await expect(
      repository.findActiveBridgeConfigByPublicKey({
        publicKey: 'tenant-a-support',
        webhookPathSecret: 'tenant-a-support-path-secret',
      }),
    ).resolves.toMatchObject({
      config: {
        chatwoot: {
          accountId: 101,
          apiAccessToken: 'tenant-a-chatwoot-runtime-token',
          baseUrl: 'https://tenant-a.chatwoot.example.test',
        },
        chatwootTelegramInboxId: 17,
        id: config.id,
        publicKey: 'tenant-a-support',
        telegram: {
          botToken: 'tenant-a-support-bot-token',
          secretToken: 'tenant-a-support-header-secret',
          webhookPathSecret: 'tenant-a-support-path-secret',
        },
        telegramBotId: '111',
        telegramBotUsername: 'tenant-a-support_bot',
        tenantId,
      },
      outcome: 'found',
    })
  })

  it('rejects wrong path secrets without returning decrypted runtime config', async () => {
    const tenantId = await seedTenant(database, {
      chatwootAccountId: 101,
      slug: 'tenant-a',
    })
    await seedBridgeConfig(database, {
      publicKey: 'tenant-a-support',
      telegramBotId: '111',
      tenantId,
    })

    const repository = createTelegramBridgeConfigRepository(database.db, {
      tenantSecretKey,
    })

    await expect(
      repository.findActiveBridgeConfigByPublicKey({
        publicKey: 'tenant-a-support',
        webhookPathSecret: 'wrong-secret',
      }),
    ).resolves.toEqual({
      outcome: 'wrong_path_secret',
    })
  })

  it('rejects disabled bridge configs and inactive tenants', async () => {
    const activeTenantId = await seedTenant(database, {
      chatwootAccountId: 101,
      slug: 'tenant-a',
    })
    const suspendedTenantId = await seedTenant(database, {
      chatwootAccountId: 102,
      slug: 'tenant-b',
      status: 'suspended',
    })
    await seedBridgeConfig(database, {
      publicKey: 'disabled-support',
      status: 'disabled',
      telegramBotId: '111',
      tenantId: activeTenantId,
    })
    await seedBridgeConfig(database, {
      publicKey: 'suspended-support',
      telegramBotId: '222',
      tenantId: suspendedTenantId,
    })

    const repository = createTelegramBridgeConfigRepository(database.db, {
      tenantSecretKey,
    })

    await expect(
      repository.findActiveBridgeConfigByPublicKey({
        publicKey: 'disabled-support',
        webhookPathSecret: 'disabled-support-path-secret',
      }),
    ).resolves.toEqual({ outcome: 'inactive_config' })
    await expect(
      repository.findActiveBridgeConfigByPublicKey({
        publicKey: 'suspended-support',
        webhookPathSecret: 'suspended-support-path-secret',
      }),
    ).resolves.toEqual({ outcome: 'inactive_tenant' })
  })

  it('keeps tenant Chatwoot runtime isolated per bridge config', async () => {
    const tenantAId = await seedTenant(database, {
      chatwootAccountId: 101,
      slug: 'tenant-a',
    })
    const tenantBId = await seedTenant(database, {
      chatwootAccountId: 202,
      slug: 'tenant-b',
    })
    await seedBridgeConfig(database, {
      publicKey: 'tenant-a-support',
      telegramBotId: '111',
      tenantId: tenantAId,
    })
    await seedBridgeConfig(database, {
      publicKey: 'tenant-b-support',
      telegramBotId: '222',
      tenantId: tenantBId,
    })

    const repository = createTelegramBridgeConfigRepository(database.db, {
      tenantSecretKey,
    })

    const result = await repository.findActiveBridgeConfigByPublicKey({
      publicKey: 'tenant-a-support',
      webhookPathSecret: 'tenant-a-support-path-secret',
    })

    expect(result).toMatchObject({
      config: {
        chatwoot: {
          accountId: 101,
          apiAccessToken: 'tenant-a-chatwoot-runtime-token',
          baseUrl: 'https://tenant-a.chatwoot.example.test',
        },
        tenantId: tenantAId,
      },
      outcome: 'found',
    })
    expect(JSON.stringify(result)).not.toContain(
      'tenant-b-chatwoot-runtime-token',
    )
  })

  it('prevents non-archived bridge configs from reusing the same Telegram bot id', async () => {
    const tenantAId = await seedTenant(database, {
      chatwootAccountId: 101,
      slug: 'tenant-a',
    })
    const tenantBId = await seedTenant(database, {
      chatwootAccountId: 202,
      slug: 'tenant-b',
    })
    await seedBridgeConfig(database, {
      publicKey: 'tenant-a-support',
      telegramBotId: '111',
      tenantId: tenantAId,
    })

    await expect(
      seedBridgeConfig(database, {
        publicKey: 'tenant-b-support',
        telegramBotId: '111',
        tenantId: tenantBId,
      }),
    ).rejects.toThrow()

    await expect(
      seedBridgeConfig(database, {
        publicKey: 'tenant-b-archived',
        status: 'archived',
        telegramBotId: '111',
        tenantId: tenantBId,
      }),
    ).resolves.toMatchObject({
      status: 'archived',
      telegramBotId: '111',
    })
  })

  it('stores only safe webhook owner metadata and rejects full webhook URLs', async () => {
    const tenantId = await seedTenant(database, {
      chatwootAccountId: 101,
      slug: 'tenant-a',
    })
    const config = await seedBridgeConfig(database, {
      publicKey: 'tenant-a-support',
      telegramBotId: '111',
      tenantId,
    })
    const repository = createTelegramBridgeConfigRepository(database.db, {
      tenantSecretKey,
    })
    const checkedAt = new Date('2026-06-24T12:00:00.000Z')

    await expect(
      repository.updateWebhookOwnerMetadata({
        checkedAt,
        configId: config.id,
        host: 'https://app.lancora.ru/telegram-bridge/key/secret',
        owner: 'telegram-bridge',
      }),
    ).rejects.toThrow('Webhook host must not include protocol, path or secret.')

    await repository.updateWebhookOwnerMetadata({
      checkedAt,
      configId: config.id,
      host: 'app.lancora.ru',
      owner: 'telegram-bridge',
    })

    const [storedConfig] = await database.db
      .select({
        lastWebhookCheckedAt: telegramBridgeConfigs.lastWebhookCheckedAt,
        lastWebhookHost: telegramBridgeConfigs.lastWebhookHost,
        lastWebhookOwner: telegramBridgeConfigs.lastWebhookOwner,
      })
      .from(telegramBridgeConfigs)
      .where(eq(telegramBridgeConfigs.id, config.id))

    expect(storedConfig).toEqual({
      lastWebhookCheckedAt: checkedAt,
      lastWebhookHost: 'app.lancora.ru',
      lastWebhookOwner: 'telegram-bridge',
    })
    expect(JSON.stringify(storedConfig)).not.toContain('secret')
  })
})
