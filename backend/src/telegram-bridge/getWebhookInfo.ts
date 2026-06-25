import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createDatabaseClient } from '../db/client.js'
import type { AppDatabase } from '../db/client.js'
import {
  classifyTelegramWebhookOwner,
  loadOperatorBridgeConfig,
} from './configureWebhook.js'
import {
  loadTelegramBridgeEnv,
  loadTelegramBridgeWebhookInfoEnv,
} from './env.js'
import { readSecretValue, redactTelegramBridgeSecrets } from './secrets.js'
import { createTelegramClient, type TelegramWebhookInfo } from './telegramClient.js'

type GetWebhookInfoArgs =
  | { bridgeKey: string }
  | { telegramBotTokenFile: string }
  | { telegramBotTokenStdin: true }

type TelegramWebhookInfoClient = {
  getWebhookInfo: () => Promise<TelegramWebhookInfo>
}

type GetSafeTelegramWebhookInfoInput = {
  db?: AppDatabase
  publicBaseUrl: string
  publicKey?: string
  readStdin?: () => Promise<string>
  requestTimeoutMs?: number
  telegramBotTokenFile?: string
  telegramBotTokenStdin?: boolean
  telegramClientFactory?: (botToken: string) => TelegramWebhookInfoClient
  tenantSecretKey?: Buffer | string
}

type RunGetWebhookInfoCliDependencies = {
  createDatabaseClient?: typeof createDatabaseClient
  getSafeTelegramWebhookInfo?: typeof getSafeTelegramWebhookInfo
  rawEnv?: NodeJS.ProcessEnv
  writeOutput?: (value: string) => void
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

function isDirectCliModule(moduleUrl: string) {
  return process.argv[1]
    ? pathToFileURL(resolve(process.argv[1])).href === moduleUrl
    : false
}

export function parseGetWebhookInfoArgs(argv: string[]): GetWebhookInfoArgs {
  const parsed: {
    bridgeKey?: string
    telegramBotTokenFile?: string
    telegramBotTokenStdin?: boolean
  } = {}

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]

    if (current === '--telegram-bot-token-stdin') {
      parsed.telegramBotTokenStdin = true
      continue
    }

    const bridgeKey = readFlagValue(argv, index, '--bridge-key')

    if (bridgeKey) {
      parsed.bridgeKey = bridgeKey.value.trim()
      if (bridgeKey.consumedNext) {
        index += 1
      }
      continue
    }

    const tokenFile = readFlagValue(argv, index, '--telegram-bot-token-file')

    if (tokenFile) {
      parsed.telegramBotTokenFile = tokenFile.value.trim()
      if (tokenFile.consumedNext) {
        index += 1
      }
      continue
    }

    throw new Error(
      `Unknown argument: ${redactTelegramBridgeSecrets(current)}`,
    )
  }

  const sources = [
    parsed.bridgeKey,
    parsed.telegramBotTokenFile,
    parsed.telegramBotTokenStdin,
  ].filter(Boolean)

  if (sources.length !== 1) {
    throw new Error('Use either --bridge-key or one token source.')
  }

  if (parsed.bridgeKey) {
    return { bridgeKey: parsed.bridgeKey }
  }

  if (parsed.telegramBotTokenFile) {
    return { telegramBotTokenFile: parsed.telegramBotTokenFile }
  }

  return { telegramBotTokenStdin: true }
}

async function resolveBotToken({
  db,
  publicKey,
  readStdin,
  telegramBotTokenFile,
  telegramBotTokenStdin,
  tenantSecretKey,
}: Pick<
  GetSafeTelegramWebhookInfoInput,
  | 'db'
  | 'publicKey'
  | 'readStdin'
  | 'telegramBotTokenFile'
  | 'telegramBotTokenStdin'
  | 'tenantSecretKey'
>) {
  if (publicKey) {
    if (!db || !tenantSecretKey) {
      throw new Error('Database and tenant secret key are required.')
    }

    const config = await loadOperatorBridgeConfig({
      db,
      publicKey,
      tenantSecretKey,
    })

    return config.telegram.botToken
  }

  return readSecretValue({
    ...(telegramBotTokenFile ? { filePath: telegramBotTokenFile } : {}),
    ...(readStdin ? { readStdin } : {}),
    ...(telegramBotTokenStdin ? { stdin: true } : {}),
  })
}

function normalizePendingUpdateCount(webhookInfo: TelegramWebhookInfo) {
  const rawValue =
    webhookInfo.pending_update_count ??
    (webhookInfo as Record<string, unknown>).pendingUpdateCount

  return typeof rawValue === 'number' ? rawValue : 0
}

export async function getSafeTelegramWebhookInfo({
  publicBaseUrl,
  requestTimeoutMs = 10_000,
  telegramClientFactory,
  ...input
}: GetSafeTelegramWebhookInfoInput) {
  const botToken = await resolveBotToken(input)
  const client =
    telegramClientFactory?.(botToken) ??
    createTelegramClient({
      botToken,
      requestTimeoutMs,
    })
  const webhookInfo = await client.getWebhookInfo()
  const owner = classifyTelegramWebhookOwner({
    publicBaseUrl,
    webhookInfo,
  })

  return {
    lastErrorMessage: webhookInfo.last_error_message
      ? redactTelegramBridgeSecrets(webhookInfo.last_error_message, [botToken])
      : undefined,
    owner,
    pendingUpdateCount: normalizePendingUpdateCount(webhookInfo),
    url: redactTelegramBridgeSecrets(webhookInfo.url ?? '', [botToken]),
  }
}

export async function runGetWebhookInfoCli(
  argv = process.argv.slice(2),
  {
    createDatabaseClient: createDatabase = createDatabaseClient,
    getSafeTelegramWebhookInfo: getSafeWebhookInfo = getSafeTelegramWebhookInfo,
    rawEnv,
    writeOutput = console.log,
  }: RunGetWebhookInfoCliDependencies = {},
) {
  const args = parseGetWebhookInfoArgs(argv)

  if ('bridgeKey' in args) {
    const env = loadTelegramBridgeEnv(rawEnv)
    const database = createDatabase({
      connectionString: env.DATABASE_URL,
    })

    try {
      const result = await getSafeWebhookInfo({
        db: database.db,
        publicBaseUrl: env.TELEGRAM_BRIDGE_PUBLIC_BASE_URL,
        publicKey: args.bridgeKey,
        requestTimeoutMs: env.TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS,
        tenantSecretKey: env.PORTAL_TENANT_SECRET_KEY,
      })

      writeOutput(JSON.stringify(result, null, 2))
      return result
    } finally {
      await database.close()
    }
  }

  const env = loadTelegramBridgeWebhookInfoEnv(rawEnv)
  const result = await getSafeWebhookInfo({
    publicBaseUrl: env.TELEGRAM_BRIDGE_PUBLIC_BASE_URL,
    requestTimeoutMs: env.TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS,
    ...('telegramBotTokenFile' in args
      ? { telegramBotTokenFile: args.telegramBotTokenFile }
      : {}),
    ...('telegramBotTokenStdin' in args
      ? { telegramBotTokenStdin: args.telegramBotTokenStdin }
      : {}),
  })

  writeOutput(JSON.stringify(result, null, 2))
  return result
}

if (isDirectCliModule(import.meta.url)) {
  runGetWebhookInfoCli().catch((error: unknown) => {
    console.error(redactTelegramBridgeSecrets(error))
    process.exitCode = 1
  })
}
