# MT-9D Branding Settings Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-owned branding settings persistence, public/admin API contracts, audit events, and the first admin UI data wiring without implementing binary asset upload.

**Architecture:** Portal backend remains the only authority. Public browser reads receive a safe branding read model without secrets or object keys. Tenant admin writes require the existing admin session cookie, write only the current tenant, validate controlled tokens, and emit tenant-scoped audit events. Asset binary upload is out of this slice; this slice creates the metadata/object-key contract needed by the later upload slice.

**Tech Stack:** Fastify, Drizzle/Postgres, Zod, Vitest/PGlite, React 19, React Router 7, Testing Library, Playwright, Tailwind CSS.

## Current Implementation Status

This plan was executed and then tightened by review findings. Stable source of
truth is the code plus `docs/architecture/overview.md` and
`docs/roadmap/work-log.md`.

Final implementation corrections compared with some older snippets below:

- branding asset references are tenant-owned through composite `(tenant_id,
asset_id)` constraints and repository slot-kind validation;
- public asset metadata does not expose `originalFilename`, `objectKey`,
  checksums or storage keys;
- `GET /api/admin/branding` requires a valid tenant admin session but does not
  require an `Origin` header; `PATCH /api/admin/branding` still requires the
  tenant origin guard;
- empty effective admin patches return controlled `400
BRANDING_SETTINGS_EMPTY`;
- admin UI disables editable fields while saving and shows `Настройки
сохранены.` after a successful save.

---

## Scope Boundaries

In scope:

- `portal_branding_settings` table, one row per tenant.
- `portal_branding_assets` metadata table with tenant-owned object-storage metadata.
- Public `GET /api/branding`.
- Admin `GET /api/admin/branding` and `PATCH /api/admin/branding`.
- Tenant admin audit events for branding reads/writes.
- Frontend admin client and `/admin/branding` state wiring.
- A preview boundary component that consumes branding data, but does not pretend asset upload works.

Out of scope for this slice:

- Binary upload, replace, delete, image transform, S3/MinIO client implementation.
- Applying branding globally to every customer portal component.
- Production object storage provisioning.
- Platform-admin tenant provisioning UI.

## File Structure

- Modify: `backend/src/db/schema.ts`
  Add `portalBrandingAssets` and `portalBrandingSettings`.
- Add: `backend/drizzle/0010_branding_settings_foundation.sql`
  SQL migration for the two new tables, indexes, and checks.
- Modify: `backend/drizzle/meta/_journal.json`
  Append migration entry `0010_branding_settings_foundation`.
- Add: `backend/src/modules/branding/brandingDefaults.ts`
  Default safe branding tokens and fallback copy.
- Add: `backend/src/modules/branding/brandingValidation.ts`
  Zod schemas and normalizers for admin patch input.
- Add: `backend/src/modules/branding/brandingAssets.ts`
  Asset kinds, public asset metadata shape, and backend-controlled URL builder.
- Add: `backend/src/modules/branding/repository.ts`
  Tenant-scoped persistence reads/upserts.
- Add: `backend/src/modules/branding/service.ts`
  Public read model, admin read model, update orchestration, audit calls.
- Add: `backend/src/modules/branding/routes.ts`
  Public/admin Fastify routes.
- Add: `backend/src/modules/tenant-admin/adminSessionGuard.ts`
  Shared helper for routes that require admin session.
- Modify: `backend/src/modules/tenant-admin/adminAuthRoutes.ts`
  Reuse `adminSessionGuard` for `/api/admin/auth/me`.
- Modify: `backend/src/app.ts`
  Wire branding repository/service/routes.
- Add: `backend/src/modules/branding/repository.test.ts`
  Tenant isolation and upsert tests.
- Add: `backend/src/modules/branding/service.test.ts`
  Validation, public read model, audit and asset URL safety tests.
- Add: `backend/src/app-branding.integration.test.ts`
  Route-level public/admin/cross-tenant behavior.
- Add: `frontend/src/features/admin-branding/api/adminBrandingClient.ts`
  Admin branding API client.
- Add: `frontend/src/features/admin-branding/api/adminBrandingClient.test.ts`
  Client error and payload tests.
- Add: `frontend/src/features/admin-branding/lib/brandingState.ts`
  Frontend types/defaults derived from backend response.
- Add: `frontend/src/features/admin-branding/components/AdminBrandingForm.tsx`
  First settings form for text/color fields.
- Add: `frontend/src/features/admin-branding/components/BrandingPreviewPane.tsx`
  Preview boundary fed by saved/draft branding state.
- Modify: `frontend/src/features/admin-shell/pages/AdminBrandingPage.tsx`
  Load/save admin branding settings and pass state to form/preview.
- Modify: `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`
  Cover loading, enabled controls, save, errors and preview state.
- Add: `tests/e2e/admin-branding-settings.spec.ts`
  Browser smoke for authenticated admin branding read/update with mocked backend.
- Modify: `docs/roadmap/work-log.md`
  Update only after implementation/review/checks are complete.
- Modify: `docs/architecture/overview.md`
  Add stable baseline notes only after the slice is accepted.

---

## Task 1: Add Branding Schema And Migration

**Files:**

- Modify: `backend/src/db/schema.ts`
- Add: `backend/drizzle/0010_branding_settings_foundation.sql`
- Modify: `backend/drizzle/meta/_journal.json`

- [ ] **Step 1: Add failing repository test imports**

Create `backend/src/modules/branding/repository.test.ts` with this first red test:

```ts
import { describe, expect, it } from 'vitest'

import { createTestDatabase } from '../../test/createTestDatabase.js'
import { createTenantsRepository } from '../tenants/repository.js'
import { encryptTenantSecret } from '../tenants/secrets.js'
import { createBrandingRepository } from './repository.js'

const tenantSecretKey = Buffer.alloc(32, 12)

async function createTenant(
  repository: ReturnType<typeof createTenantsRepository>,
  slug: string,
) {
  return repository.createTenant({
    chatwootAccountId: slug === 'alpha' ? 3 : 4,
    chatwootApiAccessTokenCiphertext: encryptTenantSecret(
      `${slug}-runtime-token`,
      tenantSecretKey,
    ),
    chatwootBaseUrl: 'https://chatwoot.example.test',
    chatwootPortalInboxId: slug === 'alpha' ? 6 : 7,
    chatwootWebhookSecretCiphertext: encryptTenantSecret(
      `${slug}-webhook-secret`,
      tenantSecretKey,
    ),
    displayName: slug === 'alpha' ? 'Альфа' : 'Бета',
    primaryDomain: `${slug}.example.test`,
    publicBaseUrl: `https://${slug}.example.test`,
    slug,
  })
}

