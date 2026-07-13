# Full Application Risk Audit Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to execute this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an evidence-backed `GO`, `GO with conditions`, or `NO-GO`
decision for continued portal operation and new-client onboarding without
changing product code during audit discovery.

**Architecture:** Audit one frozen `main` commit from an isolated read-only
source worktree while storing point-in-time audit documents on
`docs/full-application-risk-audit`. Run independent, reviewable stages for
architecture, security, backend/data, integrations, frontend/PWA, load,
operations and dynamic validation. Validate and deduplicate candidates before
creating canonical findings or assigning the final verdict.

**Tech Stack:** Git worktrees, Markdown audit artifacts, Node.js 24, pnpm 10,
TypeScript, Fastify, React, PostgreSQL/Drizzle, Vitest, Playwright, Docker
Compose, Codex Security Deep Security Scan, official Chatwoot and dependency
sources.

## Global Constraints

- Approved design:
  `docs/superpowers/specs/2026-07-13-full-application-risk-audit-design.md`.
- Audit baseline commit: `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`.
- Audit control branch: `docs/full-application-risk-audit`.
- Do not modify product code during discovery or validation.
- Do not update dependencies, lockfiles, migrations or environment contracts.
- Do not deploy, push, publish, mutate production data or restart production
  Chatwoot.
- Do not print `.env`, tokens, passwords, SMTP credentials, object-storage
  credentials or Chatwoot secrets.
- Do not use another client-portal project as a reference.
- Use official Chatwoot documentation first; inspect `../chatwoot-ce-stable`
  only when official documentation is insufficient, and never modify it.
- Treat old code as a finding only when evidence proves unsupported status,
  vulnerability, incompatibility or material impact.
- An observation remains a candidate until validation proves a reachable
  failure/attack path and concrete impact.
- Every `Critical` and `High` result requires independent revalidation.
- Report a likely `Critical` immediately, preserve evidence without exposing
  secrets, and continue only read-only impact analysis until the user chooses a
  remediation scope.
- After every completed stage, send a concise update with reviewed scope,
  checks, candidate count, blockers and immediate-Critical status.
- Before every stage commit, complete the docs-only closure flow: write/update
  the stage artifacts, perform a focused evidence and consistency review of
  the stage plus shared ledgers, correct review findings, rerun Prettier and
  `git diff --check`, and inspect the exact staged paths.
- A skipped runtime check must record the exact blocker and next action.
- Browser/runtime checks use local isolated portal services only. Before any
  mutating Chatwoot fixture call, prove the configured base URL is local and
  not a production host.
- The Codex Security Deep Security Scan must use its own canonical workflow.
  It requires exactly six usable discovery workers per completed round. Do not
  claim that stage completed when capability preflight is not `ready`.
- The currently observed session has four total concurrency slots and cannot
  satisfy a six-worker discovery round. Execution must pass the official
  capability preflight in a sufficiently provisioned session before Task 4 can
  proceed.
- Point-in-time audit reports belong under `docs/superpowers/`; active
  validated risks belong under `docs/findings/`.
- Do not update `docs/roadmap/work-log.md` merely for commands, test runs,
  candidate counts or audit minutiae.

---

## Audit Artifact Layout

Create these exact audit-control files during execution:

```text
docs/superpowers/audits/2026-07-13-full-application-risk-audit/
  manifest.md
  coverage-matrix.md
  candidate-ledger.md
  modernization-opportunities.md
  stages/
    00-baseline.md
    01-architecture-invariants.md
    02-security.md
    03-backend-data.md
    04-chatwoot-integrations.md
    05-frontend-pwa.md
    06-load-reliability.md
    07-operations-supply-chain.md
    08-existing-findings.md
    09-dynamic-validation.md
    10-canonical-validation.md
  final-report.md
```

The Codex Security scan writes its canonical artifacts to the scan directory
selected by the Codex Security workflow. Do not copy or hand-author its
`report.md`. Record the generated report path in `stages/02-security.md` and
reference its validated finding identifiers during overall synthesis.

## Shared Audit Record Contracts

Every row added to `candidate-ledger.md` must contain:

```text
Candidate ID | Stage | Area | Status | Severity hypothesis | Confidence |
Evidence locations | Reachability/failure path | Counterevidence |
Validation action | Canonical finding path or rejection reason
```

Allowed candidate statuses:

```text
candidate | validating | validated | rejected | needs_follow_up
```

Manifest stage statuses are:

```text
not_started | in_progress | complete | blocked
```

Stage-specific labels such as architecture `confirmed`/`violated`, existing
finding `superseded`, or independent-review `downgraded` belong to their stage
reports and reviewer receipts; they do not extend the candidate-ledger status
contract. Every stage observation that represents a possible current risk must
also map to an allowed candidate-ledger status.

Every row in `coverage-matrix.md` must contain:

```text
Surface | Risk area | Static review | Dynamic validation | Outcome |
Evidence artifact | Limitations
```

Allowed coverage outcomes:

```text
Reported | No issue found | Rejected | Not applicable | Needs follow-up
```

No stage may mark itself complete while an observation is missing from the
candidate ledger, a candidate row lacks its required status/evidence fields,
or a coverage row lacks an evidence artifact. A discovery-stage row may remain
`candidate` until Task 12 performs canonical validation.

Severity uses the approved design contract:

```text
Critical: practical cross-tenant compromise, broad auth bypass, secret-enabled
system compromise, remote code execution, or mass/irreversible data loss.

High: realistic protected-boundary violation, serious session/tenant weakness,
probable message loss or duplicate external side effects, dangerous migration,
or material deploy/backup/recovery failure.

Medium: bounded correctness, reliability, load, privacy or UX failure with
limited blast radius or a workaround.

Low: localized maintainability, observability or UX issue without material
current safety impact.
```

---

### Task 1: Freeze The Audit Baseline And Create Control Artifacts

**Files:**

- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/manifest.md`
- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/coverage-matrix.md`
- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/candidate-ledger.md`
- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/modernization-opportunities.md`

