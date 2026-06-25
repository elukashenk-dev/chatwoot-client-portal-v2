import { randomUUID } from 'node:crypto'

import { and, eq, ne } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import { telegramBridgeConfigs } from '../../db/schema.js'
import {
  classifyTelegramWebhookOwner,
} from '../../telegram-bridge/configureWebhook.js'
import {
  generateBridgeSecret,
} from '../../telegram-bridge/secrets.js'
import type { TelegramWebhookInfo } from '../../telegram-bridge/telegramClient.js'
import type { PublicTenantAdmin } from '../tenant-admin/adminAuthPrimitives.js'
import { encryptTenantSecret } from '../tenants/secrets.js'
import type { TenantRequestContext } from '../tenants/service.js'
import type { TelegramBridgeSetupInput } from './input.js'
import {
  buildAuditMetadata,
  createFailure,
  normalizePublicBaseUrl,
  normalizeTenantSecretKey,
  readBridgeRouteSecrets,
  readWebhookHost,
  TelegramBridgeAdminSetupError,
  toPublicStatus,
} from './serviceSupport.js'

export { TelegramBridgeAdminSetupError } from './serviceSupport.js'

type Audit = (input: {
  action: string
  actor?: PublicTenantAdmin | null
  metadata?: Record<string, unknown>
  outcome: string
  requestIp: string | null
  subjectEmail?: string | null
  userAgent: string | null
}) => Promise<void>

type ChatwootTelegramInbox = {
  botName: string
  id: number
}

type TelegramClient = {
  getWebhookInfo: () => Promise<TelegramWebhookInfo>
  setWebhook: (payload: {
    allowed_updates: string[]
    drop_pending_updates: boolean
    secret_token: string
    url: string
  }) => Promise<void>
}

type CreateTenantTelegramBridgeSetupServiceOptions = {
  audit: Audit
  db: AppDatabase
  generateBridgeKey?: () => string
  generateSecret?: () => string
  getTelegramBotIdentity: (
    botToken: string,
  ) => Promise<{ id: string; username: string }>
  now?: () => Date
  publicBaseUrl: string
  readChatwootTelegramInbox: (input: {
    inboxId: number
    tenant: TenantRequestContext
  }) => Promise<ChatwootTelegramInbox>
  telegramClientFactory: (botToken: string) => TelegramClient
  tenant: TenantRequestContext
  tenantSecretKey: Buffer | string
  verifyBridgeHealth: () => Promise<void>
}

type SetupTelegramBridgeInput = {
  admin: PublicTenantAdmin
  input: TelegramBridgeSetupInput
  requestIp: string | null
  userAgent: string | null
}

type ExistingBridgeConfig = typeof telegramBridgeConfigs.$inferSelect

async function findExistingConfig({
  db,
  input,
  tenant,
}: {
  db: AppDatabase
  input: TelegramBridgeSetupInput
  tenant: TenantRequestContext
}) {
  const [config] = await db
    .select()
    .from(telegramBridgeConfigs)
    .where(
      and(
        eq(telegramBridgeConfigs.tenantId, tenant.id),
        eq(
          telegramBridgeConfigs.chatwootTelegramInboxId,
          input.chatwootTelegramInboxId,
        ),
      ),
    )
    .limit(1)

  return config ?? null
}

async function assertBotIdAvailable({
  botId,
  db,
  existingConfig,
}: {
  botId: string
  db: AppDatabase
  existingConfig: ExistingBridgeConfig | null
}) {
  const [duplicate] = await db
    .select({ id: telegramBridgeConfigs.id })
    .from(telegramBridgeConfigs)
    .where(
      and(
        eq(telegramBridgeConfigs.telegramBotId, botId),
        ne(telegramBridgeConfigs.status, 'archived'),
      ),
    )
    .limit(1)

  if (duplicate && duplicate.id !== existingConfig?.id) {
    throw new TelegramBridgeAdminSetupError(
      'Telegram bot id is already used by another bridge config.',
      {
        code: 'TELEGRAM_BRIDGE_SETUP_CONFLICT',
        statusCode: 409,
      },
    )
  }
}

async function insertRotatingConfig({
  botIdentity,
  db,
  displayName,
  encryptedHeaderSecret,
  encryptedPathSecret,
  encryptedToken,
  input,
  publicKey,
  tenant,
}: {
  botIdentity: { id: string; username: string }
  db: AppDatabase
  displayName: string
  encryptedHeaderSecret: string
  encryptedPathSecret: string
  encryptedToken: string
  input: TelegramBridgeSetupInput
  publicKey: string
  tenant: TenantRequestContext
}) {
  const [row] = await db
    .insert(telegramBridgeConfigs)
    .values({
      chatwootTelegramInboxId: input.chatwootTelegramInboxId,
      displayName,
      id: randomUUID(),
      publicKey,
      status: 'rotating',
      telegramBotId: botIdentity.id,
      telegramBotTokenCiphertext: encryptedToken,
      telegramBotUsername: botIdentity.username,
      telegramSecretTokenCiphertext: encryptedHeaderSecret,
      telegramWebhookPathSecretCiphertext: encryptedPathSecret,
      tenantId: tenant.id,
    })
    .returning()

  if (!row) {
    throw new TelegramBridgeAdminSetupError(
      'Telegram bridge config was not created.',
    )
  }

  return row
}