describe('createBrandingRepository', () => {
  it('returns null settings for a tenant with no branding row', async () => {
    const database = await createTestDatabase()

    try {
      const tenantsRepository = createTenantsRepository(database.db)
      const tenant = await createTenant(tenantsRepository, 'alpha')
      const brandingRepository = createBrandingRepository(database.db, {
        tenantId: tenant.id,
      })

      await expect(brandingRepository.findSettings()).resolves.toBeNull()
    } finally {
      await database.close()
    }
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/branding/repository.test.ts --no-file-parallelism --reporter verbose
```

Expected: fail because `backend/src/modules/branding/repository.ts` does not exist.

- [ ] **Step 3: Add Drizzle tables**

In `backend/src/db/schema.ts`, add these exports after `portalTenants` and before `portalUsers`:

```ts
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
    chatBackgroundColor: text('chat_background_color'),
    chatHeaderBackgroundColor: text('chat_header_background_color'),
    authTitle: text('auth_title'),
    authSubtitle: text('auth_subtitle'),
    chatEmptyTitle: text('chat_empty_title'),
    chatEmptyBody: text('chat_empty_body'),
    chatInfoTitle: text('chat_info_title'),
    logoAssetId: integer('logo_asset_id').references(
      () => portalBrandingAssets.id,
      { onDelete: 'set null' },
    ),
    authHeaderImageAssetId: integer('auth_header_image_asset_id').references(
      () => portalBrandingAssets.id,
      { onDelete: 'set null' },
    ),
    authFooterImageAssetId: integer('auth_footer_image_asset_id').references(
      () => portalBrandingAssets.id,
      { onDelete: 'set null' },
    ),
    authBackgroundImageAssetId: integer(
      'auth_background_image_asset_id',
    ).references(() => portalBrandingAssets.id, { onDelete: 'set null' }),
    chatBackgroundImageAssetId: integer(
      'chat_background_image_asset_id',
    ).references(() => portalBrandingAssets.id, { onDelete: 'set null' }),
    chatHeaderBackgroundImageAssetId: integer(
      'chat_header_background_image_asset_id',
    ).references(() => portalBrandingAssets.id, { onDelete: 'set null' }),
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
    check('portal_branding_settings_version_check', sql`${table.version} > 0`),
  ],
)
```

- [ ] **Step 4: Add SQL migration**

Create `backend/drizzle/0010_branding_settings_foundation.sql`:

```sql
CREATE TABLE "portal_branding_assets" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL,
  "kind" text NOT NULL,
  "object_key" text NOT NULL,
  "content_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "checksum_sha256" text NOT NULL,
  "content_hash" text NOT NULL,
  "original_filename" text,
  "width" integer,
  "height" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "portal_branding_assets_kind_check" CHECK ("portal_branding_assets"."kind" in ('logo', 'pwa_icon', 'auth_header_image', 'auth_footer_image', 'auth_background_image', 'chat_background_image', 'chat_header_background_image')),
  CONSTRAINT "portal_branding_assets_byte_size_check" CHECK ("portal_branding_assets"."byte_size" > 0)
);

CREATE TABLE "portal_branding_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL,
  "portal_name" text,
  "support_label" text,
  "primary_color" text,
  "accent_color" text,
  "auth_background_color" text,
  "chat_background_color" text,
  "chat_header_background_color" text,
  "auth_title" text,
  "auth_subtitle" text,
  "chat_empty_title" text,
  "chat_empty_body" text,
  "chat_info_title" text,
  "logo_asset_id" integer,
  "auth_header_image_asset_id" integer,
  "auth_footer_image_asset_id" integer,
  "auth_background_image_asset_id" integer,
  "chat_background_image_asset_id" integer,
  "chat_header_background_image_asset_id" integer,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "portal_branding_settings_version_check" CHECK ("portal_branding_settings"."version" > 0)
);

ALTER TABLE "portal_branding_assets" ADD CONSTRAINT "portal_branding_assets_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_tenant_id_portal_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."portal_tenants"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_logo_asset_id_portal_branding_assets_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."portal_branding_assets"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_auth_header_image_asset_id_portal_branding_assets_id_fk" FOREIGN KEY ("auth_header_image_asset_id") REFERENCES "public"."portal_branding_assets"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_auth_footer_image_asset_id_portal_branding_assets_id_fk" FOREIGN KEY ("auth_footer_image_asset_id") REFERENCES "public"."portal_branding_assets"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_auth_background_image_asset_id_portal_branding_assets_id_fk" FOREIGN KEY ("auth_background_image_asset_id") REFERENCES "public"."portal_branding_assets"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_chat_background_image_asset_id_portal_branding_assets_id_fk" FOREIGN KEY ("chat_background_image_asset_id") REFERENCES "public"."portal_branding_assets"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "portal_branding_settings" ADD CONSTRAINT "portal_branding_settings_chat_header_background_image_asset_id_portal_branding_assets_id_fk" FOREIGN KEY ("chat_header_background_image_asset_id") REFERENCES "public"."portal_branding_assets"("id") ON DELETE set null ON UPDATE no action;
CREATE UNIQUE INDEX "portal_branding_assets_object_key_unique" ON "portal_branding_assets" USING btree ("object_key");
CREATE INDEX "portal_branding_assets_tenant_kind_idx" ON "portal_branding_assets" USING btree ("tenant_id","kind");
CREATE UNIQUE INDEX "portal_branding_settings_tenant_unique" ON "portal_branding_settings" USING btree ("tenant_id");
CREATE INDEX "portal_branding_settings_updated_at_idx" ON "portal_branding_settings" USING btree ("updated_at");
```

- [ ] **Step 5: Append migration journal entry**

Add this object to `backend/drizzle/meta/_journal.json` after index `9`:

```json
{
  "idx": 10,
  "version": "7",
  "when": 1780840000000,
  "tag": "0010_branding_settings_foundation",
  "breakpoints": true
}
```

- [ ] **Step 6: Run schema/repository test again**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/branding/repository.test.ts --no-file-parallelism --reporter verbose
```

Expected: still fail because repository is not implemented yet, but table imports compile.

---

## Task 2: Implement Branding Repository

**Files:**

- Add: `backend/src/modules/branding/repository.ts`
- Modify: `backend/src/modules/branding/repository.test.ts`

- [ ] **Step 1: Extend repository tests for upsert and tenant isolation**

Append these tests to `backend/src/modules/branding/repository.test.ts`:

```ts
it('upserts settings for only the current tenant', async () => {
  const database = await createTestDatabase()

  try {
    const tenantsRepository = createTenantsRepository(database.db)
    const tenantA = await createTenant(tenantsRepository, 'alpha')
    const tenantB = await createTenant(tenantsRepository, 'beta')
    const repositoryA = createBrandingRepository(database.db, {
      tenantId: tenantA.id,
    })
    const repositoryB = createBrandingRepository(database.db, {
      tenantId: tenantB.id,
    })

    await repositoryA.upsertSettings({
      accentColor: '#4676b4',
      authBackgroundColor: '#f3f7fc',
      authSubtitle: 'Для защищенной переписки',
      authTitle: 'Вход в личный кабинет',
      chatBackgroundColor: '#ffffff',
      chatEmptyBody: 'Напишите нам, когда будет удобно.',
      chatEmptyTitle: 'Мы на связи',
      chatHeaderBackgroundColor: '#112540',
      chatInfoTitle: 'Информация о чате',
      portalName: 'Портал Альфа',
      primaryColor: '#112540',
      supportLabel: 'Поддержка Альфа',
    })

    await expect(repositoryA.findSettings()).resolves.toMatchObject({
      portalName: 'Портал Альфа',
      supportLabel: 'Поддержка Альфа',
      version: 1,
    })
    await expect(repositoryB.findSettings()).resolves.toBeNull()
  } finally {
    await database.close()
  }
})

it('returns active asset metadata only inside the tenant scope', async () => {
  const database = await createTestDatabase()

  try {
    const tenantsRepository = createTenantsRepository(database.db)
    const tenantA = await createTenant(tenantsRepository, 'alpha')
    const tenantB = await createTenant(tenantsRepository, 'beta')
    const repositoryA = createBrandingRepository(database.db, {
      tenantId: tenantA.id,
    })
    const repositoryB = createBrandingRepository(database.db, {
      tenantId: tenantB.id,
    })
    const asset = await repositoryA.createAssetMetadata({
      byteSize: 1234,
      checksumSha256: 'a'.repeat(64),
      contentHash: 'asset-hash-a',
      contentType: 'image/png',
      height: 128,
      kind: 'logo',
      objectKey: `tenants/${tenantA.id}/branding/logo/asset-hash-a`,
      originalFilename: 'logo.png',
      width: 128,
    })

    await repositoryA.upsertSettings({
      logoAssetId: asset.id,
      portalName: 'Портал Альфа',
    })

    await expect(repositoryA.findActiveAssetMetadata()).resolves.toEqual(
      expect.objectContaining({
        logo: expect.objectContaining({
          id: asset.id,
          kind: 'logo',
          publicUrl: `/api/branding/assets/${asset.id}?v=asset-hash-a`,
        }),
      }),
    )
    await expect(repositoryB.findActiveAssetMetadata()).resolves.toEqual({})
  } finally {
    await database.close()
  }
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/branding/repository.test.ts --no-file-parallelism --reporter verbose
```