**Interfaces:**

- Consumes: approved design, this execution plan, Git commit
  `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`.
- Produces: immutable source baseline, audit directory, shared candidate and
  coverage contracts used by every later task.

- [ ] **Step 1: Verify the control branch and ownership state**

Run from `/home/evluk/projects/chatwoot-client-portal-v2`:

```bash
git status --short --branch
git rev-parse HEAD
git rev-parse main
git rev-parse origin/main
git worktree list --porcelain
```

Expected:

- current branch is `docs/full-application-risk-audit`;
- worktree is clean;
- `main` and `origin/main` both resolve to
  `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`;
- unclear changes stop execution before any new file is written.

- [ ] **Step 2: Create an isolated source worktree**

Invoke `superpowers:using-git-worktrees` and create a detached worktree for
exact commit `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`. Record the absolute path
returned by that workflow as `AUDIT_SOURCE_ROOT`. Do not choose a branch that
can advance during the audit.

Verify inside the returned worktree:

```bash
git rev-parse HEAD
git status --short --branch
git diff --quiet
```

Expected: detached source at the exact audit commit with no tracked changes.

- [ ] **Step 3: Verify product-code equality on the control branch**

Run:

```bash
git diff --quiet a61b4975ae7b59e244c0b5bbc4efd02466aa075c -- \
  .github backend frontend infra scripts tests .env.example \
  .env.production.example package.json pnpm-lock.yaml pnpm-workspace.yaml \
  playwright.config.ts playwright.admin-ui.config.ts
```

Expected: exit `0`. A nonzero exit means the control branch contains product
or runtime changes and the audit must stop for ownership review.

- [ ] **Step 4: Create the audit manifest with `apply_patch`**

Create `manifest.md` with these exact sections and literal command results:

```markdown
# Full Application Risk Audit Manifest

Status: in progress
Decision target: safe continued operation and new-client onboarding

## Frozen Source

- Repository: chatwoot-client-portal-v2
- Commit: a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- Control branch: docs/full-application-risk-audit
- Source worktree: absolute path returned by using-git-worktrees
- Product-code delta from baseline: none

## Runtime Boundaries

- Production mutation: prohibited
- Chatwoot core mutation/restart: prohibited
- Local portal services: allowed when a stage requires them
- Secrets in audit artifacts: prohibited

## Stage Status

| Stage                   | Status      | Artifact                             |
| ----------------------- | ----------- | ------------------------------------ |
| Baseline                | not_started | stages/00-baseline.md                |
| Architecture invariants | not_started | stages/01-architecture-invariants.md |
| Security                | not_started | stages/02-security.md                |
| Backend/data            | not_started | stages/03-backend-data.md            |
| Chatwoot/integrations   | not_started | stages/04-chatwoot-integrations.md   |
| Frontend/PWA            | not_started | stages/05-frontend-pwa.md            |
| Load/reliability        | not_started | stages/06-load-reliability.md        |
| Operations/supply chain | not_started | stages/07-operations-supply-chain.md |
| Existing findings       | not_started | stages/08-existing-findings.md       |
| Dynamic validation      | not_started | stages/09-dynamic-validation.md      |
| Canonical validation    | not_started | stages/10-canonical-validation.md    |
```

Replace the source-worktree description with the literal absolute path before
saving. Do not leave a symbolic token in the committed artifact.

- [ ] **Step 5: Create the shared ledgers with `apply_patch`**

Create `coverage-matrix.md` with the record contract above and one initial row
for each of these surfaces:

```text
tenant resolution; customer auth/session; tenant-admin auth/session;
database/migrations; Chatwoot runtime client; chat threads/messages;
webhooks/realtime; notifications/push; profile/avatars; branding/legal/storage;
Telegram bridge; frontend routing/state; offline/PWA; load/scalability;
dependencies/CI; deploy/backup/restore; documentation alignment
```

Set every initial review state to `not_started`, outcome to `Needs follow-up`,
and limitations to `Audit stage has not run`.

Create `candidate-ledger.md` with the candidate contract and no candidate rows.
Create `modernization-opportunities.md` with sections `Supported-version
changes`, `Maintainability`, `Observability`, and `Deferred product choices`.
State explicitly that entries here are not defects or verdict blockers.

- [ ] **Step 6: Validate and commit the control artifacts**

Run:

```bash
pnpm exec prettier --check \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit
git diff --check
git status --short --branch
```

Expected: only the four audit-control files are new and formatting passes.

Commit:

```bash
git add docs/superpowers/audits/2026-07-13-full-application-risk-audit
git commit -m "docs(audit): freeze full application baseline"
```

---

### Task 2: Inventory The Baseline And Regression Safety Net

**Files:**

- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/stages/00-baseline.md`
- Modify: shared manifest, coverage matrix and candidate ledger.

**Interfaces:**

- Consumes: frozen source worktree and shared audit contracts from Task 1.
- Produces: repository/module/test inventory and exact safety-net gaps for all
  later stages.

- [ ] **Step 1: Re-read the mandatory entry documents in order**

From `AUDIT_SOURCE_ROOT`, read completely:

```text
AGENTS.md
docs/roadmap/work-log.md
docs/architecture/overview.md
docs/roadmap/implementation-plan.md
docs/architecture/decisions.md
```

Record only current invariants and contradictions; do not treat roadmap prose
as stronger than code.

- [ ] **Step 2: Capture toolchain and dependency topology**

Run:

```bash
node --version
pnpm --version
git ls-files | wc -l
rg --files backend/src -g '*.ts' | wc -l
rg --files frontend/src -g '*.ts' -g '*.tsx' | wc -l
rg --files backend/src -g '*.test.ts' | wc -l
rg --files frontend/src -g '*.test.ts' -g '*.test.tsx' | wc -l
rg --files tests/e2e -g '*.spec.ts' | wc -l
pnpm -r list --depth 0
```

Record literal versions and counts in `00-baseline.md`.

- [ ] **Step 3: Inventory runtime entrypoints and public contracts**

Inspect these exact paths:

```text
backend/src/server.ts
backend/src/app.ts
backend/src/telegram-bridge/server.ts
backend/src/config/env.ts
backend/src/db/schema.ts
backend/src/db/tenantSchema.ts
frontend/src/main.tsx
frontend/src/app/App.tsx
frontend/src/app/AppRoutes.tsx
frontend/src/app/routePaths.ts
frontend/public/sw.js
infra/production/compose.yaml
.github/workflows/ci.yml
.github/workflows/deploy-production.yml
playwright.config.ts
```

Run:

```bash
rg -n "app\.(get|post|put|patch|delete)\(" backend/src
rg -n "path=|routePaths" frontend/src/app frontend/src/features
rg -n "pgTable\(" backend/src/db backend/src/modules
rg -n "process\.env|loadEnv\(" backend frontend scripts tests
```

Record route/table/process counts and documentation drift as candidates.

- [ ] **Step 4: Map tests to critical boundaries**

Create a table in `00-baseline.md` with rows:

```text
tenant resolution; customer auth/session; admin auth/session; persistence;
chat read/send; attachments; webhooks/SSE; unread/read/typing; push;
offline auth/cache/outbox; branding/legal/storage; Telegram; deploy/restore
```

For each row list exact backend tests, frontend tests and Playwright specs. Mark
missing layers explicitly. Confirm the known auth-route mismatch with:

```bash
rg -n "/auth/register|registration-flow" tests/e2e frontend/src backend/src
rg -n "/api/auth/code-login|path=\"login" \
  backend/src/modules/passwordless-login frontend/src/app frontend/src/features/auth
```

Record the mismatch as a candidate, not a fix.

- [ ] **Step 5: Write and review the baseline report**

`00-baseline.md` must contain frozen commit, toolchain, module/route/table
inventory, test topology, CI gates, environment requirements, contradictions,
candidate IDs and unverified areas. Update the manifest and coverage evidence.

- [ ] **Step 6: Validate and commit Task 2**

Run Prettier on the audit directory and `git diff --check`. Review the diff for
secrets and unsupported conclusions. Commit:

```bash
git add docs/superpowers/audits/2026-07-13-full-application-risk-audit
git commit -m "docs(audit): record baseline and safety net"
```

---

### Task 3: Map Trust Boundaries And Architecture Invariants

**Files:**

- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/stages/01-architecture-invariants.md`
- Modify: shared manifest, coverage matrix and candidate ledger.

**Interfaces:**

- Consumes: baseline route/table/runtime inventory from Task 2.
- Produces: overall application trust-boundary map and invariant checklist.
  This document is not supplied to Deep Security Scan discovery workers; each
  security worker must build its own independent threat model.

- [ ] **Step 1: Trace tenant resolution before protected runtime**

Inspect:

```text
backend/src/app.ts
backend/src/modules/tenants/routes.ts
backend/src/modules/tenants/service.ts
backend/src/modules/tenants/repository.ts
backend/src/runtimeChatwootClientFactory.ts
frontend/src/features/tenant/lib/TenantProvider.tsx
frontend/src/app/layouts/CustomerAuthBoundary.tsx
frontend/src/app/layouts/AdminSessionBoundary.tsx
```

Trace Host input through tenant lookup, secret decryption, request context and
customer/admin route admission. Record exact control locations and fail-closed
paths.

- [ ] **Step 2: Map external trust boundaries**

For browser, backend, Postgres, object storage, Chatwoot, SMTP, Web Push,
Telegram and reverse proxy, record trusted input, untrusted input, credential
owner, authoritative data, entrypoints, outbound calls, failure behavior and
tenant scope.

- [ ] **Step 3: Validate architectural invariants**

Create one evidence row for each invariant:

```text
tenant before auth/runtime; no browser Chatwoot authority; isolated portal DB;
tenant-scoped portal data; separate customer/admin sessions; portal-owned
thread authority; backend-owned send/realtime; Chatwoot system of record
```

Each row must be `confirmed`, `violated`, or `needs_follow_up`, with direct code
evidence and counterevidence.

- [ ] **Step 4: Complete and commit the architecture stage**

Update shared ledgers, run Prettier and `git diff --check`, then commit:

```bash
git add docs/superpowers/audits/2026-07-13-full-application-risk-audit
git commit -m "docs(audit): map architecture invariants"
```

---

### Task 4: Run The Canonical Deep Security Scan

**Files:**

