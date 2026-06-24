import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { and, eq, ne } from 'drizzle-orm'

import { loadEnv } from '../config/env.js'
import type { AppDatabase } from '../db/client.js'
import { createDatabaseClient } from '../db/client.js'
import {
  portalTenants,
  telegramBridgeConfigs,
} from '../db/schema.js'
import {
  decodeTenantSecretKey,
  decryptTenantSecret,
  encryptTenantSecret,
} from '../modules/tenants/secrets.js'
import {
  generateBridgeSecret,
  readSecretValue,
  redactTelegramBridgeSecrets,
} from './secrets.js'
import { getTelegramBotIdentity as fetchTelegramBotIdentity } from './telegramClient.js'

export type CreateBridgeConfigCliArgs = {
  bridgeKey: string
  chatwootTelegramInboxId: number
  displayName: string
  telegramBotTokenFile?: string
  telegramBotTokenStdin?: boolean
  telegramSecretTokenFile?: string
  tenantSlug: string
  webhookPathSecretFile?: string
}

type CreateTelegramBridgeConfigInput = {
  chatwootTelegramInboxId: number
  db: AppDatabase
  displayName: string
  fetchChatwoot: typeof fetch
  generateSecret?: () => string
  getTelegramBotIdentity: (
    botToken: string,
  ) => Promise<{ id: string; username: string }>
  publicKey: string
  telegramBotToken: string
  telegramSecretToken?: string
  tenantSecretKey: Buffer | string
  tenantSlug: string
  webhookPathSecret?: string
}

export class TelegramBridgeConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TelegramBridgeConfigError'
  }
}

type RawCreateBridgeConfigArgs = Partial<CreateBridgeConfigCliArgs>

const flagMap = {
  '--bridge-key': 'bridgeKey',
  '--chatwoot-telegram-inbox-id': 'chatwootTelegramInboxId',
  '--display-name': 'displayName',
  '--telegram-bot-token-file': 'telegramBotTokenFile',
  '--telegram-secret-token-file': 'telegramSecretTokenFile',
  '--tenant': 'tenantSlug',
  '--webhook-path-secret-file': 'webhookPathSecretFile',
} as const

function normalizeTenantSecretKey(tenantSecretKey: Buffer | string) {
  return typeof tenantSecretKey === 'string'
    ? decodeTenantSecretKey(tenantSecretKey)
    : tenantSecretKey
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
      throw new TelegramBridgeConfigError(`${flag} requires a value.`)
    }

    return {
      consumedNext: true,
      value,
    }
  }

  return null
}

function requireStringArg(
  args: RawCreateBridgeConfigArgs,
  key: keyof Pick<
    CreateBridgeConfigCliArgs,
    'bridgeKey' | 'displayName' | 'tenantSlug'
  >,
  flag: string,
) {
  const value = args[key]

  if (typeof value !== 'string' || !value.trim()) {
    throw new TelegramBridgeConfigError(`${flag} is required.`)
  }

  return value.trim()
}

function requirePositiveIntArg(
  args: RawCreateBridgeConfigArgs,
  key: 'chatwootTelegramInboxId',
  flag: string,
) {
  const value = Number(args[key])

  if (!Number.isInteger(value) || value <= 0) {
    throw new TelegramBridgeConfigError(`${flag} must be a positive integer.`)
  }

  return value
}

function countTokenSources(args: RawCreateBridgeConfigArgs) {
  return (
    Number(Boolean(args.telegramBotTokenFile)) +
    Number(Boolean(args.telegramBotTokenStdin))
  )
}

