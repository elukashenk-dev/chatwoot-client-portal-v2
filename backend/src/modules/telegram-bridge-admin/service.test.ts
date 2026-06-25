import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import {
  portalTenants,
  telegramBridgeConfigs,
} from '../../db/schema.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import {
  decodeTenantSecretKey,
  decryptTenantSecret,
  encryptTenantSecret,
} from '../tenants/secrets.js'
import type { TenantRequestContext } from '../tenants/service.js'
import {
  createTenantTelegramBridgeSetupService,
} from './service.js'

const tenantSecretKey = Buffer.alloc(32, 15).toString('base64')
const now = new Date('2026-06-25T10:00:00.000Z')
const admin = {
  chatwootAgentId: 42,
  email: 'admin@example.test',
  role: 'administrator',
} as const

function createTenantContext(
  overrides: Partial<TenantRequestContext> = {},
): TenantRequestContext {
  return {
    chatwoot: {
      accountId: 3,
      apiAccessToken: 'chatwoot-runtime-token',
      baseUrl: 'https://chatwoot.example.test',
      portalInboxId: 1,
      portalInboxIdentifier: 'portal-inbox',
      webhookSecret: 'webhook-secret',
    },
    displayName: 'Default',
    id: 1,
    isDefault: true,
    primaryDomain: 'default.example.test',
    publicBaseUrl: 'https://default.example.test',
    slug: 'default',
    status: 'active',
    ...overrides,
  }
}

async function seedTenant(database: DatabaseClient) {
  const key = decodeTenantSecretKey(tenantSecretKey)

  await database.db.insert(portalTenants).values({
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
    id: 1,
    primaryDomain: 'default.example.test',
    publicBaseUrl: 'https://default.example.test',
    slug: 'default',
    status: 'active',
  })
}

async function seedBridgeConfig(
  database: DatabaseClient,
  {
    botId = 'old-bot-id',
    inboxId = 17,
    tenantId = 1,
  }: {
    botId?: string
    inboxId?: number
    tenantId?: number
  } = {},
) {
  const key = decodeTenantSecretKey(tenantSecretKey)
  const [config] = await database.db
    .insert(telegramBridgeConfigs)
    .values({
      chatwootTelegramInboxId: inboxId,
      displayName: 'Old Support',
      id: randomUUID(),
      publicKey: `old-support-${tenantId}-${inboxId}`,
      status: 'active',
      telegramBotId: botId,
      telegramBotTokenCiphertext: encryptTenantSecret('old-token', key),
      telegramBotUsername: 'old_bot',
      telegramSecretTokenCiphertext: encryptTenantSecret('old-header', key),
      telegramWebhookPathSecretCiphertext: encryptTenantSecret('old-path', key),
      tenantId,
    })
    .returning()

  if (!config) {
    throw new Error('Failed to seed bridge config.')
  }

  return config
}

function createServiceDependencies(database: DatabaseClient) {
  const telegramClient = {
    getWebhookInfo: vi
      .fn()
      .mockResolvedValueOnce({
        url: 'https://app.lancora.ru/webhooks/telegram/old-token',
      })
      .mockResolvedValueOnce({
        url: 'https://default.example.test/telegram-bridge/provgroup-support/path-secret',
      }),
    setWebhook: vi.fn().mockResolvedValue(undefined),
  }

  return {
    audit: vi.fn().mockResolvedValue(undefined),
    generateBridgeKey: vi.fn(() => 'provgroup-support'),
    generateSecret: vi
      .fn()
      .mockReturnValueOnce('path-secret')
      .mockReturnValueOnce('header-secret'),
    getTelegramBotIdentity: vi.fn().mockResolvedValue({
      id: '1234567890',
      username: 'support_bot',
    }),
    readChatwootTelegramInbox: vi.fn().mockResolvedValue({
      botName: 'support_bot',
      id: 17,
    }),
    service: createTenantTelegramBridgeSetupService({
      audit: vi.fn().mockResolvedValue(undefined),
      db: database.db,
      generateBridgeKey: () => 'provgroup-support',
      generateSecret: vi
        .fn()
        .mockReturnValueOnce('path-secret')
        .mockReturnValueOnce('header-secret'),
      getTelegramBotIdentity: vi.fn().mockResolvedValue({
        id: '1234567890',
        username: 'support_bot',
      }),
      now: () => now,
      readChatwootTelegramInbox: vi.fn().mockResolvedValue({
        botName: 'support_bot',
        id: 17,
      }),
      telegramClientFactory: vi.fn(() => telegramClient),
      tenant: createTenantContext(),
      tenantSecretKey,
      verifyBridgeHealth: vi.fn().mockResolvedValue(undefined),
    }),
    telegramClient,
  }
}

