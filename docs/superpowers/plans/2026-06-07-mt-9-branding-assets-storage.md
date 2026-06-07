# MT-9 Branding Assets Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-owned branding asset storage on top of the MT-9D branding settings baseline: S3-compatible binary storage, admin upload/delete routes, tenant-scoped public asset reads and custom PWA icon routing.

**Architecture:** Portal DB remains the source of truth for asset ownership, kind, active references and cache versions. Binary content is stored in S3-compatible object storage through a backend-only adapter; browsers only see portal-owned URLs and never receive object keys or storage credentials. Admin writes require tenant admin session plus same-origin guard, while public reads first resolve the current tenant and active asset metadata before streaming an object.

**Tech Stack:** Fastify, Drizzle/Postgres, PGlite tests, Zod env validation, `@aws-sdk/client-s3`, MinIO-compatible local storage, Vitest, Playwright admin UI smoke where UI is touched.

---

## Position In Full Branding Roadmap

This plan implements `MT-9E` from `docs/roadmap/implementation-plan.md`.

Closed prerequisite slices:

- `MT-9A` - admin verification token boundary.
- `MT-9B` - tenant admin backend auth/session/audit foundation.
- `MT-9C` - tenant admin login UI and protected admin shell.
- `MT-9D` - tenant-owned branding settings, public/admin branding APIs, first settings form and live preview.

This slice intentionally stops at backend asset storage and route contracts.
The following slices remain separate because they touch different risk areas:

- `MT-9F` - admin asset upload/replace/delete controls.
- `MT-9G` - applying branding to customer auth/chat/info/PWA runtime surfaces.
- `MT-9H` - final branding QA, docs and deploy readiness.

## Scope

This slice implements backend asset storage and route contracts only.

In scope:

- S3-compatible storage adapter and local MinIO compose support.
- Environment validation for optional branding asset storage.
- `pwa_icon_asset_id` active reference in `portal_branding_settings`.
- Admin multipart upload/replace for branding assets.
- Admin delete/deactivate for active branding assets.
- Public tenant-scoped asset streaming through `/api/branding/assets/:assetId`.
- Tenant PWA icon routes using the active `pwa_icon` asset when present.
- Tests for tenant isolation, wrong-kind rejection, object-key secrecy, storage unavailability and fallback icons.

Out of scope:

- Rich admin UI upload controls.
- Image resizing or transformation.
- CDN integration.
- Public direct object-storage URLs.
- Chat/auth page visual application of image backgrounds.

## Accepted Design Constraints

- Current branch: `feature/phase-9-branding-assets-storage`.
- Source docs:
  - `docs/roadmap/work-log.md` recommended next step;
  - `docs/architecture/decisions.md` decision `D-014A`;
  - `docs/architecture/multi-tenant-reference.md` branding asset isolation requirements;
  - `docs/superpowers/specs/2026-06-06-mt-9-tenant-admin-branding-prep.md`.
- `MT-9D` already created `portal_branding_assets` metadata and most settings asset references.
- Add `pwa_icon_asset_id` because PWA icon activation must be explicit and tenant-owned.
- Object keys must be tenant-prefixed and backend-owned. The implementation should use:

```ts
export function createBrandingObjectKey({
  contentHash,
  filename,
  kind,
  tenantId,
}: {
  contentHash: string
  filename: string
  kind: BrandingAssetKind
  tenantId: number
}) {
  return `tenants/${tenantId}/branding/${kind}/${contentHash}/${filename}`
}
```

This is tenant-prefixed and content-hash versioned. Portal DB ownership, not key guessing, remains the read/write authority.

Storage reads must return a Node `Readable` at Fastify route boundaries. The S3
adapter can convert an SDK Web stream internally, but routes must never send a
raw Web `ReadableStream` directly.

Replace/delete operations must update the active DB reference before deleting
old object content. If old object deletion fails after a successful activation,
the active settings must still point to the new asset; the stale object cleanup
can be retried separately and must not roll back to a broken public URL.

## File Map

- Modify: `backend/package.json`
  Add `@aws-sdk/client-s3`.
- Modify: `pnpm-lock.yaml`
  Lock the new dependency.
- Modify: `package.json`
  Add local object-storage helper scripts.
- Create: `infra/object-storage/compose.yaml`
  Local MinIO plus bucket bootstrap.
- Modify: `.env.example`
  Add local branding storage variables.
- Modify: `.env.production.example`
  Add production branding storage variables without secrets.
- Modify: `docs/operations/local-testing.md`
  Add local MinIO startup/check commands.
- Modify: `backend/src/config/env.ts`
  Parse and validate branding storage env.
- Modify: `backend/src/config/env.test.ts`
  Cover env defaults, complete config, partial config rejection.
- Create: `backend/src/integrations/object-storage/brandingStorage.ts`
  Storage interface and S3 implementation.
- Create: `backend/src/integrations/object-storage/brandingStorage.test.ts`
  Validate command construction and unavailable storage behavior with a fake sender.
- Create: `backend/src/modules/branding/assetValidation.ts`
  Validate uploaded branding image bytes, MIME types and filenames.
- Create: `backend/src/modules/branding/assetValidation.test.ts`
  Cover empty, oversized, disallowed MIME and normalized filename cases.
- Modify: `backend/src/db/brandingSchema.ts`
  Add `pwaIconAssetId` and composite tenant FK.
- Add: `backend/drizzle/0011_branding_pwa_icon_asset.sql`
  Migration for `pwa_icon_asset_id`.
- Add: `backend/drizzle/meta/0011_snapshot.json`
  Generated Drizzle snapshot.
- Modify: `backend/drizzle/meta/_journal.json`
  Register migration `0011`.
- Modify: `backend/src/modules/branding/brandingAssets.ts`
  Include PWA icon public URL, kind/id parsers and object-safe asset helpers.
- Modify: `backend/src/modules/branding/repository.ts`
  Add active PWA icon, active asset lookup by id/kind, update object key and delete/deactivate helpers.
- Modify: `backend/src/modules/branding/repository.test.ts`
  Cover PWA icon, active-only reads, wrong tenant and delete/deactivate.
- Create: `backend/src/modules/branding/assetService.ts`
  Upload/read/delete orchestration with storage, repository and audit.
- Create: `backend/src/modules/branding/assetService.test.ts`
  Cover upload, replace cleanup, delete, storage unavailable and cross-tenant fail-closed behavior.
- Modify: `backend/src/modules/branding/service.ts`
  Keep settings service focused; do not fold binary logic into it.
- Modify: `backend/src/modules/branding/routes.ts`
  Add admin multipart upload/delete and public read routes.
- Modify: `backend/src/app.ts`
  Build storage adapter and inject branding asset service/routes.
- Modify: `backend/src/app-branding.integration.test.ts`
  Cover route-level upload/read/delete/admin-origin contracts.
- Modify: `backend/src/modules/tenants/routes.ts`
  Use active PWA icon when available; fallback unchanged.
- Modify: `backend/src/modules/tenants/routes.test.ts`
  Cover custom PWA icon manifest versioning, icon streaming and fallback redirects.
- Modify: `backend/src/test/appTestHelpers.ts`
  Add optional branding storage env fields to `testEnv`.
- Modify: `docs/roadmap/work-log.md`
  Update only after implementation/review/checks are complete.

## API Contract

Admin upload:

```http
POST /api/admin/branding/assets/:kind
Content-Type: multipart/form-data

field: asset
```

Supported `:kind` values:

```ts
const adminUploadableBrandingAssetKinds = [
  'logo',
  'pwa_icon',
  'auth_header_image',
  'auth_footer_image',
  'auth_background_image',
  'chat_background_image',
  'chat_header_background_image',
] as const
```

Admin delete:

```http
DELETE /api/admin/branding/assets/:kind
```

Public read:

```http
GET /api/branding/assets/:assetId?v=<contentHash>
```

