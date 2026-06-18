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

import { portalTenants } from './tenantSchema.js'

const timestampWithTimezone = {
  mode: 'date',
  withTimezone: true,
} as const

export const portalLegalDocuments = pgTable(
  'portal_legal_documents',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, { onDelete: 'restrict' }),
    documentType: text('document_type').notNull(),
    status: text('status').notNull().default('active'),
    title: text('title').notNull(),
    version: text('version').notNull(),
    bodyText: text('body_text').notNull(),
    sourceFileName: text('source_file_name').notNull(),
    sourceContentType: text('source_content_type').notNull(),
    sourceByteSize: integer('source_byte_size').notNull(),
    sourceSha256: text('source_sha256').notNull(),
    activatedAt: timestamp('activated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    archivedAt: timestamp('archived_at', timestampWithTimezone),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('portal_legal_documents_tenant_type_idx').on(
      table.tenantId,
      table.documentType,
    ),
    uniqueIndex('portal_legal_documents_tenant_type_version_unique').on(
      table.tenantId,
      table.documentType,
      table.version,
    ),
    uniqueIndex('portal_legal_documents_tenant_type_active_unique')
      .on(table.tenantId, table.documentType)
      .where(sql`${table.status} = 'active'`),
    check(
      'portal_legal_documents_type_check',
      sql`${table.documentType} in ('terms', 'privacy')`,
    ),
    check(
      'portal_legal_documents_status_check',
      sql`${table.status} in ('active', 'archived')`,
    ),
    check(
      'portal_legal_documents_source_byte_size_check',
      sql`${table.sourceByteSize} > 0`,
    ),
    check(
      'portal_legal_documents_source_file_name_length_check',
      sql`length(${table.sourceFileName}) between 1 and 180`,
    ),
    check(
      'portal_legal_documents_source_content_type_length_check',
      sql`length(${table.sourceContentType}) between 1 and 120`,
    ),
    check(
      'portal_legal_documents_source_sha256_length_check',
      sql`length(${table.sourceSha256}) = 64`,
    ),
    check(
      'portal_legal_documents_body_text_not_empty_check',
      sql`length(trim(${table.bodyText})) > 0`,
    ),
  ],
)