describe('createTenantTelegramBridgeSetupService', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
    await seedTenant(database)
  })

  afterEach(async () => {
    await database.close()
  })

  it('rejects when the Chatwoot account id from the submitted URL does not match the tenant', async () => {
    const { service } = createServiceDependencies(database)

    await expect(
      service.setupTelegramBridge({
        admin,
        input: {
          chatwootAccountIdFromUrl: 99,
          chatwootTelegramInboxId: 17,
          telegramBotToken:
            '1234567890:AAExampleTelegramBotTokenSecretValue',
        },
        requestIp: '127.0.0.1',
        userAgent: 'vitest',
      }),
    ).rejects.toThrow(/Chatwoot account/)
  })

  it('creates an encrypted bridge config, configures webhook and returns safe status', async () => {
    const audit = vi.fn().mockResolvedValue(undefined)
    const readChatwootTelegramInbox = vi.fn().mockResolvedValue({
      botName: 'support_bot',
      id: 17,
    })
    const getTelegramBotIdentity = vi.fn().mockResolvedValue({
      id: '1234567890',
      username: 'support_bot',
    })
    const verifyBridgeHealth = vi.fn().mockResolvedValue(undefined)
    const telegramClient = {
      getWebhookInfo: vi
        .fn()
        .mockResolvedValueOnce({
          url: 'https://app.lancora.ru/webhooks/telegram/old-token',
        })
        .mockResolvedValueOnce({
          url: 'https://default.example.test/telegram-bridge/provgroup-support/path-secret',
        }),
      setWebhook: vi.fn().mockResolvedValue(undefined),
    }
    const telegramClientFactory = vi.fn(() => telegramClient)
    const service = createTenantTelegramBridgeSetupService({
      audit,
      db: database.db,
      generateBridgeKey: () => 'provgroup-support',
      generateSecret: vi
        .fn()
        .mockReturnValueOnce('path-secret')
        .mockReturnValueOnce('header-secret'),
      getTelegramBotIdentity,
      now: () => now,
      readChatwootTelegramInbox,
      telegramClientFactory,
      tenant: createTenantContext(),
      tenantSecretKey,
      verifyBridgeHealth,
    })

    const result = await service.setupTelegramBridge({
      admin,
      input: {
        chatwootAccountIdFromUrl: 3,
        chatwootTelegramInboxId: 17,
        telegramBotToken: '1234567890:AAExampleTelegramBotTokenSecretValue',
      },
      requestIp: '127.0.0.1',
      userAgent: 'vitest',
    })

    expect(readChatwootTelegramInbox).toHaveBeenCalledWith({
      inboxId: 17,
      tenant: createTenantContext(),
    })
    expect(getTelegramBotIdentity).toHaveBeenCalledWith(
      '1234567890:AAExampleTelegramBotTokenSecretValue',
    )
    expect(
      verifyBridgeHealth.mock.invocationCallOrder[0],
    ).toBeLessThan(telegramClient.setWebhook.mock.invocationCallOrder[0] ?? 0)
    expect(
      telegramClient.getWebhookInfo.mock.invocationCallOrder[0],
    ).toBeLessThan(telegramClient.setWebhook.mock.invocationCallOrder[0] ?? 0)
    expect(telegramClient.setWebhook).toHaveBeenCalledWith({
      allowed_updates: ['message'],
      drop_pending_updates: false,
      secret_token: 'header-secret',
      url: 'https://default.example.test/telegram-bridge/provgroup-support/path-secret',
    })
    expect(telegramClientFactory).toHaveBeenCalledWith(
      '1234567890:AAExampleTelegramBotTokenSecretValue',
    )
    expect(result).toMatchObject({
      chatwootTelegramInboxId: 17,
      displayName: 'Telegram support_bot',
      publicKey: 'provgroup-support',
      status: 'active',
      telegramBotId: '1234567890',
      telegramBotUsername: 'support_bot',
      webhookConfigured: true,
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
      throw new Error('Expected bridge config row.')
    }

    expect(decryptTenantSecret(row.telegramBotTokenCiphertext, key)).toBe(
      '1234567890:AAExampleTelegramBotTokenSecretValue',
    )
    expect(decryptTenantSecret(row.telegramWebhookPathSecretCiphertext, key)).toBe(
      'path-secret',
    )
    expect(decryptTenantSecret(row.telegramSecretTokenCiphertext, key)).toBe(
      'header-secret',
    )
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'telegram_bridge_setup_started',
        actor: admin,
        outcome: 'started',
      }),
    )
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'telegram_bridge_setup_succeeded',
        actor: admin,
        metadata: expect.any(Object),
        outcome: 'succeeded',
      }),
    )
    expect(JSON.stringify(audit.mock.calls)).not.toContain(
      '1234567890:AAExampleTelegramBotTokenSecretValue',
    )
  })

  it('rejects duplicate bot ids owned by another non-archived bridge config', async () => {
    await seedBridgeConfig(database, {
      botId: '1234567890',
      inboxId: 55,
    })
    const { service } = createServiceDependencies(database)

    await expect(
      service.setupTelegramBridge({
        admin,
        input: {
          chatwootAccountIdFromUrl: 3,
          chatwootTelegramInboxId: 17,
          telegramBotToken:
            '1234567890:AAExampleTelegramBotTokenSecretValue',
        },
        requestIp: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({
      code: 'TELEGRAM_BRIDGE_SETUP_CONFLICT',
      statusCode: 409,
    })
  })

  it('rejects unknown webhook owner before setWebhook', async () => {
    const telegramClient = {
      getWebhookInfo: vi.fn().mockResolvedValue({
        url: 'https://unknown.example.test/custom/path',
      }),
      setWebhook: vi.fn(),
    }
    const service = createTenantTelegramBridgeSetupService({
      audit: vi.fn().mockResolvedValue(undefined),
      db: database.db,
      generateBridgeKey: () => 'provgroup-support',
      generateSecret: vi
        .fn()
        .mockReturnValueOnce('path-secret')
        .mockReturnValueOnce('header-secret'),
      getTelegramBotIdentity: vi.fn().mockResolvedValue({
        id: '1234567890',
        username: 'support_bot',
      }),
      now: () => now,
      readChatwootTelegramInbox: vi.fn().mockResolvedValue({
        botName: 'support_bot',
        id: 17,
      }),
      telegramClientFactory: vi.fn(() => telegramClient),
      tenant: createTenantContext(),
      tenantSecretKey,
      verifyBridgeHealth: vi.fn().mockResolvedValue(undefined),
    })

    await expect(
      service.setupTelegramBridge({
        admin,
        input: {
          chatwootAccountIdFromUrl: 3,
          chatwootTelegramInboxId: 17,
          telegramBotToken:
            '1234567890:AAExampleTelegramBotTokenSecretValue',
        },
        requestIp: null,
        userAgent: null,
      }),
    ).rejects.toThrow(/unknown webhook owner/)
    expect(telegramClient.setWebhook).not.toHaveBeenCalled()
  })

  it('reuses existing active route secrets when updating the same inbox bridge', async () => {
    await seedBridgeConfig(database)

    const telegramClient = {
      getWebhookInfo: vi
        .fn()
        .mockResolvedValueOnce({
          url: 'https://default.example.test/telegram-bridge/old-support-1-17/old-path',
        })
        .mockResolvedValueOnce({
          url: 'https://default.example.test/telegram-bridge/old-support-1-17/old-path',
        }),
      setWebhook: vi.fn().mockResolvedValue(undefined),
    }
    const service = createTenantTelegramBridgeSetupService({
      audit: vi.fn().mockResolvedValue(undefined),
      db: database.db,
      generateBridgeKey: () => 'new-bridge-key',
      generateSecret: vi
        .fn()
        .mockReturnValueOnce('new-path-secret')
        .mockReturnValueOnce('new-header-secret'),
      getTelegramBotIdentity: vi.fn().mockResolvedValue({
        id: 'old-bot-id',
        username: 'support_bot',
      }),
      now: () => now,
      readChatwootTelegramInbox: vi.fn().mockResolvedValue({
        botName: 'support_bot',
        id: 17,
      }),
      telegramClientFactory: vi.fn(() => telegramClient),
      tenant: createTenantContext(),
      tenantSecretKey,
      verifyBridgeHealth: vi.fn().mockResolvedValue(undefined),
    })

    const result = await service.setupTelegramBridge({
      admin,
      input: {
        chatwootAccountIdFromUrl: 3,
        chatwootTelegramInboxId: 17,
        telegramBotToken: '1234567890:AAExampleTelegramBotTokenSecretValue',
      },
      requestIp: null,
      userAgent: null,
    })

    expect(telegramClient.setWebhook).toHaveBeenCalledWith({
      allowed_updates: ['message'],
      drop_pending_updates: false,
      secret_token: 'old-header',
      url: 'https://default.example.test/telegram-bridge/old-support-1-17/old-path',
    })
    expect(result).toMatchObject({
      publicKey: 'old-support-1-17',
      status: 'active',
      webhookConfigured: true,
    })

    const [row] = await database.db.select().from(telegramBridgeConfigs)
    const key = decodeTenantSecretKey(tenantSecretKey)

    expect(row).toBeDefined()
    if (!row) {
      throw new Error('Expected bridge config row.')
    }

    expect(decryptTenantSecret(row.telegramWebhookPathSecretCiphertext, key)).toBe(
      'old-path',
    )
    expect(decryptTenantSecret(row.telegramSecretTokenCiphertext, key)).toBe(
      'old-header',
    )
    expect(decryptTenantSecret(row.telegramBotTokenCiphertext, key)).toBe(
      '1234567890:AAExampleTelegramBotTokenSecretValue',
    )
  })

  it('keeps existing active secrets unchanged when setWebhook fails', async () => {
    await seedBridgeConfig(database)
    const telegramClient = {
      getWebhookInfo: vi.fn().mockResolvedValue({
        url: 'https://app.lancora.ru/webhooks/telegram/old-token',
      }),
      setWebhook: vi
        .fn()
        .mockRejectedValue(
          new Error(
            'Telegram failed old-path old-header 1234567890:AAExampleTelegramBotTokenSecretValue',
          ),
        ),
    }
    const audit = vi.fn().mockResolvedValue(undefined)
    const service = createTenantTelegramBridgeSetupService({
      audit,
      db: database.db,
      generateBridgeKey: () => 'provgroup-support',
      generateSecret: vi
        .fn()
        .mockReturnValueOnce('path-secret')
        .mockReturnValueOnce('header-secret'),
      getTelegramBotIdentity: vi.fn().mockResolvedValue({
        id: '1234567890',
        username: 'support_bot',
      }),
      now: () => now,
      readChatwootTelegramInbox: vi.fn().mockResolvedValue({
        botName: 'support_bot',
        id: 17,
      }),
      telegramClientFactory: vi.fn(() => telegramClient),
      tenant: createTenantContext(),
      tenantSecretKey,
      verifyBridgeHealth: vi.fn().mockResolvedValue(undefined),
    })

    await expect(
      service.setupTelegramBridge({
        admin,
        input: {
          chatwootAccountIdFromUrl: 3,
          chatwootTelegramInboxId: 17,
          telegramBotToken:
            '1234567890:AAExampleTelegramBotTokenSecretValue',
        },
        requestIp: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({
      code: 'TELEGRAM_BRIDGE_UPSTREAM_FAILED',
      message: 'Telegram failed [redacted] [redacted] [redacted]',
      statusCode: 502,
    })

    const [row] = await database.db.select().from(telegramBridgeConfigs)
    const key = decodeTenantSecretKey(tenantSecretKey)

    expect(row).toBeDefined()
    if (!row) {
      throw new Error('Expected bridge config row.')
    }

    expect(decryptTenantSecret(row.telegramBotTokenCiphertext, key)).toBe(
      'old-token',
    )
    expect(decryptTenantSecret(row.telegramWebhookPathSecretCiphertext, key)).toBe(
      'old-path',
    )
    expect(decryptTenantSecret(row.telegramSecretTokenCiphertext, key)).toBe(
      'old-header',
    )
    expect(JSON.stringify(audit.mock.calls)).not.toContain(
      '1234567890:AAExampleTelegramBotTokenSecretValue',
    )
    expect(JSON.stringify(audit.mock.calls)).not.toContain('old-path')
    expect(JSON.stringify(audit.mock.calls)).not.toContain('old-header')
  })
})
