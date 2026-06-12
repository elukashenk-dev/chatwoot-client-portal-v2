# MT-10A SMS Fallback Tenant Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an operator-owned SMS fallback lifecycle on top of MT-10A tenants so SMS can be enabled, verified, reconciled and disabled without manual SQL.

**Architecture:** Base `tenant:create` remains focused on the normal portal Chatwoot account, runtime/admin users and main API Channel inbox. SMS fallback is an optional add-on executed after MT-10A tenant provisioning and after the SMS fallback backend schema/routes exist. The add-on creates or reuses a separate Chatwoot API Channel inbox, configures the SMS webhook, stores SMS secrets encrypted, manages one tenant-owned SMSGate gateway, and disables SMS runtime during tenant archive/deprovision.

**Tech Stack:** Node 24, TypeScript, Drizzle/Postgres, Vitest, Chatwoot Platform/account APIs, SMSGate Private Server, existing MT-10A tenant provisioning scripts.

---

## Source Context

Read before implementation:

- `AGENTS.md`
- `docs/superpowers/plans/2026-05-26-sms-fallback-gateway-implementation.md`
- `docs/operations/mt-10-deployment-runbooks.md`
- `docs/architecture/overview.md`
- `docs/architecture/decisions.md`
- `docs/architecture/multi-tenant-reference.md`
- `backend/src/modules/tenant-provisioning/service.ts`
- `backend/src/scripts/create-tenant-core.ts`
- `backend/src/scripts/deprovision-tenant.ts`
- `backend/src/scripts/verify-tenant-chatwoot-connection-core.ts`
- `backend/src/integrations/chatwoot/client.ts`
- `backend/src/modules/tenants/repository.ts`

## Preconditions

Do not execute this plan until these baseline facts are true on the branch used
for SMS work:

- MT-10A tenant lifecycle tooling is present:
  `tenant:create`, `tenant:chatwoot:verify`,
  `tenant:chatwoot:reconcile`, `tenant:deprovision`.
- SMS fallback backend schema from the SMS plan exists:
  - `portal_tenants.chatwoot_sms_fallback_inbox_id`;
  - `portal_tenants.chatwoot_sms_fallback_webhook_secret_ciphertext`;
  - `portal_sms_gateways`;
  - outbound SMS job tables.
- SMS fallback Chatwoot webhook route exists:
  `/api/integrations/chatwoot/webhooks/sms-fallback`.
- SMSGate Private Server spike has a `go` decision and confirms the auth and
  webhook signature rules used by `backend/src/modules/sms-fallback`.

If any precondition is false, stop and update the SMS bridge plan first.

## Non-Negotiable Boundaries

- Do not add SMS provisioning to the base `tenant:create` command.
- Do not store SMSGate credentials, webhook secrets or Chatwoot tokens in
  plaintext.
- Do not print SMSGate credentials, webhook secrets, full customer phone
  numbers or Chatwoot tokens in CLI reports.
- Do not physically delete portal tenant rows or SMS history in this plan.
- Do not suspend the whole portal tenant because only SMS fallback is unhealthy.
- Do not patch Chatwoot core.
- Gateway webhooks must fail closed for non-active tenants because they do not
  arrive through the browser Host-based tenant boundary.

## File Structure

Create:

- `backend/src/modules/sms-fallback/provisioning.ts` - SMS fallback tenant
  provisioning service.
- `backend/src/modules/sms-fallback/provisioning.test.ts`
- `backend/src/modules/sms-fallback/verification.ts` - SMS fallback tenant
  verification service.
- `backend/src/modules/sms-fallback/verification.test.ts`
- `backend/src/modules/sms-fallback/reconciliation.ts` - drift detection for
  SMS inbox/webhook/gateway state.
- `backend/src/modules/sms-fallback/reconciliation.test.ts`
- `backend/src/modules/sms-fallback/deprovision.ts` - SMS fallback disable and
  queued-job abandon helpers used during tenant archive/deprovision.
- `backend/src/modules/sms-fallback/deprovision.test.ts`
- `backend/src/scripts/provision-sms-fallback-tenant-core.ts`
- `backend/src/scripts/provision-sms-fallback-tenant-core.test.ts`
- `backend/src/scripts/provision-sms-fallback-tenant.ts`
- `backend/src/scripts/verify-sms-fallback-tenant-core.ts`
- `backend/src/scripts/verify-sms-fallback-tenant-core.test.ts`
- `backend/src/scripts/verify-sms-fallback-tenant.ts`
- `backend/src/scripts/reconcile-sms-fallback-tenants-core.ts`
- `backend/src/scripts/reconcile-sms-fallback-tenants-core.test.ts`
- `backend/src/scripts/reconcile-sms-fallback-tenants.ts`

Modify:

- `backend/package.json` - add operator scripts.
- `backend/src/modules/tenants/repository.ts` - add SMS fallback config update
  helpers.
