import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { eq } from 'drizzle-orm'

import type { AppDatabase } from '../db/client.js'
import { createDatabaseClient } from '../db/client.js'
import {
  portalTenants,
  telegramBridgeConfigs,
} from '../db/schema.js'
import {
  decodeTenantSecretKey,
  decryptTenantSecret,
} from '../modules/tenants/secrets.js'
import type { TelegramWebhookOwner } from './configRepository.js'
import { loadTelegramBridgeEnv } from './env.js'
import { redactTelegramBridgeSecrets } from './secrets.js'
import {
  createTelegramClient,
  type TelegramWebhookInfo,
} from './telegramClient.js'

export type OperatorBridgeConfig = {
  id: string
  publicKey: string
  telegram: {
    botToken: string
    secretToken: string
    webhookPathSecret: string
  }
}

type ClassifyTelegramWebhookOwnerInput = {
  publicBaseUrl: string
  webhookInfo: Pick<TelegramWebhookInfo, 'url'>
}

type TelegramWebhookConfigurator = {
  getWebhookInfo: () => Promise<TelegramWebhookInfo>
  setWebhook: (payload: {
    allowed_updates: string[]
    drop_pending_updates: boolean
    secret_token: string
    url: string
  }) => Promise<void>
}

type ConfigureTelegramWebhookInput = {
  allowUnknownOwner?: boolean
  db: AppDatabase
  publicBaseUrl: string
  publicKey: string
  telegramClient: TelegramWebhookConfigurator
  tenantSecretKey: Buffer | string
}

function normalizePublicBaseUrl(publicBaseUrl: string) {
  return publicBaseUrl.trim().replace(/\/+$/, '')
}

function normalizeTenantSecretKey(tenantSecretKey: Buffer | string) {
  return typeof tenantSecretKey === 'string'
    ? decodeTenantSecretKey(tenantSecretKey)
    : tenantSecretKey
}

