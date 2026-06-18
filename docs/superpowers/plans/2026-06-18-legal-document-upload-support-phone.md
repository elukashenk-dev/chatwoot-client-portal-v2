# Legal Document Upload And Support Phone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tenant admins can upload Terms and Privacy documents as PDF/DOCX/TXT files, the portal renders the extracted active legal text on public legal pages, registration records the active document versions server-side, and auth surfaces show a tenant-owned support phone.

**Architecture:** Keep legal documents as a separate tenant-scoped public-content module, not as branding assets and not as frontend constants. File upload is admin-only; backend validates/parses the file, stores normalized extracted text plus source metadata/version in Postgres, exposes only active tenant documents publicly, and registration reads active versions from backend state. Support phone is small public branding metadata and remains in the existing branding settings contract because it is rendered on auth surfaces and admin preview.

**Tech Stack:** Fastify, Drizzle/Postgres, Zod, `@fastify/multipart`, `pdf-parse` v2 (`PDFParse`), `mammoth.extractRawText`, React 19, React Router, Vitest, Playwright.

---

## Scope Decisions

- Upload UX is file-only. No inline legal text editor in the first slice.
- Supported legal upload formats in the first slice: `.pdf`, `.docx`, `.txt`.
- Public legal pages render extracted text in the existing portal legal reader UI. They do not iframe PDFs, preserve Word layout, execute uploaded HTML, or expose original binary files.
- Backend stores stable active document versions and source metadata. Old document versions are archived, not deleted.
- Browser submits only consent booleans during registration. Browser never submits legal versions.
- Support phone is tenant-configured and optional in runtime rendering. Empty phone hides phone links on auth surfaces; backend error copy falls back to generic support wording.

## External Package Notes

- `pdf-parse@2.4.5` uses `import { PDFParse } from 'pdf-parse'`; text extraction is `const parser = new PDFParse({ data: buffer }); const result = await parser.getText(); await parser.destroy();`.
- `mammoth@1.12.0` supports `extractRawText({ buffer })`; its HTML conversion performs no sanitisation, so this plan intentionally uses raw text extraction only.
- `pdf-parse` brings native/canvas transitive dependencies. Treat `pnpm install`, backend build and production Docker build as required gates before merge.

## File Map

### Backend

- Create `backend/src/db/tenantSchema.ts`
  - Moves the existing `portalTenants` table definition out of the schema barrel so domain schema files do not import from `schema.ts`.
- Modify `backend/src/db/schema.ts`
  - Imports and re-exports `portalTenants` from `tenantSchema.ts`.
  - Re-exports `legalDocumentSchema`.
- Create `backend/src/db/legalDocumentSchema.ts`
  - Defines `portalLegalDocuments`.
  - Keeps tenant-scoped active/archive versions and source metadata.
- Modify `backend/src/db/brandingSchema.ts`
  - Imports `portalTenants` from `tenantSchema.ts` instead of the schema barrel.
- Create generated migration under `backend/drizzle/`
  - Adds `portal_legal_documents`.
  - Adds `support_phone_display` to `portal_branding_settings`.
- Modify `backend/package.json` and `pnpm-lock.yaml`
  - Add backend dependencies `pdf-parse` and `mammoth`.
- Create `backend/src/modules/legal-documents/legalDocumentTypes.ts`
  - Document type constants, public/admin DTO types, limits.
- Create `backend/src/modules/legal-documents/documentParser.ts`
  - Validates uploaded file type/signature, sanitizes source metadata and extracts normalized text.
- Create `backend/src/modules/legal-documents/repository.ts`
  - Finds active docs, archives previous active doc, inserts new active doc.
- Create `backend/src/modules/legal-documents/service.ts`
  - Owns upload/versioning/read behavior and audit events.
- Create `backend/src/modules/legal-documents/routes.ts`
  - Public `GET /api/legal-documents/:documentType`.
  - Admin `GET /api/admin/legal-documents`.
  - Admin `POST /api/admin/legal-documents/:documentType`.
- Modify `backend/src/app.ts`
  - Wire repository/service/routes into tenant context and admin auth.
- Modify `backend/src/modules/branding/brandingValidation.ts`
  - Accept `supportPhoneDisplay`.
- Create `backend/src/modules/branding/supportPhone.ts`
  - Single backend normalizer for admin validation and public `tel:` href generation.
- Modify `backend/src/modules/branding/repository.ts`
  - Persist/select `supportPhoneDisplay`.
- Modify `backend/src/modules/branding/service.ts`
  - Return `supportContact` in public/admin branding.
- Modify `backend/src/modules/registration/service.ts`
  - Replace static legal versions with active legal document versions.
  - Replace hardcoded support phone in contact-not-found error with configured phone when present.
- Delete or stop using `backend/src/modules/registration/legalDocuments.ts`.

### Frontend

- Modify `frontend/src/features/branding/api/publicBrandingClient.ts`
  - Add `supportContact`.
- Modify `frontend/src/features/admin-branding/api/adminBrandingClient.ts`
  - Add `supportContact` to response and `supportPhoneDisplay` to patch.
  - Add legal document admin upload/read client functions or create a focused legal client.
- Modify `frontend/src/features/branding/lib/brandingDefaults.ts`
  - Add `supportContact: { phoneDisplay: null, phoneHref: null }`.
- Modify `frontend/src/features/admin-branding/lib/brandingState.ts`
  - Add `supportPhoneDisplay` draft field and patch mapping.
- Modify `frontend/src/features/auth/components/AuthCompactSupport.tsx`
  - Read support phone from branding.
  - Hide the phone link when no phone is configured.
- Modify `frontend/src/features/auth/components/AuthSupportBlock.tsx`
  - Same behavior, including preview mode.
- Delete or stop using `frontend/src/features/auth/components/supportContact.ts`.
- Create `frontend/src/features/legal/api/legalDocumentsClient.ts`
  - Public legal doc fetch.
- Modify `frontend/src/features/legal/pages/LegalDocumentPage.tsx`
  - Fetch legal document from backend by route document type.
  - Render loading, error and active document body states.
- Delete or stop using `frontend/src/features/legal/legalDocuments.ts`.
- Create `frontend/src/features/admin-branding/components/AdminLegalDocumentControls.tsx`
  - Two upload-only controls: Terms and Privacy.
  - Shows current filename/version/upload timestamp/extracted character count.
- Modify `frontend/src/features/admin-branding/components/AdminBrandingForm.tsx`
  - Add support phone field to “Основное”.
  - Add legal document controls as a separate “Документы” section.
- Modify `frontend/src/features/admin-shell/pages/AdminBrandingPage.tsx`
  - Load admin legal document summary alongside branding.
  - Handle legal file upload actions separately from image asset actions.
  - Preserve unsaved branding text/color changes after legal upload.
- Modify admin preview components if they currently assume the old hardcoded phone.

### Tests And Docs

- Backend tests:
  - `backend/src/modules/legal-documents/documentParser.test.ts`
  - `backend/src/modules/legal-documents/repository.test.ts`
  - `backend/src/modules/legal-documents/service.test.ts`
  - `backend/src/modules/legal-documents/routes.test.ts`
  - Updates to `backend/src/modules/branding/service.test.ts`
  - Updates to `backend/src/modules/branding/repository.test.ts`
  - Updates to `backend/src/modules/registration/service.test.ts`
  - Updates to `backend/src/app-branding.integration.test.ts` or a new legal integration test.