- `backend/src/modules/tenants/repository.test.ts`
- `backend/src/modules/sms-fallback/repository.ts` - add gateway upsert,
  disable and job-abandon helpers when not already present.
- `backend/src/modules/sms-fallback/repository.test.ts`
- `backend/src/scripts/deprovision-tenant.ts` - disable SMS fallback during
  archive/deprovision.
- `backend/src/modules/tenant-provisioning/deprovision.test.ts` or a new
  deprovision integration test file.
- `docs/operations/sms-fallback.md`
- `docs/operations/mt-10-deployment-runbooks.md`
- `docs/architecture/multi-tenant-reference.md`
- `docs/roadmap/work-log.md` only after the implementation is complete and
  verified.

---

## Task 0: Branch And Baseline Gate

**Files:**

- Read: `AGENTS.md`
- Read: `docs/roadmap/work-log.md`
- Read: `docs/superpowers/plans/2026-05-26-sms-fallback-gateway-implementation.md`
- Read: `docs/operations/mt-10-deployment-runbooks.md`

- [ ] **Step 1: Confirm branch baseline**

  Run:

  ```bash
  git status --short --branch
  git log --oneline --max-count=12
  ```

  Expected: the worktree is clean and the branch includes the MT-10A commits
  that introduced `tenant:create`, tenant Chatwoot reconciliation and
  deprovisioning.

- [ ] **Step 2: Confirm SMS backend schema exists**

  Run:

  ```bash
  rg -n "chatwootSmsFallbackInboxId|portal_sms_gateways|sms-fallback" backend/src backend/drizzle
  ```

  Expected: SMS fallback schema, repository and routes from the SMS bridge plan
  are present. If the command finds no SMS fallback implementation, stop and
  execute the SMS bridge/schema tasks first.

- [ ] **Step 3: Create the lifecycle branch**

  Run:

  ```bash
  git switch -c feature/sms-fallback-tenant-lifecycle
  ```

  Expected:

  ```text
  ## feature/sms-fallback-tenant-lifecycle
  ```

## Task 1: Tenant SMS Fallback Provisioning Service

**Files:**

- Create: `backend/src/modules/sms-fallback/provisioning.ts`
- Create: `backend/src/modules/sms-fallback/provisioning.test.ts`
- Modify: `backend/src/modules/tenants/repository.ts`
- Modify: `backend/src/modules/tenants/repository.test.ts`
- Modify: `backend/src/modules/sms-fallback/repository.ts`
- Modify: `backend/src/modules/sms-fallback/repository.test.ts`

- [ ] **Step 1: Write failing tenant repository tests**

  Add tests to `backend/src/modules/tenants/repository.test.ts`:

  ```ts
  it('updates tenant SMS fallback Chatwoot config without touching main portal inbox config', async () => {
    const repository = createTenantsRepository(db)
    const tenant = await createTenantFixture(repository)

    const updated = await repository.updateSmsFallbackChatwootConfig({
      chatwootSmsFallbackInboxId: 77,
      chatwootSmsFallbackWebhookSecretCiphertext: 'sms-webhook-ciphertext',
      tenantId: tenant.id,
    })

    expect(updated.chatwootSmsFallbackInboxId).toBe(77)
    expect(updated.chatwootSmsFallbackWebhookSecretCiphertext).toBe(
      'sms-webhook-ciphertext',
    )
    expect(updated.chatwootPortalInboxId).toBe(tenant.chatwootPortalInboxId)
    expect(updated.chatwootWebhookSecretCiphertext).toBe(
      tenant.chatwootWebhookSecretCiphertext,
    )
  })

  it('clears tenant SMS fallback Chatwoot config without archiving the tenant', async () => {
    const repository = createTenantsRepository(db)
    const tenant = await createSmsEnabledTenantFixture(repository)

    const updated = await repository.clearSmsFallbackChatwootConfig({
      tenantId: tenant.id,
    })

    expect(updated.status).toBe('active')
    expect(updated.chatwootSmsFallbackInboxId).toBeNull()
    expect(updated.chatwootSmsFallbackWebhookSecretCiphertext).toBeNull()
  })
  ```

  Run:

  ```bash
  pnpm --dir backend test -- src/modules/tenants/repository.test.ts
  ```

  Expected: fail because SMS fallback tenant helpers do not exist yet.