Expected: fail because repository functions do not exist.

- [ ] **Step 3: Implement repository**

Create `backend/src/modules/branding/repository.ts`:

```ts
import { and, eq, inArray, sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import {
  portalBrandingAssets,
  portalBrandingSettings,
} from '../../db/schema.js'
import {
  brandingAssetKinds,
  createPublicBrandingAssetUrl,
  type BrandingAssetKind,
  type PublicBrandingAssetMap,
} from './brandingAssets.js'

type CreateBrandingRepositoryOptions = {
  tenantId: number
}

export type BrandingSettingsPatch = Partial<{
  accentColor: string | null
  authBackgroundColor: string | null
  authBackgroundImageAssetId: number | null
  authFooterImageAssetId: number | null
  authHeaderImageAssetId: number | null
  authSubtitle: string | null
  authTitle: string | null
  chatBackgroundColor: string | null
  chatBackgroundImageAssetId: number | null
  chatEmptyBody: string | null
  chatEmptyTitle: string | null
  chatHeaderBackgroundColor: string | null
  chatHeaderBackgroundImageAssetId: number | null
  chatInfoTitle: string | null
  logoAssetId: number | null
  portalName: string | null
  primaryColor: string | null
  supportLabel: string | null
}>

export type CreateBrandingAssetMetadataInput = {
  byteSize: number
  checksumSha256: string
  contentHash: string
  contentType: string
  height?: number | null
  kind: BrandingAssetKind
  objectKey: string
  originalFilename?: string | null
  width?: number | null
}

const settingsSelection = {
  accentColor: portalBrandingSettings.accentColor,
  authBackgroundColor: portalBrandingSettings.authBackgroundColor,
  authBackgroundImageAssetId: portalBrandingSettings.authBackgroundImageAssetId,
  authFooterImageAssetId: portalBrandingSettings.authFooterImageAssetId,
  authHeaderImageAssetId: portalBrandingSettings.authHeaderImageAssetId,
  authSubtitle: portalBrandingSettings.authSubtitle,
  authTitle: portalBrandingSettings.authTitle,
  chatBackgroundColor: portalBrandingSettings.chatBackgroundColor,
  chatBackgroundImageAssetId: portalBrandingSettings.chatBackgroundImageAssetId,
  chatEmptyBody: portalBrandingSettings.chatEmptyBody,
  chatEmptyTitle: portalBrandingSettings.chatEmptyTitle,
  chatHeaderBackgroundColor: portalBrandingSettings.chatHeaderBackgroundColor,
  chatHeaderBackgroundImageAssetId:
    portalBrandingSettings.chatHeaderBackgroundImageAssetId,
  chatInfoTitle: portalBrandingSettings.chatInfoTitle,
  logoAssetId: portalBrandingSettings.logoAssetId,
  portalName: portalBrandingSettings.portalName,
  primaryColor: portalBrandingSettings.primaryColor,
  supportLabel: portalBrandingSettings.supportLabel,
  updatedAt: portalBrandingSettings.updatedAt,
  version: portalBrandingSettings.version,
}

function normalizeNullableText(value: string | null | undefined) {
  if (value === undefined) {
    return undefined
  }

  if (value === null) {
    return null
  }

  return value.trim() || null
}

function normalizeAssetId(value: number | null | undefined) {
  if (value === undefined) {
    return undefined
  }

  return value
}

function normalizeSettingsPatch(input: BrandingSettingsPatch) {
  return {
    accentColor: normalizeNullableText(input.accentColor),
    authBackgroundColor: normalizeNullableText(input.authBackgroundColor),
    authBackgroundImageAssetId: normalizeAssetId(
      input.authBackgroundImageAssetId,
    ),
    authFooterImageAssetId: normalizeAssetId(input.authFooterImageAssetId),
    authHeaderImageAssetId: normalizeAssetId(input.authHeaderImageAssetId),
    authSubtitle: normalizeNullableText(input.authSubtitle),
    authTitle: normalizeNullableText(input.authTitle),
    chatBackgroundColor: normalizeNullableText(input.chatBackgroundColor),
    chatBackgroundImageAssetId: normalizeAssetId(
      input.chatBackgroundImageAssetId,
    ),
    chatEmptyBody: normalizeNullableText(input.chatEmptyBody),
    chatEmptyTitle: normalizeNullableText(input.chatEmptyTitle),
    chatHeaderBackgroundColor: normalizeNullableText(
      input.chatHeaderBackgroundColor,
    ),
    chatHeaderBackgroundImageAssetId: normalizeAssetId(
      input.chatHeaderBackgroundImageAssetId,
    ),
    chatInfoTitle: normalizeNullableText(input.chatInfoTitle),
    logoAssetId: normalizeAssetId(input.logoAssetId),
    portalName: normalizeNullableText(input.portalName),
    primaryColor: normalizeNullableText(input.primaryColor),
    supportLabel: normalizeNullableText(input.supportLabel),
  }
}

export function createBrandingRepository(
  db: AppDatabase,
  { tenantId }: CreateBrandingRepositoryOptions,
) {
  return {
    async findSettings() {
      const [settings] = await db
        .select(settingsSelection)
        .from(portalBrandingSettings)
        .where(eq(portalBrandingSettings.tenantId, tenantId))
        .limit(1)

      return settings ?? null
    },

    async upsertSettings(input: BrandingSettingsPatch) {
      const normalizedInput = normalizeSettingsPatch(input)
      const now = new Date()
      const [settings] = await db
        .insert(portalBrandingSettings)
        .values({
          ...normalizedInput,
          tenantId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          set: {
            ...normalizedInput,
            updatedAt: now,
            version: sql`${portalBrandingSettings.version} + 1`,
          },
          target: portalBrandingSettings.tenantId,
        })
        .returning(settingsSelection)

      if (!settings) {
        throw new Error('Failed to upsert tenant branding settings.')
      }

      return settings
    },

    async createAssetMetadata(input: CreateBrandingAssetMetadataInput) {
      const [asset] = await db
        .insert(portalBrandingAssets)
        .values({
          byteSize: input.byteSize,
          checksumSha256: input.checksumSha256,
          contentHash: input.contentHash,
          contentType: input.contentType,
          height: input.height ?? null,
          kind: input.kind,
          objectKey: input.objectKey,
          originalFilename: input.originalFilename ?? null,
          tenantId,
          width: input.width ?? null,
        })
        .returning()

      if (!asset) {
        throw new Error('Failed to create tenant branding asset metadata.')
      }

      return asset
    },

    async findActiveAssetMetadata(): Promise<PublicBrandingAssetMap> {
      const settings = await this.findSettings()

      if (!settings) {
        return {}
      }

      const assetIdsByKind = {
        auth_background_image: settings.authBackgroundImageAssetId,
        auth_footer_image: settings.authFooterImageAssetId,
        auth_header_image: settings.authHeaderImageAssetId,
        chat_background_image: settings.chatBackgroundImageAssetId,
        chat_header_background_image: settings.chatHeaderBackgroundImageAssetId,
        logo: settings.logoAssetId,
      } satisfies Partial<Record<BrandingAssetKind, number | null>>
      const assetIds = Object.values(assetIdsByKind).filter(
        (assetId): assetId is number => typeof assetId === 'number',
      )

      if (assetIds.length === 0) {
        return {}
      }

      const assets = await db
        .select()
        .from(portalBrandingAssets)
        .where(
          and(
            eq(portalBrandingAssets.tenantId, tenantId),
            inArray(portalBrandingAssets.id, assetIds),
          ),
        )
      const assetMap: PublicBrandingAssetMap = {}

      for (const asset of assets) {
        if (!brandingAssetKinds.includes(asset.kind as BrandingAssetKind)) {
          continue
        }

        assetMap[asset.kind as BrandingAssetKind] = {
          contentHash: asset.contentHash,
          contentType: asset.contentType,
          height: asset.height,
          id: asset.id,
          kind: asset.kind as BrandingAssetKind,
          originalFilename: asset.originalFilename,
          publicUrl: createPublicBrandingAssetUrl(asset),
          width: asset.width,
        }
      }

      return assetMap
    },
  }
}

export type BrandingRepository = ReturnType<typeof createBrandingRepository>
```