- Frontend tests:
  - `frontend/src/app/AppRoutes.legal.test.tsx`
  - `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`
  - `frontend/src/features/admin-branding/api/adminBrandingClient.test.ts`
  - Auth page tests that currently assert `+7 (800) 000-00-00`.
- E2E:
  - Add or extend `tests/e2e/admin-branding-settings.spec.ts` or create `tests/e2e/admin-legal-documents.spec.ts`.
- Docs:
  - Update `docs/roadmap/work-log.md` only after implementation, review and checks close because this removes the production legal-copy blocker.
  - Add a short operator note under `docs/operations/` if manual legal upload becomes part of production readiness.

---

## Phase 1: Backend Legal Document Model And Parsing

**Files:**

- Create: `backend/src/db/tenantSchema.ts`
- Create: `backend/src/db/legalDocumentSchema.ts`
- Modify: `backend/src/db/brandingSchema.ts`
- Modify: `backend/src/db/schema.ts`
- Modify: `backend/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `backend/src/modules/legal-documents/legalDocumentTypes.ts`
- Create: `backend/src/modules/legal-documents/documentParser.ts`
- Test: `backend/src/modules/legal-documents/documentParser.test.ts`

**Risk:** PDF/DOCX parser dependencies can introduce memory/runtime surprises. Keep parsing isolated behind one adapter and cover malformed/empty/scanned documents with backend tests.

- [ ] **Step 1: Add parser dependencies**

Run:

```bash
pnpm --dir backend add pdf-parse mammoth
```

Expected:

- `backend/package.json` has `pdf-parse` and `mammoth` in dependencies.
- root `pnpm-lock.yaml` changes.

- [ ] **Step 2: Extract tenant schema dependency and create legal document schema**

Move the existing `portalTenants` table definition from `backend/src/db/schema.ts` to a new `backend/src/db/tenantSchema.ts` without changing its columns, indexes or check constraints.

Then import it in `backend/src/db/schema.ts`:

```ts
export { portalTenants } from './tenantSchema.js'
```

Also update `backend/src/db/brandingSchema.ts` so its tenant import is no longer circular:

```ts
import { portalTenants } from './tenantSchema.js'
```

Then add `backend/src/db/legalDocumentSchema.ts`:

```ts
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
```

- [ ] **Step 3: Re-export schema**

Modify `backend/src/db/schema.ts`:

```ts
export { portalTenants } from './tenantSchema.js'
export * from './brandingSchema.js'
export * from './legalDocumentSchema.js'
export * from './notificationSchema.js'
export * from './provisioningSchema.js'
```

- [ ] **Step 4: Generate migration**

Run:

```bash
pnpm --dir backend db:generate
```

Expected:

- A new SQL migration appears under `backend/drizzle/`.
- Migration creates `portal_legal_documents`.
- Migration does not touch unrelated tables except later Phase 3 support phone changes if generated together.

- [ ] **Step 5: Add legal document constants and DTOs**

Create `backend/src/modules/legal-documents/legalDocumentTypes.ts`:

```ts
export const legalDocumentTypes = ['terms', 'privacy'] as const

export type LegalDocumentType = (typeof legalDocumentTypes)[number]

export const LEGAL_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
export const LEGAL_DOCUMENT_REQUEST_MAX_BYTES =
  LEGAL_DOCUMENT_MAX_BYTES + 128 * 1024
export const LEGAL_DOCUMENT_MAX_TEXT_LENGTH = 200_000
export const LEGAL_DOCUMENT_MIN_TEXT_LENGTH = 20
export const LEGAL_DOCUMENT_MAX_FILE_NAME_LENGTH = 180
export const LEGAL_DOCUMENT_MAX_CONTENT_TYPE_LENGTH = 120

export const legalDocumentTitles = {
  privacy: 'Политика обработки персональных данных',
  terms: 'Пользовательское соглашение',
} satisfies Record<LegalDocumentType, string>

export type LegalDocumentUpload = {
  data: Buffer
  fileName: string
  mimeType: string
}
```

- [ ] **Step 6: Write failing parser tests**

Create `backend/src/modules/legal-documents/documentParser.test.ts` with tests for:

```ts
import { describe, expect, it } from 'vitest'

import {
  LEGAL_DOCUMENT_MAX_BYTES,
  LEGAL_DOCUMENT_MAX_TEXT_LENGTH,
} from './legalDocumentTypes.js'
import {
  createLegalDocumentVersion,
  detectLegalDocumentSourceType,
  normalizeExtractedLegalText,
  sanitizeLegalDocumentSourceFileName,
} from './documentParser.js'