- Create after the external scan completes:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/stages/02-security.md`
- Modify: shared manifest, coverage matrix and candidate ledger.
- External generated artifacts: the scan directory selected by
  `codex-security:deep-security-scan`.

**Interfaces:**

- Consumes: frozen `AUDIT_SOURCE_ROOT` only. Discovery workers must not consume
  the coordinator architecture report or one another's results.
- Produces: generated Codex Security report, canonical validated security
  findings, coverage artifacts and a concise import record.

- [ ] **Step 1: Load the required security workflow and references**

Read completely at execution time:

```text
codex-security:deep-security-scan
codex-security config-preflight reference
codex-security final-report reference
codex-security finding-detail-fields reference
```

Confirm the plugin exposes `security-scan`, `threat-model`,
`finding-discovery`, `validation`, `attack-path-analysis`,
`vulnerability-writeup` and `propose-security-hardening`. Stop with an exact
blocker if a required skill is unavailable.

- [ ] **Step 2: Run official capability preflight**

Run `scripts/config_preflight.py` with profile `deep_security_scan`, cwd
`AUDIT_SOURCE_ROOT`, delegation/goal availability and multi-agent
owner/version/cap/provenance verified from the active tool surface, plus only
the codex-security skills exposed by the current Available Skills surface.

Expected: `status: ready` before any scan goal, worklist or worker is created.
The observed four-slot session is insufficient for a six-worker round. Follow
only the helper's concrete remediation and never silently reduce worker count.

- [ ] **Step 3: Start the deep scan only after preflight is ready**

Use the terminal/chat route unless the host explicitly identifies itself as
the Codex desktop app and exposes both setup-continuation tools. Create or
adopt the coordinator goal required by the deep-security workflow. Resolve the
entire frozen repository as target and do not edit repository files while the
security scan is active.

- [ ] **Step 4: Complete independent discovery rounds**

Follow the workflow without modification: exactly six usable workers per
completed round, the same canonical brief, worker-specific threat models,
shared authoritative rank/deep-review inputs, no result sharing, no
partial-round semantic inspection, lossless merge, remediation-subsumption
dedupe and recorded `saturated` or `capped` terminal state.

- [ ] **Step 5: Complete centralized validation and generated reporting**

Run canonical threat-model synthesis, `validation`, `attack-path-analysis`, one
write-up worker per reportable finding, one structural hardening pass when
findings survive, canonical JSON completion and deterministic report
finalization. Do not hand-author the security `report.md`.

- [ ] **Step 6: Import only canonical security results**

After the scan ends, create `02-security.md` with scan target/commit, generated
report path, preflight status, validation mode, reportable IDs/severities,
reviewed surfaces, limitations and candidate-ledger mapping. Do not copy raw
worker bookkeeping into the overall report.

- [ ] **Step 7: Validate and commit the security-stage import**

Run Prettier and `git diff --check`, confirm no secrets or generated scan bulk
were copied into Git, then commit:

```bash
git add docs/superpowers/audits/2026-07-13-full-application-risk-audit
git commit -m "docs(audit): record canonical security review"
```

Task 4 is blocked, not completed, if preflight cannot reach `ready` or the
generated report cannot be finalized.

---

### Task 5: Audit Backend Correctness, Persistence And Concurrency

**Files:**

- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/stages/03-backend-data.md`
- Modify: shared manifest, coverage matrix and candidate ledger.

**Interfaces:**

- Consumes: frozen source, architecture invariants and canonical security
  results.
- Produces: non-security correctness and persistence candidates with exact
  tenant/query/transaction evidence.

- [ ] **Step 1: Audit customer and admin lifecycle invariants**

Review these module directories and app-level integration tests:

```text
backend/src/modules/auth/
backend/src/modules/passwordless-login/
backend/src/modules/password-reset/
backend/src/modules/password-setup/
backend/src/modules/tenant-admin/
backend/src/modules/portal-users/
backend/src/app-auth.integration.test.ts
backend/src/app-passwordless-login.integration.test.ts
backend/src/modules/password-reset/service.test.ts
backend/src/app-password-setup.integration.test.ts
backend/src/app-password-setup-email-proof.integration.test.ts
backend/src/app-admin-auth.integration.test.ts
```

For every flow trace request -> validation -> tenant/session lookup ->
transaction/lock -> persistence -> cookie/response. Record concurrency and
expiry behavior, not just happy paths.

- [ ] **Step 2: Audit schema and migrations against repositories**

Inspect:

```text
backend/src/db/schema.ts
backend/src/db/tenantSchema.ts
backend/src/db/brandingSchema.ts
backend/src/db/legalDocumentSchema.ts
backend/src/db/notificationSchema.ts
backend/src/db/provisioningSchema.ts
backend/src/db/telegramBridgeSchema.ts
backend/drizzle/
backend/drizzle/meta/_journal.json
```

For each tenant-owned table verify tenant key, foreign keys, uniqueness,
indexes for hot filters, deletion policy and repository query scope. Compare
migrations with current schema and journal; do not review generated snapshots
line-by-line beyond consistency and affected objects.

- [ ] **Step 3: Audit transactions, locks and idempotency**

Search and trace:

```bash
rg -n "transaction\(|advisory|FOR UPDATE|onConflict|clientMessageKey|dedup|processingToken|retry" backend/src
```

Check email-code replacement, session rotation, conversation bootstrap,
message send ledger, webhook delivery and Telegram update handling. Record the
precise double-write, lost-update or duplicate-side-effect path for every
candidate.

- [ ] **Step 4: Audit validation and failure mapping**

Search:

```bash
rg -n "z\.object|safeParse|\.parse\(|ApiError|setErrorHandler|multipart|fileSize|timeout|AbortController" backend/src
```

Verify that validation and timeout errors remain controlled at public routes
and do not leak secrets or leave durable state in an ambiguous status.

- [ ] **Step 5: Complete and commit the backend/data report**

For each reviewed boundary record `confirmed`, `candidate`, `rejected` or
`needs_follow_up`, with exact evidence and missing dynamic test. Update ledgers,
run docs checks and commit:

```bash
git add docs/superpowers/audits/2026-07-13-full-application-risk-audit
git commit -m "docs(audit): review backend and persistence"
```

---

### Task 6: Audit Chatwoot, Realtime, Messaging And Telegram Contracts

**Files:**

- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/stages/04-chatwoot-integrations.md`
- Modify: shared manifest, coverage matrix and candidate ledger.

**Interfaces:**

- Consumes: backend/data report and official Chatwoot contract evidence.
- Produces: integration correctness, recovery and external-side-effect
  candidates.

- [ ] **Step 1: Inventory every Chatwoot call and credential boundary**

Review:

```text
backend/src/integrations/chatwoot/
backend/src/runtimeChatwootClientFactory.ts
backend/src/modules/tenants/
backend/src/modules/tenant-provisioning/
backend/src/scripts/configure-tenant-chatwoot-webhook-core.ts
```

Map method, API surface, token type, tenant config source, timeout, retry and
response parser for every call family.

- [ ] **Step 2: Validate uncertain Chatwoot contracts with current sources**

Browse official Chatwoot documentation and release notes for the safely known
configured/deployed version and relevant APIs. If the deployed version cannot
be established without production access or exposing secrets, record that
exact blocker and use current supported documentation only for bounded
compatibility checks. Record source links and access date in the stage report.
Inspect `../chatwoot-ce-stable` read-only only when official sources do not
answer a contract question.

Do not use secondary blogs as authority and do not copy long source passages.

- [ ] **Step 3: Trace chat and webhook state machines**

Review:

```text
backend/src/modules/chat-threads/
backend/src/modules/chat-messages/
backend/src/modules/chatwoot-webhooks/
backend/src/modules/chat-realtime/
backend/src/modules/chat-presence/
backend/src/modules/chat-unread/
backend/src/modules/chat-notifications/
```

Trace private/group access, lazy bootstrap, replacement conversation,
idempotent text/attachment send, signature/dedupe, SSE admission/fanout,
read/typing and push delivery. Model network timeout before and after external
side effects.

- [ ] **Step 4: Trace Telegram bridge state and external effects**

Review:

```text
backend/src/modules/telegram-bridge-admin/
backend/src/telegram-bridge/
backend/src/db/telegramBridgeSchema.ts
docs/operations/telegram-bridge.md
infra/production/compose.yaml
```

Validate tenant ownership, bot replacement constraints, route/header secrets,
update dedupe, phone lookup, retry behavior and retention.

- [ ] **Step 5: Complete and commit the integrations report**

Separate portal bugs from documented Chatwoot limitations. Update ledgers,
run docs checks and commit:

```bash
git add docs/superpowers/audits/2026-07-13-full-application-risk-audit
git commit -m "docs(audit): review chatwoot and integrations"
```

---

### Task 7: Audit Frontend State, Browser Boundaries And Offline PWA

**Files:**

- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/stages/05-frontend-pwa.md`
- Modify: shared manifest, coverage matrix and candidate ledger.

**Interfaces:**

- Consumes: route/API inventory, backend contracts and integration report.
- Produces: frontend correctness, privacy, offline and browser-runtime
  candidates.

- [ ] **Step 1: Trace router and session boundaries**

Review:

```text
frontend/src/app/App.tsx
frontend/src/app/AppRoutes.tsx
frontend/src/app/routePaths.ts
frontend/src/app/layouts/
frontend/src/features/auth/
frontend/src/features/admin-auth/
frontend/src/features/tenant/
frontend/src/features/branding/
```

For each route trace startup state, redirect behavior, stale async response
handling, session handoff, logout and customer/admin separation.

- [ ] **Step 2: Compare frontend and backend API contracts**

Search request paths and response discriminants:

```bash
rg -n "request<|fetch\(|/api/|nextStep|result:|purpose:" frontend/src
rg -n "app\.(get|post|put|patch|delete)\(|result:|purpose:" backend/src
```

Record removed routes, stale fixtures, unhandled error variants and browser
storage remnants as candidates. Do not preserve obsolete contracts for
compatibility.

- [ ] **Step 3: Audit chat state and user-visible correctness**

Review:

```text
frontend/src/features/chat/
frontend/src/features/settings/
frontend/src/features/profile/
frontend/src/features/admin-branding/
frontend/src/features/admin-telegram-bridge/
```

Trace selected/non-selected thread updates, optimistic sends, attachment
validation, unread/badge state, stale push markers, realtime reconnect, read
sync, typing, profile password setup and admin navigation.

- [ ] **Step 4: Audit offline storage and service worker boundaries**

Review:

```text
frontend/src/features/offline/
frontend/src/pwa/
frontend/public/sw.js
frontend/src/app/layouts/useAppViewportLock.ts
frontend/src/features/chat/components/message-composer/
```

For every IndexedDB record and cache key verify tenant/user/thread scope,
expiry, logout cleanup and identity-change behavior. Trace outbox states,
leases, retries, Background Sync, foreground recovery and duplicate-send
prevention. Confirm attachments remain outside offline send scope.

- [ ] **Step 5: Audit browser-only UX risks**

Review semantic controls, focus, keyboard handling, narrow layouts, installed
PWA startup and accessibility. Static suspicions about computed layout or
browser behavior remain `needs_follow_up` until Playwright or real-device
evidence exists.

- [ ] **Step 6: Complete and commit the frontend/PWA report**

Update ledgers, run docs checks and commit:

```bash
git add docs/superpowers/audits/2026-07-13-full-application-risk-audit
git commit -m "docs(audit): review frontend and pwa"
```

---

### Task 8: Audit Load, Scalability And Reliability

**Files:**

- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/stages/06-load-reliability.md`
- Modify: shared manifest, coverage matrix, candidate ledger and modernization
  opportunities.

**Interfaces:**

- Consumes: call/state/query maps from Tasks 5-7.
- Produces: per-hot-path load model, boundedness decisions and validated load
  candidates.

- [ ] **Step 1: Build the hot-path frequency table**

For each path below record frequency unit, DB reads/writes, external calls,
locks, transaction duration, fanout, retry and stored cardinality:

```text
tenant resolution; auth request/verify; /api/auth/me; thread list;
message snapshot/history/search; text/attachment send; webhook message event;
SSE connect/reconnect; unread/read/typing; push delivery; service-worker
recovery; Telegram update; maintenance cleanup
```

- [ ] **Step 2: Trace query and index support**

Use repository/search evidence:

```bash
rg -n "select\(|insert\(|update\(|delete\(|where\(|orderBy\(|limit\(" \
  backend/src/modules backend/src/telegram-bridge
rg -n "index\(|uniqueIndex\(" backend/src/db
```

For every suspected N+1 or unindexed filter, prove the loop/query boundary and
expected cardinality before creating a candidate.

- [ ] **Step 3: Inspect process-local and unbounded state**

Search:

```bash
rg -n "new Map|new Set|setInterval|setTimeout|while \(|for \(.* of|Promise\.all" \
  backend/src frontend/src frontend/public/sw.js
```

Classify each store as bounded/transient, retention-controlled, or potentially
unbounded. Model single-instance and multi-instance behavior separately.

- [ ] **Step 4: Model `10x` and `100x` behavior**

For each material path state the first likely bottleneck and whether the design
has pagination, caching, batching, rate limiting, queueing, backpressure,
idempotency or a tenant-scoped index. Do not invent throughput numbers without
measurements.

- [ ] **Step 5: Complete and commit the load report**

Move non-defect future optimizations to `modernization-opportunities.md`.
Update ledgers, run docs checks and commit:

```bash
git add docs/superpowers/audits/2026-07-13-full-application-risk-audit
git commit -m "docs(audit): model load and reliability"
```

---

### Task 9: Audit Operations, Dependencies And Supply Chain

**Files:**

- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/stages/07-operations-supply-chain.md`
- Modify: shared manifest, coverage matrix, candidate ledger and modernization
  opportunities.

