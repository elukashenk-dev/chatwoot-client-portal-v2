import { sql } from 'drizzle-orm'
import {
  check,
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

export const tenantProvisioningRuns = pgTable(
  'portal_tenant_provisioning_runs',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull(),
    domainMode: text('domain_mode').notNull(),
    displayName: text('display_name').notNull(),
    primaryDomain: text('primary_domain').notNull(),
    providerSubdomain: text('provider_subdomain'),
    providerTenantDomainSuffix: text('provider_tenant_domain_suffix'),
    publicBaseUrl: text('public_base_url').notNull(),
    chatwootBaseUrl: text('chatwoot_base_url').notNull(),
    clientAdminEmail: text('client_admin_email').notNull(),
    clientAdminName: text('client_admin_name').notNull(),
    status: text('status').notNull().default('pending'),
    chatwootAccountId: integer('chatwoot_account_id'),
    clientAdminUserId: integer('client_admin_user_id'),
    runtimeServiceUserId: integer('runtime_service_user_id'),
    adminVerificationServiceUserId: integer(
      'admin_verification_service_user_id',
    ),
    chatwootPortalInboxId: integer('chatwoot_portal_inbox_id'),
    lastError: text('last_error'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', timestampWithTimezone),
  },
  (table) => [
    uniqueIndex('portal_tenant_provisioning_runs_slug_idx').on(table.slug),
    uniqueIndex('portal_tenant_provisioning_runs_primary_domain_idx').on(
      table.primaryDomain,
    ),
    check(
      'portal_tenant_provisioning_runs_status_check',
      sql`${table.status} in ('pending', 'creating_chatwoot_account', 'creating_client_admin', 'creating_runtime_user', 'creating_admin_verification_user', 'creating_portal_inbox', 'creating_portal_tenant', 'verifying', 'completed', 'failed')`,
    ),
    check(
      'portal_tenant_provisioning_runs_domain_mode_check',
      sql`${table.domainMode} in ('custom_domain', 'provider_subdomain')`,
    ),
    check(
      'portal_tenant_provisioning_runs_domain_fields_check',
      sql`(${table.domainMode} = 'custom_domain' and ${table.providerSubdomain} is null and ${table.providerTenantDomainSuffix} is null) or (${table.domainMode} = 'provider_subdomain' and ${table.providerSubdomain} is not null and ${table.providerTenantDomainSuffix} is not null and ${table.providerSubdomain} = ${table.slug})`,
    ),
  ],
)

export type TenantProvisioningRun = typeof tenantProvisioningRuns.$inferSelect
