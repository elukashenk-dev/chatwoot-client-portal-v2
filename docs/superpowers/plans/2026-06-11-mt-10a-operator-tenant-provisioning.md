# MT-10A Operator Tenant Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reliable operator-owned tenant lifecycle flow that creates a Chatwoot account, service users, API Channel inbox, portal tenant, safe deprovision path and drift reconciliation without requiring B2B clients to configure Chatwoot internals or own a domain.

**Architecture:** Provisioning is backend/operator-only. The browser never receives Chatwoot authority. Tenant domain input supports either a client-owned custom domain or a provider-owned subdomain built from `PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX`. A new provisioning run table records external Chatwoot IDs before the final `portal_tenants` row is activated, so reruns can resume safely after partial failures. Physical tenant deletion is not part of this plan; deletion means suspend/archive in portal plus optional Chatwoot Platform API delete.

**Tech Stack:** Node 24, TypeScript, Fastify backend modules, Drizzle schema/migrations in `backend/drizzle`, Vitest, PGlite test DB, Chatwoot CE 4.13 Platform API and Account API.

---

## Source Context

Read these before implementation:

- `AGENTS.md`
- `docs/operations/chatwoot-account-lifecycle-portal-provisioning-research.md`
- `docs/operations/mt-10-deployment-runbooks.md`
- `docs/architecture/overview.md`
- `docs/architecture/decisions.md`
- `backend/src/modules/tenants/repository.ts`
- `backend/src/scripts/bootstrap-default-tenant-core.ts`
- `backend/src/scripts/verify-tenant-chatwoot-connection-core.ts`
- `backend/src/scripts/configure-tenant-chatwoot-webhook-core.ts`
- `backend/src/integrations/chatwoot/client.ts`
- `backend/src/integrations/chatwoot/request.ts`

## Non-Negotiable Boundaries

- Do not modify Chatwoot core.
- Do not use Chatwoot DB directly.
- Do not expose Chatwoot tokens, Platform API tokens, object-storage credentials or bucket/object keys to the browser.
- Do not enable public Chatwoot signup as the portal provisioning mechanism.
- Do not physically delete `portal_tenants` rows in this plan.
- Do not store generated service-user passwords after Chatwoot accepts them.
- Do not log plaintext Chatwoot tokens, webhook secrets or generated passwords.
- Do not hard-code the current provider/company domain in code. Provider-owned
  tenant domains must come from `PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX`.

## Domain Model

Provisioning supports two domain modes:

1. Client-owned custom domain:

   ```text
   primaryDomain=lk.client.example
   publicBaseUrl=https://lk.client.example
   ```

   The B2B client creates DNS for `lk.<client-domain>` to the provider reverse
   proxy.

2. Provider-owned subdomain:

   ```text
   providerSubdomain=<normalized slug>
   PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX=portal.example.com
   ```

   The operator tooling resolves:

   ```text
   primaryDomain=buhfirma.portal.example.com
   publicBaseUrl=https://buhfirma.portal.example.com
   ```

   `providerSubdomain` is not an independent alias in MT-10A. It must be
   exactly the normalized tenant `slug`, and the CLI must reject
   `--slug=a --provider-subdomain=b`.

Provider-owned domains are controlled by our deployment DNS/certificate setup.
The plan must use neutral examples like `portal.example.com`; the real SaaS
domain is deploy configuration.

Provider-owned domain prerequisites:

- wildcard DNS for `*.PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX` resolves to the
  portal reverse proxy;
- TLS certificate covers either the wildcard
  `*.PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX` or each generated host;
- reverse proxy preserves `Host`, and if `X-Forwarded-Host` is used then
  `PORTAL_TRUST_PROXY=true` is allowed only behind the trusted proxy boundary;
- `/api/tenant` must resolve the generated host before a provider-subdomain
  tenant is considered production-ready.

## Lifecycle Model

Provisioning creates these Chatwoot resources:

- one real client admin user, linked to the new Chatwoot account as `administrator`;
- one portal runtime service user, linked as `administrator`, with its user access token stored encrypted as `chatwootApiAccessTokenCiphertext`;
- one portal admin-verification service user, linked as `administrator`, with its user access token stored encrypted as `chatwootAdminVerificationTokenCiphertext`;
- one API Channel inbox named `Portal <slug>`, with `lock_to_single_conversation=true`;
- one API Channel webhook pointing to `https://<tenant-domain>/api/chatwoot/webhooks`, with returned `Channel::Api.secret` stored encrypted.

The two service users preserve decision `D-014`: runtime token and admin-verification token remain separate security boundaries.

## Planned Files

Create:

- `backend/src/db/provisioningSchema.ts` - Drizzle table for provisioning runs.
- `backend/src/modules/tenant-provisioning/repository.ts` - persistence for provisioning runs.
- `backend/src/modules/tenant-provisioning/repository.test.ts`
- `backend/src/modules/tenant-provisioning/input.ts` - CLI/service input normalization.
- `backend/src/modules/tenant-provisioning/input.test.ts`
- `backend/src/modules/tenant-provisioning/service.ts` - provisioning orchestration.
- `backend/src/modules/tenant-provisioning/service.test.ts`
- `backend/src/modules/tenant-provisioning/reconciliation.ts` - drift detection and safe suspension.
- `backend/src/modules/tenant-provisioning/reconciliation.test.ts`
- `backend/src/modules/tenant-provisioning/deprovision.ts` - safe archive/delete orchestration.
- `backend/src/modules/tenant-provisioning/deprovision.test.ts`
- `backend/src/integrations/chatwoot/platformClient.ts`
- `backend/src/integrations/chatwoot/platformClient.test.ts`
- `backend/src/scripts/create-tenant-core.ts`
- `backend/src/scripts/create-tenant-core.test.ts`
- `backend/src/scripts/create-tenant.ts`
- `backend/src/scripts/reconcile-tenants-core.ts`
- `backend/src/scripts/reconcile-tenants-core.test.ts`
- `backend/src/scripts/reconcile-tenants.ts`
- `backend/src/scripts/deprovision-tenant-core.ts`
- `backend/src/scripts/deprovision-tenant-core.test.ts`
- `backend/src/scripts/deprovision-tenant.ts`