- [ ] **Step 2: Implement tenant repository helpers**

  Add to `backend/src/modules/tenants/repository.ts`:

  ```ts
  async updateSmsFallbackChatwootConfig({
    chatwootSmsFallbackInboxId,
    chatwootSmsFallbackWebhookSecretCiphertext,
    tenantId,
    updatedAt = new Date(),
  }: {
    chatwootSmsFallbackInboxId: number
    chatwootSmsFallbackWebhookSecretCiphertext: string
    tenantId: number
    updatedAt?: Date
  }) {
    const [tenant] = await db
      .update(portalTenants)
      .set({
        chatwootSmsFallbackInboxId: normalizePositiveInteger(
          chatwootSmsFallbackInboxId,
          'chatwootSmsFallbackInboxId',
        ),
        chatwootSmsFallbackWebhookSecretCiphertext: normalizeNonEmptyString(
          chatwootSmsFallbackWebhookSecretCiphertext,
          'chatwootSmsFallbackWebhookSecretCiphertext',
        ),
        updatedAt,
      })
      .where(eq(portalTenants.id, tenantId))
      .returning()

    if (!tenant) {
      throw new Error('Failed to update tenant SMS fallback Chatwoot config.')
    }

    return tenant
  }

  async clearSmsFallbackChatwootConfig({
    tenantId,
    updatedAt = new Date(),
  }: {
    tenantId: number
    updatedAt?: Date
  }) {
    const [tenant] = await db
      .update(portalTenants)
      .set({
        chatwootSmsFallbackInboxId: null,
        chatwootSmsFallbackWebhookSecretCiphertext: null,
        updatedAt,
      })
      .where(eq(portalTenants.id, tenantId))
      .returning()

    if (!tenant) {
      throw new Error('Failed to clear tenant SMS fallback Chatwoot config.')
    }

    return tenant
  }
  ```

- [ ] **Step 3: Write failing SMS provisioning service tests**

  Create `backend/src/modules/sms-fallback/provisioning.test.ts` with cases:

  ```text
  provisions a separate SMS Fallback API Channel inbox and stores encrypted SMS webhook secret
  reuses an existing exact SMS Fallback inbox by name
  upserts one enabled SMSGate gateway for the tenant without exposing credentials
  rejects inactive tenants before touching Chatwoot or SMSGate config
  rejects conflicting gateway public id already owned by another tenant
  returns a safe report without webhook secret, SMSGate password or full phone number
  ```

  Run:

  ```bash
  pnpm --dir backend test -- src/modules/sms-fallback/provisioning.test.ts
  ```

  Expected: fail because `provisionSmsFallbackTenant` does not exist.

- [ ] **Step 4: Implement SMS provisioning service**

  Create `backend/src/modules/sms-fallback/provisioning.ts` with this public
  interface:

  ```ts
  export type SmsFallbackTenantProvisioningInput = {
    gatewayApiBaseUrl: string
    gatewayDeviceId: string | null
    gatewayPhoneNumber: string
    gatewayPublicId: string
    gatewaySimNumber: number | null
    gatewayUsername: string | null
    gatewayPassword: string | null
    gatewayWebhookSecret: string
    supportCallPhoneNumber: string | null
    tenantSlug: string
  }

  export type SmsFallbackTenantProvisioningResult = {
    action: 'created' | 'updated'
    gateway: {
      phoneMasked: string
      publicId: string
      status: 'enabled'
    }
    smsInbox: {
      id: number
      name: string
      webhookUrl: string
    }
    tenant: {
      id: number
      slug: string
      status: 'active'
    }
  }

  export async function provisionSmsFallbackTenant(options: {
    chatwootAccountClientFactory: (
      config: ChatwootClientConfig,
    ) => TenantProvisioningChatwootAccountClient
    input: SmsFallbackTenantProvisioningInput
    smsFallbackRepository: SmsFallbackRepository
    tenantSecretKey: string
    tenantsRepository: TenantsRepository
  }): Promise<SmsFallbackTenantProvisioningResult>
  ```

  Required behavior:

  ```text
  find tenant by slug
  require tenant.status === 'active'
  create Chatwoot account client with tenant runtime token and account id
  find or create API inbox named "SMS Fallback <slug>"
  configure webhook URL "<tenant.publicBaseUrl>/api/integrations/chatwoot/webhooks/sms-fallback"
  require returned API Channel secret
  encrypt returned secret with PORTAL_TENANT_SECRET_KEY
  update portal_tenants SMS fallback fields
  encrypt SMSGate password and gateway webhook secret with PORTAL_TENANT_SECRET_KEY
  upsert one enabled tenant gateway row
  return only safe ids, masked phone and public status
  ```

- [ ] **Step 5: Run focused tests**

  Run:

  ```bash
  pnpm --dir backend test -- \
    src/modules/tenants/repository.test.ts \
    src/modules/sms-fallback/repository.test.ts \
    src/modules/sms-fallback/provisioning.test.ts
  ```

  Expected: all focused provisioning tests pass.

- [ ] **Step 6: Commit**

  Run:

  ```bash
  git add backend/src/modules/tenants backend/src/modules/sms-fallback
  git commit -m "feat: add sms fallback tenant provisioning service"
  ```

## Task 2: `tenant:sms-fallback:provision` CLI

