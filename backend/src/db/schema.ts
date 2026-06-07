import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

const timestampWithTimezone = {
  mode: 'date',
  withTimezone: true,
} as const
export const portalTenants = pgTable(
  'portal_tenants',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status').notNull().default('active'),
    primaryDomain: text('primary_domain').notNull(),
    publicBaseUrl: text('public_base_url').notNull(),
    chatwootBaseUrl: text('chatwoot_base_url').notNull(),
    chatwootAccountId: integer('chatwoot_account_id').notNull(),
    chatwootPortalInboxId: integer('chatwoot_portal_inbox_id').notNull(),
    chatwootPortalInboxIdentifier: text('chatwoot_portal_inbox_identifier'),
    chatwootApiAccessTokenCiphertext: text(
      'chatwoot_api_access_token_ciphertext',
    ).notNull(),
    chatwootAdminVerificationTokenCiphertext: text(
      'chatwoot_admin_verification_token_ciphertext',
    ),
    chatwootWebhookSecretCiphertext: text(
      'chatwoot_webhook_secret_ciphertext',
    ).notNull(),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_tenants_slug_unique').on(table.slug),
    uniqueIndex('portal_tenants_primary_domain_unique').on(table.primaryDomain),
    index('portal_tenants_status_idx').on(table.status),
    check(
      'portal_tenants_status_check',
      sql`${table.status} in ('active', 'suspended', 'provisioning', 'archived')`,
    ),
  ],
)
export const portalUsers = pgTable(
  'portal_users',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'restrict',
      }),
    email: text('email').notNull(),
    fullName: text('full_name'),
    passwordHash: text('password_hash').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', timestampWithTimezone),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_users_tenant_email_unique').on(
      table.tenantId,
      table.email,
    ),
    index('portal_users_tenant_id_idx').on(table.tenantId),
  ],
)

export const portalSessions = pgTable(
  'portal_sessions',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'restrict',
      }),
    userId: integer('user_id')
      .notNull()
      .references(() => portalUsers.id, {
        onDelete: 'cascade',
      }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', timestampWithTimezone).notNull(),
    lastSeenAt: timestamp('last_seen_at', timestampWithTimezone).notNull(),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_sessions_token_hash_unique').on(table.tokenHash),
    index('portal_sessions_tenant_user_id_idx').on(
      table.tenantId,
      table.userId,
    ),
    index('portal_sessions_expires_at_idx').on(table.expiresAt),
  ],
)

export const portalUserContactLinks = pgTable(
  'portal_user_contact_links',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'restrict',
      }),
    userId: integer('user_id')
      .notNull()
      .references(() => portalUsers.id, {
        onDelete: 'cascade',
      }),
    chatwootContactId: integer('chatwoot_contact_id').notNull(),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_user_contact_links_tenant_user_unique').on(
      table.tenantId,
      table.userId,
    ),
    uniqueIndex('portal_user_contact_links_tenant_contact_unique').on(
      table.tenantId,
      table.chatwootContactId,
    ),
  ],
)

export const portalChatThreads = pgTable(
  'portal_chat_threads',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'restrict',
      }),
    threadType: text('thread_type').notNull(),
    portalUserId: integer('portal_user_id').references(() => portalUsers.id, {
      onDelete: 'cascade',
    }),
    chatwootContactId: integer('chatwoot_contact_id').notNull(),
    chatwootInboxId: integer('chatwoot_inbox_id').notNull(),
    chatwootContactSourceId: text('chatwoot_contact_source_id'),
    chatwootConversationId: integer('chatwoot_conversation_id'),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_chat_threads_tenant_private_user_unique')
      .on(table.tenantId, table.portalUserId)
      .where(sql`${table.threadType} = 'private'`),
    uniqueIndex('portal_chat_threads_tenant_group_contact_unique')
      .on(table.tenantId, table.chatwootContactId)
      .where(sql`${table.threadType} = 'group'`),
    uniqueIndex('portal_chat_threads_tenant_conversation_unique')
      .on(table.tenantId, table.chatwootConversationId)
      .where(sql`${table.chatwootConversationId} is not null`),
    index('portal_chat_threads_tenant_contact_idx').on(
      table.tenantId,
      table.chatwootContactId,
    ),
    index('portal_chat_threads_tenant_source_id_idx')
      .on(table.tenantId, table.chatwootContactSourceId)
      .where(sql`${table.chatwootContactSourceId} is not null`),
    check(
      'portal_chat_threads_type_check',
      sql`${table.threadType} in ('private', 'group')`,
    ),
    check(
      'portal_chat_threads_private_user_check',
      sql`(${table.threadType} = 'private' and ${table.portalUserId} is not null) or (${table.threadType} = 'group' and ${table.portalUserId} is null)`,
    ),
  ],
)