Modify:

- `backend/src/db/schema.ts` - export provisioning schema.
- `backend/drizzle/*` - generated migration and journal snapshot.
- `backend/src/config/env.ts` - provisioning env values.
- `backend/src/config/env.test.ts`
- `backend/src/integrations/chatwoot/request.ts` - allow `DELETE` if reused for Platform API delete.
- `backend/src/integrations/chatwoot/client.ts` - Account API methods for API inbox discovery/creation.
- `backend/src/integrations/chatwoot/client.test.ts`
- `backend/src/modules/tenants/repository.ts` - tenant status update and lookup helpers.
- `backend/src/modules/tenants/repository.test.ts`
- `backend/package.json` - add operator scripts.
- `.env.example`
- `.env.production.example`
- `docs/operations/mt-10-deployment-runbooks.md`
- `docs/architecture/overview.md`
- `docs/architecture/decisions.md`
- `docs/architecture/multi-tenant-reference.md`
- `docs/roadmap/work-log.md` only after implementation is complete and verified.

---

## Task 01: Provisioning Persistence And Tenant Status Helpers

**Files:**

- Create: `backend/src/db/provisioningSchema.ts`
- Modify: `backend/src/db/schema.ts`
- Modify: `backend/src/modules/tenants/repository.ts`
- Modify: `backend/src/modules/tenants/repository.test.ts`
- Create: `backend/src/modules/tenant-provisioning/repository.ts`
- Create: `backend/src/modules/tenant-provisioning/repository.test.ts`
- Generate: `backend/drizzle/<generated_migration>.sql`
- Modify: `backend/drizzle/meta/_journal.json`
- Generate: `backend/drizzle/meta/<generated_snapshot>.json`

- [ ] **Step 1: Write repository tests for provisioning runs**

  Add tests that prove:
  - a run is created by normalized `slug`;
  - a run stores `domainMode='custom_domain'` with no provider subdomain fields
    for client-owned domains;
  - a run stores `domainMode='provider_subdomain'`,
    `providerSubdomain` and `providerTenantDomainSuffix` for provider-owned
    subdomains;
  - rerun by same `slug` returns the same run;
  - rerun by same `slug` rejects immutable input mismatch for `domainMode`,
    `primaryDomain`, `publicBaseUrl`, `providerSubdomain`,
    `providerTenantDomainSuffix`, `chatwootBaseUrl`, `clientAdminEmail` and
    `clientAdminName`;
  - `chatwootAccountId`, service user IDs and inbox ID can be stored one step at a time;
  - safe reports never include plaintext secrets;
  - tenant status can be updated to `suspended` and `archived`.

  Test command:

  ```bash
  pnpm --dir backend test -- src/modules/tenant-provisioning/repository.test.ts src/modules/tenants/repository.test.ts
  ```

  Expected before implementation: fail with missing module/table/helper errors.

- [ ] **Step 2: Add Drizzle schema**

  Create `backend/src/db/provisioningSchema.ts` with one table:

  ```ts
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
        .notNull()
        .default(sql`'{}'::jsonb`),
      createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
      completedAt: timestamp('completed_at', { withTimezone: true }),
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
  ```

  Import/export it from `backend/src/db/schema.ts`.

- [ ] **Step 3: Generate migration**

  Run:

  ```bash
  pnpm --dir backend db:generate
  ```

  Expected: a new SQL migration and updated Drizzle metadata under `backend/drizzle`.

  Review generated SQL manually. It must create `portal_tenant_provisioning_runs`, two unique indexes and no unrelated schema changes.

- [ ] **Step 4: Add tenant repository helpers**

  Add to `createTenantsRepository`:

  ```ts
  async findByChatwootAccountId(chatwootAccountId: number) {
    const [tenant] = await db
      .select()
      .from(portalTenants)
      .where(eq(portalTenants.chatwootAccountId, chatwootAccountId))
      .limit(1)

    return tenant ?? null
  },

  async updateTenantStatus({
    status,
    tenantId,
    updatedAt = new Date(),
  }: {
    status: TenantStatus
    tenantId: number
    updatedAt?: Date
  }) {
    const [tenant] = await db
      .update(portalTenants)
      .set({
        status: normalizeTenantStatus(status),
        updatedAt,
      })
      .where(eq(portalTenants.id, tenantId))
      .returning()

    if (!tenant) {
      throw new Error('Failed to update tenant status.')
    }

    return tenant
  },
  ```