**Files:**

- Create: `backend/src/scripts/provision-sms-fallback-tenant-core.ts`
- Create: `backend/src/scripts/provision-sms-fallback-tenant-core.test.ts`
- Create: `backend/src/scripts/provision-sms-fallback-tenant.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Write CLI core tests**

  Create `backend/src/scripts/provision-sms-fallback-tenant-core.test.ts` with
  cases:

  ```text
  parses required tenant, gateway public id, base URL and gateway phone args
  accepts optional device id, SIM number and support call phone number
  builds runtime config from DATABASE_URL, PORTAL_TENANT_SECRET_KEY, SMSGATE_GATEWAY_PASSWORD and SMSGATE_WEBHOOK_SECRET
  rejects gateway password passed as a CLI flag
  rejects webhook secret passed as a CLI flag
  rejects invalid phone numbers before runtime side effects
  creates a safe report without full phone, password or webhook secret
  ```

  Use this operator command shape in tests:

  ```bash
  SMSGATE_GATEWAY_PASSWORD=secret \
  SMSGATE_WEBHOOK_SECRET=webhook-secret \
  pnpm --dir backend tenant:sms-fallback:provision -- \
    --tenant=buhfirma \
    --gateway-public-id=buhfirma-primary \
    --gateway-api-base-url=https://sms-gateway.internal/buhfirma \
    --gateway-phone-number=+79061295512 \
    --gateway-username=buhfirma-gateway \
    --gateway-device-id=android-1 \
    --gateway-sim-number=1 \
    --support-call-phone-number=+78005550123
  ```

  Expected: tests fail because parser/runtime builder does not exist.

- [ ] **Step 2: Implement CLI core**

  Create `backend/src/scripts/provision-sms-fallback-tenant-core.ts` with:

  ```ts
  export type ProvisionSmsFallbackTenantCliArgs = {
    gatewayApiBaseUrl: string
    gatewayDeviceId: string | null
    gatewayPhoneNumber: string
    gatewayPublicId: string
    gatewaySimNumber: number | null
    gatewayUsername: string | null
    supportCallPhoneNumber: string | null
    tenantSlug: string
  }

  export type ProvisionSmsFallbackTenantRuntimeConfig = {
    databaseUrl: string
    input: SmsFallbackTenantProvisioningInput
    tenantSecretKey: string
  }

  export function parseProvisionSmsFallbackTenantArgs(
    argv: string[],
  ): ProvisionSmsFallbackTenantCliArgs

  export function buildProvisionSmsFallbackTenantRuntimeConfig(options: {
    args: ProvisionSmsFallbackTenantCliArgs
    env: Pick<
      AppEnv,
      | 'DATABASE_URL'
      | 'PORTAL_TENANT_SECRET_KEY'
      | 'SMSGATE_GATEWAY_PASSWORD'
      | 'SMSGATE_WEBHOOK_SECRET'
    >
  }): ProvisionSmsFallbackTenantRuntimeConfig

  export function createSafeSmsFallbackProvisioningReport(
    result: SmsFallbackTenantProvisioningResult,
  ): SmsFallbackTenantProvisioningResult
  ```

  The parser must reject unknown args and must never accept
  `--gateway-password` or `--gateway-webhook-secret`.

- [ ] **Step 3: Implement executable script**

  Create `backend/src/scripts/provision-sms-fallback-tenant.ts`:

  ```ts
  import { loadEnv } from '../config/env.js'
  import { createDatabaseClient } from '../db/client.js'
  import { runDatabaseMigrations } from '../db/migrate.js'
  import { createChatwootClientFactory } from '../integrations/chatwoot/client.js'
  import { provisionSmsFallbackTenant } from '../modules/sms-fallback/provisioning.js'
  import { createSmsFallbackRepository } from '../modules/sms-fallback/repository.js'
  import { createTenantsRepository } from '../modules/tenants/repository.js'
  import {
    buildProvisionSmsFallbackTenantRuntimeConfig,
    createSafeSmsFallbackProvisioningReport,
    parseProvisionSmsFallbackTenantArgs,
  } from './provision-sms-fallback-tenant-core.js'

  async function main() {
    const env = loadEnv()
    const runtimeConfig = buildProvisionSmsFallbackTenantRuntimeConfig({
      args: parseProvisionSmsFallbackTenantArgs(process.argv.slice(2)),
      env,
    })
    const database = createDatabaseClient({
      connectionString: runtimeConfig.databaseUrl,
    })

    try {
      await runDatabaseMigrations(database.db)

      const chatwootClientFactory = createChatwootClientFactory({
        requestTimeoutMs: env.CHATWOOT_REQUEST_TIMEOUT_MS,
      })
      const result = await provisionSmsFallbackTenant({
        chatwootAccountClientFactory: (config) =>
          chatwootClientFactory.forTenant(config),
        input: runtimeConfig.input,
        smsFallbackRepository: createSmsFallbackRepository(database.db),
        tenantSecretKey: runtimeConfig.tenantSecretKey,
        tenantsRepository: createTenantsRepository(database.db),
      })

      console.log(
        JSON.stringify(
          createSafeSmsFallbackProvisioningReport(result),
          null,
          2,
        ),
      )
    } finally {
      await database.close()
    }
  }

  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  ```

- [ ] **Step 4: Add package script**

  Modify `backend/package.json`:

  ```json
  {
    "scripts": {
      "tenant:sms-fallback:provision": "tsx src/scripts/provision-sms-fallback-tenant.ts"
    }
  }
  ```

- [ ] **Step 5: Run focused tests and build**

  Run:

  ```bash
  pnpm --dir backend test -- \
    src/scripts/provision-sms-fallback-tenant-core.test.ts \
    src/modules/sms-fallback/provisioning.test.ts
  pnpm --dir backend build
  ```

  Expected: tests and build pass.

- [ ] **Step 6: Commit**

  Run:

  ```bash
  git add backend/package.json backend/src/scripts/provision-sms-fallback-tenant* backend/src/modules/sms-fallback
  git commit -m "feat: add sms fallback tenant provision cli"
  ```

## Task 3: `tenant:sms-fallback:verify` CLI

**Files:**

- Create: `backend/src/modules/sms-fallback/verification.ts`
- Create: `backend/src/modules/sms-fallback/verification.test.ts`
- Create: `backend/src/scripts/verify-sms-fallback-tenant-core.ts`
- Create: `backend/src/scripts/verify-sms-fallback-tenant-core.test.ts`
- Create: `backend/src/scripts/verify-sms-fallback-tenant.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Write verification service tests**

  Create `backend/src/modules/sms-fallback/verification.test.ts` with cases:

  ```text
  verifies active tenant SMS fallback config and API Channel inbox routing
  fails when tenant is missing or non-active
  fails when SMS fallback inbox id is missing
  fails when SMS fallback webhook secret ciphertext is missing
  fails when no enabled gateway exists for tenant
  fails when gateway phone cannot normalize to E.164
  fails when support call phone cannot normalize to E.164
  fails when Chatwoot SMS inbox is not Channel::Api
  fails when Chatwoot SMS webhook URL does not match tenant public base URL
  returns a safe report without webhook secret, SMSGate credentials or full phone
  ```