- [ ] **Step 4: Add asset helpers**

Create `backend/src/modules/branding/brandingAssets.ts`:

```ts
export const brandingAssetKinds = [
  'logo',
  'pwa_icon',
  'auth_header_image',
  'auth_footer_image',
  'auth_background_image',
  'chat_background_image',
  'chat_header_background_image',
] as const

export type BrandingAssetKind = (typeof brandingAssetKinds)[number]

export type PublicBrandingAsset = {
  contentHash: string
  contentType: string
  height: number | null
  id: number
  kind: BrandingAssetKind
  originalFilename: string | null
  publicUrl: string
  width: number | null
}

export type PublicBrandingAssetMap = Partial<
  Record<BrandingAssetKind, PublicBrandingAsset>
>

export function createPublicBrandingAssetUrl({
  contentHash,
  id,
}: {
  contentHash: string
  id: number
}) {
  return `/api/branding/assets/${id}?v=${encodeURIComponent(contentHash)}`
}
```

- [ ] **Step 5: Run repository tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/branding/repository.test.ts --no-file-parallelism --reporter verbose
```

Expected: all repository tests pass.

---

## Task 3: Add Branding Validation And Service

**Files:**

- Add: `backend/src/modules/branding/brandingDefaults.ts`
- Add: `backend/src/modules/branding/brandingValidation.ts`
- Add: `backend/src/modules/branding/service.ts`
- Add: `backend/src/modules/branding/service.test.ts`

- [ ] **Step 1: Write service tests**

Create `backend/src/modules/branding/service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

import type { PublicTenantAdmin } from '../tenant-admin/adminAuthService.js'
import { createBrandingService } from './service.js'

const tenant = {
  displayName: 'Бухфирма',
  id: 3,
  primaryDomain: 'buhfirma.example.test',
  publicBaseUrl: 'https://buhfirma.example.test',
  slug: 'buhfirma',
}

const admin = {
  chatwootAgentId: 42,
  email: 'admin@example.test',
  role: 'administrator',
} satisfies PublicTenantAdmin

function createRepository(settings: unknown = null) {
  return {
    findActiveAssetMetadata: vi.fn().mockResolvedValue({}),
    findSettings: vi.fn().mockResolvedValue(settings),
    upsertSettings: vi.fn().mockImplementation(async (input) => ({
      accentColor: null,
      authBackgroundColor: null,
      authBackgroundImageAssetId: null,
      authFooterImageAssetId: null,
      authHeaderImageAssetId: null,
      authSubtitle: null,
      authTitle: null,
      chatBackgroundColor: null,
      chatBackgroundImageAssetId: null,
      chatEmptyBody: null,
      chatEmptyTitle: null,
      chatHeaderBackgroundColor: null,
      chatHeaderBackgroundImageAssetId: null,
      chatInfoTitle: null,
      logoAssetId: null,
      portalName: null,
      primaryColor: null,
      supportLabel: null,
      updatedAt: new Date('2026-06-07T00:00:00Z'),
      version: 2,
      ...input,
    })),
  }
}