- [ ] **Step 5: Implement provisioning repository**

  `backend/src/modules/tenant-provisioning/repository.ts` must expose:

  ```ts
  export const provisioningStatuses = [
    'pending',
    'creating_chatwoot_account',
    'creating_client_admin',
    'creating_runtime_user',
    'creating_admin_verification_user',
    'creating_portal_inbox',
    'creating_portal_tenant',
    'verifying',
    'completed',
    'failed',
  ] as const

  export type ProvisioningStatus = (typeof provisioningStatuses)[number]

  export type TenantProvisioningRepository = {
    createOrResumeRun(
      input: TenantProvisioningInput,
    ): Promise<TenantProvisioningRun>
    markCompleted(input: { id: number }): Promise<TenantProvisioningRun>
    markFailed(input: {
      id: number
      message: string
    }): Promise<TenantProvisioningRun>
    markStatus(input: {
      id: number
      status: ProvisioningStatus
    }): Promise<TenantProvisioningRun>
    listCompletedRuns(): Promise<TenantProvisioningRun[]>
    storeAdminVerificationServiceUserId(input: {
      adminVerificationServiceUserId: number
      id: number
    }): Promise<TenantProvisioningRun>
    storeChatwootAccountId(input: {
      chatwootAccountId: number
      id: number
    }): Promise<TenantProvisioningRun>
    storeClientAdminUserId(input: {
      clientAdminUserId: number
      id: number
    }): Promise<TenantProvisioningRun>
    storePortalInboxId(input: {
      chatwootPortalInboxId: number
      id: number
    }): Promise<TenantProvisioningRun>
    storeRuntimeServiceUserId(input: {
      id: number
      runtimeServiceUserId: number
    }): Promise<TenantProvisioningRun>
  }

  export function createTenantProvisioningRepository(
    db: AppDatabase,
  ): TenantProvisioningRepository
  ```

  Use the same normalization rules as `tenants/repository.ts` for slug/domain/url. Do not duplicate large validators if exporting small normalizers from `tenants/repository.ts` is cleaner.

  `createOrResumeRun` must treat these fields as immutable for an existing run:
  `domainMode`, `primaryDomain`, `publicBaseUrl`, `providerSubdomain`,
  `providerTenantDomainSuffix`, `chatwootBaseUrl`, `clientAdminEmail` and
  `clientAdminName`. If a rerun passes different values for the same `slug`, it
  must throw a conflict error before any Chatwoot call.

- [ ] **Step 6: Run tests**

  Run:

  ```bash
  pnpm --dir backend test -- src/modules/tenant-provisioning/repository.test.ts src/modules/tenants/repository.test.ts
  ```

  Expected: pass.

- [ ] **Step 7: Commit**

  ```bash
  git add backend/src/db backend/drizzle backend/src/modules/tenants backend/src/modules/tenant-provisioning
  git commit -m "feat: add tenant provisioning persistence"
  ```

---

## Task 02: Chatwoot Platform API Client

**Files:**

- Create: `backend/src/integrations/chatwoot/platformClient.ts`
- Create: `backend/src/integrations/chatwoot/platformClient.test.ts`
- Modify: `backend/src/integrations/chatwoot/request.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/config/env.test.ts`
- Modify: `.env.example`
- Modify: `.env.production.example`

- [ ] **Step 1: Write client tests**

  Cover these requests with fake `fetch`:
  - `POST /platform/api/v1/accounts`;
  - `GET /platform/api/v1/accounts`;
  - `GET /platform/api/v1/accounts/{id}`;
  - `DELETE /platform/api/v1/accounts/{id}`;
  - `POST /platform/api/v1/users`;
  - `POST /platform/api/v1/users/{id}/token`;
  - `POST /platform/api/v1/accounts/{account_id}/account_users`;
  - non-2xx responses throw `ChatwootClientRequestError`;
  - errors do not contain platform token or user access token.

  Expected request header:

  ```http
  api_access_token: <platform app token>
  ```

- [ ] **Step 2: Extend request helper if needed**

  Update `ChatwootJsonMethod` in `backend/src/integrations/chatwoot/request.ts`:

  ```ts
  type ChatwootJsonMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST'
  ```

- [ ] **Step 3: Add env config**

  Add optional env values:

  ```ts
  CHATWOOT_PLATFORM_API_ACCESS_TOKEN: optionalNonEmptyString,
  PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX: optionalNonEmptyString,
  PORTAL_PROVISIONING_SERVICE_EMAIL_DOMAIN: optionalNonEmptyString,
  ```

  Add tests that:
  - all three are absent by default;
  - all three parse when set;
  - `PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX` is a host suffix, not a URL;
  - production does not require them unless provisioning scripts are used.

- [ ] **Step 4: Implement platform client**

  Export:

  ```ts
  export type ChatwootPlatformClientConfig = {
    apiAccessToken: string
    baseUrl: string
  }

  export type ChatwootPlatformAccount = {
    customAttributes: Record<string, unknown>
    id: number
    name: string
  }

  export type ChatwootPlatformUser = {
    accessToken: string | null
    email: string
    id: number
    name: string
  }

  export type ChatwootPlatformClient = {
    addAccountUser(input: {
      accountId: number
      role: 'administrator' | 'agent'
      userId: number
    }): Promise<void>
    createAccount(input: {
      customAttributes: Record<string, unknown>
      name: string
    }): Promise<ChatwootPlatformAccount>
    createUser(input: {
      customAttributes: Record<string, unknown>
      email: string
      name: string
      password: string
    }): Promise<ChatwootPlatformUser>
    deleteAccount(accountId: number): Promise<void>
    getAccount(accountId: number): Promise<ChatwootPlatformAccount>
    getUserToken(userId: number): Promise<string>
    listAccounts(): Promise<ChatwootPlatformAccount[]>
  }

  export function createChatwootPlatformClient(options: {
    config: ChatwootPlatformClientConfig
    fetchFn?: typeof fetch
    requestTimeoutMs?: number
  }): ChatwootPlatformClient
  ```

  Map Chatwoot snake_case response fields to camelCase at the boundary.

