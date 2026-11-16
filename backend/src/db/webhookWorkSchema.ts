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
import { portalTenants, portalUsers } from './schema.js'

const tz = { mode: 'date', withTimezone: true } as const

export const portalWebhookWork = pgTable(
  'portal_webhook_work',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, { onDelete: 'restrict' }),
    workKey: text('work_key').notNull(),
    eventName: text('event_name').notNull(),
    chatwootBaseUrl: text('chatwoot_base_url').notNull(),
    chatwootAccountId: integer('chatwoot_account_id').notNull(),
    chatwootInboxId: integer('chatwoot_inbox_id').notNull(),
    chatwootConversationId: integer('chatwoot_conversation_id').notNull(),
    chatwootMessageId: integer('chatwoot_message_id'),
    portalChatThreadId: integer('portal_chat_thread_id').notNull(),
    generation: integer('generation').notNull().default(1),
    status: text('status').notNull().default('pending'),
    unreadCompleted: boolean('unread_completed').notNull().default(false),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', tz).notNull().defaultNow(),
    leaseToken: text('lease_token'),
    leaseUntil: timestamp('lease_until', tz),
    receivedAt: timestamp('received_at', tz).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('portal_webhook_work_key_unique').on(t.tenantId, t.workKey),
    index('portal_webhook_work_claim_idx')
      .on(t.availableAt, t.id)
      .where(sql`${t.status} = 'pending'`),
    index('portal_webhook_work_backlog_idx')
      .on(t.tenantId, t.id)
      .where(sql`${t.status} <> 'done'`),
    index('portal_webhook_work_cleanup_idx')
      .on(t.updatedAt, t.id)
      .where(sql`${t.status} = 'done'`),
    check(
      'portal_webhook_work_status_check',
      sql`${t.status} in ('pending', 'done', 'exhausted')`,
    ),
    check(
      'portal_webhook_work_event_check',
      sql`${t.eventName} in ('message_created', 'message_updated')`,
    ),
  ],
)

export const portalChatReadWatermarks = pgTable(
  'portal_chat_read_watermarks',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, { onDelete: 'restrict' }),
    portalUserId: integer('portal_user_id')
      .notNull()
      .references(() => portalUsers.id, { onDelete: 'cascade' }),
    threadId: text('thread_id').notNull(),
    sourceKey: text('source_key').notNull(),
    lastReadMessageId: integer('last_read_message_id').notNull().default(0),
  },
  (t) => [
    uniqueIndex('portal_chat_read_watermarks_thread_unique').on(
      t.tenantId,
      t.portalUserId,
      t.threadId,
      t.sourceKey,
    ),
  ],
)
