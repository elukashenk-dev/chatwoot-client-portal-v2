# MT-9A Admin Token Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть `F-MT-004`: добавить отдельный tenant-scoped encrypted Chatwoot admin-verification token boundary и backend-проверки, что tenant admin verification не использует runtime Chatwoot token.

**Architecture:** `portal_tenants` получает nullable `chatwoot_admin_verification_token_ciphertext`. Runtime `TenantRequestContext.chatwoot` остается без admin token. Новый backend module `tenant-admin` получает ciphertext отдельным repository method, расшифровывает его только внутри admin verification service и проверяет Chatwoot Agents API по `email`, `account_id`, `role` и `confirmed`, игнорируя `availability_status`.

**Tech Stack:** TypeScript, Drizzle ORM, PGlite migrations, Vitest, existing AES-256-GCM tenant secret helpers, Chatwoot Application API.

---

## File Map

- Modify: `backend/src/db/schema.ts` - добавить nullable column в `portalTenants`.
- Create: `backend/drizzle/0008_common_wonder_man.sql` - generated migration `ALTER TABLE portal_tenants ADD COLUMN`.
- Modify: `backend/drizzle/meta/_journal.json` - добавить migration entry.
- Modify: `backend/drizzle/meta/0007_snapshot.json` or generate new snapshot if `drizzle-kit generate` is used.
- Modify: `backend/src/modules/tenants/repository.ts` - optional input field, upsert behavior, dedicated admin verification config lookup.
- Modify: `backend/src/modules/tenants/repository.test.ts` - TDD coverage for nullable storage and lookup.
- Create: `backend/src/integrations/chatwoot/adminAgents.ts` - minimal Agents API client/parser for admin verification.
- Create: `backend/src/integrations/chatwoot/adminAgents.test.ts` - parser/request behavior.
- Create: `backend/src/modules/tenant-admin/adminVerification.ts` - boundary service for admin eligibility.
- Create: `backend/src/modules/tenant-admin/adminVerification.test.ts` - missing token, invalid token, insufficient permissions, separate-token and cross-tenant tests.
- Modify: `backend/src/scripts/bootstrap-default-tenant-core.ts` - optional bootstrap env support for `DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN`.
- Modify: `backend/src/scripts/bootstrap-default-tenant-core.test.ts` - verify optional encrypted token and safe report.
- Modify: `backend/src/config/env.ts`, `.env.example`, `.env.production.example` - add optional env var.
- Create: `docs/spikes/2026-06-06-chatwoot-admin-agents-permissions.md` - record official/local source findings and required runtime spike matrix.
- Delete: `docs/findings/F-MT-004-admin-chatwoot-token-boundary.md` after implementation and verification.
- Modify: `docs/roadmap/work-log.md` - update current baseline and recommended next step.

## Task 1: Schema And Repository Boundary

**Files:**

- Modify: `backend/src/db/schema.ts`
- Create: `backend/drizzle/0008_common_wonder_man.sql`
- Modify: `backend/drizzle/meta/_journal.json`
- Modify or generate: `backend/drizzle/meta/0008_snapshot.json`
- Modify: `backend/src/modules/tenants/repository.ts`
- Modify: `backend/src/modules/tenants/repository.test.ts`

- [x] **Step 1: Write failing repository tests**

Add tests proving:

```ts
expect(tenant.chatwootAdminVerificationTokenCiphertext).toBeNull()
expect(created.chatwootAdminVerificationTokenCiphertext).toBe(
  'v1:admin-token-ciphertext',
)
await expect(
  repository.findAdminVerificationConfigByTenantId(tenant.id),
).resolves.toMatchObject({
  chatwootAccountId: 3,
  chatwootAdminVerificationTokenCiphertext: 'v1:admin-token-ciphertext',
  chatwootBaseUrl: 'https://chatwoot.shared.example.com',
  id: tenant.id,
})
```

