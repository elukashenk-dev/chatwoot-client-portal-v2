import { eq } from 'drizzle-orm'

import type { AppDatabase } from '../db/client.js'
import {
  portalTenants,
  telegramBridgeConfigs,
} from '../db/schema.js'
import {
  decodeTenantSecretKey,
  decryptTenantSecret,
} from '../modules/tenants/secrets.js'

export const telegramBridgeConfigStatuses = [
  'active',
  'archived',
  'disabled',
  'rotating',
] as const

export type TelegramBridgeConfigStatus =
  (typeof telegramBridgeConfigStatuses)[number]

export const telegramWebhookOwners = [
  'chatwoot-native',
  'empty',
  'telegram-bridge',
  'unknown',
] as const

export type TelegramWebhookOwner = (typeof telegramWebhookOwners)[number]

export type ResolvedTelegramBridgeConfig = {
  chatwoot: {
    accountId: number
    apiAccessToken: string
    baseUrl: string
  }
  chatwootTelegramInboxId: number
  displayName: string
  id: string
  publicKey: string
  telegram: {
    botToken: string
    secretToken: string
    webhookPathSecret: string
  }
  telegramBotId: string
  telegramBotUsername: string
  tenantId: number
}

export type TelegramBridgeConfigLookupResult =
  | { config: ResolvedTelegramBridgeConfig; outcome: 'found' }
  | {
      outcome:
        | 'inactive_config'
        | 'inactive_tenant'
        | 'not_found'
        | 'wrong_path_secret'
    }

type RepositoryOptions = {
  tenantSecretKey: Buffer | string
}

type FindActiveBridgeConfigInput = {
  publicKey: string
  webhookPathSecret: string
}

type UpdateWebhookOwnerMetadataInput = {
  checkedAt: Date
  configId: string
  host: string | null
  owner: TelegramWebhookOwner
}

function normalizePublicKey(publicKey: string) {
  const normalizedPublicKey = publicKey.trim()

  if (!normalizedPublicKey) {
    throw new Error('Telegram bridge public key is required.')
  }

  return normalizedPublicKey
}

function normalizeWebhookPathSecret(webhookPathSecret: string) {
  const normalizedSecret = webhookPathSecret.trim()

  if (!normalizedSecret) {
    throw new Error('Telegram bridge webhook path secret is required.')
  }

  return normalizedSecret
}

function normalizeTenantSecretKey(tenantSecretKey: Buffer | string) {
  return typeof tenantSecretKey === 'string'
    ? decodeTenantSecretKey(tenantSecretKey)
    : tenantSecretKey
}

function normalizeChatwootBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '')
}

function normalizeWebhookOwner(owner: TelegramWebhookOwner) {
  if (!telegramWebhookOwners.includes(owner)) {
    throw new Error('Telegram webhook owner is not supported.')
  }

  return owner
}

function normalizeWebhookHost(host: string | null) {
  if (host === null) {
    return null
  }

  const normalizedHost = host.trim().toLowerCase().replace(/\.$/, '')

  if (
    normalizedHost.includes('://') ||
    normalizedHost.includes('/') ||
    normalizedHost.includes('?') ||
    normalizedHost.includes('#') ||
    normalizedHost.includes(':') ||
    !normalizedHost
  ) {
    throw new Error('Webhook host must not include protocol, path or secret.')
  }

  return normalizedHost
}

export function createTelegramBridgeConfigRepository(
  db: AppDatabase,
  { tenantSecretKey }: RepositoryOptions,
) {
  const secretKey = normalizeTenantSecretKey(tenantSecretKey)

  return {
    async findActiveBridgeConfigByPublicKey({
      publicKey,
      webhookPathSecret,
    }: FindActiveBridgeConfigInput): Promise<TelegramBridgeConfigLookupResult> {
      const normalizedPublicKey = normalizePublicKey(publicKey)
      const normalizedPathSecret =
        normalizeWebhookPathSecret(webhookPathSecret)

      const [row] = await db
        .select({
          chatwootAccountId: portalTenants.chatwootAccountId,
          chatwootApiAccessTokenCiphertext:
            portalTenants.chatwootApiAccessTokenCiphertext,
          chatwootBaseUrl: portalTenants.chatwootBaseUrl,
          chatwootTelegramInboxId:
            telegramBridgeConfigs.chatwootTelegramInboxId,
          displayName: telegramBridgeConfigs.displayName,
          id: telegramBridgeConfigs.id,
          publicKey: telegramBridgeConfigs.publicKey,
          status: telegramBridgeConfigs.status,
          telegramBotId: telegramBridgeConfigs.telegramBotId,
          telegramBotTokenCiphertext:
            telegramBridgeConfigs.telegramBotTokenCiphertext,
          telegramBotUsername: telegramBridgeConfigs.telegramBotUsername,
          telegramSecretTokenCiphertext:
            telegramBridgeConfigs.telegramSecretTokenCiphertext,
          telegramWebhookPathSecretCiphertext:
            telegramBridgeConfigs.telegramWebhookPathSecretCiphertext,
          tenantId: portalTenants.id,
          tenantStatus: portalTenants.status,
        })
        .from(telegramBridgeConfigs)
        .innerJoin(
          portalTenants,
          eq(telegramBridgeConfigs.tenantId, portalTenants.id),
        )
        .where(eq(telegramBridgeConfigs.publicKey, normalizedPublicKey))
        .limit(1)

      if (!row) {
        return { outcome: 'not_found' }
      }

      if (row.status !== 'active') {
        return { outcome: 'inactive_config' }
      }

      if (row.tenantStatus !== 'active') {
        return { outcome: 'inactive_tenant' }
      }

      const decryptedPathSecret = decryptTenantSecret(
        row.telegramWebhookPathSecretCiphertext,
        secretKey,
      )

      if (decryptedPathSecret !== normalizedPathSecret) {
        return { outcome: 'wrong_path_secret' }
      }

      return {
        config: {
          chatwoot: {
            accountId: row.chatwootAccountId,
            apiAccessToken: decryptTenantSecret(
              row.chatwootApiAccessTokenCiphertext,
              secretKey,
            ),
            baseUrl: normalizeChatwootBaseUrl(row.chatwootBaseUrl),
          },
          chatwootTelegramInboxId: row.chatwootTelegramInboxId,
          displayName: row.displayName,
          id: row.id,
          publicKey: row.publicKey,
          telegram: {
            botToken: decryptTenantSecret(
              row.telegramBotTokenCiphertext,
              secretKey,
            ),
            secretToken: decryptTenantSecret(
              row.telegramSecretTokenCiphertext,
              secretKey,
            ),
            webhookPathSecret: decryptedPathSecret,
          },
          telegramBotId: row.telegramBotId,
          telegramBotUsername: row.telegramBotUsername,
          tenantId: row.tenantId,
        },
        outcome: 'found',
      }
    },

    async updateWebhookOwnerMetadata({
      checkedAt,
      configId,
      host,
      owner,
    }: UpdateWebhookOwnerMetadataInput) {
      const [config] = await db
        .update(telegramBridgeConfigs)
        .set({
          lastWebhookCheckedAt: checkedAt,
          lastWebhookHost: normalizeWebhookHost(host),
          lastWebhookOwner: normalizeWebhookOwner(owner),
          updatedAt: checkedAt,
        })
        .where(eq(telegramBridgeConfigs.id, configId))
        .returning()

      if (!config) {
        throw new Error('Telegram bridge config was not found.')
      }

      return config
    },
  }
}
