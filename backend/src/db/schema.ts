import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const portalUsers = pgTable(
  'portal_users',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    fullName: text('full_name'),
    passwordHash: text('password_hash').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', {
      mode: 'date',
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('portal_users_email_unique').on(table.email)],
)

export const portalSessions = pgTable(
  'portal_sessions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => portalUsers.id, {
        onDelete: 'cascade',
      }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
    lastSeenAt: timestamp('last_seen_at', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_sessions_token_hash_unique').on(table.tokenHash),
    index('portal_sessions_user_id_idx').on(table.userId),
    index('portal_sessions_expires_at_idx').on(table.expiresAt),
  ],
)

export const portalUserContactLinks = pgTable(
  'portal_user_contact_links',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => portalUsers.id, {
        onDelete: 'cascade',
      }),
    chatwootContactId: integer('chatwoot_contact_id').notNull(),
    createdAt: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_user_contact_links_user_id_unique').on(table.userId),
    uniqueIndex('portal_user_contact_links_contact_id_unique').on(
      table.chatwootContactId,
    ),
  ],
)

export const portalUserChatwootConversations = pgTable(
  'portal_user_chatwoot_conversations',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => portalUsers.id, {
        onDelete: 'cascade',
      }),
    chatwootContactId: integer('chatwoot_contact_id').notNull(),
    chatwootConversationId: integer('chatwoot_conversation_id').notNull(),
    chatwootInboxId: integer('chatwoot_inbox_id').notNull(),
    createdAt: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_user_chatwoot_conversations_user_id_unique').on(
      table.userId,
    ),
    uniqueIndex('portal_user_chatwoot_conversations_conversation_id_unique').on(
      table.chatwootConversationId,
    ),
    index('portal_user_chatwoot_conversations_contact_id_idx').on(
      table.chatwootContactId,
    ),
  ],
)

export const portalChatMessageSends = pgTable(
  'portal_chat_message_sends',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => portalUsers.id, {
        onDelete: 'cascade',
      }),
    primaryConversationId: integer('primary_conversation_id').notNull(),
    clientMessageKey: text('client_message_key').notNull(),
    messageKind: text('message_kind').notNull(),
    payloadSha256: text('payload_sha256').notNull(),
    status: text('status').notNull().default('processing'),
    processingToken: text('processing_token'),
    attemptsCount: integer('attempts_count').notNull().default(1),
    chatwootMessageId: integer('chatwoot_message_id'),
    confirmedAt: timestamp('confirmed_at', {
      mode: 'date',
      withTimezone: true,
    }),
    failedAt: timestamp('failed_at', {
      mode: 'date',
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_chat_message_sends_scope_unique').on(
      table.userId,
      table.primaryConversationId,
      table.clientMessageKey,
    ),
    index('portal_chat_message_sends_user_id_idx').on(table.userId),
    index('portal_chat_message_sends_conversation_id_idx').on(
      table.primaryConversationId,
    ),
    index('portal_chat_message_sends_status_updated_at_idx').on(
      table.status,
      table.updatedAt,
    ),
  ],
)

export const chatwootWebhookDeliveries = pgTable(
  'chatwoot_webhook_deliveries',
  {
    id: serial('id').primaryKey(),
    deliveryKey: text('delivery_key').notNull(),
    eventName: text('event_name').notNull(),
    status: text('status').notNull(),
    payloadSha256: text('payload_sha256').notNull(),
    chatwootConversationId: integer('chatwoot_conversation_id'),
    chatwootMessageId: integer('chatwoot_message_id'),
    receivedAt: timestamp('received_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', {
      mode: 'date',
      withTimezone: true,
    }),
  },
  (table) => [
    uniqueIndex('chatwoot_webhook_deliveries_key_unique').on(table.deliveryKey),
    index('chatwoot_webhook_deliveries_conversation_id_idx').on(
      table.chatwootConversationId,
    ),
    index('chatwoot_webhook_deliveries_event_status_idx').on(
      table.eventName,
      table.status,
    ),
  ],
)

export const verificationRecords = pgTable(
  'verification_records',
  {
    id: serial('id').primaryKey(),
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
    resendNotBefore: timestamp('resend_not_before', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
    expiresAt: timestamp('expires_at', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
    lastSentAt: timestamp('last_sent_at', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
    verifiedAt: timestamp('verified_at', {
      mode: 'date',
      withTimezone: true,
    }),
    continuationTokenHash: text('continuation_token_hash'),
    continuationTokenExpiresAt: timestamp('continuation_token_expires_at', {
      mode: 'date',
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('verification_records_email_idx').on(table.email),
    index('verification_records_email_purpose_status_idx').on(
      table.email,
      table.purpose,
      table.status,
    ),
    index('verification_records_expires_at_idx').on(table.expiresAt),
    index('verification_records_portal_user_id_idx').on(table.portalUserId),
  ],
)