export const portalChatMessageSends = pgTable(
  'portal_chat_message_sends',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'restrict',
      }),
    userId: integer('user_id')
      .notNull()
      .references(() => portalUsers.id, {
        onDelete: 'cascade',
      }),
    portalChatThreadId: integer('portal_chat_thread_id')
      .references(() => portalChatThreads.id, {
        onDelete: 'restrict',
      })
      .notNull(),
    clientMessageKey: text('client_message_key').notNull(),
    messageKind: text('message_kind').notNull(),
    payloadSha256: text('payload_sha256').notNull(),
    authorDisplayNameSnapshot: text('author_display_name_snapshot'),
    status: text('status').notNull().default('processing'),
    processingToken: text('processing_token'),
    attemptsCount: integer('attempts_count').notNull().default(1),
    chatwootMessageId: integer('chatwoot_message_id'),
    confirmedAt: timestamp('confirmed_at', timestampWithTimezone),
    failedAt: timestamp('failed_at', timestampWithTimezone),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_chat_message_sends_thread_scope_unique').on(
      table.tenantId,
      table.portalChatThreadId,
      table.userId,
      table.clientMessageKey,
    ),
    index('portal_chat_message_sends_tenant_user_id_idx').on(
      table.tenantId,
      table.userId,
    ),
    index('portal_chat_message_sends_tenant_thread_message_idx').on(
      table.tenantId,
      table.portalChatThreadId,
      table.chatwootMessageId,
    ),
    index('portal_chat_message_sends_status_updated_at_idx').on(
      table.status,
      table.updatedAt,
    ),
  ],
)

export * from './notificationSchema.js'

export const portalRateLimitBuckets = pgTable(
  'portal_rate_limit_buckets',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'cascade',
      }),
    scope: text('scope').notNull(),
    subjectKey: text('subject_key').notNull(),
    count: integer('count').notNull(),
    resetAt: timestamp('reset_at', timestampWithTimezone).notNull(),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_rate_limit_buckets_scope_unique').on(
      table.tenantId,
      table.scope,
      table.subjectKey,
    ),
    index('portal_rate_limit_buckets_reset_at_idx').on(table.resetAt),
  ],
)

export const chatwootWebhookDeliveries = pgTable(
  'chatwoot_webhook_deliveries',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'restrict',
      }),
    deliveryKey: text('delivery_key').notNull(),
    eventName: text('event_name').notNull(),
    status: text('status').notNull(),
    payloadSha256: text('payload_sha256').notNull(),
    chatwootConversationId: integer('chatwoot_conversation_id'),
    chatwootMessageId: integer('chatwoot_message_id'),
    receivedAt: timestamp('received_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', timestampWithTimezone),
  },
  (table) => [
    uniqueIndex('chatwoot_webhook_deliveries_tenant_key_unique').on(
      table.tenantId,
      table.deliveryKey,
    ),
    index('chatwoot_webhook_deliveries_tenant_conversation_id_idx').on(
      table.tenantId,
      table.chatwootConversationId,
    ),
    index('chatwoot_webhook_deliveries_tenant_event_status_idx').on(
      table.tenantId,
      table.eventName,
      table.status,
    ),
    index('chatwoot_webhook_deliveries_received_at_idx').on(table.receivedAt),
  ],
)

