import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../db/client.js'
import {
  portalTenants,
  telegramBridgeConfigs,
  telegramBridgeDeliveries,
} from '../db/schema.js'
import { createTestDatabase } from '../test/testDatabase.js'
import {
  decodeTenantSecretKey,
  encryptTenantSecret,
} from '../modules/tenants/secrets.js'
import { createTelegramBridgeUpdateDedupeRepository } from './updateDedupeRepository.js'

const tenantSecretKey = Buffer.alloc(32, 12).toString('base64')

async function seedBridgeConfig(database: DatabaseClient) {
  const key = decodeTenantSecretKey(tenantSecretKey)
  const [tenant] = await database.db
    .insert(portalTenants)
    .values({
      chatwootAccountId: 1,
      chatwootApiAccessTokenCiphertext: encryptTenantSecret(
        'runtime-token',
        key,
      ),
      chatwootBaseUrl: 'https://chatwoot.example.test',
      chatwootPortalInboxId: 5,
      chatwootWebhookSecretCiphertext: encryptTenantSecret(
        'webhook-secret',
        key,
      ),
      displayName: 'Tenant',
      primaryDomain: 'tenant.example.test',
      publicBaseUrl: 'https://tenant.example.test',
      slug: 'tenant',
    })
    .returning({ id: portalTenants.id })

  if (!tenant) {
    throw new Error('Failed to seed tenant.')
  }

  const [config] = await database.db
    .insert(telegramBridgeConfigs)
    .values({
      chatwootTelegramInboxId: 17,
      displayName: 'Bridge',
      id: randomUUID(),
      publicKey: 'tenant-support',
      status: 'active',
      telegramBotId: '111',
      telegramBotTokenCiphertext: encryptTenantSecret('bot-token', key),
      telegramBotUsername: 'tenant_support_bot',
      telegramSecretTokenCiphertext: encryptTenantSecret(
        'header-secret',
        key,
      ),
      telegramWebhookPathSecretCiphertext: encryptTenantSecret(
        'path-secret',
        key,
      ),
      tenantId: tenant.id,
    })
    .returning({ id: telegramBridgeConfigs.id })

  if (!config) {
    throw new Error('Failed to seed bridge config.')
  }

  return config.id
}