describe('createBrandingService', () => {
  it('returns default public branding without leaking asset object keys', async () => {
    const repository = createRepository()
    const service = createBrandingService({
      audit: vi.fn(),
      repository,
      tenant,
    })

    await expect(service.getPublicBranding()).resolves.toEqual({
      branding: expect.objectContaining({
        assets: {},
        colors: expect.objectContaining({
          primary: '#112540',
        }),
        copy: expect.objectContaining({
          authTitle: 'Вход в личный кабинет',
        }),
        portalName: 'Бухфирма',
        supportLabel: 'Команда Бухфирма',
      }),
    })
  })

  it('validates and saves admin branding updates with audit event', async () => {
    const audit = vi.fn()
    const repository = createRepository()
    const service = createBrandingService({
      audit,
      repository,
      tenant,
    })

    await expect(
      service.updateAdminBranding({
        admin,
        input: {
          colors: {
            primary: '#123456',
          },
          copy: {
            authTitle: 'Добро пожаловать',
          },
          portalName: 'Новый портал',
          supportLabel: 'Поддержка',
        },
        requestIp: '127.0.0.1',
        userAgent: 'vitest',
      }),
    ).resolves.toEqual({
      branding: expect.objectContaining({
        colors: expect.objectContaining({
          primary: '#123456',
        }),
        copy: expect.objectContaining({
          authTitle: 'Добро пожаловать',
        }),
        portalName: 'Новый портал',
        supportLabel: 'Поддержка',
      }),
    })
    expect(repository.upsertSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        authTitle: 'Добро пожаловать',
        portalName: 'Новый портал',
        primaryColor: '#123456',
        supportLabel: 'Поддержка',
      }),
    )
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'branding_settings_updated',
        actor: admin,
        outcome: 'success',
      }),
    )
  })

  it('rejects unsafe colors before repository write', async () => {
    const repository = createRepository()
    const service = createBrandingService({
      audit: vi.fn(),
      repository,
      tenant,
    })

    await expect(
      service.updateAdminBranding({
        admin,
        input: {
          colors: {
            primary: 'javascript:alert(1)',
          },
        },
        requestIp: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({
      code: 'BRANDING_SETTINGS_INVALID',
      statusCode: 400,
    })
    expect(repository.upsertSettings).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run service tests and verify they fail**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/branding/service.test.ts --no-file-parallelism --reporter verbose
```

Expected: fail because service/defaults/validation files do not exist.

- [ ] **Step 3: Add defaults**

Create `backend/src/modules/branding/brandingDefaults.ts`:

```ts
export const defaultBrandingColors = {
  accent: '#4676b4',
  authBackground: '#f3f7fc',
  chatBackground: '#ffffff',
  chatHeaderBackground: '#112540',
  primary: '#112540',
} as const

export function createDefaultBrandingCopy(tenantDisplayName: string) {
  return {
    authSubtitle: 'Введите email и пароль, чтобы продолжить.',
    authTitle: 'Вход в личный кабинет',
    chatEmptyBody: 'Напишите нам, когда будет удобно. Мы ответим здесь.',
    chatEmptyTitle: 'Мы на связи',
    chatInfoTitle: 'Информация о чате',
    supportLabel: `Команда ${tenantDisplayName}`,
  }
}
```

- [ ] **Step 4: Add validation**

Create `backend/src/modules/branding/brandingValidation.ts`:

```ts
import { z } from 'zod'

import { ApiError } from '../../lib/errors.js'

const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/u)
  .transform((value) => value.toLowerCase())

const optionalTextSchema = z
  .string()
  .trim()
  .max(120)
  .transform((value) => value || null)
  .nullable()
  .optional()

const optionalLongTextSchema = z
  .string()
  .trim()
  .max(280)
  .transform((value) => value || null)
  .nullable()
  .optional()

export const adminBrandingPatchSchema = z
  .object({
    colors: z
      .object({
        accent: colorSchema.optional(),
        authBackground: colorSchema.optional(),
        chatBackground: colorSchema.optional(),
        chatHeaderBackground: colorSchema.optional(),
        primary: colorSchema.optional(),
      })
      .optional(),
    copy: z
      .object({
        authSubtitle: optionalLongTextSchema,
        authTitle: optionalTextSchema,
        chatEmptyBody: optionalLongTextSchema,
        chatEmptyTitle: optionalTextSchema,
        chatInfoTitle: optionalTextSchema,
      })
      .optional(),
    portalName: optionalTextSchema,
    supportLabel: optionalTextSchema,
  })
  .strict()

export type AdminBrandingPatch = z.infer<typeof adminBrandingPatchSchema>

export function parseAdminBrandingPatch(input: unknown): AdminBrandingPatch {
  const result = adminBrandingPatchSchema.safeParse(input)

  if (!result.success) {
    throw new ApiError(
      400,
      'BRANDING_SETTINGS_INVALID',
      'Проверьте значения настроек брендинга.',
    )
  }

  return result.data
}
```

- [ ] **Step 5: Add service**

Create `backend/src/modules/branding/service.ts`:

```ts
import type { TenantRequestContext } from '../tenants/service.js'
import type { PublicTenantAdmin } from '../tenant-admin/adminAuthService.js'
import {
  createDefaultBrandingCopy,
  defaultBrandingColors,
} from './brandingDefaults.js'
import { parseAdminBrandingPatch } from './brandingValidation.js'
import type { BrandingRepository } from './repository.js'

type TenantPublicContext = Pick<
  TenantRequestContext,
  'displayName' | 'id' | 'primaryDomain' | 'publicBaseUrl' | 'slug'
>

type BrandingAudit = (input: {
  action: string
  actor?: PublicTenantAdmin | null
  metadata?: Record<string, unknown>
  outcome: string
  requestIp: string | null
  subjectEmail?: string | null
  userAgent: string | null
}) => Promise<void>

type CreateBrandingServiceOptions = {
  audit: BrandingAudit
  repository: Pick<
    BrandingRepository,
    'findActiveAssetMetadata' | 'findSettings' | 'upsertSettings'
  >
  tenant: TenantPublicContext
}

function coalesce<T>(value: T | null | undefined, fallback: T) {
  return value ?? fallback
}

function buildBrandingResponse({
  assets,
  settings,
  tenant,
}: {
  assets: Awaited<ReturnType<BrandingRepository['findActiveAssetMetadata']>>
  settings: Awaited<ReturnType<BrandingRepository['findSettings']>>
  tenant: TenantPublicContext
}) {
  const defaultCopy = createDefaultBrandingCopy(tenant.displayName)

  return {
    branding: {
      assets,
      colors: {
        accent: coalesce(settings?.accentColor, defaultBrandingColors.accent),
        authBackground: coalesce(
          settings?.authBackgroundColor,
          defaultBrandingColors.authBackground,
        ),
        chatBackground: coalesce(
          settings?.chatBackgroundColor,
          defaultBrandingColors.chatBackground,
        ),
        chatHeaderBackground: coalesce(
          settings?.chatHeaderBackgroundColor,
          defaultBrandingColors.chatHeaderBackground,
        ),
        primary: coalesce(
          settings?.primaryColor,
          defaultBrandingColors.primary,
        ),
      },
      copy: {
        authSubtitle: coalesce(
          settings?.authSubtitle,
          defaultCopy.authSubtitle,
        ),
        authTitle: coalesce(settings?.authTitle, defaultCopy.authTitle),
        chatEmptyBody: coalesce(
          settings?.chatEmptyBody,
          defaultCopy.chatEmptyBody,
        ),
        chatEmptyTitle: coalesce(
          settings?.chatEmptyTitle,
          defaultCopy.chatEmptyTitle,
        ),
        chatInfoTitle: coalesce(
          settings?.chatInfoTitle,
          defaultCopy.chatInfoTitle,
        ),
      },
      portalName: coalesce(settings?.portalName, tenant.displayName),
      supportLabel: coalesce(settings?.supportLabel, defaultCopy.supportLabel),
      tenant: {
        primaryDomain: tenant.primaryDomain,
        publicBaseUrl: tenant.publicBaseUrl,
        slug: tenant.slug,
      },
      version: settings ? String(settings.version) : 'default',
    },
  }
}

function patchToRepositoryInput(
  patch: ReturnType<typeof parseAdminBrandingPatch>,
) {
  return {
    accentColor: patch.colors?.accent,
    authBackgroundColor: patch.colors?.authBackground,
    authSubtitle: patch.copy?.authSubtitle,
    authTitle: patch.copy?.authTitle,
    chatBackgroundColor: patch.colors?.chatBackground,
    chatEmptyBody: patch.copy?.chatEmptyBody,
    chatEmptyTitle: patch.copy?.chatEmptyTitle,
    chatHeaderBackgroundColor: patch.colors?.chatHeaderBackground,
    chatInfoTitle: patch.copy?.chatInfoTitle,
    portalName: patch.portalName,
    primaryColor: patch.colors?.primary,
    supportLabel: patch.supportLabel,
  }
}

export function createBrandingService({
  audit,
  repository,
  tenant,
}: CreateBrandingServiceOptions) {
  async function getBrandingResponse() {
    const [settings, assets] = await Promise.all([
      repository.findSettings(),
      repository.findActiveAssetMetadata(),
    ])

    return buildBrandingResponse({ assets, settings, tenant })
  }

  return {
    getAdminBranding: getBrandingResponse,
    getPublicBranding: getBrandingResponse,

    async updateAdminBranding({
      admin,
      input,
      requestIp,
      userAgent,
    }: {
      admin: PublicTenantAdmin
      input: unknown
      requestIp: string | null
      userAgent: string | null
    }) {
      const patch = parseAdminBrandingPatch(input)
      await repository.upsertSettings(patchToRepositoryInput(patch))
      await audit({
        action: 'branding_settings_updated',
        actor: admin,
        metadata: { fields: Object.keys(patch) },
        outcome: 'success',
        requestIp,
        subjectEmail: admin.email,
        userAgent,
      })

      return getBrandingResponse()
    },
  }
}

export type BrandingService = ReturnType<typeof createBrandingService>
```

- [ ] **Step 6: Run service tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/branding/service.test.ts --no-file-parallelism --reporter verbose
```

Expected: all service tests pass.

---

## Task 4: Add Public And Admin Branding Routes

**Files:**

- Add: `backend/src/modules/tenant-admin/adminSessionGuard.ts`
- Modify: `backend/src/modules/tenant-admin/adminAuthRoutes.ts`
- Add: `backend/src/modules/branding/routes.ts`
- Modify: `backend/src/app.ts`
- Add: `backend/src/app-branding.integration.test.ts`

- [ ] **Step 1: Write route integration tests**

Create `backend/src/app-branding.integration.test.ts` with route coverage:

```ts
import { describe, expect, it, vi } from 'vitest'

import { buildApp } from './app.js'
import { createTestDatabase } from './test/createTestDatabase.js'
import { createTenantsRepository } from './modules/tenants/repository.js'
import { encryptTenantSecret } from './modules/tenants/secrets.js'

const tenantSecretKey = Buffer.alloc(32, 13).toString('base64')

async function seedTenant(
  database: Awaited<ReturnType<typeof createTestDatabase>>,
) {
  const key = Buffer.alloc(32, 13)
  const tenantsRepository = createTenantsRepository(database.db)

  return tenantsRepository.createTenant({
    chatwootAccountId: 3,
    chatwootApiAccessTokenCiphertext: encryptTenantSecret('runtime-token', key),
    chatwootBaseUrl: 'https://chatwoot.example.test',
    chatwootPortalInboxId: 6,
    chatwootWebhookSecretCiphertext: encryptTenantSecret('webhook-secret', key),
    displayName: 'Бухфирма',
    primaryDomain: 'buhfirma.example.test',
    publicBaseUrl: 'https://buhfirma.example.test',
    slug: 'buhfirma',
  })
}

function createApp(database: Awaited<ReturnType<typeof createTestDatabase>>) {
  return buildApp({
    database,
    emailDelivery: {
      send: vi.fn().mockResolvedValue(undefined),
    },
    env: {
      AUTH_RATE_LIMIT_MAX: 100,
      AUTH_RATE_LIMIT_WINDOW_MS: 60_000,
      CHAT_ATTACHMENT_PROXY_ALLOWED_ORIGINS: [],
      CHATWOOT_REQUEST_TIMEOUT_MS: 1_000,
      DEFAULT_TENANT_SLUG: 'default',
      NODE_ENV: 'test',
      PORT: 0,
      PORTAL_TENANT_SECRET_KEY: tenantSecretKey,
      PORTAL_TRUST_PROXY: false,
      SESSION_COOKIE_NAME: 'portal_session',
      SESSION_SECRET: 'test-session-secret-32-characters',
      ADMIN_SESSION_COOKIE_NAME: 'portal_admin_session',
      SMTP_FROM: 'noreply@example.test',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: 1025,
      VAPID_PRIVATE_KEY: undefined,
      VAPID_PUBLIC_KEY: undefined,
      VAPID_SUBJECT: undefined,
    },
  })
}

describe('branding routes', () => {
  it('returns public branding for the current tenant host', async () => {
    const database = await createTestDatabase()
    const app = createApp(database)

    try {
      await seedTenant(database)
      const response = await app.inject({
        headers: {
          host: 'buhfirma.example.test',
        },
        method: 'GET',
        url: '/api/branding',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        branding: expect.objectContaining({
          portalName: 'Бухфирма',
          supportLabel: 'Команда Бухфирма',
        }),
      })
    } finally {
      await app.close()
    }
  })

  it('requires admin session for admin branding writes', async () => {
    const database = await createTestDatabase()
    const app = createApp(database)

    try {
      await seedTenant(database)
      const response = await app.inject({
        headers: {
          host: 'buhfirma.example.test',
          origin: 'https://buhfirma.example.test',
        },
        method: 'PATCH',
        payload: {
          portalName: 'Новый портал',
        },
        url: '/api/admin/branding',
      })

      expect(response.statusCode).toBe(401)
      expect(response.json().error.code).toBe('TENANT_ADMIN_UNAUTHORIZED')
    } finally {
      await app.close()
    }
  })
})
```

- [ ] **Step 1.1: Extend the route test with an authenticated admin update case**

In the same file, add a test that creates a valid admin session through the existing tenant-admin repository/service, sends the signed admin cookie, patches `/api/admin/branding`, then asserts `GET /api/branding` returns the updated value and `portal_admin_audit_events` contains `branding_settings_updated`.

- [ ] **Step 2: Run route tests and verify they fail**

Run:

```bash
pnpm --dir backend exec vitest run src/app-branding.integration.test.ts --no-file-parallelism --reporter verbose
```

Expected: fail because routes are not registered.

- [ ] **Step 3: Add admin session guard**

Create `backend/src/modules/tenant-admin/adminSessionGuard.ts`:

```ts
import type { FastifyReply, FastifyRequest } from 'fastify'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'
import type { TenantAdminAuthService } from './adminAuthService.js'
import {
  clearAdminSessionCookie,
  getAdminSessionToken,
} from './adminSessionCookie.js'

export function createAdminUnauthorizedError() {
  return new ApiError(
    401,
    'TENANT_ADMIN_UNAUTHORIZED',
    'Требуется вход администратора.',
  )
}

export async function requireTenantAdminSession({
  createTenantAdminAuthService,
  env,
  reply,
  request,
}: {
  createTenantAdminAuthService: (
    request: FastifyRequest,
  ) => TenantAdminAuthService
  env: AppEnv
  reply: FastifyReply
  request: FastifyRequest
}) {
  const sessionToken = getAdminSessionToken(request, env)
  const service = createTenantAdminAuthService(request)

  if (!sessionToken) {
    clearAdminSessionCookie(reply, env)
    throw createAdminUnauthorizedError()
  }

  const session = await service.getCurrentAdminSession({ sessionToken })

  if (!session) {
    clearAdminSessionCookie(reply, env)
    throw createAdminUnauthorizedError()
  }

  return session
}
```

- [ ] **Step 4: Reuse guard in auth routes**

In `backend/src/modules/tenant-admin/adminAuthRoutes.ts`, replace local `createAdminUnauthorizedError` and `/api/admin/auth/me` session logic with `requireTenantAdminSession`. Keep response shape:

```ts
const session = formatAdminSessionResponse(
  await requireTenantAdminSession({
    createTenantAdminAuthService,
    env,
    reply,
    request,
  }),
)

return session
```

- [ ] **Step 5: Add branding routes**

Create `backend/src/modules/branding/routes.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { AppEnv } from '../../config/env.js'
import { assertAllowedTenantOrigin } from '../../lib/origin.js'
import { requireTenantAdminSession } from '../tenant-admin/adminSessionGuard.js'
import type { TenantAdminAuthService } from '../tenant-admin/adminAuthService.js'
import { requireTenantContext } from '../tenants/routes.js'
import type { BrandingService } from './service.js'

type RegisterBrandingRoutesOptions = {
  createBrandingService: (request: FastifyRequest) => BrandingService
  createTenantAdminAuthService: (
    request: FastifyRequest,
  ) => TenantAdminAuthService
  env: AppEnv
}

function getUserAgent(request: FastifyRequest) {
  const userAgent = request.headers['user-agent']

  return typeof userAgent === 'string' ? userAgent : null
}

export function registerBrandingRoutes(
  app: FastifyInstance,
  {
    createBrandingService,
    createTenantAdminAuthService,
    env,
  }: RegisterBrandingRoutesOptions,
) {
  app.get('/api/branding', async (request) => {
    requireTenantContext(request)

    return createBrandingService(request).getPublicBranding()
  })

  app.get('/api/admin/branding', async (request, reply) => {
    assertAllowedTenantOrigin(request)
    requireTenantContext(request)
    await requireTenantAdminSession({
      createTenantAdminAuthService,
      env,
      reply,
      request,
    })

    return createBrandingService(request).getAdminBranding()
  })

  app.patch('/api/admin/branding', async (request, reply) => {
    assertAllowedTenantOrigin(request)
    const session = await requireTenantAdminSession({
      createTenantAdminAuthService,
      env,
      reply,
      request,
    })

    return createBrandingService(request).updateAdminBranding({
      admin: session.admin,
      input: request.body,
      requestIp: request.ip || null,
      userAgent: getUserAgent(request),
    })
  })
}
```

- [ ] **Step 6: Wire app**

In `backend/src/app.ts`:

- import `registerBrandingRoutes`;
- import `createBrandingRepository`;
- import `createBrandingService`;
- create `createBrandingServiceForRequest`;
- register branding routes after admin auth routes.

The service factory must use current tenant:

```ts
const createBrandingServiceForRequest = (request: FastifyRequest) => {
  const tenant = requireTenantContext(request)
  const adminAuthRepository = createTenantAdminAuthRepository(database.db, {
    tenantId: tenant.id,
  })

  return createBrandingService({
    audit: createTenantAdminAuditLogger(adminAuthRepository),
    repository: createBrandingRepository(database.db, {
      tenantId: tenant.id,
    }),
    tenant,
  })
}
```

- [ ] **Step 7: Run route tests**

Run:

```bash
pnpm --dir backend exec vitest run src/app-branding.integration.test.ts --no-file-parallelism --reporter verbose
```

Expected: public read and unauthorized admin write tests pass. Add authenticated write test after helper wiring is stable.

---

## Task 5: Add Frontend Branding Client And Admin State

**Files:**

- Add: `frontend/src/features/admin-branding/api/adminBrandingClient.ts`
- Add: `frontend/src/features/admin-branding/api/adminBrandingClient.test.ts`
- Add: `frontend/src/features/admin-branding/lib/brandingState.ts`
- Add: `frontend/src/features/admin-branding/components/AdminBrandingForm.tsx`
- Add: `frontend/src/features/admin-branding/components/BrandingPreviewPane.tsx`
- Modify: `frontend/src/features/admin-shell/pages/AdminBrandingPage.tsx`
- Modify: `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`

- [ ] **Step 1: Add client tests**

Create `frontend/src/features/admin-branding/api/adminBrandingClient.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getAdminBranding, updateAdminBranding } from './adminBrandingClient'

describe('adminBrandingClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads admin branding settings through the admin API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue({
          branding: {
            assets: {},
            colors: {
              accent: '#4676b4',
              authBackground: '#f3f7fc',
              chatBackground: '#ffffff',
              chatHeaderBackground: '#112540',
              primary: '#112540',
            },
            copy: {
              authSubtitle: 'Введите email и пароль, чтобы продолжить.',
              authTitle: 'Вход в личный кабинет',
              chatEmptyBody: 'Напишите нам, когда будет удобно.',
              chatEmptyTitle: 'Мы на связи',
              chatInfoTitle: 'Информация о чате',
            },
            portalName: 'Бухфирма',
            supportLabel: 'Команда Бухфирма',
            tenant: {
              primaryDomain: 'buhfirma.example.test',
              publicBaseUrl: 'https://buhfirma.example.test',
              slug: 'buhfirma',
            },
            version: 'default',
          },
        }),
        ok: true,
        status: 200,
      }),
    )

    await expect(getAdminBranding()).resolves.toMatchObject({
      branding: {
        portalName: 'Бухфирма',
      },
    })
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/branding',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
  })

  it('sends only controlled branding settings on update', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue({
          branding: {
            assets: {},
            colors: {
              accent: '#4676b4',
              authBackground: '#f3f7fc',
              chatBackground: '#ffffff',
              chatHeaderBackground: '#112540',
              primary: '#123456',
            },
            copy: {
              authSubtitle: 'Введите email и пароль, чтобы продолжить.',
              authTitle: 'Добро пожаловать',
              chatEmptyBody: 'Напишите нам, когда будет удобно.',
              chatEmptyTitle: 'Мы на связи',
              chatInfoTitle: 'Информация о чате',
            },
            portalName: 'Новый портал',
            supportLabel: 'Команда Бухфирма',
            tenant: {
              primaryDomain: 'buhfirma.example.test',
              publicBaseUrl: 'https://buhfirma.example.test',
              slug: 'buhfirma',
            },
            version: '2',
          },
        }),
        ok: true,
        status: 200,
      }),
    )

    await updateAdminBranding({
      colors: { primary: '#123456' },
      copy: { authTitle: 'Добро пожаловать' },
      portalName: 'Новый портал',
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/branding',
      expect.objectContaining({
        body: JSON.stringify({
          colors: { primary: '#123456' },
          copy: { authTitle: 'Добро пожаловать' },
          portalName: 'Новый портал',
        }),
        credentials: 'include',
        method: 'PATCH',
      }),
    )
  })
})
```

- [ ] **Step 2: Implement client and types**

Create `frontend/src/features/admin-branding/api/adminBrandingClient.ts`:

```ts
import { AdminApiClientError } from '../../admin-auth/api/adminAuthClient'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export type BrandingColors = {
  accent: string
  authBackground: string
  chatBackground: string
  chatHeaderBackground: string
  primary: string
}

export type BrandingCopy = {
  authSubtitle: string
  authTitle: string
  chatEmptyBody: string
  chatEmptyTitle: string
  chatInfoTitle: string
}

export type AdminBrandingResponse = {
  branding: {
    assets: Record<string, unknown>
    colors: BrandingColors
    copy: BrandingCopy
    portalName: string
    supportLabel: string
    tenant: {
      primaryDomain: string
      publicBaseUrl: string
      slug: string
    }
    version: string
  }
}

export type AdminBrandingPatch = Partial<{
  colors: Partial<BrandingColors>
  copy: Partial<BrandingCopy>
  portalName: string
  supportLabel: string
}>

async function request<TResponse>(path: string, init: RequestInit) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
  })
  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string }
  } | null

  if (!response.ok) {
    throw new AdminApiClientError({
      code: payload?.error?.code,
      message:
        payload?.error?.message ??
        'Мы не смогли выполнить запрос. Попробуйте еще раз чуть позже.',
      statusCode: response.status,
    })
  }

  return payload as TResponse
}

export function getAdminBranding() {
  return request<AdminBrandingResponse>('/admin/branding', {
    method: 'GET',
  })
}

export function updateAdminBranding(input: AdminBrandingPatch) {
  return request<AdminBrandingResponse>('/admin/branding', {
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH',
  })
}
```

- [ ] **Step 3: Add UI components**

Create `frontend/src/features/admin-branding/components/AdminBrandingForm.tsx` with controlled inputs for:

- `portalName`;
- `supportLabel`;
- `colors.primary`;
- `colors.authBackground`;
- `colors.chatBackground`;
- `colors.chatHeaderBackground`;
- `copy.authTitle`;
- `copy.authSubtitle`.

Each input must have a Russian label, a stable `name`, and a save button labelled `Сохранить настройки`.

Create `frontend/src/features/admin-branding/components/BrandingPreviewPane.tsx` that accepts the same draft state and renders:

- portal name;
- support label;
- auth title/subtitle sample;
- chat header sample using `colors.chatHeaderBackground`;
- a note `Загрузка изображений появится в следующем срезе`.

- [ ] **Step 4: Wire `AdminBrandingPage`**

Update `frontend/src/features/admin-shell/pages/AdminBrandingPage.tsx`:

- load `getAdminBranding()` on mount;
- show loading text `Загружаем настройки брендинга`;
- show API errors through `InlineAlert`;
- render `AdminBrandingForm` and `BrandingPreviewPane`;
- on save, call `updateAdminBranding(draft)` and update local state with response;
- keep mobile blocker behavior unchanged;
- keep logout behavior unchanged.

- [ ] **Step 5: Update page tests**

In `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`, mock the new client and add tests:

- page loads and renders saved portal name;
- editing `Название портала` updates preview;
- clicking `Сохранить настройки` calls `updateAdminBranding`;
- API error displays Russian error;
- mobile blocker text still exists.

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-shell/pages/AdminBrandingPage.test.tsx src/features/admin-branding/api/adminBrandingClient.test.ts
```

Expected: all tests pass.

---

## Task 6: Add Browser Smoke For Admin Branding Settings

**Files:**

- Add: `tests/e2e/admin-branding-settings.spec.ts`

- [ ] **Step 1: Add Playwright route-mocked test**

Create `tests/e2e/admin-branding-settings.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('admin can edit branding settings and see preview update', async ({
  page,
}) => {
  await page.route('**/api/tenant', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        tenant: {
          displayName: 'Бухфирма',
          primaryDomain: 'buhfirma.example.test',
          publicBaseUrl: 'https://buhfirma.example.test',
          slug: 'buhfirma',
        },
      },
    })
  })
  await page.route('**/api/admin/auth/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        admin: {
          chatwootAgentId: 42,
          email: 'admin@example.test',
          role: 'administrator',
        },
        session: {
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    })
  })
  await page.route('**/api/admin/branding', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          branding: {
            assets: {},
            colors: {
              accent: '#4676b4',
              authBackground: '#f3f7fc',
              chatBackground: '#ffffff',
              chatHeaderBackground: '#112540',
              primary: '#112540',
            },
            copy: {
              authSubtitle: 'Введите email и пароль, чтобы продолжить.',
              authTitle: 'Вход в личный кабинет',
              chatEmptyBody: 'Напишите нам, когда будет удобно.',
              chatEmptyTitle: 'Мы на связи',
              chatInfoTitle: 'Информация о чате',
            },
            portalName: 'Бухфирма',
            supportLabel: 'Команда Бухфирма',
            tenant: {
              primaryDomain: 'buhfirma.example.test',
              publicBaseUrl: 'https://buhfirma.example.test',
              slug: 'buhfirma',
            },
            version: 'default',
          },
        },
      })
      return
    }

    await expect(route.request().postDataJSON()).toMatchObject({
      portalName: 'Портал Бухфирма',
    })
    await route.fulfill({
      contentType: 'application/json',
      json: {
        branding: {
          assets: {},
          colors: {
            accent: '#4676b4',
            authBackground: '#f3f7fc',
            chatBackground: '#ffffff',
            chatHeaderBackground: '#112540',
            primary: '#112540',
          },
          copy: {
            authSubtitle: 'Введите email и пароль, чтобы продолжить.',
            authTitle: 'Вход в личный кабинет',
            chatEmptyBody: 'Напишите нам, когда будет удобно.',
            chatEmptyTitle: 'Мы на связи',
            chatInfoTitle: 'Информация о чате',
          },
          portalName: 'Портал Бухфирма',
          supportLabel: 'Команда Бухфирма',
          tenant: {
            primaryDomain: 'buhfirma.example.test',
            publicBaseUrl: 'https://buhfirma.example.test',
            slug: 'buhfirma',
          },
          version: '2',
        },
      },
    })
  })

  await page.goto('/admin/branding')
  await expect(page.getByRole('heading', { name: 'Брендинг' })).toBeVisible()
  await page.getByLabel('Название портала').fill('Портал Бухфирма')
  await expect(page.getByText('Портал Бухфирма')).toBeVisible()
  await page.getByRole('button', { name: 'Сохранить настройки' }).click()
  await expect(page.getByText('Настройки сохранены.')).toBeVisible()
})
```

- [ ] **Step 2: Run Playwright admin branding test**

Run:

```bash
pnpm test:e2e -- --config=playwright.admin-ui.config.ts tests/e2e/admin-branding-settings.spec.ts
```

Expected: one passing test.

---

## Task 7: Review, Full Checks, Docs And Checkpoint

**Files:**

- Modify after implementation: `docs/roadmap/work-log.md`
- Modify after implementation: `docs/architecture/overview.md`

- [ ] **Step 1: Run targeted backend checks**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/branding/repository.test.ts src/modules/branding/service.test.ts src/app-branding.integration.test.ts --no-file-parallelism --reporter verbose
```