- [ ] **Step 5: Run tests**

  ```bash
  pnpm --dir backend test -- src/integrations/chatwoot/platformClient.test.ts src/config/env.test.ts
  ```

  Expected: pass.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/src/integrations/chatwoot backend/src/config .env.example .env.production.example
  git commit -m "feat: add chatwoot platform api client"
  ```

---

## Task 03: API Channel Inbox Provisioning Client

**Files:**

- Modify: `backend/src/integrations/chatwoot/client.ts`
- Modify: `backend/src/integrations/chatwoot/client.test.ts`

- [ ] **Step 1: Write tests for API inbox discovery and creation**

  Add tests for:
  - listing account inboxes and finding `Channel::Api` by exact name;
  - creating API Channel inbox with `channel.type='api'`;
  - setting `lock_to_single_conversation=true`;
  - configuring webhook with existing `configurePortalInboxWebhook`;
  - parsing `id`, `inbox_identifier`, `secret` and `webhook_url`.

  Expected create request:

  ```json
  {
    "name": "Portal buhfirma",
    "lock_to_single_conversation": true,
    "channel": {
      "type": "api"
    }
  }
  ```

- [ ] **Step 2: Add types**

  Add:

  ```ts
  export type ChatwootInboxSummary = {
    channelType: string | null
    id: number
    inboxIdentifier: string | null
    name: string | null
  }

  export type ChatwootCreatedApiInbox = ChatwootPortalInboxRouting & {
    name: string | null
  }
  ```

- [ ] **Step 3: Add client methods**

  Add methods to `createChatwootClient`:

  ```ts
  createPortalApiInbox(input: {
    name: string
  }): Promise<ChatwootCreatedApiInbox>

  findPortalApiInboxByName(input: {
    name: string
  }): Promise<ChatwootInboxSummary | null>
  ```

  `findPortalApiInboxByName` must call:

  ```http
  GET /api/v1/accounts/{accountId}/inboxes
  ```

  `createPortalApiInbox` must call:

  ```http
  POST /api/v1/accounts/{accountId}/inboxes
  ```

  The service in Task 04 will call `findPortalApiInboxByName` before creating to reduce duplicate inbox risk after retries.

- [ ] **Step 4: Run tests**

  ```bash
  pnpm --dir backend test -- src/integrations/chatwoot/client.test.ts
  ```

  Expected: pass.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/integrations/chatwoot/client.ts backend/src/integrations/chatwoot/client.test.ts
  git commit -m "feat: add chatwoot api inbox provisioning client"
  ```

---

## Task 04: Tenant Provisioning Service

**Files:**

- Create: `backend/src/modules/tenant-provisioning/input.ts`
- Create: `backend/src/modules/tenant-provisioning/input.test.ts`
- Create: `backend/src/modules/tenant-provisioning/service.ts`
- Create: `backend/src/modules/tenant-provisioning/service.test.ts`
- Modify: `backend/src/modules/tenant-provisioning/repository.ts`

- [ ] **Step 1: Write input tests**

  Cover:
  - `slug` normalization;
  - custom-domain mode requires `primaryDomain` and `publicBaseUrl`;
  - provider-subdomain mode requires `providerSubdomain` and
    `providerTenantDomainSuffix`;
  - custom-domain `primaryDomain` rejects protocol/path/port;
  - custom-domain `publicBaseUrl` host must match `primaryDomain`;
  - provider-subdomain value must exactly equal normalized `slug`;
  - provider-subdomain value rejects uppercase, dots, protocol, slash, spaces,
    `_`, wildcard values, unicode/IDNA ambiguity, leading hyphen, trailing
    hyphen, labels longer than 63 chars and reserved labels `admin`, `api`,
    `www`, `mail`, `chat`, `support`;
  - provider-domain suffix rejects protocol/path/port/wildcard and normalizes
    lowercase plus trailing dot removal;
  - provider-subdomain mode resolves `buhfirma.portal.example.com` and
    `https://buhfirma.portal.example.com`;
  - `chatwootBaseUrl` must be http/https URL;
  - service email domain must be a domain, not URL;
  - generated service emails are deterministic:

  ```text
  portal-runtime+buhfirma@portal-service.example.com
  portal-admin-verify+buhfirma@portal-service.example.com
  ```

- [ ] **Step 2: Implement input normalization**

  Export:

  ```ts
  export type TenantProvisioningBaseInput = {
    chatwootBaseUrl: string
    clientAdminEmail: string
    clientAdminName: string
    displayName: string
    serviceEmailDomain: string
    slug: string
  }

  export type TenantProvisioningDomainInput =
    | {
        mode: 'custom_domain'
        primaryDomain: string
        publicBaseUrl: string
      }
    | {
        mode: 'provider_subdomain'
        providerSubdomain: string
        providerTenantDomainSuffix: string
      }

  export type TenantProvisioningInput = TenantProvisioningBaseInput &
    TenantProvisioningDomainInput

  export type NormalizedTenantProvisioningInput =
    TenantProvisioningBaseInput & {
      domainMode: 'custom_domain' | 'provider_subdomain'
      primaryDomain: string
      providerSubdomain: string | null
      providerTenantDomainSuffix: string | null
      publicBaseUrl: string
    }

  export function normalizeTenantProvisioningInput(
    input: TenantProvisioningInput,
  ): NormalizedTenantProvisioningInput

  export function buildProvisioningServiceUsers(input: {
    serviceEmailDomain: string
    slug: string
  }) {
    return {
      adminVerificationEmail: `portal-admin-verify+${input.slug}@${input.serviceEmailDomain}`,
      runtimeEmail: `portal-runtime+${input.slug}@${input.serviceEmailDomain}`,
    }
  }
  ```

  Use this exact provider-subdomain DNS label rule:

  ```ts
  const providerSubdomainPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
  ```

  The implementation must reject reserved labels after lower-case normalization
  and before building `primaryDomain`.