**Interfaces:**

- Consumes: repository operations files and current primary external sources.
- Produces: deploy/recovery/env/CI and dependency risk candidates.

- [ ] **Step 1: Review build, CI and deploy paths**

Inspect:

```text
package.json
backend/package.json
frontend/package.json
pnpm-lock.yaml
backend/Dockerfile
frontend/Dockerfile
infra/production/compose.yaml
.github/workflows/ci.yml
.github/workflows/deploy-production.yml
scripts/deploy-production-archive.sh
scripts/test-production-env-upgrade.sh
docs/operations/production-deployment.md
docs/operations/production-clean-reinstall.md
docs/operations/mt-10-deployment-runbooks.md
```

Compare documented deploy authority, env upgrade, source tracking and rollback
with every executable deployment path.

- [ ] **Step 2: Audit environment propagation without printing secrets**

Compare names only:

```bash
rg -o "[A-Z][A-Z0-9_]{2,}" .env.example .env.production.example \
  infra/production/compose.yaml backend/src/config/env.ts scripts \
  | sort -u
```

Trace required provisioning, tenant, storage, mail, push and Telegram values
into the processes that need them. Never display actual `.env` values.

- [ ] **Step 3: Review backup, restore and failure recovery**

Inspect portal DB, object-storage and deploy-source preservation instructions.
Confirm Chatwoot-owned data is not included in portal-destructive steps. Record
unrehearsed instructions as `needs_follow_up`, not proven failures.

- [ ] **Step 4: Collect current dependency evidence**

Run read-only package checks from the frozen source:

```bash
pnpm audit --prod --json
pnpm -r outdated
```

Nonzero exit is evidence to inspect, not automatic proof of a reachable
finding. For every material advisory or unsupported version, verify package
usage and reachability using official advisory/release sources. Record links
and access date. Put ordinary upgrades in `modernization-opportunities.md`.

- [ ] **Step 5: Complete and commit the operations report**

Update ledgers, run docs checks and commit:

```bash
git add docs/superpowers/audits/2026-07-13-full-application-risk-audit
git commit -m "docs(audit): review operations and supply chain"
```

---

### Task 10: Revalidate The Existing Finding Registry

**Files:**

- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/stages/08-existing-findings.md`
- Read without modifying during discovery: every file under `docs/findings/`.
- Modify: shared manifest, coverage matrix and candidate ledger.

**Interfaces:**

- Consumes: all prior stage evidence.
- Produces: current disposition for every pre-existing finding without silently
  deleting historical registry entries.

- [ ] **Step 1: Enumerate the registry and verify format**

Run:

```bash
rg --files docs/findings | sort
```

Read `docs/findings/README.md` and every returned finding file completely.

- [ ] **Step 2: Revalidate each current finding**

The initial registry at the frozen commit contains:

```text
F-AUTH-001-rate-limit-shared-store.md
F-CHAT-005-frontend-attachment-validation.md
F-CHAT-008-unread-indicators-missing-for-other-thread-push.md
F-CHAT-UI-003-audio-attachment-narrow-width.md
F-E2E-001-chatwoot-registration-fixture-env.md
F-IOS-001-keyboard-textarea-viewport-pan.md
F-OPS-001-apt-daily-chatwoot-realtime.md
F-OPS-002-mt10a-domain-ingress-readiness.md
F-OPS-003-mt10a-operator-ui-audit-wrapper.md
F-PWA-003-background-sync-closed-app-outbox-may-stall.md
```

For each file verify current code locations, reachable behavior, risk,
acceptance criteria and whether wording still matches the current product
contract. Assign `validated`, `rejected`, `superseded`, or `needs_follow_up`.

- [ ] **Step 3: Preserve docs history before recommending cleanup**

For any stale/superseded finding, run the preservation audit with its literal
path and ID:

```bash
git log --all -- docs/findings/F-E2E-001-chatwoot-registration-fixture-env.md
rg -n "F-E2E-001|F-E2E-001-chatwoot-registration-fixture-env.md" \
  docs backend frontend tests
```

Repeat those two commands with each affected finding's literal path and ID.
Record the replacement/removal rationale. Do not delete findings during audit
discovery.

- [ ] **Step 4: Complete and commit the registry review**

Update ledgers, run docs checks and commit:

```bash
git add docs/superpowers/audits/2026-07-13-full-application-risk-audit
git commit -m "docs(audit): revalidate existing findings"
```

---

### Task 11: Run Dynamic Validation Against The Frozen Product Code

**Files:**

- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/stages/09-dynamic-validation.md`
- Modify: shared manifest, coverage matrix and candidate ledger.
- Do not modify tracked product files.

**Interfaces:**

- Consumes: test matrix and validation actions from all discovery stages.
- Produces: fresh command evidence, runtime reproductions and exact blockers.

- [ ] **Step 1: Prove the tested product tree matches the audit commit**

From the control worktree run:

```bash
git diff --quiet a61b4975ae7b59e244c0b5bbc4efd02466aa075c -- \
  .github backend frontend infra scripts tests .env.example \
  .env.production.example package.json pnpm-lock.yaml pnpm-workspace.yaml \
  playwright.config.ts playwright.admin-ui.config.ts
```

Expected: exit `0`. Run product checks from the control worktree so the
existing ignored local `.env` and installed dependencies remain available
without copying secrets into audit artifacts.

- [ ] **Step 2: Run the required non-browser gates**

Run separately and record start/end time, exit code, pass/fail counts and the
first actionable failure:

```bash
pnpm lint
pnpm build
pnpm test
```

Expected baseline is exit `0`. Any failure becomes validation evidence; do not
fix it. After each command verify tracked product files remain unchanged.

