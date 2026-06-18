import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
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