PWA icon read:

```http
GET /api/tenant/icons/icon-192.png?v=<tenant-asset-version>
GET /api/tenant/icons/icon-512.png?v=<tenant-asset-version>
GET /api/tenant/icons/icon-maskable-512.png?v=<tenant-asset-version>
GET /api/tenant/apple-touch-icon.png?v=<tenant-asset-version>
```

If no active tenant PWA icon exists, existing fallback redirects stay unchanged.

## Error Codes

Use backend-controlled `ApiError` codes:

```ts
BRANDING_ASSET_STORAGE_UNAVAILABLE
BRANDING_ASSET_KIND_INVALID
BRANDING_ASSET_MULTIPART_REQUIRED
BRANDING_ASSET_FILE_REQUIRED
BRANDING_ASSET_FIELD_INVALID
BRANDING_ASSET_EMPTY
BRANDING_ASSET_TOO_LARGE
BRANDING_ASSET_TYPE_NOT_ALLOWED
BRANDING_ASSET_NOT_FOUND
BRANDING_ASSET_READ_FAILED
BRANDING_ASSET_WRITE_FAILED
BRANDING_ASSET_DELETE_FAILED
```

Do not expose object keys, bucket names, S3 endpoint values, storage access keys, checksum values or original filenames in public responses.

## Task 1: Storage Env, Dependency And Local MinIO

**Files:**

- Modify: `backend/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `package.json`
- Create: `infra/object-storage/compose.yaml`
- Modify: `.env.example`
- Modify: `.env.production.example`
- Modify: `docs/operations/local-testing.md`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/config/env.test.ts`

- [ ] **Step 1: Write failing env tests**

Add these tests to `backend/src/config/env.test.ts`:

```ts
it('leaves branding asset storage unavailable by default', () => {
  const env = loadEnv(baseRawEnv)

  expect(env.BRANDING_ASSET_STORAGE_BUCKET).toBeUndefined()
  expect(env.BRANDING_ASSET_STORAGE_ENDPOINT).toBeUndefined()
  expect(env.BRANDING_ASSET_STORAGE_ACCESS_KEY_ID).toBeUndefined()
  expect(env.BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY).toBeUndefined()
  expect(env.BRANDING_ASSET_STORAGE_REGION).toBe('us-east-1')
  expect(env.BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE).toBe(true)
})

it('accepts complete branding asset storage configuration', () => {
  const env = loadEnv({
    ...baseRawEnv,
    BRANDING_ASSET_STORAGE_ACCESS_KEY_ID: 'portal-minio',
    BRANDING_ASSET_STORAGE_BUCKET: 'portal-branding-assets',
    BRANDING_ASSET_STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
    BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE: 'false',
    BRANDING_ASSET_STORAGE_REGION: 'eu-central-1',
    BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY: 'secret',
  })

  expect(env.BRANDING_ASSET_STORAGE_ACCESS_KEY_ID).toBe('portal-minio')
  expect(env.BRANDING_ASSET_STORAGE_BUCKET).toBe('portal-branding-assets')
  expect(env.BRANDING_ASSET_STORAGE_ENDPOINT).toBe('http://127.0.0.1:9000')
  expect(env.BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE).toBe(false)
  expect(env.BRANDING_ASSET_STORAGE_REGION).toBe('eu-central-1')
  expect(env.BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY).toBe('secret')
})

it.each([
  ['BRANDING_ASSET_STORAGE_ENDPOINT'],
  ['BRANDING_ASSET_STORAGE_BUCKET'],
  ['BRANDING_ASSET_STORAGE_ACCESS_KEY_ID'],
  ['BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY'],
])('rejects partial branding asset storage config missing %s', (missingKey) => {
  const complete = {
    ...baseRawEnv,
    BRANDING_ASSET_STORAGE_ACCESS_KEY_ID: 'portal-minio',
    BRANDING_ASSET_STORAGE_BUCKET: 'portal-branding-assets',
    BRANDING_ASSET_STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
    BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY: 'secret',
  }

  delete complete[missingKey as keyof typeof complete]

  expect(() => loadEnv(complete)).toThrow(/BRANDING_ASSET_STORAGE/)
})
```

- [ ] **Step 2: Run env tests and verify failure**

Run:

```bash
pnpm --dir backend exec vitest run src/config/env.test.ts --reporter verbose
```

Expected: FAIL because the new env properties do not exist yet.

- [ ] **Step 3: Add dependency**

Run:

```bash
pnpm --dir backend add @aws-sdk/client-s3
```

Expected: `backend/package.json` and `pnpm-lock.yaml` change.

- [ ] **Step 4: Add env schema**

In `backend/src/config/env.ts`, add storage fields to `envSchema`:

```ts
BRANDING_ASSET_STORAGE_ENDPOINT: optionalUrlString,
BRANDING_ASSET_STORAGE_REGION: optionalNonEmptyString.default('us-east-1'),
BRANDING_ASSET_STORAGE_BUCKET: optionalNonEmptyString,
BRANDING_ASSET_STORAGE_ACCESS_KEY_ID: optionalNonEmptyString,
BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY: optionalNonEmptyString,
BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE: z
  .preprocess((value) => {
    if (value === undefined || value === null || value === '') {
      return true
    }

    if (typeof value === 'string') {
      if (value === 'true') {
        return true
      }

      if (value === 'false') {
        return false
      }
    }

    return value
  }, z.boolean())
  .default(true),
```

Then add a `superRefine` block:

```ts
const brandingStorageKeys = [
  'BRANDING_ASSET_STORAGE_ENDPOINT',
  'BRANDING_ASSET_STORAGE_BUCKET',
  'BRANDING_ASSET_STORAGE_ACCESS_KEY_ID',
  'BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY',
] as const
const hasBrandingStorageConfig = brandingStorageKeys.some((key) =>
  Boolean(env[key]),
)

if (hasBrandingStorageConfig) {
  for (const key of brandingStorageKeys) {
    if (!env[key]) {
      context.addIssue({
        code: 'custom',
        message: `${key} is required when branding asset storage is configured`,
        path: [key],
      })
    }
  }
}
```

- [ ] **Step 5: Add local MinIO compose**

Create `infra/object-storage/compose.yaml`:

```yaml
services:
  minio:
    image: quay.io/minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${PORTAL_V2_MINIO_ROOT_USER:-portal_v2_minio}
      MINIO_ROOT_PASSWORD: ${PORTAL_V2_MINIO_ROOT_PASSWORD:-portal_v2_minio_password}
    ports:
      - '${PORTAL_V2_MINIO_API_PORT:-59000}:9000'
      - '${PORTAL_V2_MINIO_CONSOLE_PORT:-59001}:9001'
    volumes:
      - portal-v2-minio-data:/data

  minio-init:
    image: quay.io/minio/mc:latest
    depends_on:
      - minio
    entrypoint: >
      /bin/sh -c "
      until mc alias set local http://minio:9000 ${PORTAL_V2_MINIO_ROOT_USER:-portal_v2_minio} ${PORTAL_V2_MINIO_ROOT_PASSWORD:-portal_v2_minio_password}; do
        sleep 2;
      done;
      mc mb --ignore-existing local/${BRANDING_ASSET_STORAGE_BUCKET:-portal-branding-assets};
      "

volumes:
  portal-v2-minio-data:
```

- [ ] **Step 6: Add scripts**

In root `package.json`, add:

```json
"storage:up": "docker --context default compose --env-file .env -f infra/object-storage/compose.yaml up -d",
"storage:down": "docker --context default compose --env-file .env -f infra/object-storage/compose.yaml down",
"storage:logs": "docker --context default compose --env-file .env -f infra/object-storage/compose.yaml logs -f"
```

- [ ] **Step 7: Add env examples**

In `.env.example`, add:

