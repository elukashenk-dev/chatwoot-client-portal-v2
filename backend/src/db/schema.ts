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
