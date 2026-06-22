# Lancora Domain Baseline Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify and normalize the repository so `https://app.lancora.ru` is the current primary Chatwoot admin/runtime URL everywhere current production guidance depends on it.

**Architecture:** This was a docs/runtime-baseline audit, not a tenant-domain migration. It has been superseded by the stricter baseline that no legacy Chatwoot host is part of the active production runtime. `lk.provgroup.ru` remains allowed as the real `provgroup` tenant portal domain. Tests may keep `lk.provgroup.ru` as a tenant host fixture when they are not documenting the primary Chatwoot admin URL.

**Tech Stack:** Markdown operations docs, shell scripts, TypeScript test fixtures, ripgrep inventory, `pnpm test:ops`, `git diff --check`.

---

### Task 1: Rebuild The Domain Inventory

**Files:**

- Read: `README.md`
- Read: `docs/operations/*.md`
- Read: `docs/roadmap/*.md`
- Read: `scripts/*.sh`
- Read: `backend/src/**/*.test.ts`
- Read: `frontend/src/**/*.test.ts`

- [x] **Step 1: Confirm the current branch and clean worktree**

Run:

```bash
git status --short --branch
```

Expected: branch is `docs/lancora-domain-baseline-audit`; no unrelated working-tree changes are present.

- [x] **Step 2: Collect current domain occurrences**

Run:

```bash
rg -n "chat\.provgroup\.ru|app\.lancora\.ru|provgroup\.ru|lancora\.ru" . \
  --glob '!node_modules' \
  --glob '!dist' \
  --glob '!playwright-report' \
  --glob '!test-results'
```

Expected: every occurrence can be classified into one of these buckets:

```text
current_chatwoot_admin_runtime: must say https://app.lancora.ru
legacy_chatwoot_host: must not be part of current runtime docs or active config
tenant_domain: may mention lk.provgroup.ru as provgroup tenant portal domain
service_mail: should use Lancora/no-reply@lancora.ru for production service mail
historical_note: may preserve old facts when clearly dated or scoped as historical
test_fixture: may use stable tenant hosts where the test is not documenting Chatwoot admin runtime
```

- [x] **Step 3: Identify stale current-facing references**

Review the inventory manually and mark only current/future-facing references as needing edits. Do not mark `lk.provgroup.ru` tenant examples as stale just because they contain `provgroup.ru`.

### Task 2: Normalize Current Source-Of-Truth Docs

**Files:**

- Modify if stale current-facing wording is found: `README.md`
- Modify if stale current-facing wording is found: `docs/operations/production-server-notes.md`
- Modify if stale current-facing wording is found: `docs/operations/mt-10-deployment-runbooks.md`
- Modify if stale current-facing wording is found: `docs/operations/production-clean-reinstall.md`
- Modify if stale current-facing wording is found: `docs/operations/production-deployment.md`
- Modify if stale current-facing wording is found: `docs/operations/continue-on-new-laptop.md`
- Modify if stale current-facing wording is found: `docs/operations/installed-pwa-smoke.md`
- Modify if stale current-facing wording is found: `docs/roadmap/implementation-plan.md`
- Modify if stale current-facing wording is found: `docs/roadmap/work-log.md`

- [x] **Step 1: Keep the production rule explicit**

Ensure current operations docs state this rule in plain language:

```text
Primary production Chatwoot admin/runtime URL: https://app.lancora.ru.
No legacy Chatwoot host is part of the active production runtime baseline.
Tenant portal domains such as https://lk.provgroup.ru and https://lk.pronalogi.pro are customer portal hosts, not Chatwoot admin hosts.
```

- [x] **Step 2: Preserve historical upgrade notes**

If `docs/operations/chatwoot-4-13-upgrade-notes.md` mentions a retired Chatwoot
host, keep the operation history but make current checks use
`https://app.lancora.ru`.

- [x] **Step 3: Avoid tenant-domain churn**

Leave `lk.provgroup.ru` references intact when they describe the actual `provgroup` tenant, smoke checks, or PWA test examples. Replace only text that implies `provgroup.ru` is still the provider/central Chatwoot admin baseline.

### Task 3: Normalize Current Script And Test Fixtures

**Files:**

- Modify if stale current-facing defaults are found: `scripts/configure-tenant-domain-ingress.sh`
- Modify if stale current-facing defaults are found: `scripts/test-production-env-upgrade.sh`
- Modify if stale production sender fixture is found: `backend/src/modules/chat-notifications/pushTransport.test.ts`
- Modify if stale Chatwoot admin URL fixture is found: `frontend/src/pwa/serviceWorkerAsset.test.ts`
- Modify if stale Chatwoot admin URL fixture is found: `frontend/src/pwa/serviceWorkerAsset.testSupport.ts`
- Modify if stale Chatwoot admin URL fixture is found: `frontend/src/pwa/serviceWorkerBackgroundSync.test.ts`
- Modify if stale Chatwoot admin URL fixture is found: `frontend/src/pwa/serviceWorkerNotificationOptions.test.ts`

- [x] **Step 1: Check shell examples for current production defaults**

Run:

```bash
rg -n "chat\.provgroup\.ru|cbr@provgroup\.ru|DEFAULT_TENANT_CHATWOOT_BASE_URL|APP_ORIGIN|PORTAL_DOMAIN" scripts
```

Expected: no script implies a legacy Chatwoot host is the current Chatwoot base URL. Tenant-domain fixtures may remain when the script is testing tenant ingress behavior.

- [x] **Step 2: Check tests for fixture intent**

Run:

```bash
rg -n "chat\.provgroup\.ru|cbr@provgroup\.ru|lk\.provgroup\.ru|app\.lancora\.ru" backend frontend
```

Expected: `lk.provgroup.ru` remains acceptable as a tenant host fixture. `cbr@provgroup.ru` should be replaced with a neutral or Lancora-owned fixture if the test models a production service sender.

- [x] **Step 3: Run syntax checks if shell files changed**

Run only if shell scripts changed:

```bash
bash -n scripts/configure-tenant-domain-ingress.sh scripts/test-production-env-upgrade.sh
```

Expected: command exits with code `0`.

Result: skipped; no shell files changed in this audit scope.

### Task 4: Verify The Audit

**Files:**

- Verify: all files changed by Tasks 2 and 3.

- [x] **Step 1: Re-run the domain inventory**

Run:

```bash
rg -n "chat\.provgroup\.ru|app\.lancora\.ru|provgroup\.ru|lancora\.ru" . \
  --glob '!node_modules' \
  --glob '!dist' \
  --glob '!playwright-report' \
  --glob '!test-results'
```

Expected: all current Chatwoot admin/runtime references point to `https://app.lancora.ru`, no legacy Chatwoot host is part of the active baseline, and `lk.provgroup.ru` references are tenant-domain examples or fixtures.

- [x] **Step 2: Run operations tests**

Run:

```bash
pnpm test:ops
```

Expected: command exits with code `0`.

- [x] **Step 3: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no output.

- [x] **Step 4: Review the diff**

Run:

```bash
git diff -- README.md docs scripts backend frontend
```

Expected: diff only updates the Lancora Chatwoot admin/runtime baseline, service-mail fixture wording if needed, and historical notes; no secrets, `.env`, generated artifacts, or unrelated changes are included.

- [x] **Step 5: Commit after closure**

Run after review and verification pass:

```bash
git add README.md docs scripts backend frontend
git commit -m "docs: audit lancora domain baseline"
```

Expected: a small docs/audit commit on `docs/lancora-domain-baseline-audit`.