- [ ] **Step 2: Implement verification service**

  Create `backend/src/modules/sms-fallback/verification.ts`:

  ```ts
  export type VerifySmsFallbackTenantResult = {
    gateway: {
      phoneMasked: string
      publicId: string
      status: 'enabled'
    }
    ok: true
    smsInbox: {
      id: number
      webhookUrl: string
    }
    tenant: {
      id: number
      slug: string
    }
  }

  export async function verifySmsFallbackTenant(options: {
    chatwootAccountClientFactory: (
      config: ChatwootClientConfig,
    ) => TenantProvisioningChatwootAccountClient
    smsFallbackRepository: SmsFallbackRepository
    tenantSecretKey: string
    tenantSlug: string
    tenantsRepository: TenantsRepository
  }): Promise<VerifySmsFallbackTenantResult>
  ```

  Required checks:

  ```text
  tenant exists and status is active
  tenant has chatwootSmsFallbackInboxId
  tenant has chatwootSmsFallbackWebhookSecretCiphertext
  exactly one enabled tenant gateway exists
  gateway phone and optional support call phone normalize
  Chatwoot inbox exists, belongs to tenant account and is Channel::Api
  Chatwoot inbox webhook URL equals "<tenant.publicBaseUrl>/api/integrations/chatwoot/webhooks/sms-fallback"
  Chatwoot inbox lock_to_single_conversation is true
  ```

- [ ] **Step 3: Write and implement CLI core**

  Create `backend/src/scripts/verify-sms-fallback-tenant-core.test.ts`:

  ```text
  parses --tenant=<slug>
  rejects missing tenant
  rejects unknown args
  creates safe verification report
  ```

  Create `backend/src/scripts/verify-sms-fallback-tenant-core.ts`:

  ```ts
  export type VerifySmsFallbackTenantCliArgs = {
    tenantSlug: string
  }

  export function parseVerifySmsFallbackTenantArgs(
    argv: string[],
  ): VerifySmsFallbackTenantCliArgs

  export function createSafeSmsFallbackVerificationReport(
    result: VerifySmsFallbackTenantResult,
  ): VerifySmsFallbackTenantResult
  ```

- [ ] **Step 4: Implement executable script and package script**

  Create `backend/src/scripts/verify-sms-fallback-tenant.ts` and add:

  ```json
  {
    "scripts": {
      "tenant:sms-fallback:verify": "tsx src/scripts/verify-sms-fallback-tenant.ts"
    }
  }
  ```

