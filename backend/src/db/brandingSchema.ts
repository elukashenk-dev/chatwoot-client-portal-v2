import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import { portalTenants } from './schema.js'

const timestampWithTimezone = {
  mode: 'date',
  withTimezone: true,
} as const

export const portalBrandingAssets = pgTable(
  'portal_branding_assets',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'restrict',
      }),
    kind: text('kind').notNull(),
    objectKey: text('object_key').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    checksumSha256: text('checksum_sha256').notNull(),
    contentHash: text('content_hash').notNull(),
    originalFilename: text('original_filename'),
    width: integer('width'),
    height: integer('height'),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_branding_assets_tenant_id_unique').on(
      table.tenantId,
      table.id,
    ),
    uniqueIndex('portal_branding_assets_object_key_unique').on(table.objectKey),
    index('portal_branding_assets_tenant_kind_idx').on(
      table.tenantId,
      table.kind,
    ),
    check(
      'portal_branding_assets_kind_check',
      sql`${table.kind} in ('logo', 'pwa_icon', 'auth_header_image', 'auth_footer_image', 'auth_background_image', 'chat_background_image', 'chat_header_background_image')`,
    ),
    check('portal_branding_assets_byte_size_check', sql`${table.byteSize} > 0`),
  ],
)

export const portalBrandingSettings = pgTable(
  'portal_branding_settings',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'restrict',
      }),
    portalName: text('portal_name'),
    supportLabel: text('support_label'),
    primaryColor: text('primary_color'),
    accentColor: text('accent_color'),
    authBackgroundColor: text('auth_background_color'),
    authTextColor: text('auth_text_color'),
    authMutedTextColor: text('auth_muted_text_color'),
    chatBackgroundColor: text('chat_background_color'),
    chatTextColor: text('chat_text_color'),
    chatMutedTextColor: text('chat_muted_text_color'),
    chatHeaderBackgroundColor: text('chat_header_background_color'),
    chatHeaderTextColor: text('chat_header_text_color'),
    authTitle: text('auth_title'),
    authSubtitle: text('auth_subtitle'),
    chatEmptyTitle: text('chat_empty_title'),
    chatEmptyBody: text('chat_empty_body'),
    chatInfoTitle: text('chat_info_title'),
    logoAssetId: integer('logo_asset_id'),
    authHeaderImageAssetId: integer('auth_header_image_asset_id'),
    authFooterImageAssetId: integer('auth_footer_image_asset_id'),
    authBackgroundImageAssetId: integer('auth_background_image_asset_id'),
    chatBackgroundImageAssetId: integer('chat_background_image_asset_id'),
    chatHeaderBackgroundImageAssetId: integer(
      'chat_header_background_image_asset_id',
    ),
    pwaIconAssetId: integer('pwa_icon_asset_id'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_branding_settings_tenant_unique').on(table.tenantId),
    index('portal_branding_settings_updated_at_idx').on(table.updatedAt),
    foreignKey({
      columns: [table.tenantId, table.logoAssetId],
      foreignColumns: [portalBrandingAssets.tenantId, portalBrandingAssets.id],
      name: 'portal_branding_settings_logo_asset_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.authHeaderImageAssetId],
      foreignColumns: [portalBrandingAssets.tenantId, portalBrandingAssets.id],
      name: 'portal_branding_settings_auth_header_asset_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.authFooterImageAssetId],
      foreignColumns: [portalBrandingAssets.tenantId, portalBrandingAssets.id],
      name: 'portal_branding_settings_auth_footer_asset_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.authBackgroundImageAssetId],
      foreignColumns: [portalBrandingAssets.tenantId, portalBrandingAssets.id],
      name: 'portal_branding_settings_auth_background_asset_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.chatBackgroundImageAssetId],
      foreignColumns: [portalBrandingAssets.tenantId, portalBrandingAssets.id],
      name: 'portal_branding_settings_chat_background_asset_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.chatHeaderBackgroundImageAssetId],
      foreignColumns: [portalBrandingAssets.tenantId, portalBrandingAssets.id],
      name: 'portal_branding_settings_chat_header_background_asset_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.pwaIconAssetId],
      foreignColumns: [portalBrandingAssets.tenantId, portalBrandingAssets.id],
      name: 'portal_branding_settings_pwa_icon_asset_tenant_fk',
    }).onDelete('restrict'),
    check('portal_branding_settings_version_check', sql`${table.version} > 0`),
  ],
)