- [x] **Step 2: Run repository tests and verify RED**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/tenants/repository.test.ts --no-file-parallelism --reporter verbose
```

Expected: FAIL because the column/property/method does not exist.

- [x] **Step 3: Implement schema, migration and repository**

Add nullable schema property:

```ts
chatwootAdminVerificationTokenCiphertext: text(
  'chatwoot_admin_verification_token_ciphertext',
),
```

Generate migration:

```sql
ALTER TABLE "portal_tenants" ADD COLUMN "chatwoot_admin_verification_token_ciphertext" text;
```

Add optional repository input:

```ts
chatwootAdminVerificationTokenCiphertext?: string | null
```

Normalize with:

```ts
function normalizeOptionalNonEmptyString(
  value: string | null | undefined,
  fieldName: string,
) {
  if (value === undefined) return undefined
  if (value === null) return null
  return normalizeNonEmptyString(value, fieldName)
}
```

Upsert semantics:

- absent `chatwootAdminVerificationTokenCiphertext` preserves the existing value;
- explicit `null` clears the stored admin-verification token;
- non-empty string stores the normalized ciphertext.

Add dedicated lookup:

```ts
async findAdminVerificationConfigByTenantId(tenantId: number) {
  const [tenant] = await db
    .select({
      chatwootAccountId: portalTenants.chatwootAccountId,
      chatwootAdminVerificationTokenCiphertext:
        portalTenants.chatwootAdminVerificationTokenCiphertext,
      chatwootBaseUrl: portalTenants.chatwootBaseUrl,
      id: portalTenants.id,
      status: portalTenants.status,
    })
    .from(portalTenants)
    .where(eq(portalTenants.id, tenantId))
    .limit(1)

  return tenant ?? null
}
```

- [x] **Step 4: Run repository tests and verify GREEN**

Run the same Vitest command. Expected: PASS.

## Task 2: Chatwoot Agents Parser/Client

**Files:**

- Create: `backend/src/integrations/chatwoot/adminAgents.ts`
- Create: `backend/src/integrations/chatwoot/adminAgents.test.ts`

- [x] **Step 1: Write failing parser/client tests**

Cover:

```ts
parseChatwootAdminAgentsResponse(
  [
    {
      account_id: 3,
      auto_offline: true,
      availability_status: 'available',
      confirmed: true,
      custom_attributes: { ignored: true },
      email: ' Admin@Example.test ',
      id: 11,
      role: 'administrator',
    },
  ],
  3,
)
```

Expected parsed agent:

```ts
{
  accountId: 3,
  confirmed: true,
  email: 'admin@example.test',
  id: 11,
  role: 'administrator',
}
```

Also cover top-level non-array failure and request path/header:

```text
GET /api/v1/accounts/3/agents
api_access_token: admin-token
```

- [x] **Step 2: Run parser/client tests and verify RED**

Run:

```bash
pnpm --dir backend exec vitest run src/integrations/chatwoot/adminAgents.test.ts --no-file-parallelism --reporter verbose
```

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement parser/client**

Export:

```ts
export type ChatwootAdminAgent = {
  accountId: number
  confirmed: boolean
  email: string
  id: number
  role: string
}
```

Parser rules:

- top-level response must be an array;
- `id` and `account_id` must be integers;
- `email`, `role` must be non-empty strings;
- `confirmed` must be boolean;
- normalize email with existing `normalizeEmail`;
- ignore `availability_status`, `auto_offline`, `provider`, `custom_attributes` and unknown fields.

Client rules:

- use existing `createChatwootFetch`, `requestChatwootJson`;
- call `/api/v1/accounts/${accountId}/agents`;
- pass the supplied token as `api_access_token`.

- [x] **Step 4: Run parser/client tests and verify GREEN**

Run the same Vitest command. Expected: PASS.

## Task 3: Tenant Admin Verification Service

**Files:**

- Create: `backend/src/modules/tenant-admin/adminVerification.ts`
- Create: `backend/src/modules/tenant-admin/adminVerification.test.ts`

- [x] **Step 1: Write failing service tests**

Cover:

- missing `chatwootAdminVerificationTokenCiphertext` returns `{ result: 'not_configured' }`;
- invalid ciphertext returns `{ result: 'invalid_token_secret' }`;
- Chatwoot request failure returns `{ result: 'chatwoot_permission_denied' }`;
- service uses decrypted admin-verification token, not runtime token;
- same email from tenant A cannot authenticate tenant B unless tenant B response contains `role === "administrator"`, `confirmed === true`, and matching `account_id`.

Example expected success:

```ts
await expect(
  service.verifyTenantAdminEmail({ email: 'admin@example.test', tenantId: 2 }),
).resolves.toEqual({
  agent: {
    accountId: 5,
    email: 'admin@example.test',
    id: 22,
    role: 'administrator',
  },
  result: 'eligible',
})
```

- [x] **Step 2: Run service tests and verify RED**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/tenant-admin/adminVerification.test.ts --no-file-parallelism --reporter verbose
```

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement service**