describe('legal document parser helpers', () => {
  it('accepts txt uploads by extension and content type', () => {
    expect(
      detectLegalDocumentSourceType({
        data: Buffer.from('Пользовательское соглашение\n\nТекст документа.'),
        fileName: 'terms.txt',
        mimeType: 'text/plain',
      }),
    ).toBe('txt')
  })

  it('accepts pdf uploads only when the file starts with the PDF signature', () => {
    expect(
      detectLegalDocumentSourceType({
        data: Buffer.from('%PDF-1.7\nbody'),
        fileName: 'terms.pdf',
        mimeType: 'application/pdf',
      }),
    ).toBe('pdf')
  })

  it('accepts docx uploads only when the file has a ZIP signature', () => {
    expect(
      detectLegalDocumentSourceType({
        data: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01]),
        fileName: 'privacy.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ).toBe('docx')
  })

  it('rejects empty files before parser dependencies run', () => {
    expect(() =>
      detectLegalDocumentSourceType({
        data: Buffer.alloc(0),
        fileName: 'terms.pdf',
        mimeType: 'application/pdf',
      }),
    ).toThrow('LEGAL_DOCUMENT_EMPTY')
  })

  it('rejects unsupported file extensions and MIME types', () => {
    expect(() =>
      detectLegalDocumentSourceType({
        data: Buffer.from('<script>alert(1)</script>'),
        fileName: 'terms.html',
        mimeType: 'text/html',
      }),
    ).toThrow('LEGAL_DOCUMENT_TYPE_UNSUPPORTED')
  })

  it('sanitizes uploaded source filenames before storing metadata', () => {
    expect(
      sanitizeLegalDocumentSourceFileName('..\\\\nested/terms\\u0000.pdf'),
    ).toBe('terms.pdf')
  })

  it('rejects source filenames that become empty after sanitization', () => {
    expect(() => sanitizeLegalDocumentSourceFileName('\\u0000/')).toThrow(
      'LEGAL_DOCUMENT_FILE_NAME_INVALID',
    )
  })

  it('normalizes extracted legal text without preserving unsafe markup', () => {
    expect(
      normalizeExtractedLegalText(
        '  Заголовок\\r\\n\\r\\n\\r\\nПункт 1\\t\\tПункт 2  ',
      ),
    ).toBe('Заголовок\\n\\nПункт 1 Пункт 2')
  })

  it('rejects parsed text that is too short to be a legal document', () => {
    expect(() => normalizeExtractedLegalText('коротко')).toThrow(
      'LEGAL_DOCUMENT_TEXT_EMPTY',
    )
  })

  it('rejects parsed text above the stored text limit', () => {
    expect(() =>
      normalizeExtractedLegalText(
        'а'.repeat(LEGAL_DOCUMENT_MAX_TEXT_LENGTH + 1),
      ),
    ).toThrow('LEGAL_DOCUMENT_TEXT_TOO_LARGE')
  })

  it('keeps upload size limit explicit for route limits', () => {
    expect(LEGAL_DOCUMENT_MAX_BYTES).toBe(10 * 1024 * 1024)
  })

  it('generates distinct versions for repeated uploads of the same file', () => {
    const at = new Date('2026-06-18T10:20:30.456Z')
    const sourceSha256 = 'a'.repeat(64)

    expect(createLegalDocumentVersion({ at, sourceSha256 })).not.toBe(
      createLegalDocumentVersion({ at, sourceSha256 }),
    )
  })
})
```

- [ ] **Step 7: Run parser helper tests and confirm they fail**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/legal-documents/documentParser.test.ts --no-file-parallelism --reporter verbose
```

Expected:

- Fails because `documentParser.ts` does not exist yet.

- [ ] **Step 8: Implement parser adapter**

Create `backend/src/modules/legal-documents/documentParser.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto'

import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'

import { ApiError } from '../../lib/errors.js'
import {
  LEGAL_DOCUMENT_MAX_BYTES,
  LEGAL_DOCUMENT_MAX_CONTENT_TYPE_LENGTH,
  LEGAL_DOCUMENT_MAX_FILE_NAME_LENGTH,
  LEGAL_DOCUMENT_MAX_TEXT_LENGTH,
  LEGAL_DOCUMENT_MIN_TEXT_LENGTH,
  type LegalDocumentUpload,
} from './legalDocumentTypes.js'

export type LegalDocumentSourceType = 'docx' | 'pdf' | 'txt'

const docxMime =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function hasPdfSignature(data: Buffer) {
  return data.subarray(0, 5).toString('ascii') === '%PDF-'
}

function hasZipSignature(data: Buffer) {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b
}

function getExtension(fileName: string) {
  return fileName.trim().toLowerCase().split('.').pop() ?? ''
}

export function sanitizeLegalDocumentSourceFileName(fileName: string) {
  const sanitized = fileName
    .replace(/[\\u0000-\\u001f\\u007f]/gu, '')
    .split(/[\\\\/]/u)
    .pop()
    ?.trim()

  if (!sanitized) {
    throw new ApiError(
      400,
      'LEGAL_DOCUMENT_FILE_NAME_INVALID',
      'Некорректное имя файла документа.',
    )
  }

  if (sanitized.length > LEGAL_DOCUMENT_MAX_FILE_NAME_LENGTH) {
    throw new ApiError(
      400,
      'LEGAL_DOCUMENT_FILE_NAME_TOO_LONG',
      'Имя файла документа слишком длинное.',
    )
  }

  return sanitized
}

export function sanitizeLegalDocumentContentType(contentType: string) {
  const sanitized = contentType.trim().toLowerCase()

  if (!sanitized || sanitized.length > LEGAL_DOCUMENT_MAX_CONTENT_TYPE_LENGTH) {
    throw new ApiError(
      400,
      'LEGAL_DOCUMENT_CONTENT_TYPE_INVALID',
      'Некорректный тип файла документа.',
    )
  }

  return sanitized
}

export function detectLegalDocumentSourceType(
  upload: LegalDocumentUpload,
): LegalDocumentSourceType {
  const fileName = sanitizeLegalDocumentSourceFileName(upload.fileName)
  const mimeType = sanitizeLegalDocumentContentType(upload.mimeType)

  if (upload.data.byteLength === 0) {
    throw new ApiError(400, 'LEGAL_DOCUMENT_EMPTY', 'Файл документа пустой.')
  }

  if (upload.data.byteLength > LEGAL_DOCUMENT_MAX_BYTES) {
    throw new ApiError(
      413,
      'LEGAL_DOCUMENT_TOO_LARGE',
      'Документ должен быть не больше 10 МБ.',
    )
  }

  const extension = getExtension(fileName)

  if (extension === 'txt' && mimeType.startsWith('text/plain')) {
    return 'txt'
  }

  if (
    extension === 'pdf' &&
    mimeType === 'application/pdf' &&
    hasPdfSignature(upload.data)
  ) {
    return 'pdf'
  }

  if (
    extension === 'docx' &&
    mimeType === docxMime &&
    hasZipSignature(upload.data)
  ) {
    return 'docx'
  }

  throw new ApiError(
    415,
    'LEGAL_DOCUMENT_TYPE_UNSUPPORTED',
    'Загрузите документ в формате PDF, DOCX или TXT.',
  )
}

export function normalizeExtractedLegalText(input: string) {
  const normalized = input
    .replace(/\\r\\n?/gu, '\\n')
    .replace(/[\\t ]+/gu, ' ')
    .replace(/\\n[\\t ]+/gu, '\\n')
    .replace(/[\\t ]+\\n/gu, '\\n')
    .replace(/\\n{3,}/gu, '\\n\\n')
    .trim()

  if (normalized.length < LEGAL_DOCUMENT_MIN_TEXT_LENGTH) {
    throw new ApiError(
      422,
      'LEGAL_DOCUMENT_TEXT_EMPTY',
      'Не удалось извлечь текст документа. Проверьте, что файл содержит текст, а не только скан.',
    )
  }

  if (normalized.length > LEGAL_DOCUMENT_MAX_TEXT_LENGTH) {
    throw new ApiError(
      413,
      'LEGAL_DOCUMENT_TEXT_TOO_LARGE',
      'Извлеченный текст документа слишком большой.',
    )
  }

  return normalized
}

export function createLegalDocumentVersion({
  at,
  sourceSha256,
}: {
  at: Date
  sourceSha256: string
}) {
  const timestamp = at.toISOString().replace(/[-:.]/gu, '')
  const randomSuffix = randomBytes(4).toString('hex')

  return `${timestamp}-${sourceSha256.slice(0, 16)}-${randomSuffix}`
}

export function createLegalDocumentSourceSha256(data: Buffer) {
  return createHash('sha256').update(data).digest('hex')
}

export async function extractLegalDocumentText(upload: LegalDocumentUpload) {
  const sourceType = detectLegalDocumentSourceType(upload)

  if (sourceType === 'txt') {
    return normalizeExtractedLegalText(upload.data.toString('utf8'))
  }

  if (sourceType === 'docx') {
    try {
      const result = await mammoth.extractRawText({ buffer: upload.data })

      return normalizeExtractedLegalText(result.value)
    } catch {
      throw new ApiError(
        422,
        'LEGAL_DOCUMENT_PARSE_FAILED',
        'Не удалось прочитать документ. Проверьте файл и попробуйте снова.',
      )
    }
  }

  const parser = new PDFParse({ data: upload.data })

  try {
    const result = await parser.getText()

    return normalizeExtractedLegalText(result.text)
  } catch (error) {
    throw new ApiError(
      422,
      'LEGAL_DOCUMENT_PARSE_FAILED',
      'Не удалось прочитать документ. Проверьте файл и попробуйте снова.',
    )
  } finally {
    await parser.destroy()
  }
}
```

- [ ] **Step 9: Run parser helper tests again**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/legal-documents/documentParser.test.ts --no-file-parallelism --reporter verbose
```

Expected:

- Tests pass.
- If TypeScript import style for `mammoth` differs, fix the import in `documentParser.ts` and keep the same public adapter API.

- [ ] **Step 10: Add parser extraction tests for PDF and DOCX**

Extend `documentParser.test.ts` with extraction tests that call `extractLegalDocumentText()` against tiny in-memory PDF/DOCX buffers. Do not commit binary fixtures for this slice; keep the test data generated in code so the repository diff stays reviewable.

```ts
import { extractLegalDocumentText } from './documentParser.js'

function createMinimalPdfBuffer(text: string) {
  // Build a one-page PDF with selectable ASCII text.
}

function createMinimalDocxBuffer(text: string) {
  // Build a minimal ZIP/DOCX with a single document.xml paragraph.
}

it('extracts selectable text from a PDF legal document', async () => {
  await expect(
    extractLegalDocumentText({
      data: createMinimalPdfBuffer('Legal terms text'),
      fileName: 'sample-terms.pdf',
      mimeType: 'application/pdf',
    }),
  ).resolves.toContain('Legal terms text')
})

it('extracts raw text from a DOCX legal document', async () => {
  await expect(
    extractLegalDocumentText({
      data: createMinimalDocxBuffer('Privacy policy text'),
      fileName: 'sample-privacy.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
  ).resolves.toContain('Privacy policy text')
})

it('maps malformed DOCX parser errors to a controlled upload error', async () => {
  await expect(
    extractLegalDocumentText({
      data: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01]),
      fileName: 'broken.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
  ).rejects.toMatchObject({ code: 'LEGAL_DOCUMENT_PARSE_FAILED' })
})

it('maps malformed PDF parser errors to a controlled upload error', async () => {
  await expect(
    extractLegalDocumentText({
      data: Buffer.from('%PDF-1.7\nbroken'),
      fileName: 'broken.pdf',
      mimeType: 'application/pdf',
    }),
  ).rejects.toMatchObject({ code: 'LEGAL_DOCUMENT_PARSE_FAILED' })
})
```

## Phase 2: Backend Repository, Service And Routes

**Files:**

- Create: `backend/src/modules/legal-documents/repository.ts`
- Create: `backend/src/modules/legal-documents/service.ts`
- Create: `backend/src/modules/legal-documents/routes.ts`
- Modify: `backend/src/app.ts`
- Test: backend legal document route/service/repository tests.

**Risk:** Cross-tenant leaks and unstable document versions. All reads/writes must use current tenant scope, and upload must archive the previous active document inside one transaction.

- [ ] **Step 1: Write repository tests**

Create `backend/src/modules/legal-documents/repository.test.ts` with these cases:

- `findActiveDocument('terms')` returns `null` for a tenant without docs.
- `activateDocument()` inserts an active doc.
- second `activateDocument()` archives previous active doc for the same tenant/type.
- repeated activation for the same tenant/type/file does not leave two active rows.
- concurrent activation for the same tenant/type is serialized by the advisory lock.
- tenant B cannot read tenant A active docs.

Use `createTestDatabase()` and `createTestTenant()` patterns from existing repository tests.

- [ ] **Step 2: Implement repository**

Create `backend/src/modules/legal-documents/repository.ts` with this public shape:

```ts
import { createHash } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import { portalLegalDocuments } from '../../db/schema.js'
import type { LegalDocumentType } from './legalDocumentTypes.js'

export type ActiveLegalDocumentRow = typeof portalLegalDocuments.$inferSelect

export type ActivateLegalDocumentInput = {
  bodyText: string
  documentType: LegalDocumentType
  sourceByteSize: number
  sourceContentType: string
  sourceFileName: string
  sourceSha256: string
  title: string
  version: string
}

function createLegalDocumentLockKey(
  tenantId: number,
  documentType: LegalDocumentType,
) {
  const digest = createHash('sha256')
    .update(`legal-document:${tenantId}:${documentType}`)
    .digest()

  return [digest.readInt32BE(0), digest.readInt32BE(4)] as const
}

export function createLegalDocumentsRepository(
  db: AppDatabase,
  { tenantId }: { tenantId: number },
) {
  return {
    async findActiveDocument(documentType: LegalDocumentType) {
      const [document] = await db
        .select()
        .from(portalLegalDocuments)
        .where(
          and(
            eq(portalLegalDocuments.tenantId, tenantId),
            eq(portalLegalDocuments.documentType, documentType),
            eq(portalLegalDocuments.status, 'active'),
          ),
        )
        .limit(1)

      return document ?? null
    },

    async findActiveDocuments() {
      return db
        .select()
        .from(portalLegalDocuments)
        .where(
          and(
            eq(portalLegalDocuments.tenantId, tenantId),
            eq(portalLegalDocuments.status, 'active'),
          ),
        )
        .orderBy(portalLegalDocuments.documentType)
    },

    async activateDocument(input: ActivateLegalDocumentInput) {
      const now = new Date()
      const [lockKeyPartOne, lockKeyPartTwo] = createLegalDocumentLockKey(
        tenantId,
        input.documentType,
      )

      return db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${lockKeyPartOne}, ${lockKeyPartTwo})`,
        )

        await tx
          .update(portalLegalDocuments)
          .set({
            archivedAt: now,
            status: 'archived',
            updatedAt: now,
          })
          .where(
            and(
              eq(portalLegalDocuments.tenantId, tenantId),
              eq(portalLegalDocuments.documentType, input.documentType),
              eq(portalLegalDocuments.status, 'active'),
            ),
          )

        const [document] = await tx
          .insert(portalLegalDocuments)
          .values({
            ...input,
            activatedAt: now,
            status: 'active',
            tenantId,
            updatedAt: now,
          })
          .returning()

        if (!document) {
          throw new Error('Failed to activate legal document.')
        }

        return document
      })
    },
  }
}

export type LegalDocumentsRepository = ReturnType<
  typeof createLegalDocumentsRepository
>
```

- [ ] **Step 3: Write service tests**

Create `backend/src/modules/legal-documents/service.test.ts` with these cases:

- uploads TXT terms and returns summary with generated version/hash.
- uploading the same TXT twice in the same second still creates distinct versions.
- rejects unsupported document type before repository write.
- public read returns active document body split-ready as text.
- missing document returns a controlled `LEGAL_DOCUMENT_NOT_CONFIGURED` error.
- audit is written with action `legal_document_uploaded`.

- [ ] **Step 4: Implement service**

Create `backend/src/modules/legal-documents/service.ts` with:

```ts
import { ApiError } from '../../lib/errors.js'
import type { PublicTenantAdmin } from '../tenant-admin/adminAuthService.js'
import {
  createLegalDocumentSourceSha256,
  createLegalDocumentVersion,
  extractLegalDocumentText,
  sanitizeLegalDocumentContentType,
  sanitizeLegalDocumentSourceFileName,
} from './documentParser.js'
import {
  legalDocumentTitles,
  legalDocumentTypes,
  type LegalDocumentType,
  type LegalDocumentUpload,
} from './legalDocumentTypes.js'
import type { LegalDocumentsRepository } from './repository.js'

type LegalAudit = (input: {
  action: string
  actor?: PublicTenantAdmin | null
  metadata?: Record<string, unknown>
  outcome: string
  requestIp: string | null
  subjectEmail?: string | null
  userAgent: string | null
}) => Promise<void> | void

function assertLegalDocumentType(value: string): LegalDocumentType {
  if (legalDocumentTypes.includes(value as LegalDocumentType)) {
    return value as LegalDocumentType
  }

  throw new ApiError(404, 'LEGAL_DOCUMENT_NOT_FOUND', 'Документ не найден.')
}

function toSummary(
  document: Awaited<ReturnType<LegalDocumentsRepository['findActiveDocument']>>,
) {
  if (!document) {
    return null
  }

  return {
    activatedAt: document.activatedAt.toISOString(),
    bodyCharacterCount: document.bodyText.length,
    documentType: document.documentType as LegalDocumentType,
    sourceContentType: document.sourceContentType,
    sourceFileName: document.sourceFileName,
    sourceSha256: document.sourceSha256,
    title: document.title,
    version: document.version,
  }
}

export function createLegalDocumentsService({
  audit,
  now = () => new Date(),
  repository,
}: {
  audit: LegalAudit
  now?: () => Date
  repository: LegalDocumentsRepository
}) {
  return {
    parseDocumentType: assertLegalDocumentType,

    async getPublicDocument(documentType: LegalDocumentType) {
      const document = await repository.findActiveDocument(documentType)

      if (!document) {
        throw new ApiError(
          404,
          'LEGAL_DOCUMENT_NOT_CONFIGURED',
          'Документ пока не загружен.',
        )
      }

      return {
        document: {
          bodyText: document.bodyText,
          documentType,
          title: document.title,
          version: document.version,
        },
      }
    },

    async getAdminDocuments() {
      const activeDocuments = await repository.findActiveDocuments()
      const summaries = Object.fromEntries(
        activeDocuments.map((document) => [
          document.documentType,
          toSummary(document),
        ]),
      )

      return {
        documents: {
          privacy: summaries.privacy ?? null,
          terms: summaries.terms ?? null,
        },
      }
    },

    async uploadDocument({
      admin,
      documentType,
      requestIp,
      upload,
      userAgent,
    }: {
      admin: PublicTenantAdmin
      documentType: LegalDocumentType
      requestIp: string | null
      upload: LegalDocumentUpload
      userAgent: string | null
    }) {
      const bodyText = await extractLegalDocumentText(upload)
      const sourceSha256 = createLegalDocumentSourceSha256(upload.data)
      const document = await repository.activateDocument({
        bodyText,
        documentType,
        sourceByteSize: upload.data.byteLength,
        sourceContentType: sanitizeLegalDocumentContentType(upload.mimeType),
        sourceFileName: sanitizeLegalDocumentSourceFileName(upload.fileName),
        sourceSha256,
        title: legalDocumentTitles[documentType],
        version: createLegalDocumentVersion({
          at: now(),
          sourceSha256,
        }),
      })

      await audit({
        action: 'legal_document_uploaded',
        actor: admin,
        metadata: {
          bodyCharacterCount: document.bodyText.length,
          documentType,
          sourceByteSize: document.sourceByteSize,
          sourceContentType: document.sourceContentType,
          sourceFileName: document.sourceFileName,
          sourceSha256: document.sourceSha256,
          version: document.version,
        },
        outcome: 'success',
        requestIp,
        subjectEmail: admin.email,
        userAgent,
      })

      return { document: toSummary(document) }
    },

    async getActiveVersionsForRegistration() {
      const [terms, privacy] = await Promise.all([
        repository.findActiveDocument('terms'),
        repository.findActiveDocument('privacy'),
      ])

      if (!terms || !privacy) {
        throw new ApiError(
          503,
          'LEGAL_DOCUMENTS_NOT_CONFIGURED',
          'Регистрация временно недоступна: юридические документы еще не загружены.',
        )
      }

      return {
        privacyPolicyVersion: privacy.version,
        termsVersion: terms.version,
      }
    },
  }
}

export type LegalDocumentsService = ReturnType<
  typeof createLegalDocumentsService
>
```

- [ ] **Step 5: Implement routes with multipart isolation**

Create `backend/src/modules/legal-documents/routes.ts`.

Important route behavior:

- Public route needs only tenant context.
- Admin routes require tenant admin session and origin guard for writes.
- Authenticated admin uploads with a missing or foreign `Origin` must return 403 before parsing/storing the document.
- Upload field must be named `document`.
- Route uses `bodyLimit: LEGAL_DOCUMENT_REQUEST_MAX_BYTES`.
- `request.parts()` uses `fields: 0`, `files: 1`, `parts: 1`, `fileSize: LEGAL_DOCUMENT_MAX_BYTES`.

Use the multipart error mapping style from `backend/src/modules/branding/routes.ts`, but with legal-specific error codes/messages.

- [ ] **Step 6: Wire module in app**

Modify `backend/src/app.ts`:

```ts
import { createLegalDocumentsRepository } from './modules/legal-documents/repository.js'
import { registerLegalDocumentRoutes } from './modules/legal-documents/routes.js'
import { createLegalDocumentsService } from './modules/legal-documents/service.js'
```

Add factory near branding factories:

```ts
const createLegalDocumentsServiceForRequest = (request: FastifyRequest) => {
  const tenant = requireTenantContext(request)
  const adminAuthRepository = createTenantAdminAuthRepository(database.db, {
    tenantId: tenant.id,
  })

  return createLegalDocumentsService({
    audit: createTenantAdminAuditLogger(adminAuthRepository),
    repository: createLegalDocumentsRepository(database.db, {
      tenantId: tenant.id,
    }),
    ...(now ? { now } : {}),
  })
}
```

Register routes before registration routes:

```ts
registerLegalDocumentRoutes(app, {
  createLegalDocumentsService: createLegalDocumentsServiceForRequest,
  createTenantAdminAuthService: createTenantAdminAuthServiceForRequest,
  env,
})
```

- [ ] **Step 7: Run backend legal tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/legal-documents --no-file-parallelism --reporter verbose
```

Expected:

- Legal document tests pass.

## Phase 3: Support Phone Public Branding Contract

**Files:**

- Modify: `backend/src/db/brandingSchema.ts`
- Modify: generated migration under `backend/drizzle/`
- Create: `backend/src/modules/branding/supportPhone.ts`
- Modify: `backend/src/modules/branding/brandingValidation.ts`
- Modify: `backend/src/modules/branding/repository.ts`
- Modify: `backend/src/modules/branding/service.ts`
- Create: `backend/src/modules/branding/supportPhone.ts`
- Test: `backend/src/modules/branding/supportPhone.test.ts`
- Modify tests under `backend/src/modules/branding/` and `backend/src/app-branding.integration.test.ts`

**Risk:** Existing auth/admin tests currently assume a hardcoded phone. The new contract must make missing phone explicit and avoid broken `tel:` hrefs.

- [ ] **Step 1: Add branding column**

Modify `backend/src/db/brandingSchema.ts`:

```ts
supportPhoneDisplay: text('support_phone_display'),
```

Add it beside `supportLabel`.

- [ ] **Step 2: Generate or update migration**

Run:

```bash
pnpm --dir backend db:generate
```

Expected:

- Migration adds `support_phone_display` to `portal_branding_settings`.
- If Phase 1 already generated a migration, keep one coherent migration for this feature branch and inspect it before committing.

- [ ] **Step 3: Add one support phone normalizer**

Create `backend/src/modules/branding/supportPhone.ts`:

```ts
export type SupportContact = {
  phoneDisplay: string | null
  phoneHref: string | null
}

function normalizeSupportPhoneDigits(phoneDisplay: string) {
  const trimmed = phoneDisplay.trim()
  const digits = trimmed.replace(/\D/gu, '')

  return trimmed.startsWith('+') ? `+${digits}` : digits
}

export function createSupportContact(
  phoneDisplay: string | null | undefined,
): SupportContact {
  if (!phoneDisplay) {
    return {
      phoneDisplay: null,
      phoneHref: null,
    }
  }

  const display = phoneDisplay.trim()
  const normalized = normalizeSupportPhoneDigits(display)

  if (!/^\+\d{7,15}$/u.test(normalized)) {
    return {
      phoneDisplay: null,
      phoneHref: null,
    }
  }

  return {
    phoneDisplay: display,
    phoneHref: `tel:${normalized}`,
  }
}

export function isValidSupportPhoneDisplay(value: string) {
  return value.trim() === '' || createSupportContact(value).phoneHref !== null
}
```

Create `backend/src/modules/branding/supportPhone.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  createSupportContact,
  isValidSupportPhoneDisplay,
} from './supportPhone.js'

describe('support phone helpers', () => {
  it('normalizes configured support phone to a tel href', () => {
    expect(createSupportContact('+7 (846) 211-11-11')).toEqual({
      phoneDisplay: '+7 (846) 211-11-11',
      phoneHref: 'tel:+78462111111',
    })
  })

  it('treats empty support phone as missing contact metadata', () => {
    expect(createSupportContact('')).toEqual({
      phoneDisplay: null,
      phoneHref: null,
    })
  })

  it('rejects values that cannot produce a valid tel href', () => {
    expect(isValidSupportPhoneDisplay('846 211')).toBe(false)
  })
})
```

Modify `backend/src/modules/branding/brandingValidation.ts` to use the same helper:

```ts
import { isValidSupportPhoneDisplay } from './supportPhone.js'

function optionalSupportPhone() {
  return z
    .union([
      z
        .string()
        .trim()
        .max(40)
        .refine(isValidSupportPhoneDisplay, {
          message: 'Введите телефон в международном формате.',
        })
        .transform((value) => value || null),
      z.null(),
    ])
    .optional()
}
```

Add to schema:

```ts
supportPhoneDisplay: optionalSupportPhone(),
```

- [ ] **Step 4: Persist support phone**

Modify `backend/src/modules/branding/repository.ts`:

- Add to `BrandingSettingsPatch`:

```ts
supportPhoneDisplay: string | null
```

- Add to `settingsSelection`.
- Add to `normalizeSettingsPatch`.

- [ ] **Step 5: Return support contact in branding service**

Modify `backend/src/modules/branding/service.ts`.

Import the shared normalizer:

```ts
import { createSupportContact } from './supportPhone.js'
```

Add to response:

```ts
supportContact: createSupportContact(resolvedSettings?.supportPhoneDisplay),
```

Add to `toSettingsPatch()`:

```ts
if (parsedInput.supportPhoneDisplay !== undefined) {
  patch.supportPhoneDisplay = parsedInput.supportPhoneDisplay
}
```

- [ ] **Step 6: Backend tests**

Update `backend/src/modules/branding/service.test.ts`:

- default branding returns `supportContact: { phoneDisplay: null, phoneHref: null }`.
- admin update stores `supportPhoneDisplay: '+7 (846) 211-11-11'`.
- response returns `phoneHref: 'tel:+78462111111'`.
- invalid phone payload is rejected before repository write.

Update `backend/src/modules/branding/repository.test.ts`:

- `upsertSettings({ supportPhoneDisplay })` persists trimmed phone.
- empty string normalizes to `null`.

Run:

```bash
pnpm --dir backend exec vitest run src/modules/branding --no-file-parallelism --reporter verbose
```

Expected:

- Branding module tests pass.

## Phase 4: Registration Uses Active Legal Versions And Configured Phone

**Files:**

- Modify: `backend/src/modules/registration/service.ts`
- Delete or stop using: `backend/src/modules/registration/legalDocuments.ts`
- Modify: `backend/src/app.ts`
- Modify tests: `backend/src/modules/registration/service.test.ts`

**Risk:** Registration must fail closed when legal docs are missing, otherwise users can accept obsolete template versions.

- [ ] **Step 1: Extend registration service dependencies**

Modify `backend/src/modules/registration/service.ts` options:

```ts
type RegistrationLegalDocumentsReader = {
  getActiveVersionsForRegistration: () => Promise<{
    privacyPolicyVersion: string
    termsVersion: string
  }>
}

type RegistrationSupportContactReader = {
  getPublicBranding: () => Promise<{
    branding: {
      supportContact: {
        phoneDisplay: string | null
      }
    }
  }>
}
```

Add to `CreateRegistrationServiceOptions`:

```ts
legalDocumentsReader: RegistrationLegalDocumentsReader
supportContactReader: RegistrationSupportContactReader
```

- [ ] **Step 2: Replace static legal version lookup**

Change `buildLegalAcceptanceRecord()` to accept versions:

```ts
function buildLegalAcceptanceRecord({
  acceptedAt,
  email,
  legalAcceptance,
  legalVersions,
}: {
  acceptedAt: Date
  email: string
  legalAcceptance: RegistrationLegalAcceptanceInput
  legalVersions: {
    privacyPolicyVersion: string
    termsVersion: string
  }
}) {
  return {
    acceptedAt,
    email,
    personalDataConsentAccepted: legalAcceptance.personalDataConsentAccepted,
    privacyPolicyVersion: legalVersions.privacyPolicyVersion,
    purpose: REGISTRATION_PURPOSE,
    requestIp: legalAcceptance.requestIp,
    termsAccepted: legalAcceptance.termsAccepted,
    termsVersion: legalVersions.termsVersion,
    userAgent: legalAcceptance.userAgent,
  } as const
}
```

At start of `requestVerification()`, before creating `legalAcceptanceRecord`:

```ts
const legalVersions =
  await legalDocumentsReader.getActiveVersionsForRegistration()
```

- [ ] **Step 3: Replace hardcoded support phone in missing-contact error**

Add helper:

```ts
async function createContactNotFoundError(
  supportContactReader: RegistrationSupportContactReader,
) {
  const response = await supportContactReader.getPublicBranding()
  const phone = response.branding.supportContact.phoneDisplay

  return new ApiError(
    403,
    'REGISTRATION_CONTACT_NOT_FOUND',
    phone
      ? `Мы не нашли профиль с таким email. Позвоните по тел: ${phone}.`
      : 'Мы не нашли профиль с таким email. Обратитесь в поддержку.',
  )
}
```

Use:

```ts
if (!contact) {
  throw await createContactNotFoundError(supportContactReader)
}
```

- [ ] **Step 4: Wire registration in app**

Modify `backend/src/app.ts` `createRegistrationServiceForRequest()`:

```ts
legalDocumentsReader: createLegalDocumentsServiceForRequest(request),
supportContactReader: createBrandingServiceForRequest(request),
```

- [ ] **Step 5: Registration tests**

Update `backend/src/modules/registration/service.test.ts`:

- default test setup injects `legalDocumentsReader.getActiveVersionsForRegistration()` returning `{ termsVersion: '2026-06-18-terms', privacyPolicyVersion: '2026-06-18-privacy' }`.
- acceptance rows use those versions.
- when legal reader throws `LEGAL_DOCUMENTS_NOT_CONFIGURED`, registration request fails before Chatwoot lookup.
- missing Chatwoot contact error includes configured phone.
- missing Chatwoot contact error uses generic copy when phone is `null`.

Run:

```bash
pnpm --dir backend exec vitest run src/modules/registration/service.test.ts --no-file-parallelism --reporter verbose
```

Expected:

- Registration service tests pass.

## Phase 5: Frontend Runtime Legal Pages And Support Phone

**Files:**

- Modify: `frontend/src/features/branding/api/publicBrandingClient.ts`
- Modify: `frontend/src/features/branding/lib/brandingDefaults.ts`
- Modify: `frontend/src/features/auth/components/AuthCompactSupport.tsx`
- Modify: `frontend/src/features/auth/components/AuthSupportBlock.tsx`
- Delete or stop using: `frontend/src/features/auth/components/supportContact.ts`
- Create: `frontend/src/features/legal/api/legalDocumentsClient.ts`
- Modify: `frontend/src/features/legal/pages/LegalDocumentPage.tsx`
- Delete or stop using: `frontend/src/features/legal/legalDocuments.ts`
- Test: `frontend/src/app/AppRoutes.legal.test.tsx` and auth page tests.

**Risk:** Legal pages must stay reachable without customer session and must not flash template text while backend content loads.

- [ ] **Step 1: Extend public branding types**

Modify `frontend/src/features/branding/api/publicBrandingClient.ts`:

```ts
export type PublicSupportContact = {
  phoneDisplay: string | null
  phoneHref: string | null
}
```

Add to `PublicBranding`:

```ts
supportContact: PublicSupportContact
```

Modify default branding:

```ts
supportContact: {
  phoneDisplay: null,
  phoneHref: null,
},
```

- [ ] **Step 2: Update auth support components**

Modify `AuthCompactSupport`:

```tsx
import { PhoneFilledIcon } from '../../../shared/ui/icons'
import { useBranding } from '../../branding/lib/useBranding'

export function AuthCompactSupport() {
  const { branding } = useBranding()
  const supportPhone = branding.supportContact.phoneDisplay
  const supportPhoneHref = branding.supportContact.phoneHref

  if (!supportPhone || !supportPhoneHref) {
    return null
  }

  return (
    <aside aria-label="Помощь со входом" className="auth-flow-support">
      <p className="auth-flow-support__question">Нужна помощь?</p>
      <a className="auth-flow-support__phone" href={supportPhoneHref}>
        <PhoneFilledIcon className="auth-flow-support__phone-icon" />
        <span>{supportPhone}</span>
      </a>
    </aside>
  )
}
```

Modify `AuthSupportBlock` similarly, keeping `preview` as non-link when true.

- [ ] **Step 3: Create public legal client**

Create `frontend/src/features/legal/api/legalDocumentsClient.ts`:

```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export type LegalDocumentId = 'privacy' | 'terms'

export type PublicLegalDocument = {
  bodyText: string
  documentType: LegalDocumentId
  title: string
  version: string
}

type LegalDocumentResponse = {
  document: PublicLegalDocument
}

export class LegalDocumentClientError extends Error {
  readonly code?: string
  readonly statusCode: number

  constructor({
    code,
    message,
    statusCode,
  }: {
    code?: string
    message: string
    statusCode: number
  }) {
    super(message)
    this.name = 'LegalDocumentClientError'
    this.code = code
    this.statusCode = statusCode
  }
}

export async function getLegalDocument(document: LegalDocumentId) {
  const response = await fetch(`${API_BASE_URL}/legal-documents/${document}`, {
    cache: 'no-store',
    credentials: 'include',
  })
  const payload = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | LegalDocumentResponse
    | null

  if (!response.ok) {
    throw new LegalDocumentClientError({
      code: payload && 'error' in payload ? payload.error?.code : undefined,
      message:
        payload && 'error' in payload
          ? (payload.error?.message ?? 'Документ временно недоступен.')
          : 'Документ временно недоступен.',
      statusCode: response.status,
    })
  }

  return (payload as LegalDocumentResponse).document
}
```

- [ ] **Step 4: Update legal page to load backend content**

Modify `LegalDocumentPage.tsx`:

- Remove `legalDocuments` import.
- Import `getLegalDocument`.
- Track `status`, `content`, `error`.
- Render loading text inside `.legal-document-body`: `Загружаем документ`.
- Render controlled error: `Документ временно недоступен.`
- Split `bodyText` with `bodyText.split(/\n{2,}/u)` and render paragraphs.

- [ ] **Step 5: Frontend tests**

Update `frontend/src/app/AppRoutes.legal.test.tsx`:

- mock `/api/legal-documents/privacy` and `/api/legal-documents/terms`.
- assert backend title/version/body render.
- assert template warning text from deleted constants is gone.
- assert legal pages still call `/api/branding` for visual shell.
- assert 404/503 legal API response renders controlled error.

Update auth page tests:

- branding response with phone renders phone link.
- branding response with `phoneDisplay: null` hides support phone block.

Run:

```bash
pnpm --dir frontend exec vitest run src/app/AppRoutes.legal.test.tsx src/features/auth --reporter verbose
```

Expected:

- Targeted frontend runtime tests pass.

## Phase 6: Admin UI Upload Controls

**Files:**

- Modify or create: `frontend/src/features/admin-branding/api/adminBrandingClient.ts`
- Create: `frontend/src/features/admin-branding/components/AdminLegalDocumentControls.tsx`
- Modify: `frontend/src/features/admin-branding/components/AdminBrandingForm.tsx`
- Modify: `frontend/src/features/admin-branding/lib/brandingState.ts`
- Modify: `frontend/src/features/admin-shell/pages/AdminBrandingPage.tsx`
- Tests: admin branding page/client tests.

**Risk:** Admin legal upload should not overwrite unsaved branding draft changes. Treat legal file upload like image asset upload: separate action, then refresh only legal summaries.

- [ ] **Step 1: Extend admin types and client**

Add to `AdminBrandingResponse['branding']`:

```ts
supportContact: {
  phoneDisplay: string | null
  phoneHref: string | null
}
```

Add to `AdminBrandingPatch`:

```ts
supportPhoneDisplay: string | null
```

Add legal client exports:

```ts
export type AdminLegalDocumentSummary = {
  activatedAt: string
  bodyCharacterCount: number
  documentType: 'privacy' | 'terms'
  sourceContentType: string
  sourceFileName: string
  sourceSha256: string
  title: string
  version: string
}

export type AdminLegalDocumentsResponse = {
  documents: {
    privacy: AdminLegalDocumentSummary | null
    terms: AdminLegalDocumentSummary | null
  }
}

export function getAdminLegalDocuments() {
  return request<AdminLegalDocumentsResponse>('/admin/legal-documents', {
    method: 'GET',
  })
}

export function uploadAdminLegalDocument(
  documentType: 'privacy' | 'terms',
  file: File,
) {
  const formData = new FormData()
  formData.set('document', file)

  return request<{ document: AdminLegalDocumentSummary }>(
    `/admin/legal-documents/${documentType}`,
    {
      body: formData,
      method: 'POST',
    },
  )
}
```

Client requirement: `uploadAdminLegalDocument()` must not set a manual `Content-Type` header. The browser must set multipart `boundary` for the `FormData` request.

- [ ] **Step 2: Extend branding draft**

Modify `BrandingDraft`:

```ts
supportPhoneDisplay: string
```

In `createBrandingDraft()`:

```ts
supportPhoneDisplay: response.branding.supportContact.phoneDisplay ?? '',
```

In `createBrandingPatch()`:

```ts
supportPhoneDisplay: draft.supportPhoneDisplay.trim() || null,
```

- [ ] **Step 3: Create upload-only legal controls**

Create `AdminLegalDocumentControls.tsx` with:

- accept string:

```ts
const legalDocumentAccept =
  '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'
```

- file size guard:

```ts
const legalDocumentMaxBytes = 10 * 1024 * 1024
```

- two cards with labels:
  - `Загрузить пользовательское соглашение`
  - `Загрузить политику обработки персональных данных`
- summary fields:
  - current version
  - source file
  - upload date
  - extracted character count

- [ ] **Step 4: Add support phone and legal controls to form**

Modify “Основное” section in `AdminBrandingForm.tsx`:

```tsx
<BrandingTextField
  disabled={isSaving}
  label="Телефон поддержки"
  name="supportPhoneDisplay"
  onChange={(value) => {
    onChange({ ...draft, supportPhoneDisplay: value })
  }}
  value={draft.supportPhoneDisplay}
/>
```

Add a new section:

```tsx
<BrandingFormSection
  description="Файлы документов, которые клиент видит при входе и регистрации."
  id="documents"
  title="Документы"
>
  <AdminLegalDocumentControls ... />
</BrandingFormSection>
```

- [ ] **Step 5: Wire admin page state**

Modify `AdminBrandingPage.tsx`:

- `const [legalDocuments, setLegalDocuments] = useState<AdminLegalDocumentsResponse['documents'] | null>(null)`
- `const [legalDocumentAction, setLegalDocumentAction] = useState<'privacy' | 'terms' | null>(null)`
- load `getAdminBranding()` and `getAdminLegalDocuments()` in parallel.
- upload handler calls `uploadAdminLegalDocument()` then refreshes only legal summaries.
- legal upload disables legal inputs and save button while active.
- success messages:
  - terms: `Пользовательское соглашение загружено.`
  - privacy: `Политика обработки персональных данных загружена.`

- [ ] **Step 6: Admin frontend tests**

Update `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`:

- admin load calls `/api/admin/legal-documents`.
- support phone field saves through `/api/admin/branding`.
- uploading terms sends multipart field `document`.
- after legal upload, unsaved `portalName` draft remains unchanged.
- legal upload validation rejects `.html` before fetch.

Update `frontend/src/features/admin-branding/api/adminBrandingClient.test.ts`:

- legal upload uses multipart form data and correct endpoint.
- legal upload does not set a manual `Content-Type` header when body is `FormData`.

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-shell/pages/AdminBrandingPage.test.tsx src/features/admin-branding/api/adminBrandingClient.test.ts --reporter verbose
```

Expected:

- Admin frontend tests pass.

## Phase 7: Integration And Browser Gates

**Files:**

- Modify: `backend/src/app-branding.integration.test.ts` or create `backend/src/app-legal-documents.integration.test.ts`
- Modify or create: `tests/e2e/admin-legal-documents.spec.ts`
- Modify: `tests/e2e/customer-branding-runtime.spec.ts`

**Risk:** Unit tests can pass while route auth/origin/multipart limits are wrong. Integration and one browser gate protect the actual admin/public flow.

- [ ] **Step 1: Backend integration tests**

Create or extend backend integration tests:

- unauthenticated admin upload to `/api/admin/legal-documents/terms` returns 401.
- authenticated admin upload with missing or invalid `Origin` returns 403 and creates no document or audit event.
- authenticated admin upload with same-origin writes active document and audit event.
- public `/api/legal-documents/terms` returns active tenant document.
- tenant B cannot read tenant A document by host.
- registration records active legal versions after upload.

Use existing `createMultipartBrandingAssetPayload()` as a pattern, but create `createMultipartLegalDocumentPayload()` with field `document`.

- [ ] **Step 2: E2E admin upload smoke**

Create `tests/e2e/admin-legal-documents.spec.ts` by following admin branding asset route mocking style:

- mock admin session.
- mock `/api/admin/branding`.
- mock `/api/admin/legal-documents`.
- upload a `.txt` test file through the Terms input.
- assert success status.
- assert current document summary updates.
- assert support phone field appears and can be saved.

This browser gate uses TXT because PDF/DOCX parsing is backend-covered; browser only needs to verify upload UI and multipart field behavior.

- [ ] **Step 3: E2E runtime support phone/legal page smoke**

Extend `tests/e2e/customer-branding-runtime.spec.ts`:

- mocked `/api/branding` includes `supportContact`.
- login/auth surface shows configured phone and `tel:` href.
- mocked `/api/legal-documents/privacy` renders backend-provided privacy text.

- [ ] **Step 4: Run targeted integration/browser checks**

Run:

```bash
pnpm --dir backend exec vitest run src/app-legal-documents.integration.test.ts src/modules/registration/service.test.ts --no-file-parallelism --reporter verbose
pnpm --dir frontend exec vitest run src/app/AppRoutes.legal.test.tsx src/features/admin-shell/pages/AdminBrandingPage.test.tsx --reporter verbose
pnpm test:e2e -- tests/e2e/admin-legal-documents.spec.ts tests/e2e/customer-branding-runtime.spec.ts
```

Expected:

- Backend integration passes.
- Frontend targeted tests pass.
- Targeted Playwright tests pass.

## Phase 8: Docs, Full Checks And Checkpoint

**Files:**

- Modify: `docs/roadmap/work-log.md`
- Optional create: `docs/operations/legal-document-upload.md`

**Risk:** Work-log should record only the durable baseline change, not test minutiae.

- [ ] **Step 1: Update operations note if needed**

If admin legal upload becomes part of production readiness, add `docs/operations/legal-document-upload.md` with:

- accepted file formats and size limit;
- requirement that uploaded PDF/DOCX must contain selectable text;
- how to verify public `/legal/terms` and `/legal/privacy`;
- registration blocked behavior when either document is missing;
- support phone configuration rule.

- [ ] **Step 2: Update work-log after implementation is verified**

Replace the current Recommended Next Step legal blocker with a closed baseline note:

```md
- Tenant admins can upload active Terms and Privacy documents as PDF/DOCX/TXT
  files; backend stores extracted tenant-scoped legal text/version metadata,
  public legal pages render active backend documents, and registration records
  active legal versions server-side.
- Auth support phone is tenant-owned branding metadata and is rendered by auth
  surfaces/admin preview without hardcoded fallback phone numbers.
```

Then add a new single `Recommended Next Step` relevant to the next open production smoke/deploy step.

- [ ] **Step 3: Run full closure checks**

Run:

```bash
pnpm lint
pnpm build
pnpm test
pnpm test:e2e -- tests/e2e/admin-legal-documents.spec.ts tests/e2e/customer-branding-runtime.spec.ts
docker compose --env-file .env.production -f infra/production/compose.yaml build backend
git diff --check
```

Expected:

- All pass.
- If full e2e requires services not running, record exact blocker and run the targeted frontend/backend tests that do not require external services.
- If `.env.production` is intentionally unavailable locally, record that blocker and run the same production backend image build in the deployment environment before merge/deploy approval.

- [ ] **Step 4: Code review touched areas**

Review:

- backend tenant scoping;
- admin auth and origin guards;
- multipart limits;
- parser error handling;
- registration fail-closed behavior when docs missing;
- frontend missing-phone rendering;
- admin upload state preserving unsaved branding draft;
- generated migration and lockfile diff.

- [ ] **Step 5: Checkpoint commit**

Only after implementation, fixes, checks and review are complete:

```bash
git status --short --branch
git add backend frontend tests docs package.json pnpm-lock.yaml
git commit -m "feat: add tenant legal document upload"
```

Expected:

- Commit contains only this feature slice.
- No `.env`, generated reports, `dist`, `test-results`, or object-storage/runtime artifacts are staged.

---

## Manual UI Acceptance

- Admin opens `/admin/branding`.
- Admin enters support phone `+7 (846) 211-11-11`, saves, reloads, and sees the same phone.
- Login page footer shows the configured phone and `tel:+78462111111`.
- Admin uploads Terms as PDF and Privacy as DOCX.
- Admin sees both active document summaries with filename/version/date.
- `/legal/terms` and `/legal/privacy` show extracted active backend text, not template copy.
- Registration consent links still open legal pages.
- Registration request records the active terms/privacy versions in `portal_legal_acceptances`.
- Re-uploading Terms changes only Terms active version; Privacy version remains unchanged.

## Deferred Cleanup Not In This Slice

- Rich legal document editor.
- PDF iframe/original binary serving.
- Manual version name input.
- Legal document diff viewer.
- Legal document deletion/purge.
- Per-domain legal variants.
- Public download of original uploaded files.
