import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import { portalChatThreads, portalTenants, portalUsers } from './schema.js'

const timestampWithTimezone = {
  mode: 'date',
  withTimezone: true,
} as const

export const portalUserNotificationPreferences = pgTable(
  'portal_user_notification_preferences',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'restrict',
      }),
    portalUserId: integer('portal_user_id')
      .notNull()
      .references(() => portalUsers.id, {
        onDelete: 'cascade',
      }),
    newMessagesEnabled: boolean('new_messages_enabled').notNull().default(true),
    soundEnabled: boolean('sound_enabled').notNull().default(true),
    pushEnabled: boolean('push_enabled').notNull().default(false),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_user_notification_preferences_user_unique').on(
      table.tenantId,
      table.portalUserId,
    ),
    index('portal_user_notification_preferences_tenant_user_idx').on(
      table.tenantId,
      table.portalUserId,
    ),
  ],
)

export const portalChatNotificationPreferences = pgTable(
  'portal_chat_notification_preferences',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'restrict',
      }),
    portalUserId: integer('portal_user_id')
      .notNull()
      .references(() => portalUsers.id, {
        onDelete: 'cascade',
      }),
    threadId: text('thread_id').notNull(),
    newMessagesEnabledOverride: boolean('new_messages_enabled_override'),
    soundEnabledOverride: boolean('sound_enabled_override'),
    pushEnabledOverride: boolean('push_enabled_override'),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_chat_notification_preferences_thread_unique').on(
      table.tenantId,
      table.portalUserId,
      table.threadId,
    ),
    index('portal_chat_notification_preferences_tenant_user_idx').on(
      table.tenantId,
      table.portalUserId,
    ),
  ],
)

export const portalPushSubscriptions = pgTable(
  'portal_push_subscriptions',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'restrict',
      }),
    portalUserId: integer('portal_user_id')
      .notNull()
      .references(() => portalUsers.id, {
        onDelete: 'cascade',
      }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    vapidKeyId: text('vapid_key_id').notNull(),
    vapidPublicKeyFingerprint: text('vapid_public_key_fingerprint').notNull(),
    userAgent: text('user_agent'),
    status: text('status').notNull().default('active'),
    lastError: text('last_error'),
    lastErrorAt: timestamp('last_error_at', timestampWithTimezone),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_push_subscriptions_user_endpoint_unique').on(
      table.tenantId,
      table.portalUserId,
      table.endpoint,
    ),
    index('portal_push_subscriptions_tenant_user_status_idx').on(
      table.tenantId,
      table.portalUserId,
      table.status,
    ),
    index('portal_push_subscriptions_tenant_status_idx').on(
      table.tenantId,
      table.status,
    ),
    check(
      'portal_push_subscriptions_status_check',
      sql`${table.status} in ('active', 'expired', 'disabled')`,
    ),
  ],
)

export const portalPushDeliveries = pgTable(
  'portal_push_deliveries',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'restrict',
      }),
    portalUserId: integer('portal_user_id')
      .notNull()
      .references(() => portalUsers.id, {
        onDelete: 'cascade',
      }),
    portalChatThreadId: integer('portal_chat_thread_id').references(
      () => portalChatThreads.id,
      {
        onDelete: 'set null',
      },
    ),
    threadId: text('thread_id').notNull(),
    chatwootMessageId: integer('chatwoot_message_id').notNull(),
    subscriptionId: integer('subscription_id')
      .notNull()
      .references(() => portalPushSubscriptions.id, {
        onDelete: 'restrict',
      }),
    status: text('status').notNull(),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_push_deliveries_subscription_unique').on(
      table.tenantId,
      table.portalUserId,
      table.threadId,
      table.chatwootMessageId,
      table.subscriptionId,
    ),
    index('portal_push_deliveries_tenant_thread_message_idx').on(
      table.tenantId,
      table.threadId,
      table.chatwootMessageId,
    ),
    index('portal_push_deliveries_tenant_user_created_at_idx').on(
      table.tenantId,
      table.portalUserId,
      table.createdAt,
    ),
    check(
      'portal_push_deliveries_status_check',
      sql`${table.status} in ('sent', 'skipped', 'failed', 'expired')`,
    ),
  ],
)