Create factory:

```ts
createTenantAdminVerificationService({
  chatwootAdminAgentsClientFactory,
  tenantSecretKey,
  tenantsRepository,
})
```

Use repository method `findAdminVerificationConfigByTenantId`. Decode
`tenantSecretKey` with existing helpers. Decrypt only
`chatwootAdminVerificationTokenCiphertext`. Never accept runtime token as input.

Eligibility:

```ts
agent.email === normalizedEmail &&
  agent.accountId === tenant.chatwootAccountId &&
  agent.role === 'administrator' &&
  agent.confirmed === true
```

- [x] **Step 4: Run service tests and verify GREEN**

Run the same Vitest command. Expected: PASS.

## Task 4: Bootstrap And Env Wiring

**Files:**

- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/scripts/bootstrap-default-tenant-core.ts`
- Modify: `backend/src/scripts/bootstrap-default-tenant-core.test.ts`
- Modify: `.env.example`
- Modify: `.env.production.example`

- [x] **Step 1: Write failing bootstrap test**

Add `DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN` to test env and assert:

```ts
expect(
  decryptTenantSecret(
    result.tenant.chatwootAdminVerificationTokenCiphertext!,
    key,
  ),
).toBe('chatwoot-admin-token')
expect(report.tenant.hasChatwootAdminVerificationTokenCiphertext).toBe(true)
```

- [x] **Step 2: Run bootstrap test and verify RED**

Run:

```bash
pnpm --dir backend exec vitest run src/scripts/bootstrap-default-tenant-core.test.ts --no-file-parallelism --reporter verbose
```

Expected: FAIL because env/repository/bootstrap do not support the new token.

- [x] **Step 3: Implement optional env/bootstrap support**

Add optional env var:

```ts
DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN: optionalNonEmptyString
```

In bootstrap, encrypt it only when present:

```ts
const adminVerificationTokenPatch =
  env.DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN === undefined
    ? {}
    : {
        chatwootAdminVerificationTokenCiphertext: encryptTenantSecret(
          env.DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN,
          tenantSecretKey,
        ),
      }
```

In `.env*.example`, document it as optional and separate from runtime token.

- [x] **Step 4: Run bootstrap test and verify GREEN**

Run the same Vitest command. Expected: PASS.

## Task 5: Spike Doc, Finding Closure And Full Verification

**Files:**

- Create: `docs/spikes/2026-06-06-chatwoot-admin-agents-permissions.md`
- Delete: `docs/findings/F-MT-004-admin-chatwoot-token-boundary.md`
- Modify: `docs/roadmap/work-log.md`

- [x] **Step 1: Write spike doc**

Record:

- official Chatwoot docs endpoint and auth header;
- local source `v4.13.0-1-g38c6b79b4` controller/policy behavior;
- response field drift around `availability_status`;
- operational decision: admin verification uses separate per-tenant encrypted token;
- runtime/manual matrix remains to run when real credentials are available, but implementation already fails closed for permission errors.

- [x] **Step 2: Close finding**

Delete `docs/findings/F-MT-004-admin-chatwoot-token-boundary.md` only after tests pass and docs explain the closure.

- [x] **Step 3: Update work-log**

Replace Recommended Next Step with MT-9B admin auth foundation after F-MT-004 closure.

- [x] **Step 4: Run targeted checks**

```bash
pnpm --dir backend exec vitest run \
  src/modules/tenants/repository.test.ts \
  src/integrations/chatwoot/adminAgents.test.ts \
  src/modules/tenant-admin/adminVerification.test.ts \
  src/scripts/bootstrap-default-tenant-core.test.ts \
  --no-file-parallelism --reporter verbose
pnpm --dir backend lint
pnpm --dir backend build
mapfile -t changed < <((git diff --name-only --diff-filter=ACM; git ls-files --others --exclude-standard) | rg '\.(ts|tsx|md|json|yaml|yml)$' | sort -u)
pnpm exec prettier --check "${changed[@]}"
git diff --check
```

Expected: all pass.

Diagnostic note: `pnpm exec prettier --check .` currently reports unrelated
pre-existing baseline formatting warnings outside this F-MT-004 scope, so the
closure gate is scoped to changed supported files.

- [x] **Step 5: Commit**

```bash
git add .
git commit -m "feat: close mt-9 admin token boundary"
```
