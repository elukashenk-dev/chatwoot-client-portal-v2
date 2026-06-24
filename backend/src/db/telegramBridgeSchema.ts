import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { portalTenants } from './tenantSchema.js'

const timestampWithTimezone = {
  mode: 'date',
  withTimezone: true,
} as const

export const telegramBridgeConfigs = pgTable(
  'telegram_bridge_configs',
  {
    id: uuid('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'restrict',
      }),
    publicKey: text('public_key').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status').notNull(),
    chatwootTelegramInboxId: integer('chatwoot_telegram_inbox_id').notNull(),
    telegramBotId: text('telegram_bot_id').notNull(),
    telegramBotUsername: text('telegram_bot_username').notNull(),
    telegramBotTokenCiphertext: text(
      'telegram_bot_token_ciphertext',
    ).notNull(),
    telegramWebhookPathSecretCiphertext: text(
      'telegram_webhook_path_secret_ciphertext',
    ).notNull(),
    telegramSecretTokenCiphertext: text(
      'telegram_secret_token_ciphertext',
    ).notNull(),
    lastWebhookOwner: text('last_webhook_owner'),
    lastWebhookHost: text('last_webhook_host'),
    lastWebhookCheckedAt: timestamp(
      'last_webhook_checked_at',
      timestampWithTimezone,
    ),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('telegram_bridge_configs_public_key_unique').on(
      table.publicKey,
    ),
    uniqueIndex('telegram_bridge_configs_tenant_inbox_unique').on(
      table.tenantId,
      table.chatwootTelegramInboxId,
    ),
    uniqueIndex('telegram_bridge_configs_active_bot_id_unique')
      .on(table.telegramBotId)
      .where(sql`${table.status} <> 'archived'`),
    index('telegram_bridge_configs_tenant_status_idx').on(
      table.tenantId,
      table.status,
    ),
    check(
      'telegram_bridge_configs_status_check',
      sql`${table.status} in ('active', 'disabled', 'rotating', 'archived')`,
    ),
    check(
      'telegram_bridge_configs_last_webhook_owner_check',
      sql`${table.lastWebhookOwner} is null or ${table.lastWebhookOwner} in ('empty', 'chatwoot-native', 'telegram-bridge', 'unknown')`,
    ),
  ],
)

export const telegramBridgeDeliveries = pgTable(
  'telegram_bridge_deliveries',
  {
    id: uuid('id').primaryKey(),
    telegramBridgeConfigId: uuid('telegram_bridge_config_id')
      .notNull()
      .references(() => telegramBridgeConfigs.id, {
        onDelete: 'restrict',
      }),
    updateId: bigint('update_id', { mode: 'number' }).notNull(),
    status: text('status').notNull(),
    telegramChatId: text('telegram_chat_id'),
    telegramFromId: text('telegram_from_id'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    attemptCount: integer('attempt_count').notNull().default(1),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', timestampWithTimezone),
  },
  (table) => [
    uniqueIndex('telegram_bridge_deliveries_config_update_unique').on(
      table.telegramBridgeConfigId,
      table.updateId,
    ),
    index('telegram_bridge_deliveries_config_status_idx').on(
      table.telegramBridgeConfigId,
      table.status,
    ),
    index('telegram_bridge_deliveries_updated_at_idx').on(table.updatedAt),
    check(
      'telegram_bridge_deliveries_status_check',
      sql`${table.status} in ('processing', 'processed', 'failed')`,
    ),
    check(
      'telegram_bridge_deliveries_error_message_length_check',
      sql`${table.errorMessage} is null or length(${table.errorMessage}) <= 1000`,
    ),
  ],
)