```dotenv
# Local branding asset object storage (MinIO-compatible).
PORTAL_V2_MINIO_API_PORT=59000
PORTAL_V2_MINIO_CONSOLE_PORT=59001
PORTAL_V2_MINIO_ROOT_USER=portal_v2_minio
PORTAL_V2_MINIO_ROOT_PASSWORD=portal_v2_minio_password
BRANDING_ASSET_STORAGE_ENDPOINT=http://127.0.0.1:59000
BRANDING_ASSET_STORAGE_REGION=us-east-1
BRANDING_ASSET_STORAGE_BUCKET=portal-branding-assets
BRANDING_ASSET_STORAGE_ACCESS_KEY_ID=portal_v2_minio
BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY=portal_v2_minio_password
BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE=true
```

In `.env.production.example`, add the same `BRANDING_ASSET_STORAGE_*` names with placeholder values and without local `PORTAL_V2_MINIO_*` defaults.

- [ ] **Step 8: Update local testing docs**

In `docs/operations/local-testing.md`, add a short object storage section after Postgres startup:

````markdown
## Object Storage Для Branding Assets

Локально branding assets используют MinIO, чтобы development и production
оставались в одной storage-модели.

```bash
pnpm storage:up
docker --context default compose --env-file .env -f infra/object-storage/compose.yaml ps
```
````

MinIO Console:

```text
http://127.0.0.1:59001
```

Backend env должен указывать на API endpoint:

```dotenv
BRANDING_ASSET_STORAGE_ENDPOINT=http://127.0.0.1:59000
BRANDING_ASSET_STORAGE_BUCKET=portal-branding-assets
BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE=true
```

````

- [ ] **Step 9: Run checks**

Run:

```bash
pnpm --dir backend exec vitest run src/config/env.test.ts --reporter verbose
pnpm exec prettier --check package.json .env.example .env.production.example infra/object-storage/compose.yaml docs/operations/local-testing.md backend/src/config/env.ts backend/src/config/env.test.ts
````

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/package.json pnpm-lock.yaml package.json infra/object-storage/compose.yaml .env.example .env.production.example docs/operations/local-testing.md backend/src/config/env.ts backend/src/config/env.test.ts
git commit -m "feat: add branding asset storage configuration"
```

## Task 2: Storage Adapter And Upload Validation

**Files:**

- Create: `backend/src/integrations/object-storage/brandingStorage.ts`
- Create: `backend/src/integrations/object-storage/brandingStorage.test.ts`
- Create: `backend/src/modules/branding/assetValidation.ts`
- Create: `backend/src/modules/branding/assetValidation.test.ts`

- [ ] **Step 1: Write storage adapter tests**

Create `backend/src/integrations/object-storage/brandingStorage.test.ts`:

```ts
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

import {
  createBrandingObjectStorage,
  createDisabledBrandingObjectStorage,
} from './brandingStorage.js'

describe('branding object storage', () => {
  it('fails closed when storage is disabled', async () => {
    const storage = createDisabledBrandingObjectStorage()

    await expect(
      storage.putObject({
        body: Buffer.from('x'),
        contentLength: 1,
        contentType: 'image/png',
        key: 'tenants/1/branding/logo/hash/logo.png',
      }),
    ).rejects.toMatchObject({ code: 'BRANDING_ASSET_STORAGE_UNAVAILABLE' })
  })

  it('sends bucket-scoped put/get/delete commands through the S3 client', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: {
        transformToWebStream: () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([120]))
              controller.close()
            },
          }),
      },
      ContentLength: 1,
      ContentType: 'image/png',
    })
    const storage = createBrandingObjectStorage({
      bucket: 'portal-branding-assets',
      send,
    })

    await storage.putObject({
      body: Buffer.from('x'),
      contentLength: 1,
      contentType: 'image/png',
      key: 'tenants/1/branding/logo/hash/logo.png',
    })
    const object = await storage.getObject({
      key: 'tenants/1/branding/logo/hash/logo.png',
    })
    await storage.deleteObject({ key: 'tenants/1/branding/logo/hash/logo.png' })

    expect(object.body).toBeInstanceOf(Readable)

    expect(send).toHaveBeenCalledTimes(3)
    expect(send.mock.calls[0]?.[0].input).toMatchObject({
      Bucket: 'portal-branding-assets',
      ContentLength: 1,
      ContentType: 'image/png',
      Key: 'tenants/1/branding/logo/hash/logo.png',
    })
    expect(send.mock.calls[1]?.[0].input).toMatchObject({
      Bucket: 'portal-branding-assets',
      Key: 'tenants/1/branding/logo/hash/logo.png',
    })
    expect(send.mock.calls[2]?.[0].input).toMatchObject({
      Bucket: 'portal-branding-assets',
      Key: 'tenants/1/branding/logo/hash/logo.png',
    })
  })
})
```

- [ ] **Step 2: Write validation tests**

Create `backend/src/modules/branding/assetValidation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  BRANDING_ASSET_MAX_BYTES,
  normalizeBrandingAssetUpload,
} from './assetValidation.js'

describe('branding asset validation', () => {
  it('accepts a PNG branding asset and normalizes the filename', () => {
    expect(
      normalizeBrandingAssetUpload({
        data: Buffer.from('png-data'),
        fileName: ' ../Logo File.PNG ',
        kind: 'logo',
        mimeType: ' IMAGE/PNG ',
      }),
    ).toMatchObject({
      contentType: 'image/png',
      data: Buffer.from('png-data'),
      fileName: 'logo-file.png',
      kind: 'logo',
      size: 8,
    })
  })

  it('rejects empty branding assets', () => {
    expect(() =>
      normalizeBrandingAssetUpload({
        data: Buffer.alloc(0),
        fileName: 'logo.png',
        kind: 'logo',
        mimeType: 'image/png',
      }),
    ).toThrow(/BRANDING_ASSET_EMPTY/)
  })

  it('rejects oversized branding assets', () => {
    expect(() =>
      normalizeBrandingAssetUpload({
        data: Buffer.alloc(BRANDING_ASSET_MAX_BYTES + 1),
        fileName: 'logo.png',
        kind: 'logo',
        mimeType: 'image/png',
      }),
    ).toThrow(/BRANDING_ASSET_TOO_LARGE/)
  })

  it('rejects non-image branding assets', () => {
    expect(() =>
      normalizeBrandingAssetUpload({
        data: Buffer.from('plain'),
        fileName: 'asset.txt',
        kind: 'logo',
        mimeType: 'text/plain',
      }),
    ).toThrow(/BRANDING_ASSET_TYPE_NOT_ALLOWED/)
  })

  it('allows only PNG for PWA icons', () => {
    expect(() =>
      normalizeBrandingAssetUpload({
        data: Buffer.from('jpg'),
        fileName: 'icon.jpg',
        kind: 'pwa_icon',
        mimeType: 'image/jpeg',
      }),
    ).toThrow(/BRANDING_ASSET_TYPE_NOT_ALLOWED/)
  })
})
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
pnpm --dir backend exec vitest run src/integrations/object-storage/brandingStorage.test.ts src/modules/branding/assetValidation.test.ts --reporter verbose
```

Expected: FAIL because files do not exist.

- [ ] **Step 4: Implement storage adapter**

Create `backend/src/integrations/object-storage/brandingStorage.ts`:

```ts
import { Readable } from 'node:stream'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'

type StorageSender = {
  send: S3Client['send']
}

export type BrandingStoredObject = {
  body: Readable | null
  contentLength: number | null
  contentType: string | null
}

export type BrandingObjectStorage = {
  deleteObject(input: { key: string }): Promise<void>
  getObject(input: { key: string }): Promise<BrandingStoredObject>
  putObject(input: {
    body: Buffer
    contentLength: number
    contentType: string
    key: string
  }): Promise<void>
}

export function createDisabledBrandingObjectStorage(): BrandingObjectStorage {
  const fail = () => {
    throw new ApiError(
      503,
      'BRANDING_ASSET_STORAGE_UNAVAILABLE',
      'Хранилище файлов брендинга сейчас недоступно.',
    )
  }

  return {
    async deleteObject() {
      fail()
    },
    async getObject() {
      fail()
    },
    async putObject() {
      fail()
    },
  }
}

export function createBrandingObjectStorage({
  bucket,
  send,
}: {
  bucket: string
  send: StorageSender['send']
}): BrandingObjectStorage {
  return {
    async deleteObject({ key }) {
      await send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    },
    async getObject({ key }) {
      const response = await send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      )

      const body =
        response.Body && 'transformToWebStream' in response.Body
          ? Readable.fromWeb(response.Body.transformToWebStream())
          : null

      return {
        body,
        contentLength: response.ContentLength ?? null,
        contentType: response.ContentType ?? null,
      }
    },
    async putObject({ body, contentLength, contentType, key }) {
      await send(
        new PutObjectCommand({
          Body: body,
          Bucket: bucket,
          ContentLength: contentLength,
          ContentType: contentType,
          Key: key,
        }),
      )
    },
  }
}

export function createBrandingObjectStorageFromEnv(
  env: Pick<
    AppEnv,
    | 'BRANDING_ASSET_STORAGE_ACCESS_KEY_ID'
    | 'BRANDING_ASSET_STORAGE_BUCKET'
    | 'BRANDING_ASSET_STORAGE_ENDPOINT'
    | 'BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE'
    | 'BRANDING_ASSET_STORAGE_REGION'
    | 'BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY'
  >,
) {
  if (
    !env.BRANDING_ASSET_STORAGE_ACCESS_KEY_ID ||
    !env.BRANDING_ASSET_STORAGE_BUCKET ||
    !env.BRANDING_ASSET_STORAGE_ENDPOINT ||
    !env.BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY
  ) {
    return createDisabledBrandingObjectStorage()
  }

  const config: S3ClientConfig = {
    credentials: {
      accessKeyId: env.BRANDING_ASSET_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY,
    },
    endpoint: env.BRANDING_ASSET_STORAGE_ENDPOINT,
    forcePathStyle: env.BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE,
    region: env.BRANDING_ASSET_STORAGE_REGION,
  }
  const client = new S3Client(config)

  return createBrandingObjectStorage({
    bucket: env.BRANDING_ASSET_STORAGE_BUCKET,
    send: client.send.bind(client),
  })
}
```

- [ ] **Step 5: Implement upload validation**

Create `backend/src/modules/branding/assetValidation.ts`:

```ts
import { extname } from 'node:path'

import { ApiError } from '../../lib/errors.js'
import type { BrandingAssetKind } from './brandingAssets.js'

export const BRANDING_ASSET_MAX_BYTES = 5 * 1024 * 1024

const allowedImageTypes = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

export type BrandingAssetUpload = {
  data: Buffer
  fileName: string
  kind: BrandingAssetKind
  mimeType: string
}

export type NormalizedBrandingAssetUpload = {
  contentType: string
  data: Buffer
  fileName: string
  kind: BrandingAssetKind
  size: number
}

function normalizeFilename(input: string, contentType: string) {
  const extensionByType: Record<string, string> = {
    'image/gif': '.gif',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  }
  const fallbackExtension = extensionByType[contentType] ?? '.img'
  const rawBaseName = input.trim().split(/[\\/]/u).pop() ?? ''
  const withoutExtension = rawBaseName.replace(/\.[^.]*$/u, '')
  const slug = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  const baseName = slug || 'branding-asset'
  const extension = extensionByType[contentType] ?? extname(rawBaseName)

  return `${baseName}${extension || fallbackExtension}`
}

export function normalizeBrandingAssetUpload(
  upload: BrandingAssetUpload,
): NormalizedBrandingAssetUpload {
  const data = Buffer.from(upload.data)
  const size = data.byteLength
  const contentType = upload.mimeType.trim().toLowerCase()

  if (size <= 0) {
    throw new ApiError(400, 'BRANDING_ASSET_EMPTY', 'Файл пустой.')
  }

  if (size > BRANDING_ASSET_MAX_BYTES) {
    throw new ApiError(
      413,
      'BRANDING_ASSET_TOO_LARGE',
      'Файл должен быть не больше 5 МБ.',
    )
  }

  if (!allowedImageTypes.has(contentType)) {
    throw new ApiError(
      415,
      'BRANDING_ASSET_TYPE_NOT_ALLOWED',
      'Можно загрузить PNG, JPEG, WEBP или GIF.',
    )
  }

  if (upload.kind === 'pwa_icon' && contentType !== 'image/png') {
    throw new ApiError(
      415,
      'BRANDING_ASSET_TYPE_NOT_ALLOWED',
      'PWA-иконка должна быть PNG.',
    )
  }

  return {
    contentType,
    data,
    fileName: normalizeFilename(upload.fileName, contentType),
    kind: upload.kind,
    size,
  }
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --dir backend exec vitest run src/integrations/object-storage/brandingStorage.test.ts src/modules/branding/assetValidation.test.ts --reporter verbose
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/integrations/object-storage/brandingStorage.ts backend/src/integrations/object-storage/brandingStorage.test.ts backend/src/modules/branding/assetValidation.ts backend/src/modules/branding/assetValidation.test.ts
git commit -m "feat: add branding asset storage adapter"
```

## Task 3: PWA Icon Reference And Repository Methods

**Files:**

- Modify: `backend/src/db/brandingSchema.ts`
- Add: `backend/drizzle/0011_branding_pwa_icon_asset.sql`
- Add: `backend/drizzle/meta/0011_snapshot.json`
- Modify: `backend/drizzle/meta/_journal.json`
- Modify: `backend/src/modules/branding/brandingAssets.ts`
- Modify: `backend/src/modules/branding/repository.ts`
- Modify: `backend/src/modules/branding/repository.test.ts`

- [ ] **Step 1: Write repository tests**

Add tests to `backend/src/modules/branding/repository.test.ts`:

```ts
it('activates and returns a tenant-scoped pwa icon asset', async () => {
  const { database, tenantId } = await createBrandingRepositoryTestContext()
  const repository = createBrandingRepository(database.db, { tenantId })
  const asset = await repository.createAssetMetadata({
    byteSize: 10,
    checksumSha256: 'checksum',
    contentHash: 'hash-pwa',
    contentType: 'image/png',
    kind: 'pwa_icon',
    objectKey: 'tenants/1/branding/pwa_icon/hash/icon.png',
    originalFilename: 'icon.png',
  })

  await repository.upsertSettings({ pwaIconAssetId: asset.id })

  await expect(repository.findActivePwaIcon()).resolves.toMatchObject({
    contentHash: 'hash-pwa',
    contentType: 'image/png',
    id: asset.id,
    kind: 'pwa_icon',
  })
})

it('finds public asset metadata only when the asset is active for the tenant', async () => {
  const { database, tenantId } = await createBrandingRepositoryTestContext()
  const repository = createBrandingRepository(database.db, { tenantId })
  const inactive = await repository.createAssetMetadata({
    byteSize: 10,
    checksumSha256: 'inactive-checksum',
    contentHash: 'inactive-hash',
    contentType: 'image/png',
    kind: 'logo',
    objectKey: 'tenants/1/branding/logo/inactive/logo.png',
  })
  const active = await repository.createAssetMetadata({
    byteSize: 11,
    checksumSha256: 'active-checksum',
    contentHash: 'active-hash',
    contentType: 'image/png',
    kind: 'logo',
    objectKey: 'tenants/1/branding/logo/active/logo.png',
  })

  await repository.upsertSettings({ logoAssetId: active.id })

  await expect(repository.findActiveAssetById(inactive.id)).resolves.toBeNull()
  await expect(
    repository.findActiveAssetById(active.id),
  ).resolves.toMatchObject({
    id: active.id,
    objectKey: 'tenants/1/branding/logo/active/logo.png',
  })
  await expect(repository.findActiveAssetByKind('logo')).resolves.toMatchObject(
    {
      id: active.id,
      objectKey: 'tenants/1/branding/logo/active/logo.png',
    },
  )
})

it('deactivates an active asset kind without deleting other settings', async () => {
  const { database, tenantId } = await createBrandingRepositoryTestContext()
  const repository = createBrandingRepository(database.db, { tenantId })
  const asset = await repository.createAssetMetadata({
    byteSize: 10,
    checksumSha256: 'checksum',
    contentHash: 'hash',
    contentType: 'image/png',
    kind: 'logo',
    objectKey: 'tenants/1/branding/logo/hash/logo.png',
  })

  await repository.upsertSettings({
    logoAssetId: asset.id,
    portalName: 'Tenant Portal',
  })
  await repository.deactivateAssetKind('logo')

  await expect(repository.findSettings()).resolves.toMatchObject({
    logoAssetId: null,
    portalName: 'Tenant Portal',
  })
})
```