- [ ] **Step 5: Run checks**

  Run:

  ```bash
  pnpm --dir backend test -- \
    src/modules/sms-fallback/verification.test.ts \
    src/scripts/verify-sms-fallback-tenant-core.test.ts
  pnpm --dir backend build
  ```

  Expected: tests and build pass.

- [ ] **Step 6: Commit**

  Run:

  ```bash
  git add backend/package.json backend/src/modules/sms-fallback/verification* backend/src/scripts/verify-sms-fallback-tenant*
  git commit -m "feat: add sms fallback tenant verify cli"
  ```

## Task 4: SMS Fallback Reconciliation

**Files:**

- Create: `backend/src/modules/sms-fallback/reconciliation.ts`
- Create: `backend/src/modules/sms-fallback/reconciliation.test.ts`
- Create: `backend/src/scripts/reconcile-sms-fallback-tenants-core.ts`
- Create: `backend/src/scripts/reconcile-sms-fallback-tenants-core.test.ts`
- Create: `backend/src/scripts/reconcile-sms-fallback-tenants.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Write reconciliation service tests**

  Create `backend/src/modules/sms-fallback/reconciliation.test.ts` with cases:

  ```text
  keeps an enabled SMS fallback tenant when inbox, webhook and gateway are reachable
  reports no_sms_config for tenants without SMS fallback fields
  reports sms_inbox_missing when Chatwoot returns 404
  reports platform_auth_failed or account_auth_failed without disabling SMS fallback on 401
  reports webhook_mismatch when Chatwoot URL differs from expected tenant URL
  dry-run never writes tenant or gateway state
  apply disables SMS fallback for missing SMS inbox without suspending the portal tenant
  apply reconfigures webhook when only webhook URL drift is detected
  archived tenants are skipped
  safe report excludes credentials, full phone and ciphertext fields
  ```

- [ ] **Step 2: Implement reconciliation service**

  Create `backend/src/modules/sms-fallback/reconciliation.ts`:

  ```ts
  export type ReconcileSmsFallbackTenantsResult = {
    checked: number
    disabled: number
    dryRun: boolean
    repaired: number
    tenants: Array<{
      action:
        | 'disabled'
        | 'kept_enabled'
        | 'repaired'
        | 'skipped'
        | 'would_disable'
        | 'would_repair'
      reason:
        | 'archived'
        | 'chatwoot_auth_failed'
        | 'no_sms_config'
        | 'sms_gateway_disabled'
        | 'sms_inbox_missing'
        | 'sms_inbox_reachable'
        | 'webhook_mismatch'
      slug: string
    }>
  }

  export async function reconcileSmsFallbackTenants(options: {
    chatwootAccountClientFactory: (
      config: ChatwootClientConfig,
    ) => TenantProvisioningChatwootAccountClient
    dryRun: boolean
    smsFallbackRepository: SmsFallbackRepository
    tenantSecretKey: string
    tenantsRepository: TenantsRepository
  }): Promise<ReconcileSmsFallbackTenantsResult>
  ```

  Do not change `portal_tenants.status`. SMS drift affects SMS fallback only.

- [ ] **Step 3: Write and implement CLI core**

  Create parser tests for:

  ```text
  accepts --dry-run
  accepts --apply
  requires exactly one mode
  rejects unknown args
  ```

  Create `backend/src/scripts/reconcile-sms-fallback-tenants-core.ts`:

  ```ts
  export type ReconcileSmsFallbackTenantsCliArgs = {
    dryRun: boolean
  }

  export function parseReconcileSmsFallbackTenantsArgs(
    argv: string[],
  ): ReconcileSmsFallbackTenantsCliArgs
  ```

- [ ] **Step 4: Implement executable script and package script**

  Add:

  ```json
  {
    "scripts": {
      "tenant:sms-fallback:reconcile": "tsx src/scripts/reconcile-sms-fallback-tenants.ts"
    }
  }
  ```

- [ ] **Step 5: Run checks**

  Run:

  ```bash
  pnpm --dir backend test -- \
    src/modules/sms-fallback/reconciliation.test.ts \
    src/scripts/reconcile-sms-fallback-tenants-core.test.ts
  pnpm --dir backend build
  ```

  Expected: tests and build pass.

- [ ] **Step 6: Commit**

  Run:

  ```bash
  git add backend/package.json backend/src/modules/sms-fallback/reconciliation* backend/src/scripts/reconcile-sms-fallback-tenants*
  git commit -m "feat: add sms fallback reconciliation cli"
  ```

## Task 5: Tenant Deprovision Integration

**Files:**

- Create: `backend/src/modules/sms-fallback/deprovision.ts`
- Create: `backend/src/modules/sms-fallback/deprovision.test.ts`
- Modify: `backend/src/scripts/deprovision-tenant.ts`
- Modify: `backend/src/modules/tenant-provisioning/deprovision.test.ts` or
  create `backend/src/scripts/deprovision-tenant.sms-fallback.test.ts`

- [ ] **Step 1: Write SMS disable helper tests**

  Create `backend/src/modules/sms-fallback/deprovision.test.ts` with cases:

  ```text
  disables enabled gateways for a tenant
  abandons queued and retryable outbound jobs for a tenant
  clears tenant SMS fallback Chatwoot config
  is idempotent for tenants without SMS fallback config
  does not delete SMS history rows
  returns a safe report without credentials, full phone or ciphertext
  ```

- [ ] **Step 2: Implement SMS disable helper**

  Create `backend/src/modules/sms-fallback/deprovision.ts`:

  ```ts
  export type DisableSmsFallbackForTenantResult = {
    abandonedJobs: number
    clearedTenantConfig: boolean
    disabledGateways: number
    tenantId: number
  }

  export async function disableSmsFallbackForTenant(options: {
    smsFallbackRepository: SmsFallbackRepository
    tenantId: number
    tenantsRepository: TenantsRepository
  }): Promise<DisableSmsFallbackForTenantResult>
  ```

  Required behavior:

  ```text
  disable all enabled gateways for tenant
  mark queued/sending/failed_retryable outbound jobs abandoned
  clear portal_tenants SMS fallback Chatwoot fields
  preserve SMS messages, webhook deliveries and conversation mappings
  ```

- [ ] **Step 3: Integrate tenant deprovision script**

  Modify `backend/src/scripts/deprovision-tenant.ts` so both archive-only and
  Chatwoot-delete modes disable SMS fallback before the tenant is archived:

  ```text
  load tenant
  disable SMS fallback for tenant id
  run existing deprovisionTenant
  print deprovision result plus safe SMS disable summary
  ```

  Do not require `CHATWOOT_PLATFORM_API_ACCESS_TOKEN` for archive-only mode.

- [ ] **Step 4: Write integration tests**

  Add tests that prove:

  ```text
  archive-only deprovision disables SMS fallback without Platform API token
  delete-chatwoot-account mode disables SMS fallback before Platform API delete
  deprovision report does not include SMSGate credentials or webhook secret
  ```

- [ ] **Step 5: Run checks**

  Run:

  ```bash
  pnpm --dir backend test -- \
    src/modules/sms-fallback/deprovision.test.ts \
    src/modules/tenant-provisioning/deprovision.test.ts
  pnpm --dir backend build
  ```

  Expected: tests and build pass.

- [ ] **Step 6: Commit**

  Run:

  ```bash
  git add backend/src/modules/sms-fallback/deprovision* backend/src/scripts/deprovision-tenant.ts backend/src/modules/tenant-provisioning/deprovision.test.ts
  git commit -m "feat: disable sms fallback during tenant deprovision"
  ```

## Task 6: Operations Documentation

**Files:**

- Modify: `docs/operations/sms-fallback.md`
- Modify: `docs/operations/mt-10-deployment-runbooks.md`
- Modify: `docs/architecture/multi-tenant-reference.md`
- Modify: `docs/architecture/decisions.md`

- [ ] **Step 1: Update SMS fallback runbook**

  Add an operator lifecycle section to `docs/operations/sms-fallback.md`:

  ````markdown
  ## Operator Tenant Lifecycle

  Base tenant creation:

  ```bash
  pnpm --dir backend tenant:create -- --slug=<slug> ...
  pnpm --dir backend tenant:chatwoot:verify -- --tenant=<slug>
  ```

  SMS fallback enablement:

  ```bash
  SMSGATE_GATEWAY_PASSWORD=<secret> \
  SMSGATE_WEBHOOK_SECRET=<secret> \
  pnpm --dir backend tenant:sms-fallback:provision -- \
    --tenant=<slug> \
    --gateway-public-id=<tenant-gateway-id> \
    --gateway-api-base-url=<private-server-url> \
    --gateway-phone-number=<gateway-phone> \
    --gateway-username=<gateway-user>
  pnpm --dir backend tenant:sms-fallback:verify -- --tenant=<slug>
  ```

  Routine drift check:

  ```bash
  pnpm --dir backend tenant:sms-fallback:reconcile -- --dry-run
  ```
  ````

- [ ] **Step 2: Update MT-10 deployment runbook**

  Add that SMS fallback is an optional post-tenant add-on. Do not list SMS
  fallback as a mandatory result of base `tenant:create`.

- [ ] **Step 3: Update architecture docs**

  Add an architecture decision:

  ```markdown
  ## D-027. SMS fallback is an optional operator-provisioned tenant add-on

  - дата: `2026-06-12`
  - решение:
    SMS fallback is enabled after MT-10A tenant creation through separate
    operator lifecycle commands. It uses a separate Chatwoot API Channel inbox,
    separate webhook secret, tenant-owned SMSGate gateway credentials and
    backend-only routing. Base tenant creation remains independent from Android
    device/SIM availability.
  - причина:
    SMS fallback depends on physical gateway operations and should not make
    normal tenant creation fragile. The browser must not receive SMSGate or
    Chatwoot authority.
  ```

  If implementation happens on a later date, update the decision date in the
  committed architecture document to the actual implementation date.

- [ ] **Step 4: Run docs checks**

  Run:

  ```bash
  pnpm exec prettier --check \
    docs/operations/sms-fallback.md \
    docs/operations/mt-10-deployment-runbooks.md \
    docs/architecture/multi-tenant-reference.md \
    docs/architecture/decisions.md
  git diff --check
  ```

  Expected: docs formatting and diff check pass.

- [ ] **Step 5: Commit**

  Run:

  ```bash
  git add docs/operations docs/architecture
  git commit -m "docs: document sms fallback tenant lifecycle"
  ```

## Task 7: Final Verification And Closure

**Files:**

- Modify: `docs/roadmap/work-log.md` only after implementation is complete,
  reviewed and verified.

- [ ] **Step 1: Run backend checks**

  Run:

  ```bash
  pnpm --dir backend test
  pnpm --dir backend build
  pnpm --dir backend lint
  ```

  Expected: all exit 0.

- [ ] **Step 2: Run repository checks**

  Run:

  ```bash
  pnpm lint
  git diff --check
  ```

  Expected: all exit 0.

- [ ] **Step 3: Manual local smoke**

  With local Chatwoot, portal DB and SMSGate test gateway available:

  ```text
  tenant:create creates a normal MT-10A tenant
  tenant:sms-fallback:provision creates or reuses SMS Fallback inbox
  tenant:sms-fallback:verify passes
  /api/chat/threads/private%3Ame/sms-fallback returns enabled true for a verified user phone
  gateway inbound webhook for known phone reaches SMS Fallback Chatwoot conversation
  agent reply in SMS Fallback inbox enqueues one outbound SMS job
  agent reply in main Portal inbox does not enqueue SMS
  tenant:deprovision --archive-only disables SMS fallback and archives tenant
  gateway webhook after archive fails closed without creating Chatwoot messages
  ```

- [ ] **Step 4: Review**

  Review in this order:

  ```text
  no SMS fallback authority in browser
  no manual SQL requirement for tenant SMS enablement
  SMS inbox is separate from main portal inbox
  webhook secrets are separate and encrypted
  gateway credentials are encrypted and redacted
  reconciliation never suspends whole tenant for SMS-only drift
  archive/deprovision stops outbound SMS sends
  unknown/ambiguous/unlinked inbound SMS remains fail-closed
  docs match operator commands
  ```

  Critical or Important findings must be fixed and retested before closure.

- [ ] **Step 5: Update work-log**

  Add a short `docs/roadmap/work-log.md` entry:

  ```markdown
  - SMS fallback tenant lifecycle is operator-owned: SMS enablement provisions a
    separate Chatwoot SMS Fallback inbox, encrypted SMS webhook/gateway secrets,
    tenant verification, reconciliation and deprovision disable behavior.
  ```

  Replace the final `Recommended Next Step` block with the next concrete scope.

- [ ] **Step 6: Final checkpoint commit**

  Run:

  ```bash
  git status --short --branch
  git log --oneline --max-count=8
  ```

  If clean except the work-log update, commit:

  ```bash
  git add docs/roadmap/work-log.md
  git commit -m "docs: record sms fallback tenant lifecycle baseline"
  ```

## Acceptance Criteria

- Base `tenant:create` remains usable without SMSGate device/SIM configuration.
- Operator can enable SMS fallback for an MT-10A tenant without manual SQL.
- SMS fallback provisions a separate Chatwoot API Channel inbox named
  `SMS Fallback <tenant-slug>`.
- SMS fallback webhook URL uses the tenant public base URL and path
  `/api/integrations/chatwoot/webhooks/sms-fallback`.
- SMS fallback webhook secret is encrypted separately from the main portal
  Chatwoot webhook secret.
- SMSGate gateway credentials and webhook secret are encrypted and never printed.
- `tenant:sms-fallback:verify` proves tenant, inbox, webhook and gateway
  readiness.
- `tenant:sms-fallback:reconcile --apply` can repair SMS webhook drift or
  disable SMS fallback for missing SMS inbox without suspending the tenant.
- Tenant archive/deprovision disables SMS fallback and prevents queued outbound
  SMS sends.
- Gateway webhooks for archived/non-active tenants fail closed.
- Browser receives only safe SMS fallback metadata and no Chatwoot/SMSGate
  authority.
- Chatwoot core remains untouched.