Expected: all branding backend tests pass.

- [ ] **Step 2: Run targeted frontend checks**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-shell/pages/AdminBrandingPage.test.tsx src/features/admin-branding/api/adminBrandingClient.test.ts
```

Expected: all admin branding frontend tests pass.

- [ ] **Step 3: Run full project checks**

Run:

```bash
pnpm lint
pnpm test
pnpm build
git diff --check
pnpm exec prettier --check backend/src/modules/branding frontend/src/features/admin-branding frontend/src/features/admin-shell/pages/AdminBrandingPage.tsx frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx
```

Expected:

- `pnpm lint` exits `0`;
- `pnpm test` exits `0`;
- `pnpm build` exits `0`;
- `git diff --check` exits `0`;
- Prettier check exits `0`.

- [ ] **Step 4: Manual local smoke**

With local environment running:

1. Open `http://buhfirma.127.0.0.1.nip.io:5173/admin/login`.
2. Login as a Chatwoot admin.
3. Open `/admin/branding`.
4. Change `Название портала` to `Портал Бухфирма`.
5. Click `Сохранить настройки`.
6. Refresh `/admin/branding`.
7. Verify the saved value persists.
8. Open `http://buhfirma.127.0.0.1.nip.io:5173/api/branding`.
9. Verify response contains `portalName: "Портал Бухфирма"` and does not contain `objectKey`.