export const verificationRecords = pgTable(
  'verification_records',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'restrict',
      }),
    purpose: text('purpose').notNull(),
    email: text('email').notNull(),
    fullName: text('full_name'),
    chatwootContactId: integer('chatwoot_contact_id'),
    portalUserId: integer('portal_user_id').references(() => portalUsers.id, {
      onDelete: 'cascade',
    }),
    codeHash: text('code_hash').notNull(),
    status: text('status').notNull().default('pending'),
    attemptsCount: integer('attempts_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    resendCount: integer('resend_count').notNull().default(0),
    resendNotBefore: timestamp(
      'resend_not_before',
      timestampWithTimezone,
    ).notNull(),
    expiresAt: timestamp('expires_at', timestampWithTimezone).notNull(),
    lastSentAt: timestamp('last_sent_at', timestampWithTimezone).notNull(),
    verifiedAt: timestamp('verified_at', timestampWithTimezone),
    continuationTokenHash: text('continuation_token_hash'),
    continuationTokenExpiresAt: timestamp(
      'continuation_token_expires_at',
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
    index('verification_records_tenant_email_idx').on(
      table.tenantId,
      table.email,
    ),
    index('verification_records_tenant_email_purpose_status_idx').on(
      table.tenantId,
      table.email,
      table.purpose,
      table.status,
    ),
    index('verification_records_expires_at_idx').on(table.expiresAt),
    index('verification_records_tenant_portal_user_id_idx').on(
      table.tenantId,
      table.portalUserId,
    ),
  ],
)

export const portalAdminLoginChallenges = pgTable(
  'portal_admin_login_challenges',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'restrict',
      }),
    email: text('email').notNull(),
    chatwootAgentId: integer('chatwoot_agent_id').notNull(),
    role: text('role').notNull(),
    codeHash: text('code_hash').notNull(),
    status: text('status').notNull().default('pending'),
    attemptsCount: integer('attempts_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    resendCount: integer('resend_count').notNull().default(0),
    resendNotBefore: timestamp(
      'resend_not_before',
      timestampWithTimezone,
    ).notNull(),
    expiresAt: timestamp('expires_at', timestampWithTimezone).notNull(),
    lastSentAt: timestamp('last_sent_at', timestampWithTimezone).notNull(),
    verifiedAt: timestamp('verified_at', timestampWithTimezone),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('portal_admin_login_challenges_tenant_email_status_idx').on(
      table.tenantId,
      table.email,
      table.status,
    ),
    index('portal_admin_login_challenges_expires_at_idx').on(table.expiresAt),
  ],
)

export const portalAdminSessions = pgTable(
  'portal_admin_sessions',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'restrict',
      }),
    tokenHash: text('token_hash').notNull(),
    email: text('email').notNull(),
    chatwootAgentId: integer('chatwoot_agent_id').notNull(),
    role: text('role').notNull(),
    expiresAt: timestamp('expires_at', timestampWithTimezone).notNull(),
    lastSeenAt: timestamp('last_seen_at', timestampWithTimezone).notNull(),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_admin_sessions_token_hash_unique').on(table.tokenHash),
    index('portal_admin_sessions_tenant_email_idx').on(
      table.tenantId,
      table.email,
    ),
    index('portal_admin_sessions_expires_at_idx').on(table.expiresAt),
  ],
)

export const portalAdminAuditEvents = pgTable(
  'portal_admin_audit_events',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'restrict',
      }),
    actorEmail: text('actor_email'),
    actorChatwootAgentId: integer('actor_chatwoot_agent_id'),
    action: text('action').notNull(),
    outcome: text('outcome').notNull(),
    subjectEmail: text('subject_email'),
    requestIp: text('request_ip'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('portal_admin_audit_events_tenant_created_at_idx').on(
      table.tenantId,
      table.createdAt,
    ),
    index('portal_admin_audit_events_tenant_action_idx').on(
      table.tenantId,
      table.action,
    ),
  ],
)