- [ ] **Step 3: Run targeted tests for discovered candidates**

For each candidate that names a test file or test gap, first record its literal
test path in the ledger, then run the narrowest existing command:

```bash
pnpm --dir backend test -- src/app-passwordless-login.integration.test.ts
pnpm --dir frontend test -- src/features/auth/pages/PasswordlessLoginPages.test.tsx
```

Use the candidate's literal test file instead of these examples where it
differs. Record PASS, FAIL or BLOCKED and the exact assertion/environment
blocker.

- [ ] **Step 4: Prepare local portal services only for browser checks**

Follow `docs/operations/local-testing.md`:

```bash
pnpm db:up
pnpm storage:up
docker --context default compose --env-file .env -f infra/postgres/compose.yaml ps
docker --context default compose --env-file .env -f infra/object-storage/compose.yaml ps
```

Check whether local Chatwoot and Mailpit are already available. Do not restart
or reconfigure Chatwoot. Start backend and frontend in separate long-running
sessions:

```bash
AUTH_RATE_LIMIT_MAX=100 pnpm dev:backend
pnpm dev:web --host 0.0.0.0
```

- [ ] **Step 5: Enforce the local-only Chatwoot mutation gate**

Before any Playwright spec creates Chatwoot contacts/messages, verify without
printing tokens that `E2E_CHATWOOT_BASE_URL` resolves to
`http://127.0.0.1:3000` or another explicitly approved local address. If it is
absent or production, mark those specs `BLOCKED` and do not run them.

- [ ] **Step 6: Run browser checks by risk surface**

Run targeted specs first:

```bash
pnpm test:e2e tests/e2e/auth-email-flows.spec.ts
pnpm test:e2e tests/e2e/auth-guard-negative.spec.ts
pnpm test:e2e tests/e2e/auth-session.spec.ts
pnpm test:e2e tests/e2e/chat-read-model.spec.ts
pnpm test:e2e tests/e2e/chat-notifications.spec.ts
pnpm test:e2e tests/e2e/offline-first-pwa.spec.ts
pnpm test:e2e tests/e2e/chat-background-sync-real-network.spec.ts
pnpm test:e2e tests/e2e/admin-branding-settings.spec.ts
pnpm test:e2e tests/e2e/profile-page.spec.ts
```

Use the local tenant host and E2E variables from the runbook. Record every spec
as PASS, FAIL or BLOCKED. Run `pnpm test:e2e` only after targeted failures are
understood and all required fixtures are available.

- [ ] **Step 7: Run candidate-specific browser checks**

Do not add tests during discovery. Reproduce browser-only candidates with
existing Playwright/browser tooling and record steps, console/network evidence
and limitations. Unavailable real-device iOS/Android checks remain explicit
blockers.

- [ ] **Step 8: Stop only portal services started by this task**

Stop backend/frontend sessions started by the agent. Run `pnpm storage:down`
and `pnpm db:down` only if this task started them and the user does not need
them left running. Do not stop Chatwoot or Mailpit.

- [ ] **Step 9: Complete and commit dynamic validation evidence**

`09-dynamic-validation.md` must list every command, exit status, key count,
failure and blocker without verbose raw logs or secrets. Update ledgers, run
docs checks and commit:

```bash
git add docs/superpowers/audits/2026-07-13-full-application-risk-audit
git commit -m "docs(audit): record dynamic validation"
```

---

### Task 12: Canonically Validate, Deduplicate And Register Findings

**Files:**

- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/stages/10-canonical-validation.md`
- Modify: manifest, candidate ledger and coverage matrix.
- Create conditionally: one literal file under `docs/findings/` for each newly
  validated risk, including security risks imported from the generated Codex
  Security report, using the next available registry ID and following registry
  and Git branch rules.

**Interfaces:**

- Consumes: all stage reports, dynamic evidence, generated Codex Security
  report and existing-finding dispositions.
- Produces: one coherent validated candidate set, canonical findings and
  explicit rejection/unknown records.

- [ ] **Step 1: Validate every remaining candidate**

For each `candidate` or `validating` row, require exact source locations,
reachable source/control/sink or failure path, concrete impact,
counterevidence, existing protections, confidence, dynamic evidence or exact
blocker, and remediation acceptance criteria.

Set status to `validated`, `rejected`, or `needs_follow_up`. No candidate may
remain `candidate` or `validating` after this step. Use `needs_follow_up` only
when exact unavailable evidence prevents confirmation or rejection; record the
blocker, next validation action, severity hypothesis and whether the unknown
blocks the final verdict.

- [ ] **Step 2: Deduplicate by remediation subsumption**

Merge candidates only when one remediation closes every upstream proof tuple.
Keep independently reachable routes, sinks and external side effects separate.
Preserve all non-duplicative evidence in the surviving row.

- [ ] **Step 3: Independently revalidate Critical and High candidates**

Use a fresh reviewer context without the candidate author's conclusion.
Provide only frozen commit, exact evidence and the validation question. Require
`confirmed`, `downgraded`, or `rejected` with counterevidence. Preserve
canonical Codex Security validation/attack-path receipts for security findings.

- [ ] **Step 4: Assign canonical IDs and exact finding paths**

Run:

```bash
rg --files docs/findings | sort
```

Choose the next unused area/number and record the exact filename in the ledger.
One file equals one finding. Include every field from
`docs/findings/README.md`, plus confidence, source/failure path,
counterevidence and load impact when relevant. A project finding imported from
the security scan must reference its generated canonical security finding and
must not replace or hand-edit the generated security report.

- [ ] **Step 5: Register each new finding in one bounded branch**

For every new finding, perform this sequence independently:

1. Resolve current `main`. If it has advanced beyond the frozen audit commit,
   revalidate the finding against current `main` before registration.
2. Invoke `superpowers:using-git-worktrees` and create one branch from current
   `main` with a literal name matching the finding, for example
   `fix/auth-session-scope`.
3. Add exactly one new `docs/findings/` file. Do not copy audit stage reports,
   modify existing findings or add a product fix on that branch.
4. Run Prettier on that literal finding path, `git diff --check`, and the review
   level required by its severity. Critical and High findings require an
   independent reviewer before commit.
5. Stage the literal finding path only, inspect `git diff --cached --name-status`
   and commit it with a message naming the canonical finding ID.
6. Return to the audit control branch and integrate only that reviewed finding
   commit. Never merge the audit branch into the finding branch. Record the
   branch and commit in `10-canonical-validation.md`.

If branch creation, current-main revalidation or integration is blocked, keep
the candidate `needs_follow_up`, record the exact blocker and do not pretend the
active-risk registry is complete.

- [ ] **Step 6: Review canonical registry output**

Verify every validated candidate maps to one canonical/new or existing finding.
Verify every rejected/follow-up candidate has a written reason. Run docs
preservation checks before recommending removal of an existing finding; do not
delete it in this task.

- [ ] **Step 7: Complete and commit canonical validation**

Run Prettier and `git diff --check`. Commit stage/ledger updates after all
dedicated finding documents have been reviewed and integrated:

```bash
git add docs/superpowers/audits/2026-07-13-full-application-risk-audit
git commit -m "docs(audit): validate canonical findings"
```

---

### Task 13: Produce The Overall Verdict And Close The Audit Branch

**Files:**

- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/final-report.md`
- Modify: manifest, coverage matrix and modernization opportunities.
- Do not modify product code or `docs/roadmap/work-log.md`.