describe('createTelegramBridgeUpdateDedupeRepository', () => {
  let database: DatabaseClient
  let bridgeConfigId: string

  beforeEach(async () => {
    database = await createTestDatabase()
    bridgeConfigId = await seedBridgeConfig(database)
  })

  afterEach(async () => {
    await database.close()
  })

  it('starts processing a new update and skips a duplicate processed update', async () => {
    const repository = createTelegramBridgeUpdateDedupeRepository(database.db)
    const now = new Date('2026-06-24T12:00:00.000Z')

    await expect(
      repository.startUpdateProcessing({
        bridgeConfigId,
        now,
        staleProcessingBefore: new Date('2026-06-24T11:50:00.000Z'),
        telegramChatId: '100',
        telegramFromId: '200',
        updateId: 1001,
      }),
    ).resolves.toMatchObject({
      delivery: {
        attemptCount: 1,
        status: 'processing',
        telegramChatId: '100',
        telegramFromId: '200',
        updateId: 1001,
      },
      outcome: 'acquired',
    })

    await repository.markUpdateProcessed({
      bridgeConfigId,
      now: new Date('2026-06-24T12:00:01.000Z'),
      updateId: 1001,
    })

    await expect(
      repository.startUpdateProcessing({
        bridgeConfigId,
        now: new Date('2026-06-24T12:00:02.000Z'),
        staleProcessingBefore: new Date('2026-06-24T11:50:00.000Z'),
        telegramChatId: '100',
        telegramFromId: '200',
        updateId: 1001,
      }),
    ).resolves.toMatchObject({
      delivery: {
        status: 'processed',
        updateId: 1001,
      },
      outcome: 'processed',
    })
  })

  it('returns retryable in-progress for duplicate recent processing and does not mark it processed', async () => {
    const repository = createTelegramBridgeUpdateDedupeRepository(database.db)
    const now = new Date('2026-06-24T12:00:00.000Z')

    await repository.startUpdateProcessing({
      bridgeConfigId,
      now,
      staleProcessingBefore: new Date('2026-06-24T11:50:00.000Z'),
      telegramChatId: '100',
      telegramFromId: '200',
      updateId: 1002,
    })

    await expect(
      repository.startUpdateProcessing({
        bridgeConfigId,
        now: new Date('2026-06-24T12:00:03.000Z'),
        staleProcessingBefore: new Date('2026-06-24T11:59:00.000Z'),
        telegramChatId: '100',
        telegramFromId: '200',
        updateId: 1002,
      }),
    ).resolves.toMatchObject({
      delivery: {
        attemptCount: 1,
        status: 'processing',
      },
      outcome: 'in_progress',
    })
  })

  it('reclaims stale processing rows and retries failed rows', async () => {
    const repository = createTelegramBridgeUpdateDedupeRepository(database.db)
    const firstAttemptAt = new Date('2026-06-24T12:00:00.000Z')

    await repository.startUpdateProcessing({
      bridgeConfigId,
      now: firstAttemptAt,
      staleProcessingBefore: new Date('2026-06-24T11:50:00.000Z'),
      telegramChatId: '100',
      telegramFromId: '200',
      updateId: 1003,
    })

    await expect(
      repository.startUpdateProcessing({
        bridgeConfigId,
        now: new Date('2026-06-24T12:15:00.000Z'),
        staleProcessingBefore: new Date('2026-06-24T12:10:00.000Z'),
        telegramChatId: '100',
        telegramFromId: '200',
        updateId: 1003,
      }),
    ).resolves.toMatchObject({
      delivery: {
        attemptCount: 2,
        status: 'processing',
      },
      outcome: 'acquired',
    })

    await repository.markUpdateFailed({
      bridgeConfigId,
      error: new Error('Chatwoot timeout'),
      now: new Date('2026-06-24T12:15:01.000Z'),
      updateId: 1003,
    })

    await expect(
      repository.startUpdateProcessing({
        bridgeConfigId,
        now: new Date('2026-06-24T12:15:05.000Z'),
        staleProcessingBefore: new Date('2026-06-24T12:10:00.000Z'),
        telegramChatId: '100',
        telegramFromId: '200',
        updateId: 1003,
      }),
    ).resolves.toMatchObject({
      delivery: {
        attemptCount: 3,
        errorMessage: null,
        status: 'processing',
      },
      outcome: 'acquired',
    })
  })

  it('keeps a failed original processing update retryable for later Telegram delivery', async () => {
    const repository = createTelegramBridgeUpdateDedupeRepository(database.db)
    const now = new Date('2026-06-24T12:00:00.000Z')

    await repository.startUpdateProcessing({
      bridgeConfigId,
      now,
      staleProcessingBefore: new Date('2026-06-24T11:50:00.000Z'),
      telegramChatId: '100',
      telegramFromId: '200',
      updateId: 1004,
    })
    await expect(
      repository.startUpdateProcessing({
        bridgeConfigId,
        now: new Date('2026-06-24T12:00:01.000Z'),
        staleProcessingBefore: new Date('2026-06-24T11:59:00.000Z'),
        telegramChatId: '100',
        telegramFromId: '200',
        updateId: 1004,
      }),
    ).resolves.toMatchObject({
      outcome: 'in_progress',
    })

    await repository.markUpdateFailed({
      bridgeConfigId,
      error: new Error('Chatwoot accepted no response'),
      now: new Date('2026-06-24T12:00:02.000Z'),
      updateId: 1004,
    })

    await expect(
      repository.startUpdateProcessing({
        bridgeConfigId,
        now: new Date('2026-06-24T12:00:03.000Z'),
        staleProcessingBefore: new Date('2026-06-24T11:59:00.000Z'),
        telegramChatId: '100',
        telegramFromId: '200',
        updateId: 1004,
      }),
    ).resolves.toMatchObject({
      delivery: {
        attemptCount: 2,
        status: 'processing',
      },
      outcome: 'acquired',
    })
  })

  it('does not let an older stale attempt overwrite a newer processed retry', async () => {
    const repository = createTelegramBridgeUpdateDedupeRepository(database.db)
    const firstAttemptAt = new Date('2026-06-24T12:00:00.000Z')

    const firstAttempt = await repository.startUpdateProcessing({
      bridgeConfigId,
      now: firstAttemptAt,
      staleProcessingBefore: new Date('2026-06-24T11:50:00.000Z'),
      telegramChatId: '100',
      telegramFromId: '200',
      updateId: 1006,
    })
    const retryAttempt = await repository.startUpdateProcessing({
      bridgeConfigId,
      now: new Date('2026-06-24T12:15:00.000Z'),
      staleProcessingBefore: new Date('2026-06-24T12:10:00.000Z'),
      telegramChatId: '100',
      telegramFromId: '200',
      updateId: 1006,
    })

    if (
      firstAttempt.outcome !== 'acquired' ||
      retryAttempt.outcome !== 'acquired'
    ) {
      throw new Error('Expected both attempts to be acquired.')
    }

    await repository.markUpdateProcessed({
      attemptCount: retryAttempt.delivery.attemptCount,
      bridgeConfigId,
      now: new Date('2026-06-24T12:15:01.000Z'),
      updateId: 1006,
    })

    await expect(
      repository.markUpdateFailed({
        attemptCount: firstAttempt.delivery.attemptCount,
        bridgeConfigId,
        error: new Error('Late failure from older worker'),
        now: new Date('2026-06-24T12:15:02.000Z'),
        updateId: 1006,
      }),
    ).resolves.toBeNull()

    const [delivery] = await database.db
      .select({
        attemptCount: telegramBridgeDeliveries.attemptCount,
        errorMessage: telegramBridgeDeliveries.errorMessage,
        status: telegramBridgeDeliveries.status,
      })
      .from(telegramBridgeDeliveries)
      .where(eq(telegramBridgeDeliveries.updateId, 1006))

    expect(delivery).toEqual({
      attemptCount: 2,
      errorMessage: null,
      status: 'processed',
    })
  })

  it('stores sanitized bounded error text without tokens, secrets or full phones', async () => {
    const repository = createTelegramBridgeUpdateDedupeRepository(database.db)
    const now = new Date('2026-06-24T12:00:00.000Z')
    const botToken = '1234567890:AAExampleTelegramBotTokenSecretValue'
    const pathSecret = 'bridge-path-secret-value'
    const headerSecret = 'telegram-header-secret-value'

    await repository.startUpdateProcessing({
      bridgeConfigId,
      now,
      staleProcessingBefore: new Date('2026-06-24T11:50:00.000Z'),
      telegramChatId: '100',
      telegramFromId: '200',
      updateId: 1005,
    })
    await repository.markUpdateFailed({
      bridgeConfigId,
      error: new Error(
        `POST https://api.telegram.org/bot${botToken}/sendMessage failed for /telegram-bridge/key/${pathSecret} with header ${headerSecret} and phone +79161234567 ${'x'.repeat(1200)}`,
      ),
      now: new Date('2026-06-24T12:00:01.000Z'),
      sensitiveValues: [botToken, pathSecret, headerSecret],
      updateId: 1005,
    })

    const [delivery] = await database.db
      .select({
        errorMessage: telegramBridgeDeliveries.errorMessage,
        status: telegramBridgeDeliveries.status,
      })
      .from(telegramBridgeDeliveries)
      .where(eq(telegramBridgeDeliveries.updateId, 1005))

    expect(delivery?.status).toBe('failed')
    expect(delivery?.errorMessage).toBeDefined()
    expect(delivery?.errorMessage?.length).toBeLessThanOrEqual(1000)
    expect(delivery?.errorMessage).not.toContain(botToken)
    expect(delivery?.errorMessage).not.toContain(pathSecret)
    expect(delivery?.errorMessage).not.toContain(headerSecret)
    expect(delivery?.errorMessage).not.toContain('+79161234567')
  })
})