If `createBrandingRepositoryTestContext` does not exist, add a small helper near the top of the test file that returns the same database and tenant setup used by existing tests.

- [ ] **Step 2: Run repository test and verify failure**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/branding/repository.test.ts --reporter verbose
```

Expected: FAIL because `pwaIconAssetId`, `findActivePwaIcon`,
`findActiveAssetById`, `findActiveAssetByKind`, `deactivateAssetKind`,
`parseBrandingAssetKind` and `parseBrandingAssetId` do not exist.

- [ ] **Step 3: Add schema and migration**

In `backend/src/db/brandingSchema.ts`, add:

```ts
pwaIconAssetId: integer('pwa_icon_asset_id'),
```

In the table callback, add:

```ts
foreignKey({
  columns: [table.tenantId, table.pwaIconAssetId],
  foreignColumns: [portalBrandingAssets.tenantId, portalBrandingAssets.id],
  name: 'portal_branding_settings_pwa_icon_asset_tenant_fk',
}).onDelete('restrict'),
```

Generate migration:

```bash
pnpm --dir backend db:generate
```

Expected new migration name: `0011_branding_pwa_icon_asset.sql`.

- [ ] **Step 4: Update asset helpers and route parsers**

In `backend/src/modules/branding/brandingAssets.ts`, add the import near the top:

```ts
import { ApiError } from '../../lib/errors.js'
```

Then add:

```ts
export function createTenantPwaIconVersion({
  contentHash,
  tenantSlug,
}: {
  contentHash: string
  tenantSlug: string
}) {
  return encodeURIComponent(`${tenantSlug}-${contentHash}`)
}

export function parseBrandingAssetKind(input: string): BrandingAssetKind {
  if (brandingAssetKinds.includes(input as BrandingAssetKind)) {
    return input as BrandingAssetKind
  }

  throw new ApiError(
    404,
    'BRANDING_ASSET_KIND_NOT_FOUND',
    'Такой тип файла брендинга не найден.',
  )
}

export function parseBrandingAssetId(input: string): number {
  const assetId = Number(input)

  if (!Number.isSafeInteger(assetId) || assetId <= 0) {
    throw new ApiError(
      404,
      'BRANDING_ASSET_NOT_FOUND',
      'Файл брендинга не найден.',
    )
  }

  return assetId
}
```

- [ ] **Step 5: Update repository types and active slots**

In `backend/src/modules/branding/repository.ts`, add `pwaIconAssetId` to:

- `BrandingSettingsPatch`;
- `settingsSelection`;
- `normalizeSettingsPatch`;
- `collectActiveAssetIds`;
- `brandingAssetReferenceSlots`.

Add repository methods:

```ts
async findActivePwaIcon() {
  const settings = await this.findSettings()

  if (!settings?.pwaIconAssetId) {
    return null
  }

  return this.findActiveAssetById(settings.pwaIconAssetId)
},

async findActiveAssetById(assetId: number) {
  const settings = await this.findSettings()

  if (!settings) {
    return null
  }

  const activeAssetIds = new Set(
    collectActiveAssetIds(settings).map(([, activeAssetId]) => activeAssetId),
  )

  if (!activeAssetIds.has(assetId)) {
    return null
  }

  const [asset] = await db
    .select()
    .from(portalBrandingAssets)
    .where(
      and(
        eq(portalBrandingAssets.tenantId, tenantId),
        eq(portalBrandingAssets.id, assetId),
      ),
    )
    .limit(1)

  return asset ?? null
},

async findActiveAssetByKind(kind: BrandingAssetKind) {
  const settings = await this.findSettings()

  if (!settings) {
    return null
  }

  const activeAssetId = collectActiveAssetIds(settings).find(
    ([activeKind]) => activeKind === kind,
  )?.[1]

  if (!activeAssetId) {
    return null
  }

  return this.findActiveAssetById(activeAssetId)
},

async deactivateAssetKind(kind: BrandingAssetKind) {
  const patchByKind: Record<BrandingAssetKind, BrandingSettingsPatch> = {
    auth_background_image: { authBackgroundImageAssetId: null },
    auth_footer_image: { authFooterImageAssetId: null },
    auth_header_image: { authHeaderImageAssetId: null },
    chat_background_image: { chatBackgroundImageAssetId: null },
    chat_header_background_image: { chatHeaderBackgroundImageAssetId: null },
    logo: { logoAssetId: null },
    pwa_icon: { pwaIconAssetId: null },
  }

  return this.upsertSettings(patchByKind[kind])
},

async deleteAssetMetadata(assetId: number) {
  await db
    .delete(portalBrandingAssets)
    .where(
      and(
        eq(portalBrandingAssets.tenantId, tenantId),
        eq(portalBrandingAssets.id, assetId),
      ),
    )
},
```

- [ ] **Step 6: Run repository tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/branding/repository.test.ts --reporter verbose
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/db/brandingSchema.ts backend/drizzle/0011_branding_pwa_icon_asset.sql backend/drizzle/meta/0011_snapshot.json backend/drizzle/meta/_journal.json backend/src/modules/branding/brandingAssets.ts backend/src/modules/branding/repository.ts backend/src/modules/branding/repository.test.ts
git commit -m "feat: add active pwa branding asset metadata"
```

## Task 4: Branding Asset Service

**Files:**

- Create: `backend/src/modules/branding/assetService.ts`
- Create: `backend/src/modules/branding/assetService.test.ts`

- [ ] **Step 1: Write service tests**

Create `backend/src/modules/branding/assetService.test.ts` with fake repository/storage objects. Cover:

```ts
it('uploads an asset, stores object content, activates the matching settings slot and audits success', async () => {
  // Expect storage.putObject key starts with tenants/7/branding/logo/
  // Expect repository.upsertSettings({ logoAssetId: <new id> })
  // Expect public response contains no objectKey or originalFilename.
})

it('replaces an existing active asset and deletes the old object after activation', async () => {
  // Arrange active logo id=1/objectKey=old.
  // Upload new logo.
  // Expect storage.deleteObject({ key: old }) after new settings are active.
})

it('deletes an active asset kind by deactivating settings and deleting object metadata/content', async () => {
  // Arrange active pwa_icon.
  // Call deleteAsset({ kind: 'pwa_icon' }).
  // Expect repository.deactivateAssetKind('pwa_icon') and storage.deleteObject.
})

it('returns a controlled unavailable error when storage is disabled', async () => {
  // Use createDisabledBrandingObjectStorage().
  // Expect BRANDING_ASSET_STORAGE_UNAVAILABLE.
})

it('streams only active tenant-owned assets', async () => {
  // Repository returns active asset metadata with objectKey.
  // Storage returns body/contentType/contentLength.
  // Expect body and metadata; objectKey remains backend-only.
})
```