- [ ] **Step 5: Update stable docs**

Update `docs/architecture/overview.md` only after implementation and verification:

```markdown
- `branding` - tenant-scoped public/admin branding settings read model and admin update boundary;
```

Update `docs/roadmap/work-log.md` current baseline with one concise bullet:

```markdown
- `MT-9D` is closed: tenant-owned branding settings persistence, public/admin branding APIs, tenant admin audit events and first admin UI data wiring are implemented without binary asset upload or browser object keys.
```

Replace the final `Recommended Next Step` block with:

```markdown
## Recommended Next Step

- Start the next `MT-9` branding asset upload/object-storage slice: MinIO/S3-compatible storage client, upload/replace/delete routes, tenant-scoped asset reads and PWA icon integration.
```

- [ ] **Step 6: Commit**

Run:

```bash
git status --short --branch
git add backend frontend tests docs
git commit -m "feat: add mt-9d branding settings foundation"
```

Expected: commit succeeds and `git status --short --branch` is clean.

---

## Acceptance Criteria

- `GET /api/branding` returns tenant-specific safe branding data.
- `GET /api/branding` never returns admin-only fields, object keys, tokens or Chatwoot authority.
- `GET /api/admin/branding` requires an authenticated tenant admin session.
- `PATCH /api/admin/branding` requires same-origin tenant admin session.
- Tenant A admin cannot read/write tenant B branding through host or cookie confusion.
- Admin branding update emits a `portal_admin_audit_events` row with action `branding_settings_updated`.
- Branding colors accept only `#rrggbb`.
- Text settings are trimmed and bounded.
- Asset metadata rows are tenant-owned and public asset URLs are backend-controlled.
- No binary upload route exists in this slice.
- `/admin/branding` loads saved settings, edits text/color draft state, saves settings and updates preview.
- Mobile admin blocker behavior remains unchanged.

## Self-Review

Spec coverage:

- Tenant-scoped settings: Task 1, Task 2, Task 3, Task 4.
- Public safe read model: Task 3, Task 4.
- Admin writes and audit: Task 3, Task 4.
- Asset metadata/object-storage shape: Task 1, Task 2.
- No browser object keys: Task 2, Task 3, Task 4, Acceptance Criteria.
- Frontend admin branding state: Task 5, Task 6.
- Required checks and docs: Task 7.

Placeholder scan:

- No task uses `TBD`.
- No task says to add generic validation without exact validation rules.
- Binary upload is explicitly out of scope, not deferred inside a half-built route.

Type consistency:

- Backend public response uses `branding.colors`, `branding.copy`, `branding.assets`, `branding.portalName`, `branding.supportLabel`, `branding.version`.
- Frontend client and Playwright test use the same response names.
- Repository column names map directly to service response names.