function readWebhookHost(webhookInfo: Pick<TelegramWebhookInfo, 'url'>) {
  const url = webhookInfo.url?.trim()

  if (!url) {
    return null
  }

  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function isDirectCliModule(moduleUrl: string) {
  return process.argv[1]
    ? pathToFileURL(resolve(process.argv[1])).href === moduleUrl
    : false
}

function readFlagValue(argv: string[], index: number, flag: string) {
  const current = argv[index]

  if (!current) {
    return null
  }

  if (current.startsWith(`${flag}=`)) {
    return {
      consumedNext: false,
      value: current.slice(flag.length + 1),
    }
  }

  if (current === flag) {
    const value = argv[index + 1]

    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${flag} requires a value.`)
    }

    return {
      consumedNext: true,
      value,
    }
  }

  return null
}

function parseConfigureWebhookArgs(argv: string[]) {
  let allowUnknownOwner = false
  let bridgeKey = ''

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]

    if (current === '--allow-unknown-owner') {
      allowUnknownOwner = true
      continue
    }

    const parsedBridgeKey = readFlagValue(argv, index, '--bridge-key')

    if (parsedBridgeKey) {
      bridgeKey = parsedBridgeKey.value.trim()
      if (parsedBridgeKey.consumedNext) {
        index += 1
      }
      continue
    }

    throw new Error(
      `Unknown argument: ${redactTelegramBridgeSecrets(current)}`,
    )
  }

  if (!bridgeKey) {
    throw new Error('--bridge-key is required.')
  }

  return {
    allowUnknownOwner,
    bridgeKey,
  }
}

export async function loadOperatorBridgeConfig({
  db,
  publicKey,
  tenantSecretKey,
}: {
  db: AppDatabase
  publicKey: string
  tenantSecretKey: Buffer | string
}): Promise<OperatorBridgeConfig> {
  const [row] = await db
    .select({
      botTokenCiphertext: telegramBridgeConfigs.telegramBotTokenCiphertext,
      id: telegramBridgeConfigs.id,
      publicKey: telegramBridgeConfigs.publicKey,
      secretTokenCiphertext: telegramBridgeConfigs.telegramSecretTokenCiphertext,
      status: telegramBridgeConfigs.status,
      tenantStatus: portalTenants.status,
      webhookPathSecretCiphertext:
        telegramBridgeConfigs.telegramWebhookPathSecretCiphertext,
    })
    .from(telegramBridgeConfigs)
    .innerJoin(
      portalTenants,
      eq(telegramBridgeConfigs.tenantId, portalTenants.id),
    )
    .where(eq(telegramBridgeConfigs.publicKey, publicKey.trim()))
    .limit(1)

  if (!row) {
    throw new Error('Telegram bridge config was not found.')
  }

  if (row.tenantStatus !== 'active') {
    throw new Error('Telegram bridge config requires an active tenant.')
  }

  if (row.status === 'archived' || row.status === 'disabled') {
    throw new Error('Telegram bridge config is not configurable.')
  }

  const key = normalizeTenantSecretKey(tenantSecretKey)

  return {
    id: row.id,
    publicKey: row.publicKey,
    telegram: {
      botToken: decryptTenantSecret(row.botTokenCiphertext, key),
      secretToken: decryptTenantSecret(row.secretTokenCiphertext, key),
      webhookPathSecret: decryptTenantSecret(
        row.webhookPathSecretCiphertext,
        key,
      ),
    },
  }
}

export function classifyTelegramWebhookOwner({
  publicBaseUrl,
  webhookInfo,
}: ClassifyTelegramWebhookOwnerInput): TelegramWebhookOwner {
  const webhookUrl = webhookInfo.url?.trim()

  if (!webhookUrl) {
    return 'empty'
  }

  try {
    const parsedWebhookUrl = new URL(webhookUrl)
    const normalizedPublicBaseUrl = new URL(normalizePublicBaseUrl(publicBaseUrl))

    if (
      parsedWebhookUrl.origin === normalizedPublicBaseUrl.origin &&
      parsedWebhookUrl.pathname.startsWith('/telegram-bridge/')
    ) {
      return 'telegram-bridge'
    }

    if (parsedWebhookUrl.pathname.startsWith('/webhooks/telegram/')) {
      return 'chatwoot-native'
    }
  } catch {
    return 'unknown'
  }

  return 'unknown'
}

export async function configureTelegramWebhook({
  allowUnknownOwner = false,
  db,
  publicBaseUrl,
  publicKey,
  telegramClient,
  tenantSecretKey,
}: ConfigureTelegramWebhookInput) {
  const bridgeConfig = await loadOperatorBridgeConfig({
    db,
    publicKey,
    tenantSecretKey,
  })
  const normalizedPublicBaseUrl = normalizePublicBaseUrl(publicBaseUrl)
  const webhookUrl = `${normalizedPublicBaseUrl}/telegram-bridge/${bridgeConfig.publicKey}/${bridgeConfig.telegram.webhookPathSecret}`
  const beforeInfo = await telegramClient.getWebhookInfo()
  const owner = classifyTelegramWebhookOwner({
    publicBaseUrl: normalizedPublicBaseUrl,
    webhookInfo: beforeInfo,
  })
  const checkedAt = new Date()

  await db
    .update(telegramBridgeConfigs)
    .set({
      lastWebhookCheckedAt: checkedAt,
      lastWebhookHost: readWebhookHost(beforeInfo),
      lastWebhookOwner: owner,
      updatedAt: checkedAt,
    })
    .where(eq(telegramBridgeConfigs.id, bridgeConfig.id))

  if (owner === 'unknown' && !allowUnknownOwner) {
    throw new Error('Refusing to replace unknown webhook owner.')
  }

  await telegramClient.setWebhook({
    allowed_updates: ['message'],
    drop_pending_updates: false,
    secret_token: bridgeConfig.telegram.secretToken,
    url: webhookUrl,
  })

  const afterInfo = await telegramClient.getWebhookInfo()

  if (afterInfo.url !== webhookUrl) {
    throw new Error('Telegram webhook confirmation did not match expected URL.')
  }

  const [updatedConfig] = await db
    .update(telegramBridgeConfigs)
    .set({
      status: 'active',
      updatedAt: new Date(),
    })
    .where(eq(telegramBridgeConfigs.id, bridgeConfig.id))
    .returning({
      publicKey: telegramBridgeConfigs.publicKey,
      status: telegramBridgeConfigs.status,
    })

  if (!updatedConfig) {
    throw new Error('Telegram bridge config was not found after webhook setup.')
  }

  return {
    publicKey: updatedConfig.publicKey,
    status: updatedConfig.status,
    webhookConfigured: true,
    webhookUrlHost: new URL(webhookUrl).hostname,
  }
}

export async function runConfigureTelegramWebhookCli(
  argv = process.argv.slice(2),
) {
  const args = parseConfigureWebhookArgs(argv)
  const env = loadTelegramBridgeEnv()
  const database = createDatabaseClient({
    connectionString: env.DATABASE_URL,
  })

  try {
    const bridgeConfig = await loadOperatorBridgeConfig({
      db: database.db,
      publicKey: args.bridgeKey,
      tenantSecretKey: env.PORTAL_TENANT_SECRET_KEY,
    })
    const result = await configureTelegramWebhook({
      allowUnknownOwner: args.allowUnknownOwner,
      db: database.db,
      publicBaseUrl: env.TELEGRAM_BRIDGE_PUBLIC_BASE_URL,
      publicKey: args.bridgeKey,
      telegramClient: createTelegramClient({
        botToken: bridgeConfig.telegram.botToken,
        requestTimeoutMs: env.TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS,
      }),
      tenantSecretKey: env.PORTAL_TENANT_SECRET_KEY,
    })

    console.log(JSON.stringify(result, null, 2))
    return result
  } finally {
    await database.close()
  }
}

if (isDirectCliModule(import.meta.url)) {
  runConfigureTelegramWebhookCli().catch((error: unknown) => {
    console.error(redactTelegramBridgeSecrets(error))
    process.exitCode = 1
  })
}