- [ ] **Step 2: Run service tests and verify failure**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/branding/assetService.test.ts --reporter verbose
```

Expected: FAIL because service file does not exist.

- [ ] **Step 3: Implement service**

Create `backend/src/modules/branding/assetService.ts` with this public shape:

```ts
import { createHash } from 'node:crypto'

import { ApiError } from '../../lib/errors.js'
import type { BrandingObjectStorage } from '../../integrations/object-storage/brandingStorage.js'
import type { PublicTenantAdmin } from '../tenant-admin/adminAuthService.js'
import type { BrandingAssetKind } from './brandingAssets.js'
import {
  normalizeBrandingAssetUpload,
  type BrandingAssetUpload,
} from './assetValidation.js'
import type { BrandingRepository } from './repository.js'

type BrandingAssetAudit = (input: {
  action: string
  actor?: PublicTenantAdmin | null
  metadata?: Record<string, unknown>
  outcome: string
  requestIp: string | null
  subjectEmail?: string | null
  userAgent: string | null
}) => Promise<void> | void

type CreateBrandingAssetServiceOptions = {
  audit: BrandingAssetAudit
  repository: Pick<
    BrandingRepository,
    | 'createAssetMetadata'
    | 'deactivateAssetKind'
    | 'deleteAssetMetadata'
    | 'findActiveAssetById'
    | 'findActiveAssetByKind'
    | 'upsertSettings'
  >
  storage: BrandingObjectStorage
  tenantId: number
}

export type BrandingAssetService = ReturnType<typeof createBrandingAssetService>
```

Implement:

- `uploadAsset({ admin, upload, requestIp, userAgent })`;
- `deleteAsset({ admin, kind, requestIp, userAgent })`;
- `getPublicAsset({ assetId })`.

Use this mapping:

```ts
const settingsPatchByKind = {
  auth_background_image: (assetId: number | null) => ({
    authBackgroundImageAssetId: assetId,
  }),
  auth_footer_image: (assetId: number | null) => ({
    authFooterImageAssetId: assetId,
  }),
  auth_header_image: (assetId: number | null) => ({
    authHeaderImageAssetId: assetId,
  }),
  chat_background_image: (assetId: number | null) => ({
    chatBackgroundImageAssetId: assetId,
  }),
  chat_header_background_image: (assetId: number | null) => ({
    chatHeaderBackgroundImageAssetId: assetId,
  }),
  logo: (assetId: number | null) => ({ logoAssetId: assetId }),
  pwa_icon: (assetId: number | null) => ({ pwaIconAssetId: assetId }),
} satisfies Record<BrandingAssetKind, (assetId: number | null) => object>
```

Compute hashes:

```ts
const checksumSha256 = createHash('sha256').update(asset.data).digest('hex')
const contentHash = checksumSha256.slice(0, 32)
```

Use this operation order for replace:

```ts
const previousAsset = await repository.findActiveAssetByKind(upload.kind)
await storage.putObject({ body, contentLength, contentType, key })
const createdAsset = await repository.createAssetMetadata(metadata)
await repository.upsertSettings(
  settingsPatchByKind[upload.kind](createdAsset.id),
)

if (previousAsset) {
  await repository.deleteAssetMetadata(previousAsset.id)
  await storage.deleteObject({ key: previousAsset.objectKey })
}
```

The old object cleanup happens after the new DB reference is active. If cleanup
throws, the service should audit a cleanup failure and rethrow the controlled
storage error, but must not restore the old settings reference or delete the
new object.

Use this operation order for delete:

```ts
const activeAsset = await repository.findActiveAssetByKind(kind)
if (!activeAsset) {
  return { deleted: false }
}

await repository.deactivateAssetKind(kind)
await repository.deleteAssetMetadata(activeAsset.id)
await storage.deleteObject({ key: activeAsset.objectKey })
return { deleted: true }
```

After delete, a storage failure can leave object content behind, but settings
must already be cleared so public reads return 404.

Return public metadata without `objectKey`, `checksumSha256` or `originalFilename`.

- [ ] **Step 4: Run service tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/branding/assetService.test.ts --reporter verbose
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/branding/assetService.ts backend/src/modules/branding/assetService.test.ts
git commit -m "feat: add branding asset service"
```

## Task 5: Admin/Public Asset Routes

**Files:**

- Modify: `backend/src/modules/branding/routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/app-branding.integration.test.ts`
- Modify: `backend/src/test/appTestHelpers.ts`

- [ ] **Step 1: Write integration tests**

Add tests to `backend/src/app-branding.integration.test.ts`:

```ts
it('uploads a branding logo through an authenticated same-origin admin request', async () => {
  // Create admin session.
  // POST /api/admin/branding/assets/logo with multipart field asset.
  // Expect 200, public response asset kind logo and publicUrl.
  // Expect GET /api/branding returns assets.logo without objectKey/originalFilename.
})

it('rejects admin branding asset uploads without same-origin tenant guard', async () => {
  // Valid admin cookie, Origin: https://evil.example.test.
  // Expect 403 FORBIDDEN_ORIGIN and no asset metadata row.
})

it('streams only active tenant-owned branding assets through the public route', async () => {
  // Upload tenant A logo.
  // GET on tenant A host succeeds with image/png.
  // GET same asset id on tenant B host returns 404.
})

it('deletes an active branding asset through an authenticated same-origin admin request', async () => {
  // Upload logo.
  // DELETE /api/admin/branding/assets/logo.
  // Expect GET /api/branding has no logo and public asset URL returns 404.
})
```

- [ ] **Step 2: Run integration tests and verify failure**

Run:

```bash
pnpm --dir backend exec vitest run src/app-branding.integration.test.ts --no-file-parallelism --reporter verbose
```

Expected: FAIL because routes are missing.

- [ ] **Step 3: Add multipart parsing helpers**

In `backend/src/modules/branding/routes.ts`, add imports:

```ts
import type { MultipartFile } from '@fastify/multipart'

import { ApiError } from '../../lib/errors.js'
import {
  BRANDING_ASSET_MAX_BYTES,
  type BrandingAssetUpload,
} from './assetValidation.js'
import {
  parseBrandingAssetId,
  parseBrandingAssetKind,
  type BrandingAssetKind,
} from './brandingAssets.js'
import type { BrandingAssetService } from './assetService.js'
```

Extend `RegisterBrandingRoutesOptions`:

```ts
createBrandingAssetService: (request: FastifyRequest) => BrandingAssetService
```

Add parsing similar to profile avatar upload:

```ts
const BRANDING_ASSET_REQUEST_OVERHEAD_BYTES = 128 * 1024
const BRANDING_ASSET_REQUEST_MAX_BYTES =
  BRANDING_ASSET_MAX_BYTES + BRANDING_ASSET_REQUEST_OVERHEAD_BYTES

async function readBrandingAssetFile({
  kind,
  part,
}: {
  kind: BrandingAssetKind
  part: MultipartFile
}): Promise<BrandingAssetUpload> {
  if (part.fieldname !== 'asset') {
    throw new ApiError(
      400,
      'BRANDING_ASSET_FIELD_INVALID',
      'Файл нужно передать в поле asset.',
    )
  }

  return {
    data: await part.toBuffer(),
    fileName: part.filename,
    kind,
    mimeType: part.mimetype,
  }
}

function toBrandingMultipartApiError(app: FastifyInstance, error: unknown) {
  if (error instanceof ApiError) {
    return error
  }

  if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
    return new ApiError(
      413,
      'BRANDING_ASSET_TOO_LARGE',
      'Файл брендинга должен быть не больше 5 МБ.',
    )
  }

  if (
    error instanceof app.multipartErrors.FilesLimitError ||
    error instanceof app.multipartErrors.FieldsLimitError ||
    error instanceof app.multipartErrors.PartsLimitError
  ) {
    return new ApiError(
      400,
      'BRANDING_ASSET_REQUEST_INVALID',
      'Можно загрузить только один файл брендинга.',
    )
  }

  if (error instanceof app.multipartErrors.InvalidMultipartContentTypeError) {
    return new ApiError(
      415,
      'BRANDING_ASSET_MULTIPART_REQUIRED',
      'Файл нужно отправить как multipart/form-data.',
    )
  }

  return null
}

async function parseBrandingAssetUpload({
  app,
  kind,
  request,
}: {
  app: FastifyInstance
  kind: BrandingAssetKind
  request: FastifyRequest
}) {
  if (!request.isMultipart()) {
    throw new ApiError(
      415,
      'BRANDING_ASSET_MULTIPART_REQUIRED',
      'Файл нужно отправить как multipart/form-data.',
    )
  }

  let upload: BrandingAssetUpload | null = null

  try {
    const parts = request.parts({
      limits: {
        fields: 0,
        fileSize: BRANDING_ASSET_MAX_BYTES,
        files: 1,
        parts: 1,
      },
    })

    for await (const part of parts) {
      if (part.type === 'field' || upload) {
        throw new ApiError(
          400,
          'BRANDING_ASSET_REQUEST_INVALID',
          'Можно загрузить только один файл брендинга.',
        )
      }

      upload = await readBrandingAssetFile({ kind, part })
    }
  } catch (error) {
    const apiError = toBrandingMultipartApiError(app, error)

    if (apiError) {
      throw apiError
    }

    throw error
  }

  if (!upload) {
    throw new ApiError(
      400,
      'BRANDING_ASSET_FILE_REQUIRED',
      'Выберите файл брендинга.',
    )
  }

  return upload
}
```

- [ ] **Step 4: Add routes**

In `registerBrandingRoutes`, add:

```ts
app.post<{ Params: { kind: string } }>(
  '/api/admin/branding/assets/:kind',
  { bodyLimit: BRANDING_ASSET_REQUEST_MAX_BYTES },
  async (request, reply) => {
    assertAllowedTenantOrigin(request)
    requireTenantContext(request)
    const session = await requireTenantAdminSession({
      createTenantAdminAuthService,
      env,
      reply,
      request,
    })
    const kind = parseBrandingAssetKind(request.params.kind)
    const upload = await parseBrandingAssetUpload({ app, kind, request })

    return createBrandingAssetService(request).uploadAsset({
      admin: session.admin,
      requestIp: request.ip || null,
      upload,
      userAgent: getUserAgent(request),
    })
  },
)

app.delete<{ Params: { kind: string } }>(
  '/api/admin/branding/assets/:kind',
  async (request, reply) => {
    assertAllowedTenantOrigin(request)
    requireTenantContext(request)
    const session = await requireTenantAdminSession({
      createTenantAdminAuthService,
      env,
      reply,
      request,
    })
    const kind = parseBrandingAssetKind(request.params.kind)

    return createBrandingAssetService(request).deleteAsset({
      admin: session.admin,
      kind,
      requestIp: request.ip || null,
      userAgent: getUserAgent(request),
    })
  },
)

app.get<{ Params: { assetId: string } }>(
  '/api/branding/assets/:assetId',
  async (request, reply) => {
    requireTenantContext(request)
    const asset = await createBrandingAssetService(request).getPublicAsset({
      assetId: parseBrandingAssetId(request.params.assetId),
    })

    if (!asset.body) {
      throw new ApiError(
        404,
        'BRANDING_ASSET_NOT_FOUND',
        'Файл брендинга не найден.',
      )
    }

    reply.header('cache-control', 'public, max-age=31536000, immutable')
    reply.header('content-type', asset.contentType)
    if (asset.contentLength !== null) {
      reply.header('content-length', String(asset.contentLength))
    }

    return reply.send(asset.body)
  },
)
```

- [ ] **Step 5: Wire app**

In `backend/src/app.ts`:

- import `createBrandingObjectStorageFromEnv`;
- create one storage instance near other runtime singletons;
- add `createBrandingAssetServiceForRequest`;
- pass it to `registerBrandingRoutes`.

Use:

```ts
const brandingObjectStorage = createBrandingObjectStorageFromEnv(env)

const createBrandingAssetServiceForRequest = (request: FastifyRequest) => {
  const tenant = requireTenantContext(request)
  const adminAuthRepository = createTenantAdminAuthRepository(database.db, {
    tenantId: tenant.id,
  })

  return createBrandingAssetService({
    audit: createTenantAdminAuditLogger(adminAuthRepository),
    repository: createBrandingRepository(database.db, {
      tenantId: tenant.id,
    }),
    storage: brandingObjectStorage,
    tenantId: tenant.id,
  })
}
```

Pass both branding services:

```ts
registerBrandingRoutes(app, {
  createBrandingAssetService: createBrandingAssetServiceForRequest,
  createBrandingService: createBrandingServiceForRequest,
  createTenantAdminAuthService: createTenantAdminAuthServiceForRequest,
  env,
})
```

- [ ] **Step 6: Run integration tests**

Run:

```bash
pnpm --dir backend exec vitest run src/app-branding.integration.test.ts --no-file-parallelism --reporter verbose
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/branding/routes.ts backend/src/app.ts backend/src/app-branding.integration.test.ts backend/src/test/appTestHelpers.ts
git commit -m "feat: add branding asset routes"
```

## Task 6: PWA Icon Integration

**Files:**

- Modify: `backend/src/modules/tenants/routes.ts`
- Modify: `backend/src/modules/tenants/routes.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Write PWA route tests**

Add tests to `backend/src/modules/tenants/routes.test.ts`:

```ts
it('uses active tenant pwa icon metadata in manifest icon URLs', async () => {
  // Seed tenant, branding pwa_icon asset metadata and settings pwaIconAssetId.
  // GET /api/tenant/manifest.webmanifest.
  // Expect icons src contain /api/tenant/icons/icon-192.png?v=<slug>-<contentHash>.
})

it('streams active tenant pwa icon content for tenant icon routes', async () => {
  // Seed active pwa_icon and fake storage body.
  // GET /api/tenant/icons/icon-512.png?v=<slug>-<contentHash>.
  // Expect 200 image/png and immutable cache header.
})

it('keeps fallback pwa icon redirects when tenant has no active pwa icon', async () => {
  // Existing fallback test remains and still expects 302.
})
```

- [ ] **Step 2: Run tenant route tests and verify failure**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/tenants/routes.test.ts --reporter verbose
```

Expected: FAIL because tenant routes do not know branding PWA icon metadata.

- [ ] **Step 3: Add tenant route injection**

In `backend/src/modules/tenants/routes.ts`, import:

```ts
import type { Readable } from 'node:stream'
```

Change `registerTenantRoutes` options:

```ts
type TenantPwaIconReader = {
  getActivePwaIconMetadata(request: FastifyRequest): Promise<{
    contentHash: string
    contentType: string
  } | null>
  getActivePwaIconObject(request: FastifyRequest): Promise<{
    body: Readable | null
    contentHash: string
    contentLength: number | null
    contentType: string
  } | null>
}
```

Use `TenantPwaIconReader` in:

- `getTenantPwaManifest` through `getActivePwaIconMetadata`, so manifest
  generation does not fetch object content;
- `/api/tenant/apple-touch-icon.png` through `getActivePwaIconObject`;
- `/api/tenant/icons/:iconName` through `getActivePwaIconObject`.

When custom icon exists:

```ts
if (!icon.body) {
  throw new ApiError(
    404,
    'TENANT_PWA_ICON_NOT_FOUND',
    'Иконка приложения не найдена.',
  )
}

reply.header('Cache-Control', 'public, max-age=31536000, immutable')
reply.header('Vary', 'Host')
reply.type(icon.contentType)
return reply.send(icon.body)
```