- [ ] **Step 3: Write service tests**

  Use mocked Platform API client, mocked Chatwoot account client and PGlite DB.

  Cover:
  - happy path creates all Chatwoot resources and active portal tenant;
  - provider-subdomain path stores resolved `primaryDomain` and
    `publicBaseUrl`, not only the suffix;
  - provider-subdomain path rejects `providerSubdomain` that differs from
    normalized `slug`;
  - safe report contains IDs and statuses but no tokens/passwords/secrets;
  - existing completed tenant returns `action='already_exists'`;
  - rerun after account creation reuses `chatwootAccountId` from provisioning run;
  - rerun finds existing account by `custom_attributes.portal_tenant_slug`;
  - rerun finds existing API inbox by exact name before creating another inbox;
  - rerun rejects immutable input mismatch for custom-domain to
    provider-subdomain, provider suffix change, domain change and Chatwoot base
    URL change;
  - failure marks run `failed` and stores sanitized error;
  - runtime token and admin-verification token decrypt to different values.

- [ ] **Step 4: Implement service**

  Export:

  ```ts
  export type ProvisionTenantResult = {
    action: 'already_exists' | 'created' | 'resumed'
    runId: number
    tenant: {
      chatwootAccountId: number
      chatwootPortalInboxId: number
      id: number
      primaryDomain: string
      publicBaseUrl: string
      slug: string
      status: 'active'
    }
  }

  export function provisionTenant(options: {
    chatwootAccountClientFactory: (config: ChatwootClientConfig) => {
      configurePortalInboxWebhook(input: {
        url: string
      }): Promise<ChatwootPortalInboxWebhook>
      createPortalApiInbox(input: {
        name: string
      }): Promise<ChatwootCreatedApiInbox>
      findPortalApiInboxByName(input: {
        name: string
      }): Promise<ChatwootInboxSummary | null>
      ensurePortalInboxSingleConversationRouting(): Promise<
        ChatwootPortalInboxRouting & { updated: boolean }
      >
    }
    input: TenantProvisioningInput
    passwordGenerator?: () => string
    platformClient: ChatwootPlatformClient
    provisioningRepository: TenantProvisioningRepository
    tenantSecretKey: string
    tenantsRepository: TenantsRepository
  }): Promise<ProvisionTenantResult>
  ```

  Required orchestration order:
  1. Normalize input.
  2. If a portal tenant already exists by slug or primary domain, return `already_exists` only if it matches the requested domain and Chatwoot base URL; otherwise throw a conflict error.
  3. Create or resume provisioning run by slug with normalized `domainMode`,
     `primaryDomain`, `publicBaseUrl`, `providerSubdomain` and
     `providerTenantDomainSuffix`.
  4. Find existing Platform API account with `custom_attributes.portal_tenant_slug === slug`; create it if absent.
  5. Create/link real client admin user.
  6. Create/link runtime service user.
  7. Create/link admin-verification service user.
  8. Get runtime and admin-verification access tokens.
  9. Find API inbox named `Portal <slug>`; create it if absent.
  10. Configure webhook URL from `publicBaseUrl`.
  11. Store encrypted tokens and webhook secret in `portal_tenants`.
  12. Verify Chatwoot account/inbox routing.
  13. Mark provisioning run completed.

  Account custom attributes:

  ```json
  {
    "portal_managed": true,
    "portal_tenant_slug": "buhfirma"
  }
  ```

  Service user custom attributes:

  ```json
  {
    "portal_managed": true,
    "portal_service_role": "runtime"
  }
  ```

- [ ] **Step 5: Run tests**

  ```bash
  pnpm --dir backend test -- src/modules/tenant-provisioning/input.test.ts src/modules/tenant-provisioning/service.test.ts
  ```

  Expected: pass.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/src/modules/tenant-provisioning
  git commit -m "feat: add tenant provisioning service"
  ```

---

## Task 05: `tenant:create` CLI

**Files:**

- Create: `backend/src/scripts/create-tenant-core.ts`
- Create: `backend/src/scripts/create-tenant-core.test.ts`
- Create: `backend/src/scripts/create-tenant.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Write CLI core tests**

  Cover custom-domain parsing:

  ```bash
  --slug=buhfirma
  --display-name=Бухфирма
  --primary-domain=lk.buhfirma.ru
  --public-base-url=https://lk.buhfirma.ru
  --chatwoot-base-url=https://chat.example.ru
  --client-admin-email=admin@buhfirma.ru
  --client-admin-name="Иван Админ"
  ```

  Cover provider-subdomain parsing:

  ```bash
  --slug=buhfirma
  --display-name=Бухфирма
  --provider-subdomain=buhfirma
  --chatwoot-base-url=https://chat.example.ru
  --client-admin-email=admin@buhfirma.example
  --client-admin-name="Иван Админ"
  ```

  Cover rejected combinations:
  - `--provider-subdomain` together with `--primary-domain`;
  - `--provider-subdomain` together with `--public-base-url`;
  - `--provider-subdomain=other` when normalized `--slug=buhfirma`;
  - `--primary-domain` without `--public-base-url`;
  - `--public-base-url` without `--primary-domain`;
  - provider-subdomain mode without `PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX`;
  - provider-subdomain value `admin`, `api`, `www`, `mail`, `chat` or
    `support`.

  Required env for every run:

  ```text
  CHATWOOT_PLATFORM_API_ACCESS_TOKEN
  PORTAL_PROVISIONING_SERVICE_EMAIL_DOMAIN
  PORTAL_TENANT_SECRET_KEY
  DATABASE_URL
  ```

  Additional env required only for `--provider-subdomain`:

  ```text
  PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX
  ```

  Tests must assert missing required args/env fail with clear messages.