**Interfaces:**

- Consumes: complete canonical findings, coverage matrix, validation evidence
  and blockers.
- Produces: plain-language overall verdict and ordered remediation scopes.

- [ ] **Step 1: Close every coverage row**

Set each surface to one allowed outcome and link its evidence artifact. A row
with missing static/dynamic evidence must be `Needs follow-up` with exact
blocker. Do not call incomplete coverage `No issue found`.

- [ ] **Step 2: Apply the verdict rules mechanically**

Use:

```text
NO-GO: any validated Critical, or an unmitigated blocking High in tenant,
auth, data integrity, message delivery or production safety.

GO with conditions: no Critical; remaining risks are bounded by explicit
limits and have mandatory remediation/acceptance criteria.

GO: no blocking Critical/High; core invariants and required checks are
validated; unverified areas do not block operation/onboarding.
```

Record evidence for the verdict. Passing tests cannot override a blocking
finding. A `needs_follow_up` item with plausible Critical/High impact, or an
unknown in a core tenant/auth/data/message-delivery/production-safety boundary,
prevents `GO`; classify the decision as `NO-GO` when safe operation or
onboarding cannot be established. A blocked Deep Security Scan makes the full
audit incomplete and also prevents `GO`.

- [ ] **Step 3: Write the final report with `apply_patch`**

Use this exact section order:

```markdown
# Full Application Risk Audit

## Executive Verdict

## What Was Audited

## What Was Dynamically Verified

## Blocking Findings

## Non-Blocking Validated Findings

## Existing Finding Dispositions

## Modernization Opportunities

## Unverified Areas And Blockers

## Required Remediation Order

## Conditions For Reassessment

## Evidence And Artifact Map
```

Explain each risk in plain Russian first, then provide technical evidence and
links. Link the generated Codex Security report instead of duplicating it.

- [ ] **Step 4: Define remediation order without implementing it**

Order future fix scopes:

```text
Critical authority/data; High tenant/auth/session; High message/persistence/
operations; regression safety-net gaps; Medium correctness/reliability; Low;
modernization opportunities
```

Each proposed scope names its finding file, branch prefix, required tests and
runtime acceptance gate.

- [ ] **Step 5: Prove no product code changed**

Run:

```bash
git diff --quiet a61b4975ae7b59e244c0b5bbc4efd02466aa075c -- \
  .github backend frontend infra scripts tests .env.example \
  .env.production.example package.json pnpm-lock.yaml pnpm-workspace.yaml \
  playwright.config.ts playwright.admin-ui.config.ts
git diff --name-status \
  a61b4975ae7b59e244c0b5bbc4efd02466aa075c..HEAD
git status --short --branch
git log --oneline --decorate \
  a61b4975ae7b59e244c0b5bbc4efd02466aa075c..HEAD
```

Expected: product-code diff is empty. Every changed path is limited to the
approved design, this plan, the point-in-time audit directory, or a newly
registered `docs/findings/` file; there are no existing-finding deletions or
changes to stable architecture/roadmap documents. Audit-branch commits are
docs-only.

- [ ] **Step 6: Run final audit-document verification**

Run:

```bash
pnpm exec prettier --check \
  docs/superpowers/specs/2026-07-13-full-application-risk-audit-design.md \
  docs/superpowers/plans/2026-07-13-full-application-risk-audit.md \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit \
  docs/findings
git diff --check
```

Review the report against every design completion criterion and candidate row.
Fix documentation-only inconsistencies before committing.

- [ ] **Step 7: Commit the final audit report**

```bash
git add \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit
git commit -m "docs(audit): conclude full application risk review"
```

Do not merge, push, deploy or begin fixes automatically.

- [ ] **Step 8: Present the checkpoint to the user**

Report verdict, highest-priority finding, validated counts by severity,
checks run, blocked checks, generated security report path, overall report
path, exact recommended fix scope, branch and commit status. Ask the user to
review the final report and choose the first remediation scope.

---

## Plan Completion Gate

Before execution starts, verify this plan has:

- one task for every approved design stage;
- an immutable source commit;
- a Deep Security Scan capability gate;
- exact artifact ownership and file paths;
- candidate, coverage, severity and verdict contracts;
- local-only runtime safety gates;
- explicit existing-finding revalidation;
- independent Critical/High validation;
- proof that product code remains unchanged;
- a user review gate before any fix work.

Execution is not complete until Task 13 is finished and the user receives the
final report. A blocked Deep Security Scan means the full audit is incomplete;
do not downgrade it silently or issue `GO` under the approved design.