When custom icon does not exist, keep the current fallback redirects and `no-store`.

- [ ] **Step 4: Wire app**

In `backend/src/app.ts`, pass a `TenantPwaIconReader` into `registerTenantRoutes` using the same branding repository/storage service.

Use:

```ts
const tenantPwaIconReader = {
  async getActivePwaIconMetadata(request: FastifyRequest) {
    const tenant = requireTenantContext(request)
    const asset = await createBrandingRepository(database.db, {
      tenantId: tenant.id,
    }).findActivePwaIcon()

    if (!asset) {
      return null
    }

    return {
      contentHash: asset.contentHash,
      contentType: asset.contentType,
    }
  },
  async getActivePwaIconObject(request: FastifyRequest) {
    const tenant = requireTenantContext(request)
    const asset = await createBrandingRepository(database.db, {
      tenantId: tenant.id,
    }).findActivePwaIcon()

    if (!asset) {
      return null
    }

    return createBrandingAssetServiceForRequest(request).getPublicAsset({
      assetId: asset.id,
    })
  },
}

registerTenantRoutes(app, {
  pwaIconReader: tenantPwaIconReader,
  tenantsService,
})
```

- [ ] **Step 5: Run tenant route tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/tenants/routes.test.ts --reporter verbose
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/tenants/routes.ts backend/src/modules/tenants/routes.test.ts backend/src/app.ts
git commit -m "feat: use branding pwa icons in tenant metadata"
```

## Task 7: Full Review, Docs And Verification

**Files:**

- Modify: `docs/architecture/overview.md`
- Modify: `docs/roadmap/work-log.md`
- Modify: `docs/superpowers/plans/2026-06-07-mt-9-branding-assets-storage.md`

- [ ] **Step 1: Self-review code**

Review:

```bash
git diff main...HEAD -- backend/src/modules/branding backend/src/modules/tenants backend/src/integrations/object-storage backend/src/config backend/src/app.ts backend/drizzle tests/e2e
```

Check:

- no public response contains `objectKey`, `checksumSha256`, bucket, endpoint or storage credentials;
- admin upload/delete routes call `assertAllowedTenantOrigin`;
- public asset read uses current tenant and active asset reference before storage;
- PWA icon routes fallback when no active icon exists;
- storage disabled state returns controlled 503 on upload/read custom assets;
- object delete failure does not leave settings pointing at deleted metadata.

- [ ] **Step 2: Request independent code review**

Use `superpowers:requesting-code-review` or an equivalent subagent reviewer for:

```text
Review MT-9 branding asset storage slice for tenant isolation, object-key leakage,
admin/customer boundary, storage failure handling, route contracts, PWA icon cache
behavior and missing tests. Treat this as a security-sensitive backend review.
```

Fix findings before continuing.

- [ ] **Step 3: Update architecture docs after fixes**

In `docs/architecture/overview.md`, update MT-9 section to state:

```markdown
- branding asset binary upload/read/delete is backed by S3-compatible object
  storage through backend-owned routes; public/admin responses expose portal URLs
  and safe metadata only, never object storage keys;
- tenant PWA icon routes can use an active tenant-owned `pwa_icon` asset while
  preserving fallback icons.
```

In `docs/roadmap/work-log.md`, replace `Recommended Next Step` with:

```markdown
## Recommended Next Step

- Start the next `MT-9` admin branding UI asset controls slice: upload/replace/delete controls for logo, PWA icon and configured image slots, plus preview wiring against the storage-backed asset routes.
```

Only update work-log after implementation, review and checks pass.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
pnpm --dir backend exec vitest run src/config/env.test.ts src/integrations/object-storage/brandingStorage.test.ts src/modules/branding/assetValidation.test.ts src/modules/branding/repository.test.ts src/modules/branding/assetService.test.ts src/modules/tenants/routes.test.ts src/app-branding.integration.test.ts --no-file-parallelism --reporter verbose
```

Expected: PASS.

- [ ] **Step 5: Run required checks**

Run:

```bash
pnpm lint
pnpm test
pnpm build
git diff --check
pnpm exec prettier --check backend/src/config backend/src/integrations/object-storage backend/src/modules/branding backend/src/modules/tenants backend/src/app.ts backend/drizzle docs/architecture/overview.md docs/roadmap/work-log.md docs/superpowers/plans/2026-06-07-mt-9-branding-assets-storage.md .env.example .env.production.example infra/object-storage/compose.yaml package.json backend/package.json
```

Expected: all commands PASS.

- [ ] **Step 6: Optional runtime smoke with MinIO**

If Docker is available locally, run:

```bash
pnpm storage:up
pnpm --dir backend db:migrate
```

Then use an authenticated admin browser/session or backend integration harness to upload a PNG `pwa_icon`, request:

```bash
curl -I -H 'Host: buhfirma.127.0.0.1.nip.io:5173' \
  'http://127.0.0.1:5173/api/tenant/icons/icon-512.png'
```

Expected with active custom icon: `200` and `content-type: image/png`.

Expected without active custom icon: `302` fallback redirect.

- [ ] **Step 7: Commit**

```bash
git add docs/architecture/overview.md docs/roadmap/work-log.md docs/superpowers/plans/2026-06-07-mt-9-branding-assets-storage.md
git commit -m "docs: record mt-9 branding asset storage completion"
```

## Acceptance Criteria

- Tenant admin can upload a supported branding image through backend-owned multipart route.
- Upload requires same-origin tenant admin session.
- Upload stores binary content in S3-compatible storage and metadata in portal DB.
- Active asset reference is explicit in `portal_branding_settings`, including `pwa_icon_asset_id`.
- Public branding responses include only safe metadata and portal-owned URLs.
- Public asset reads resolve current tenant and active asset reference before object storage fetch.
- Tenant A cannot fetch, activate, replace or delete tenant B assets.
- Admin delete clears the active reference and makes the previous public asset URL unavailable for the tenant.
- PWA manifest/icon routes use an active tenant PWA icon when configured and fallback icons otherwise.
- Browser never receives object key, bucket, endpoint, access key, secret key, checksum or original filename.
- Storage missing/misconfigured state returns controlled backend errors instead of crashing.

## Self-Review

- Spec coverage: covered storage config, MinIO local flow, metadata source of truth, tenant-scoped reads/writes, admin upload/delete, public asset read, PWA icon integration, tests and docs.
- Placeholder scan: no unresolved placeholder requirements remain.
- Type consistency: plan consistently uses `BrandingAssetKind`, `pwaIconAssetId`, `BrandingObjectStorage`, `createBrandingObjectStorageFromEnv`, `normalizeBrandingAssetUpload` and `TenantPwaIconReader`.
- Scope check: admin UI upload controls and visual preview are intentionally left for the next slice after backend storage is reliable.

## Plan Review Notes

Reviewed and hardened before implementation:

- Full branding slice map is recorded in `docs/roadmap/implementation-plan.md`;
  this plan is explicitly `MT-9E`, not the whole branding feature.
- Repository/service consistency is fixed: `findActiveAssetByKind` is created
  before `assetService` depends on it.
- Route parser consistency is fixed: `parseBrandingAssetKind` and
  `parseBrandingAssetId` are defined before admin/public routes use them.
- Storage stream contract is fixed: object storage converts SDK Web streams to
  Node `Readable` before Fastify routes send the body.
- Local MinIO bootstrap is made robust through `quay.io/minio/*` images and a
  retrying `mc alias set` loop instead of an invalid server-image readiness
  probe.
- Multipart upload handling is explicit: route-level body limit, file limit,
  non-multipart error, too-large error and invalid field/parts errors all map
  to controlled API errors.
- Replace/delete ordering is explicit: settings move away from stale assets
  before old object cleanup, so public URLs do not point at deleted metadata.
- PWA icon reader is split into metadata and object methods, so manifest
  generation does not fetch binary object content.