- [ ] **Step 2: Implement CLI core**

  `create-tenant-core.ts` exports:

  ```ts
  export type CreateTenantCliArgs = {
    chatwootBaseUrl: string
    clientAdminEmail: string
    clientAdminName: string
    displayName: string
    primaryDomain?: string
    providerSubdomain?: string
    publicBaseUrl?: string
    slug: string
  }

  export function parseCreateTenantArgs(argv: string[]): CreateTenantCliArgs

  export function createSafeTenantProvisioningReport(
    result: ProvisionTenantResult,
  ): ProvisionTenantResult
  ```

  `create-tenant.ts` must combine `CreateTenantCliArgs` with
  `PORTAL_PROVISIONING_SERVICE_EMAIL_DOMAIN` from env. If
  `providerSubdomain` is present, it must also inject
  `PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX` and call `provisionTenant` with
  `mode='provider_subdomain'`. Otherwise it must call `provisionTenant` with
  `mode='custom_domain'`. Do not accept passwords through CLI args.

- [ ] **Step 3: Implement executable script**

  `create-tenant.ts` must:
  - load env;
  - run DB migrations;
  - create DB client;
  - create Platform API client using `CHATWOOT_PLATFORM_API_ACCESS_TOKEN`;
  - create Chatwoot account client factory;
  - call `provisionTenant`;
  - print safe JSON report.

- [ ] **Step 4: Add package script**

  Add:

  ```json
  {
    "tenant:create": "tsx src/scripts/create-tenant.ts"
  }
  ```

- [ ] **Step 5: Run tests**

  ```bash
  pnpm --dir backend test -- src/scripts/create-tenant-core.test.ts
  ```

  Expected: pass.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/src/scripts/create-tenant* backend/package.json
  git commit -m "feat: add tenant create operator cli"
  ```

---

## Task 06: Reconciliation For Manual Chatwoot Deletes

**Files:**

- Create: `backend/src/modules/tenant-provisioning/reconciliation.ts`
- Create: `backend/src/modules/tenant-provisioning/reconciliation.test.ts`
- Create: `backend/src/scripts/reconcile-tenants-core.ts`
- Create: `backend/src/scripts/reconcile-tenants-core.test.ts`
- Create: `backend/src/scripts/reconcile-tenants.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Write reconciliation tests**

  Cover:
  - active operator-provisioned tenant with reachable Chatwoot account remains active;
  - Chatwoot `404` marks tenant `suspended`;
  - Chatwoot `401` reports `platform_auth_failed` and does not change tenant
    status;
  - tenants with no completed provisioning run are reported `unmanaged` and skipped;
  - `provisioning` and `archived` tenants are skipped;
  - dry-run reports intended changes without writing status;
  - report never includes tokens.

- [ ] **Step 2: Implement reconciliation service**

  Export:

  ```ts
  export type ReconcileTenantChatwootAccountsResult = {
    checked: number
    dryRun: boolean
    suspended: number
    tenants: Array<{
      action: 'kept_active' | 'skipped' | 'suspended' | 'would_suspend'
      reason:
        | 'archived'
        | 'chatwoot_account_missing'
        | 'chatwoot_account_reachable'
        | 'not_operator_provisioned'
        | 'platform_auth_failed'
        | 'provisioning'
      slug: string
    }>
  }

  export function reconcileTenantChatwootAccounts(options: {
    dryRun: boolean
    platformClientFactory: (baseUrl: string) => ChatwootPlatformClient
    provisioningRepository: Pick<
      TenantProvisioningRepository,
      'listCompletedRuns'
    >
    tenantsRepository: Pick<
      TenantsRepository,
      'listTenants' | 'updateTenantStatus'
    >
  }): Promise<ReconcileTenantChatwootAccountsResult>
  ```

  Use Platform API only for tenants with a completed provisioning run. If a tenant
  was created through older/default bootstrap flow, report `not_operator_provisioned`
  and do not suspend it in this job.

- [ ] **Step 3: Implement CLI**

  Add script:

  ```json
  {
    "tenant:chatwoot:reconcile": "tsx src/scripts/reconcile-tenants.ts"
  }
  ```

  Supported args:

  ```bash
  --dry-run
  --apply
  ```

  Require exactly one of `--dry-run` or `--apply`.

- [ ] **Step 4: Run tests**

  ```bash
  pnpm --dir backend test -- src/modules/tenant-provisioning/reconciliation.test.ts src/scripts/reconcile-tenants-core.test.ts
  ```

  Expected: pass.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/modules/tenant-provisioning backend/src/scripts/reconcile-tenants* backend/package.json
  git commit -m "feat: add tenant chatwoot reconciliation"
  ```

---

## Task 07: Safe Deprovision CLI

**Files:**

- Create: `backend/src/modules/tenant-provisioning/deprovision.ts`
- Create: `backend/src/modules/tenant-provisioning/deprovision.test.ts`
- Create: `backend/src/scripts/deprovision-tenant-core.ts`
- Create: `backend/src/scripts/deprovision-tenant-core.test.ts`
- Create: `backend/src/scripts/deprovision-tenant.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Write deprovision tests**

  Cover:
  - `--archive-only` changes tenant from `active` to `archived` and does not call Chatwoot delete;
  - `--delete-chatwoot-account` first suspends tenant, calls Platform API delete, then archives tenant;
  - command requires `--confirm=<tenant-slug>`;
  - missing tenant fails clearly;
  - physical DB delete is never called.