export function parseCreateBridgeConfigArgs(
  argv: string[],
): CreateBridgeConfigCliArgs {
  const args: RawCreateBridgeConfigArgs = {}

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]

    if (current === '--telegram-bot-token-stdin') {
      args.telegramBotTokenStdin = true
      continue
    }

    let matched = false

    for (const [flag, key] of Object.entries(flagMap)) {
      const parsed = readFlagValue(argv, index, flag)

      if (!parsed) {
        continue
      }

      if (key === 'chatwootTelegramInboxId') {
        args[key] = Number(parsed.value)
      } else {
        args[key] = parsed.value.trim()
      }

      matched = true

      if (parsed.consumedNext) {
        index += 1
      }

      break
    }

    if (!matched) {
      throw new TelegramBridgeConfigError(
        `Unknown argument: ${redactTelegramBridgeSecrets(current)}`,
      )
    }
  }

  const tenantSlug = requireStringArg(args, 'tenantSlug', '--tenant')
  const bridgeKey = requireStringArg(args, 'bridgeKey', '--bridge-key')
  const chatwootTelegramInboxId = requirePositiveIntArg(
    args,
    'chatwootTelegramInboxId',
    '--chatwoot-telegram-inbox-id',
  )
  const displayName = requireStringArg(args, 'displayName', '--display-name')

  if (countTokenSources(args) !== 1) {
    throw new TelegramBridgeConfigError(
      'Use only one telegram bot token source: --telegram-bot-token-file or --telegram-bot-token-stdin.',
    )
  }

  return {
    bridgeKey,
    chatwootTelegramInboxId,
    displayName,
    ...(args.telegramBotTokenFile
      ? { telegramBotTokenFile: args.telegramBotTokenFile }
      : {}),
    ...(args.telegramBotTokenStdin ? { telegramBotTokenStdin: true } : {}),
    ...(args.telegramSecretTokenFile
      ? { telegramSecretTokenFile: args.telegramSecretTokenFile }
      : {}),
    tenantSlug,
    ...(args.webhookPathSecretFile
      ? { webhookPathSecretFile: args.webhookPathSecretFile }
      : {}),
  }
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function isDirectCliModule(moduleUrl: string) {
  return process.argv[1]
    ? pathToFileURL(resolve(process.argv[1])).href === moduleUrl
    : false
}

function requireTenantSecretKey(value: string | undefined) {
  if (!value?.trim()) {
    throw new TelegramBridgeConfigError('PORTAL_TENANT_SECRET_KEY is required.')
  }

  return value
}

async function readOptionalSecretFile(filePath: string | undefined) {
  return filePath ? readSecretValue({ filePath }) : undefined
}

async function readChatwootInbox({
  accountId,
  apiAccessToken,
  baseUrl,
  fetchChatwoot,
  inboxId,
}: {
  accountId: number
  apiAccessToken: string
  baseUrl: string
  fetchChatwoot: typeof fetch
  inboxId: number
}) {
  const requestUrl = new URL(
    `/api/v1/accounts/${accountId}/inboxes/${inboxId}`,
    baseUrl,
  )
  const response = await fetchChatwoot(requestUrl, {
    headers: {
      Accept: 'application/json',
      api_access_token: apiAccessToken,
    },
    method: 'GET',
  })

  if (response.status === 404 || !response.ok) {
    throw new TelegramBridgeConfigError('Chatwoot Telegram inbox was not found.')
  }

  const payload = await response.json()
  const id = readInteger(payload?.id)
  const channelType = readString(payload?.channel_type)
  const botName = readString(payload?.bot_name)

  if (id !== inboxId || channelType !== 'Channel::Telegram' || !botName) {
    throw new TelegramBridgeConfigError(
      'Chatwoot Telegram inbox must exist and be a Telegram inbox.',
    )
  }

  return {
    botName,
    id,
  }
}

