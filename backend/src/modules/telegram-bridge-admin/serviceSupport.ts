import { telegramBridgeConfigs } from '../../db/schema.js'
import { ApiError } from '../../lib/errors.js'
import {
  redactTelegramBridgeSecrets,
} from '../../telegram-bridge/secrets.js'
import type { TelegramWebhookInfo } from '../../telegram-bridge/telegramClient.js'
import {
  decodeTenantSecretKey,
  decryptTenantSecret,
  encryptTenantSecret,
} from '../tenants/secrets.js'
import type { TelegramBridgeAdminStatus } from './publicTypes.js'

type ExistingBridgeConfig = typeof telegramBridgeConfigs.$inferSelect

export class TelegramBridgeAdminSetupError extends ApiError {
  constructor(
    message: string,
    {
      code = 'TELEGRAM_BRIDGE_SETUP_FAILED',
      statusCode = 400,
    }: {
      code?: string
      statusCode?: number
    } = {},
  ) {
    super(statusCode, code, message)
    this.name = 'TelegramBridgeAdminSetupError'
  }
}

export function normalizePublicBaseUrl(publicBaseUrl: string) {
  return publicBaseUrl.trim().replace(/\/+$/, '')
}

export function normalizeTenantSecretKey(tenantSecretKey: Buffer | string) {
  return typeof tenantSecretKey === 'string'
    ? decodeTenantSecretKey(tenantSecretKey)
    : tenantSecretKey
}

export function readWebhookHost(
  webhookInfo: Pick<TelegramWebhookInfo, 'url'>,
) {
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

export function toPublicStatus({
  row,
  webhookConfigured,
}: {
  row: ExistingBridgeConfig
  webhookConfigured: boolean
}): TelegramBridgeAdminStatus {
  return {
    chatwootTelegramInboxId: row.chatwootTelegramInboxId,
    displayName: row.displayName,
    lastWebhookCheckedAt: row.lastWebhookCheckedAt
      ? row.lastWebhookCheckedAt.toISOString()
      : null,
    lastWebhookHost: row.lastWebhookHost,
    lastWebhookOwner: row.lastWebhookOwner,
    publicKey: row.publicKey,
    status: row.status,
    telegramBotId: row.telegramBotId,
    telegramBotUsername: row.telegramBotUsername,
    webhookConfigured,
  }
}

export function createFailure(error: unknown, sensitiveValues: string[]) {
  const message = redactTelegramBridgeSecrets(
    error instanceof Error ? error.message : String(error),
    sensitiveValues,
  )

  if (error instanceof ApiError) {
    return new ApiError(error.statusCode, error.code, message, error.details)
  }

  return new ApiError(502, 'TELEGRAM_BRIDGE_UPSTREAM_FAILED', message)
}

export function buildAuditMetadata(input: {
  chatwootTelegramInboxId: number
  publicKey?: string
  telegramBotId?: string
  webhookOwner?: string
}) {
  return {
    chatwootTelegramInboxId: input.chatwootTelegramInboxId,
    ...(input.publicKey ? { publicKey: input.publicKey } : {}),
    ...(input.telegramBotId ? { telegramBotId: input.telegramBotId } : {}),
    ...(input.webhookOwner ? { webhookOwner: input.webhookOwner } : {}),
  }
}

export function readBridgeRouteSecrets({
  existingConfig,
  generateSecret,
  key,
  sensitiveValues,
}: {
  existingConfig: ExistingBridgeConfig | null
  generateSecret: () => string
  key: Buffer
  sensitiveValues: string[]
}) {
  if (existingConfig) {
    const webhookPathSecret = decryptTenantSecret(
      existingConfig.telegramWebhookPathSecretCiphertext,
      key,
    )
    const telegramSecretToken = decryptTenantSecret(
      existingConfig.telegramSecretTokenCiphertext,
      key,
    )

    sensitiveValues.push(webhookPathSecret, telegramSecretToken)

    return {
      encryptedHeaderSecret: existingConfig.telegramSecretTokenCiphertext,
      encryptedPathSecret: existingConfig.telegramWebhookPathSecretCiphertext,
      telegramSecretToken,
      webhookPathSecret,
    }
  }

  const webhookPathSecret = generateSecret()
  const telegramSecretToken = generateSecret()

  sensitiveValues.push(webhookPathSecret, telegramSecretToken)

  return {
    encryptedHeaderSecret: encryptTenantSecret(telegramSecretToken, key),
    encryptedPathSecret: encryptTenantSecret(webhookPathSecret, key),
    telegramSecretToken,
    webhookPathSecret,
  }
}