- [ ] **Step 2: Implement deprovision service**

  Export:

  ```ts
  export type DeprovisionTenantResult = {
    chatwootDeleteRequested: boolean
    finalStatus: 'archived'
    previousStatus: TenantStatus
    tenantId: number
    tenantSlug: string
  }

  export function deprovisionTenant(options: {
    confirmSlug: string
    deleteChatwootAccount: boolean
    platformClient: ChatwootPlatformClient
    tenantSlug: string
    tenantsRepository: Pick<
      TenantsRepository,
      'findBySlug' | 'updateTenantStatus'
    >
  }): Promise<DeprovisionTenantResult>
  ```

  Behavior:
  - reject if `confirmSlug !== tenantSlug`;
  - set status `suspended` before external delete;
  - if `deleteChatwootAccount=true`, call Platform API delete;
  - set status `archived` after successful archive/delete path;
  - return safe report with tenant id, slug, previous status, final status and whether Chatwoot delete was requested.

- [ ] **Step 3: Add CLI**

  Add package script:

  ```json
  {
    "tenant:deprovision": "tsx src/scripts/deprovision-tenant.ts"
  }
  ```

  Supported examples:

  ```bash
  pnpm --dir backend tenant:deprovision -- --tenant=buhfirma --archive-only --confirm=buhfirma
  pnpm --dir backend tenant:deprovision -- --tenant=buhfirma --delete-chatwoot-account --confirm=buhfirma
  ```