export function createTenantTelegramBridgeSetupService({
  audit,
  db,
  generateBridgeKey = () => randomUUID(),
  generateSecret = generateBridgeSecret,
  getTelegramBotIdentity,
  now = () => new Date(),
  publicBaseUrl,
  readChatwootTelegramInbox,
  telegramClientFactory,
  tenant,
  tenantSecretKey,
  verifyBridgeHealth,
}: CreateTenantTelegramBridgeSetupServiceOptions) {
  const key = normalizeTenantSecretKey(tenantSecretKey)
  const normalizedPublicBaseUrl = normalizePublicBaseUrl(publicBaseUrl)

  return {
    async setupTelegramBridge({
      admin,
      input,
      requestIp,
      userAgent,
    }: SetupTelegramBridgeInput) {
      const sensitiveValues = [input.telegramBotToken]

      await audit({
        action: 'telegram_bridge_setup_started',
        actor: admin,
        metadata: buildAuditMetadata({
          chatwootTelegramInboxId: input.chatwootTelegramInboxId,
        }),
        outcome: 'started',
        requestIp,
        userAgent,
      })

      try {
        if (input.chatwootAccountIdFromUrl !== tenant.chatwoot.accountId) {
          throw new TelegramBridgeAdminSetupError(
            'Chatwoot account id does not match the current tenant.',
          )
        }

        const inbox = await readChatwootTelegramInbox({
          inboxId: input.chatwootTelegramInboxId,
          tenant,
        })
        const botIdentity = await getTelegramBotIdentity(input.telegramBotToken)

        if (botIdentity.username !== inbox.botName) {
          throw new TelegramBridgeAdminSetupError(
            'Chatwoot Telegram inbox bot_name does not match Telegram getMe username.',
          )
        }

        const existingConfig = await findExistingConfig({
          db,
          input,
          tenant,
        })

        await assertBotIdAvailable({
          botId: botIdentity.id,
          db,
          existingConfig,
        })

        await verifyBridgeHealth()

        const publicKey = existingConfig?.publicKey ?? generateBridgeKey()
        const displayName = `Telegram ${botIdentity.username}`
        const encryptedToken = encryptTenantSecret(input.telegramBotToken, key)
        const {
          encryptedHeaderSecret,
          encryptedPathSecret,
          telegramSecretToken,
          webhookPathSecret,
        } = readBridgeRouteSecrets({
          existingConfig,
          generateSecret,
          key,
          sensitiveValues,
        })
        const row =
          existingConfig ??
          (await insertRotatingConfig({
            botIdentity,
            db,
            displayName,
            encryptedHeaderSecret,
            encryptedPathSecret,
            encryptedToken,
            input,
            publicKey,
            tenant,
          }))
        const telegramClient = telegramClientFactory(input.telegramBotToken)
        const beforeInfo = await telegramClient.getWebhookInfo()
        const owner = classifyTelegramWebhookOwner({
          publicBaseUrl: normalizedPublicBaseUrl,
          webhookInfo: beforeInfo,
        })
        const checkedAt = now()

        await db
          .update(telegramBridgeConfigs)
          .set({
            lastWebhookCheckedAt: checkedAt,
            lastWebhookHost: readWebhookHost(beforeInfo),
            lastWebhookOwner: owner,
            updatedAt: checkedAt,
          })
          .where(eq(telegramBridgeConfigs.id, row.id))

        if (owner === 'unknown') {
          throw new TelegramBridgeAdminSetupError(
            'Refusing to replace unknown webhook owner.',
            {
              code: 'TELEGRAM_BRIDGE_WEBHOOK_OWNER_CONFLICT',
              statusCode: 409,
            },
          )
        }

        const webhookUrl = `${normalizedPublicBaseUrl}/telegram-bridge/${publicKey}/${webhookPathSecret}`

        await telegramClient.setWebhook({
          allowed_updates: ['message'],
          drop_pending_updates: false,
          secret_token: telegramSecretToken,
          url: webhookUrl,
        })

        const afterInfo = await telegramClient.getWebhookInfo()

        if (afterInfo.url !== webhookUrl) {
          throw new TelegramBridgeAdminSetupError(
            'Telegram webhook confirmation did not match expected URL.',
          )
        }

        const [updatedRow] = await db
          .update(telegramBridgeConfigs)
          .set({
            displayName,
            status: 'active',
            telegramBotId: botIdentity.id,
            telegramBotTokenCiphertext: encryptedToken,
            telegramBotUsername: botIdentity.username,
            telegramSecretTokenCiphertext: encryptedHeaderSecret,
            telegramWebhookPathSecretCiphertext: encryptedPathSecret,
            updatedAt: now(),
          })
          .where(eq(telegramBridgeConfigs.id, row.id))
          .returning()

        if (!updatedRow) {
          throw new TelegramBridgeAdminSetupError(
            'Telegram bridge config was not saved.',
          )
        }

        await audit({
          action: 'telegram_bridge_setup_succeeded',
          actor: admin,
          metadata: buildAuditMetadata({
            chatwootTelegramInboxId: input.chatwootTelegramInboxId,
            publicKey,
            telegramBotId: botIdentity.id,
            webhookOwner: owner,
          }),
          outcome: 'succeeded',
          requestIp,
          userAgent,
        })

        return toPublicStatus({
          row: updatedRow,
          webhookConfigured: true,
        })
      } catch (error) {
        const setupError = createFailure(error, sensitiveValues)

        await audit({
          action: 'telegram_bridge_setup_failed',
          actor: admin,
          metadata: {
            ...buildAuditMetadata({
              chatwootTelegramInboxId: input.chatwootTelegramInboxId,
            }),
            error: setupError.message,
          },
          outcome: 'failed',
          requestIp,
          userAgent,
        })

        throw setupError
      }
    },
  }
}

export type TenantTelegramBridgeSetupService = ReturnType<
  typeof createTenantTelegramBridgeSetupService
>