export async function createTelegramBridgeConfig({
  chatwootTelegramInboxId,
  db,
  displayName,
  fetchChatwoot,
  generateSecret = generateBridgeSecret,
  getTelegramBotIdentity,
  publicKey,
  telegramBotToken,
  telegramSecretToken,
  tenantSecretKey,
  tenantSlug,
  webhookPathSecret,
}: CreateTelegramBridgeConfigInput) {
  const [tenant] = await db
    .select()
    .from(portalTenants)
    .where(eq(portalTenants.slug, tenantSlug.trim()))
    .limit(1)

  if (!tenant || tenant.status !== 'active') {
    throw new TelegramBridgeConfigError(
      'Telegram bridge config requires an active tenant.',
    )
  }

  const key = normalizeTenantSecretKey(tenantSecretKey)
  const chatwootApiAccessToken = decryptTenantSecret(
    tenant.chatwootApiAccessTokenCiphertext,
    key,
  )
  const inbox = await readChatwootInbox({
    accountId: tenant.chatwootAccountId,
    apiAccessToken: chatwootApiAccessToken,
    baseUrl: tenant.chatwootBaseUrl,
    fetchChatwoot,
    inboxId: chatwootTelegramInboxId,
  })
  const botIdentity = await getTelegramBotIdentity(telegramBotToken)

  if (botIdentity.username !== inbox.botName) {
    throw new TelegramBridgeConfigError(
      'Chatwoot Telegram inbox bot_name does not match Telegram getMe username.',
    )
  }

  const [existingBotConfig] = await db
    .select({ id: telegramBridgeConfigs.id })
    .from(telegramBridgeConfigs)
    .where(
      and(
        eq(telegramBridgeConfigs.telegramBotId, botIdentity.id),
        ne(telegramBridgeConfigs.status, 'archived'),
      ),
    )
    .limit(1)

  if (existingBotConfig) {
    throw new TelegramBridgeConfigError(
      'Telegram bot id is already used by another bridge config.',
    )
  }

  const pathSecret = webhookPathSecret ?? generateSecret()
  const headerSecret = telegramSecretToken ?? generateSecret()
  const [config] = await db
    .insert(telegramBridgeConfigs)
    .values({
      chatwootTelegramInboxId,
      displayName: displayName.trim(),
      id: randomUUID(),
      publicKey: publicKey.trim(),
      status: 'rotating',
      telegramBotId: botIdentity.id,
      telegramBotTokenCiphertext: encryptTenantSecret(telegramBotToken, key),
      telegramBotUsername: botIdentity.username,
      telegramSecretTokenCiphertext: encryptTenantSecret(headerSecret, key),
      telegramWebhookPathSecretCiphertext: encryptTenantSecret(pathSecret, key),
      tenantId: tenant.id,
    })
    .returning({
      publicKey: telegramBridgeConfigs.publicKey,
      status: telegramBridgeConfigs.status,
      telegramBotId: telegramBridgeConfigs.telegramBotId,
      telegramBotUsername: telegramBridgeConfigs.telegramBotUsername,
    })

  if (!config) {
    throw new TelegramBridgeConfigError(
      'Telegram bridge config was not created.',
    )
  }

  return config
}

export async function runCreateBridgeConfigCli(argv = process.argv.slice(2)) {
  const args = parseCreateBridgeConfigArgs(argv)
  const env = loadEnv()
  const requestTimeoutMs = env.CHATWOOT_REQUEST_TIMEOUT_MS ?? 10_000
  const telegramBotToken = await readSecretValue({
    ...(args.telegramBotTokenFile
      ? { filePath: args.telegramBotTokenFile }
      : {}),
    ...(args.telegramBotTokenStdin ? { stdin: true } : {}),
  })
  const webhookPathSecret = await readOptionalSecretFile(
    args.webhookPathSecretFile,
  )
  const telegramSecretToken = await readOptionalSecretFile(
    args.telegramSecretTokenFile,
  )
  const database = createDatabaseClient({
    connectionString: env.DATABASE_URL,
  })

  try {
    const result = await createTelegramBridgeConfig({
      chatwootTelegramInboxId: args.chatwootTelegramInboxId,
      db: database.db,
      displayName: args.displayName,
      fetchChatwoot: fetch,
      getTelegramBotIdentity: (botToken) =>
        fetchTelegramBotIdentity(botToken, {
          requestTimeoutMs,
        }),
      publicKey: args.bridgeKey,
      telegramBotToken,
      ...(telegramSecretToken ? { telegramSecretToken } : {}),
      tenantSecretKey: requireTenantSecretKey(env.PORTAL_TENANT_SECRET_KEY),
      tenantSlug: args.tenantSlug,
      ...(webhookPathSecret ? { webhookPathSecret } : {}),
    })

    console.log(JSON.stringify(result, null, 2))
    return result
  } finally {
    await database.close()
  }
}

if (isDirectCliModule(import.meta.url)) {
  runCreateBridgeConfigCli().catch((error: unknown) => {
    console.error(redactTelegramBridgeSecrets(error))
    process.exitCode = 1
  })
}