- [ ] **Step 4: Run tests**

  ```bash
  pnpm --dir backend test -- src/modules/tenant-provisioning/deprovision.test.ts src/scripts/deprovision-tenant-core.test.ts
  ```

  Expected: pass.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/modules/tenant-provisioning backend/src/scripts/deprovision-tenant* backend/package.json
  git commit -m "feat: add safe tenant deprovision cli"
  ```

---

## Task 08: Operations Documentation

**Files:**

- Modify: `docs/operations/mt-10-deployment-runbooks.md`
- Modify: `docs/operations/chatwoot-account-lifecycle-portal-provisioning-research.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/architecture/decisions.md`
- Modify: `docs/architecture/multi-tenant-reference.md`
- Modify: `docs/roadmap/work-log.md`

- [ ] **Step 1: Update MT-10 runbook**

  Add custom-domain operator command:

  ```bash
  pnpm --dir backend tenant:create -- \
    --slug=buhfirma \
    --display-name="Бухфирма" \
    --primary-domain=lk.buhfirma.ru \
    --public-base-url=https://lk.buhfirma.ru \
    --chatwoot-base-url=https://chat.example.ru \
    --client-admin-email=admin@buhfirma.ru \
    --client-admin-name="Иван Админ"
  ```

  Add provider-subdomain operator command:

  ```bash
  pnpm --dir backend tenant:create -- \
    --slug=buhfirma \
    --display-name="Бухфирма" \
    --provider-subdomain=buhfirma \
    --chatwoot-base-url=https://chat.example.ru \
    --client-admin-email=admin@buhfirma.example \
    --client-admin-name="Иван Админ"
  ```

  Add lifecycle commands:

  ```bash
  pnpm --dir backend tenant:chatwoot:reconcile -- --dry-run

  pnpm --dir backend tenant:deprovision -- \
    --tenant=buhfirma \
    --archive-only \
    --confirm=buhfirma
  ```

  Explain DNS responsibility:

  ```text
  Custom domain: B2B client creates DNS record lk.<client-domain> to the portal reverse proxy.
  Provider subdomain: provider owns wildcard DNS/certificates/reverse proxy readiness for <tenant-slug>.<PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX>.
  In both cases provider/operator runs tenant provisioning.
  ```

  Add note that `PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX` is a deploy config value,
  not a hard-coded brand name. Documentation examples must use neutral
  `portal.example.com`.

  Add provider-domain prerequisites:

  ```text
  *.PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX resolves to the portal reverse proxy.
  TLS covers the wildcard or generated host.
  Reverse proxy preserves Host / trusted X-Forwarded-Host.
  /api/tenant works on generated host before production handoff.
  ```

- [ ] **Step 2: Update research note status**

  Add a short status block pointing from research to implemented operator flow.

- [ ] **Step 3: Update architecture docs**

  Update stable architecture docs so they describe both production domain modes:

  ```text
  custom domain: lk.<client-domain>
  provider-owned subdomain: <tenant-slug>.<PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX>
  ```

  Add or update a decision entry in `docs/architecture/decisions.md` stating
  that tenant resolution remains Host-based, while provisioning can produce
  either domain mode. The current provider/company domain must not appear as
  code-level policy.

- [ ] **Step 4: Update work-log after all tests pass**

  Add one short bullet to `Current Baseline` only after implementation closure:

  ```text
  - MT-10A operator tenant lifecycle tooling is implemented: provider-owned CLI creates Chatwoot account/service users/API Channel inbox and portal tenant, supports safe archive/deprovision and detects Chatwoot account drift through reconciliation.
  ```

  Replace `Recommended Next Step` with the next concrete follow-up, for example UI wrapper or production rehearsal.

- [ ] **Step 5: Run docs checks**

  ```bash
  pnpm exec prettier --check docs/operations/mt-10-deployment-runbooks.md docs/operations/chatwoot-account-lifecycle-portal-provisioning-research.md docs/architecture/overview.md docs/architecture/decisions.md docs/architecture/multi-tenant-reference.md docs/roadmap/work-log.md
  git diff --check
  ```

  Expected: pass.

- [ ] **Step 6: Commit**

  ```bash
  git add docs/operations docs/architecture docs/roadmap/work-log.md
  git commit -m "docs: document tenant lifecycle operations"
  ```

---

## Task 09: Final Verification And Closure

**Files:**

- No planned code files unless findings require fixes.

- [ ] **Step 1: Run targeted backend tests**

  ```bash
  pnpm --dir backend test -- \
    src/integrations/chatwoot/platformClient.test.ts \
    src/integrations/chatwoot/client.test.ts \
    src/modules/tenant-provisioning/repository.test.ts \
    src/modules/tenant-provisioning/input.test.ts \
    src/modules/tenant-provisioning/service.test.ts \
    src/modules/tenant-provisioning/reconciliation.test.ts \
    src/modules/tenant-provisioning/deprovision.test.ts \
    src/modules/tenants/repository.test.ts \
    src/scripts/create-tenant-core.test.ts \
    src/scripts/reconcile-tenants-core.test.ts \
    src/scripts/deprovision-tenant-core.test.ts
  ```

  Expected: pass.

- [ ] **Step 2: Run required broad backend checks**

  ```bash
  pnpm --dir backend test
  pnpm --dir backend build
  pnpm lint
  git diff --check
  ```

  Expected: pass. If full `pnpm lint` fails because of unrelated baseline, capture exact unrelated files and run the narrow equivalent for touched code before closure.

- [ ] **Step 3: Manual local smoke with real Chatwoot**

  With local Chatwoot and portal DB running, first test custom-domain mode:

  ```bash
  pnpm --dir backend tenant:create -- \
    --slug=buhfirma-smoke \
    --display-name="Бухфирма Smoke" \
    --primary-domain=buhfirma.127.0.0.1.nip.io \
    --public-base-url=http://buhfirma.127.0.0.1.nip.io:5173 \
    --chatwoot-base-url=http://127.0.0.1:3000 \
    --client-admin-email=cbr+smoke@example.com \
    --client-admin-name="Smoke Admin"
  ```

  Then test provider-subdomain mode with a neutral local suffix configured in
  env, for example
  `PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX=portal.127.0.0.1.nip.io`:

  ```bash
  pnpm --dir backend tenant:create -- \
    --slug=buhfirma-provider-smoke \
    --display-name="Бухфирма Provider Smoke" \
    --provider-subdomain=buhfirma-provider-smoke \
    --chatwoot-base-url=http://127.0.0.1:3000 \
    --client-admin-email=cbr+provider-smoke@example.com \
    --client-admin-name="Provider Smoke Admin"
  ```

  Verify:
  - JSON report has `action=created` or `action=already_exists`;
  - no plaintext tokens/passwords/secrets are printed;
  - tenant appears in portal DB with status `active`;
  - provider-subdomain tenant resolves to
    `buhfirma-provider-smoke.portal.127.0.0.1.nip.io`;
  - backend Host-based tenant resolution works for the generated host, for
    example through local proxy or direct backend request:

    ```bash
    curl -fsS \
      -H 'Host: buhfirma-provider-smoke.portal.127.0.0.1.nip.io' \
      http://127.0.0.1:3301/api/tenant
    ```

  - Chatwoot has account, service users and API Channel inbox;
  - `pnpm --dir backend tenant:chatwoot:verify -- --tenant=buhfirma-smoke` passes.
  - `pnpm --dir backend tenant:chatwoot:verify -- --tenant=buhfirma-provider-smoke`
    passes.

  Before production handoff for a provider-subdomain tenant, also verify:

  ```bash
  curl -fsS https://<tenant-slug>.<PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX>/api/tenant
  ```

  Expected: 200 JSON for that tenant. If wildcard DNS/TLS/proxy are not ready,
  this is a production readiness blocker, not an implementation success.

- [ ] **Step 4: Review**

  Perform code review in this order:
  - schema/migration safety;
  - Platform API token handling;
  - idempotency and retry behavior;
  - tenant isolation and status transitions;
  - safe report redaction;
  - docs accuracy.

  Critical/Important findings must be fixed and retested before closure.

- [ ] **Step 5: Final checkpoint commit**

  Commit only if the closure flow is green and no unrelated files are staged:

  ```bash
  git status --short --branch
  git log --oneline --max-count=5
  ```

  If all task commits already exist and no fix remains, no extra empty commit is needed.

## Acceptance Criteria

- Operator can create a tenant without manual SQL.
- B2B client with its own domain only needs DNS for `lk.<client-domain>`; the client does not configure Chatwoot, object storage, inboxes, webhooks or tokens.
- B2B client without its own domain can be created on
  `<tenant-slug>.<PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX>` with no client-side DNS
  work.
- Provider-owned domain suffix is deploy config, not a hard-coded current
  provider/company name.
- Provider-owned domain mode has documented and verified wildcard DNS, TLS and
  reverse-proxy Host preservation prerequisites before production handoff.
- Chatwoot account is created through Platform API.
- Client admin user is created or reused and linked to the account.
- Portal runtime service user and admin-verification service user are separate.
- API Channel inbox is created or reused by exact name.
- API Channel webhook URL and `Channel::Api.secret` are configured and stored encrypted.
- Portal tenant is created only after required Chatwoot resources exist.
- Rerun after partial failure resumes from stored provisioning run state where possible.
- Safe reports do not expose plaintext tokens, passwords or secrets.
- Manual Chatwoot deletion drift can suspend the portal tenant through reconciliation.
- Deprovision path archives/suspends tenants and never physically deletes portal tenant rows.
- Chatwoot core remains untouched.

## Out Of Scope

- Customer self-service signup directly from Chatwoot login page.
- Browser/admin UI for tenant creation.
- Automatic DNS or certificate management.
- Migrating an existing tenant from provider-owned subdomain to client-owned
  custom domain.
- Physical purge of portal-owned tenant data.
- Billing, tariff setup or payment integration.
- Patching Chatwoot to emit `account.deleted`.
