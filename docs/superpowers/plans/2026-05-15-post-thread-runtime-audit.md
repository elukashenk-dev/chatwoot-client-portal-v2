# MT-8.6 Post-Thread Runtime Audit And Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the post-thread runtime audit gate before `MT-9`: prove production/runtime provenance, audit the rewritten chat-thread baseline, classify findings, identify regression safety gaps and decide whether any separate cleanup/refactoring/dead-code slices are needed.

**Architecture:** This is an audit-first plan. It does not implement `MT-9`, does not preselect cleanup slices and does not change runtime behavior. Chatwoot remains system of record, portal backend remains the only browser-facing authority, and the public chat contract remains portal-owned `threadId`.

**Tech Stack:** TypeScript, Fastify, Drizzle/Postgres, Vitest, React, Vite, Playwright, Docker Compose, Chatwoot API Channel.

---

## Source Spec

- Spec: `docs/superpowers/specs/2026-05-15-post-thread-runtime-audit-design.md`
- Roadmap entry: `docs/IMPLEMENTATION_PLAN.md`, `MT-8.6. Post-Thread Runtime Audit And Cleanup`
- Current stable architecture: `docs/ARCHITECTURE.md`
- Current decisions: `docs/DECISIONS.md`
- Finding registry schema: `docs/Findings/README.md`

## Scope Guard

This plan is the first `MT-8.6` implementation plan. It produces an audit
report and gate decision only.

Allowed:

- inspect code, tests, docs, deploy scripts and runbooks;
- run automated checks;
- record production smoke result or blocker;
- create finding files for real risks;
- update stable docs with audit outcome;
- recommend separate follow-up plans for approved slices.

Not allowed in this plan:

- implement tenant admin or branding;
- refactor production code;
- remove dead code;
- change database schema;
- change runtime behavior;
- close `F-MT-004` inside `MT-8.6`;
- hide findings in the chat instead of writing them to `docs/Findings/`.

## File Structure

Create:

- `docs/MT_8_6_POST_THREAD_RUNTIME_AUDIT.md` - the audit report, findings index, technical debt map, dead-code candidate list, MT-9 gate matrix and final readiness decision.

Modify:

- `docs/WORK_LOG.md` - after the completed audit and verification, replace the current recommended next step with the next real action.
- `docs/IMPLEMENTATION_PLAN.md` - only if the audit changes `MT-8.6` status or changes the MT-9 gate decision.

Possibly create:

- `docs/Findings/F-MT86-001-company-thread-access-revalidation-gap.md` as the first MT-8.6 finding if that exact risk is present; otherwise create the first `F-MT86-*` file with an exact lowercase ASCII slug that describes the actual risk.
- Separate future plan files under `docs/superpowers/plans/` only after the audit report classifies and approves a bounded follow-up slice.

Do not modify:

- `backend/src/**`
- `frontend/src/**`
- `backend/drizzle/**`
- `infra/**`
- `scripts/**`

If an audit step proves that code changes are required before `MT-9`, stop this
plan after documenting the finding and write a separate focused implementation
plan for that finding or slice.

## Current Gates

- `F-PROD-002-release-source-remote-drift.md`: open. Production smoke is not valid unless deployed source provenance is recorded.
- `F-MT-004-admin-chatwoot-token-boundary.md`: deferred. It must remain carried into `MT-9` as the first permissions-spike/admin-token-boundary task.
- Other open findings (`F-AUTH-001`, `F-CHAT-UI-003`, `F-IOS-001`) must be listed in the audit report and classified against `MT-9`, but must not be silently fixed in this plan.

---

## Task 0: Entry Check And Source Review

**Files:**

- Inspect: `AGENTS.md`
- Inspect: `docs/WORK_LOG.md`
- Inspect: `docs/ARCHITECTURE.md`
- Inspect: `docs/IMPLEMENTATION_PLAN.md`
- Inspect: `docs/DECISIONS.md`
- Inspect: `docs/superpowers/specs/2026-05-15-post-thread-runtime-audit-design.md`
- Inspect: `docs/Findings/*.md`

- [ ] **Step 1: Confirm branch and clean working tree**

Run:

```bash
git status --short --branch
```

Expected:

- branch is a dedicated `MT-8.6` branch;
- no unrelated modified files.

If unrelated files are present, stop and identify ownership before continuing.

- [ ] **Step 2: Read the source documents**

Run:

```bash
sed -n '1,260p' AGENTS.md
sed -n '1,260p' docs/WORK_LOG.md
sed -n '1,340p' docs/IMPLEMENTATION_PLAN.md
sed -n '1,320p' docs/ARCHITECTURE.md
sed -n '1,280p' docs/DECISIONS.md
sed -n '1,340p' docs/superpowers/specs/2026-05-15-post-thread-runtime-audit-design.md
```

Expected:

- current roadmap still points to `MT-8.6`;
- `MT-8.6` still has no completed audit report;
- `F-MT-004` is still deferred into `MT-9`.

- [ ] **Step 3: List open findings**

Run:

```bash
find docs/Findings -maxdepth 1 -type f -name 'F-*.md' -print | sort
```

Expected:

- list includes `F-PROD-002-release-source-remote-drift.md`;
- list includes `F-MT-004-admin-chatwoot-token-boundary.md`;
- no chat-thread rollout gate findings remain open unless a new regression was found after Task 8.

---

## Task 1: Create Audit Report Shell And Production Provenance Gate

**Files:**

- Create: `docs/MT_8_6_POST_THREAD_RUNTIME_AUDIT.md`
- Inspect: `docs/PRODUCTION_DEPLOYMENT.md`
- Inspect: `docs/MT_10_PRODUCTION_CLEAN_REINSTALL_RUNBOOK.md`
- Inspect: `scripts/deploy-production-archive.sh`
- Inspect: `docs/Findings/F-PROD-002-release-source-remote-drift.md`

- [ ] **Step 1: Create the audit report shell**

Create `docs/MT_8_6_POST_THREAD_RUNTIME_AUDIT.md` with this structure:

```markdown
# MT-8.6 Post-Thread Runtime Audit

Date: 2026-05-15
Status: in progress

## Executive Summary

- Production smoke: not checked yet.
- Automated baseline checks: not checked yet.
- MT-9 readiness: not decided yet.

## Production Provenance And Smoke

### Release Provenance

| Check                                        | Result          | Evidence                                                  |
| -------------------------------------------- | --------------- | --------------------------------------------------------- |
| Local branch and commit                      | not checked yet |                                                           |
| Local working tree state                     | not checked yet |                                                           |
| Production `DEPLOY_SOURCE.txt`               | not checked yet |                                                           |
| Deployed commit contains post-thread runtime | not checked yet |                                                           |
| `F-PROD-002` impact                          | open            | `docs/Findings/F-PROD-002-release-source-remote-drift.md` |

### Functional Smoke

| Flow                                                      | Result          | Evidence |
| --------------------------------------------------------- | --------------- | -------- |
| `https://lk.provgroup.ru/api/health`                      | not checked yet |          |
| `https://lk.provgroup.ru/api/tenant`                      | not checked yet |          |
| `https://lk.provgroup.ru/api/tenant/manifest.webmanifest` | not checked yet |          |
| Login with approved test account                          | not checked yet |          |
| Private thread history/send                               | not checked yet |          |
| Company thread listing/send                               | not checked yet |          |
| Chatwoot admin author prefix view                         | not checked yet |          |
| Realtime delivery                                         | not checked yet |          |

## Automated Baseline Checks

| Command                         | Result          | Evidence |
| ------------------------------- | --------------- | -------- |
| `pnpm --dir backend test`       | not checked yet |          |
| `pnpm --dir frontend test`      | not checked yet |          |
| `pnpm --dir backend build`      | not checked yet |          |
| `pnpm --dir frontend typecheck` | not checked yet |          |
| `pnpm --dir frontend build`     | not checked yet |          |
| `pnpm lint`                     | not checked yet |          |
| `pnpm test:e2e`                 | not checked yet |          |
| `git diff --check`              | not checked yet |          |

## Audit Map

| Area | Authority Boundary | Evidence | Test Coverage | Decision |
| ---- | ------------------ | -------- | ------------- | -------- |

## Regression Safety Matrix

| Boundary | Existing Tests | Gap | Decision |
| -------- | -------------- | --- | -------- |

## Existing Findings Index

| Finding | Status | MT-9 Impact | Decision |
| ------- | ------ | ----------- | -------- |

## New Findings

No new findings recorded yet.

## Technical Debt Map

| Candidate | Area | Evidence | Classification | Decision |
| --------- | ---- | -------- | -------------- | -------- |

## Dead-Code Candidates

| Candidate | Evidence Checked | Runtime Entrypoint Risk | Decision |
| --------- | ---------------- | ----------------------- | -------- |

## MT-9 Gate Matrix

| Gate                                         | Status             | Evidence                                                  | Next Action                                                                     |
| -------------------------------------------- | ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Chat/runtime `must-fix-before-MT-9` blockers | not checked yet    |                                                           |                                                                                 |
| `F-MT-004` admin token boundary              | deferred into MT-9 | `docs/Findings/F-MT-004-admin-chatwoot-token-boundary.md` | Start MT-9 with permissions spike and separate admin-verification token design. |
| Tenant admin implementation in MT-8.6        | not implemented    | Scope guard                                               | Keep out of MT-8.6.                                                             |
| Branding implementation in MT-8.6            | not implemented    | Scope guard                                               | Keep out of MT-8.6.                                                             |

## Final Decision

MT-9 readiness is not decided yet.
```

- [ ] **Step 2: Record local source provenance**

Run:

```bash
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --short
git log --oneline --decorate -5
```

Expected:

- branch and commit are recorded in the report;
- dirty state is recorded exactly.

- [ ] **Step 3: Inspect production deploy source**

Run this only when the operator has exported the production SSH target for the
current VM session:

```bash
ssh "$PORTAL_PROD_SSH_HOST" 'set -euo pipefail; cd /opt/chatwoot-client-portal-v2; cat DEPLOY_SOURCE.txt; docker compose --env-file .env.production -f infra/production/compose.yaml ps'
```

Expected:

- `DEPLOY_SOURCE.txt` exists;
- branch, commit, dirty state and preview label are visible;
- deployed source is recorded in the audit report.

If SSH access or production shell is unavailable, record the blocker in
`Production Provenance And Smoke` with the command, error and next unblock
action. Continue local audit only after the blocker is recorded.

- [ ] **Step 4: Check public unauthenticated production endpoints**

Run:

```bash
curl -fsS https://lk.provgroup.ru/api/health
curl -fsS https://lk.provgroup.ru/api/tenant
curl -fsS https://lk.provgroup.ru/api/tenant/manifest.webmanifest
```

Expected:

- health returns success;
- tenant response resolves `lk.provgroup.ru`;
- manifest is tenant-aware and not a static legacy manifest.

Record exact result or exact blocker in the report.

- [ ] **Step 5: Perform browser production smoke**

Manual browser checklist:

```text
1. Open https://lk.provgroup.ru.
2. Login with the approved test account. Do not commit the password.
3. Open the left menu and confirm available threads are visible.
4. Select "Личный чат".
5. Send a private-thread test message.
6. Select a company thread if the production test contacts are configured.
7. Send a company-thread test message.
8. Open Chatwoot admin and verify the company message has the Markdown author prefix.
9. Verify portal transcript displays the author without exposing the technical prefix.
10. Verify realtime delivery in another browser/device if the environment allows it.
```

Expected:

- private thread works;
- company thread works when production test contacts are configured;
- realtime works or the blocker is recorded;
- Chatwoot admin view matches the accepted company author-prefix behavior.

---

## Task 2: Baseline Automated Verification Before Audit Decisions

**Files:**

- Modify: `docs/MT_8_6_POST_THREAD_RUNTIME_AUDIT.md`
- Inspect: `package.json`
- Inspect: `backend/package.json`
- Inspect: `frontend/package.json`
- Inspect: `playwright.config.ts`

- [ ] **Step 1: Run backend tests**

Run:

```bash
pnpm --dir backend test
```

Expected: command exits `0`. Record pass count or failure details in the report.

- [ ] **Step 2: Run frontend tests**

Run:

```bash
pnpm --dir frontend test
```

Expected: command exits `0`. Record pass count or failure details in the report.

- [ ] **Step 3: Run backend build**

Run:

```bash
pnpm --dir backend build
```

Expected: command exits `0`.

- [ ] **Step 4: Run frontend typecheck and build**

Run:

```bash
pnpm --dir frontend typecheck
pnpm --dir frontend build
```

Expected: both commands exit `0`.

- [ ] **Step 5: Run root lint and code-health**

Run:

```bash
pnpm lint
```

Expected: command exits `0`.

- [ ] **Step 6: Run Playwright e2e if local stack is available**

Run:

```bash
pnpm test:e2e
```

Expected: command exits `0`.

If blocked, record:

- exact command;
- exact error;
- service that was unavailable;
- targeted checks that still passed;
- next action that unblocks Playwright.

- [ ] **Step 7: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: command exits `0`.

---

## Task 3: Backend Read-Only Audit

**Files:**

- Modify: `docs/MT_8_6_POST_THREAD_RUNTIME_AUDIT.md`
- Inspect: `backend/src/modules/**`
- Inspect: `backend/src/integrations/**`
- Inspect: `backend/src/db/schema.ts`
- Inspect: `backend/drizzle/**`
- Inspect: `backend/src/test/**`

- [ ] **Step 1: Map backend thread and legacy authority terms**

Run:

```bash
rg -n "primaryConversationId|primary_conversation|conversationId|chatwootConversationId|threadId|portal_chat_threads|portalChatThreadId|clientMessageKey|authorRole|portal_client_company_contact_ids" backend/src backend/drizzle
```

Expected:

- every browser-facing path uses `threadId`;
- Chatwoot conversation id appears only in backend-owned mapping, repository, webhook and Chatwoot integration boundaries;
- any remaining `primaryConversationId` usage is internal compatibility or documented as a candidate.

Record each relevant file group in `Audit Map`.

- [ ] **Step 2: Audit tenant/session authority boundaries**

Run:

```bash
rg -n "tenantId|tenant_id|resolveTenant|requireTenant|session|portalSession|current tenant|Host|X-Forwarded-Host" backend/src/modules backend/src/app.ts backend/src/server.ts
```

Expected:

- tenant is resolved before auth/chat runtime;
- session lookup is tenant-bound;
- chat routes cannot choose tenant from browser body/query/header.

Create a finding only if a concrete cross-tenant or fail-open path is visible.

- [ ] **Step 3: Audit chat-thread listing and runtime context**

Run:

```bash
rg -n "getChatThreads|listThreads|resolveThread|resolve.*Thread|portal_chat_threads|company:<|private:me|advisory|lock" backend/src/modules/chat-threads backend/src/modules/chat-context backend/src/modules/chat-messages
```

Expected:

- `GET /api/chat/threads` fails closed for malformed or unavailable company attributes;
- first send can create Chatwoot conversation only through tenant-scoped thread runtime context;
- company access is validated before history/send.

Record tests that prove these decisions.

- [ ] **Step 4: Audit send ledger, attachments and rate limits**

Run:

```bash
rg -n "send ledger|clientMessageKey|portalChatThreadId|rate limit|attachment|upload|file" backend/src/modules/chat-messages backend/src/modules/chat-rate-limit backend/src/modules/chat-attachments backend/src/test
```

Expected:

- idempotency scope includes `portalChatThreadId + user + clientMessageKey`;
- attachment send uses the same backend authority boundary as text send;
- rate limits remain authenticated and tenant/user/thread scoped where applicable.

- [ ] **Step 5: Audit realtime and webhook routing**

Run:

```bash
rg -n "EventSource|SSE|subscribe|publish|fanout|webhook|signature|portal_chat_threads|conversation.*thread|delivery|dedupe" backend/src/modules/chat-realtime backend/src/modules/chatwoot-webhooks backend/src/integrations
```

Expected:

- SSE fanout key includes tenant and `threadId`;
- webhook signature and payload tenant checks occur before delivery;
- Chatwoot conversation id is mapped back to `portal_chat_threads`;
- company event delivery revalidates access.

- [ ] **Step 6: Audit backend test coverage**

Run:

```bash
rg -n "private:me|company:|portal_chat_threads|portalChatThreadId|clientMessageKey|authorRole|webhook|realtime|access removal|forged|malformed" backend/src/**/*.test.ts
```

Expected:

- every critical boundary from the spec has at least one test reference or an explicit gap in `Regression Safety Matrix`;
- missing coverage is recorded as a gap, not fixed in this task.

---

## Task 4: Frontend And Browser Runtime Read-Only Audit

**Files:**

- Modify: `docs/MT_8_6_POST_THREAD_RUNTIME_AUDIT.md`
- Inspect: `frontend/src/features/chat/**`
- Inspect: `frontend/src/features/auth/**`
- Inspect: `frontend/src/features/tenant/**`
- Inspect: `tests/e2e/**`

- [ ] **Step 1: Map frontend chat authority terms**

Run:

```bash
rg -n "primaryConversationId|conversationId|threadId|activeThread|selectedThread|ChatThread|EventSource|localStorage|sessionStorage|Chatwoot" frontend/src tests/e2e
```

Expected:

- frontend sends `threadId`, not Chatwoot conversation id;
- frontend stores no Chatwoot secrets or conversation authority;
- local/session storage does not become a hidden authority source.

- [ ] **Step 2: Audit selected-thread state and fallback behavior**

Run:

```bash
rg -n "selectedThread|activeThread|setSelected|fallback|defaultThread|private:me|company:" frontend/src/features/chat
```

Expected:

- initial selection is derived from backend thread list;
- backend errors do not silently switch a user into another company thread;
- UI can show a controlled unavailable/error state.

- [ ] **Step 3: Audit composer, attachment and optimistic send behavior**

Run:

```bash
rg -n "optimistic|clientMessageKey|attachment|sendMessage|sendAttachment|threadId|disabled|isSending" frontend/src/features/chat
```

Expected:

- optimistic sends are scoped to the selected thread;
- switching threads cannot leak an optimistic message into another transcript;
- disabled state remains controlled while threads/messages load.

- [ ] **Step 4: Audit frontend test coverage**

Run:

```bash
rg -n "thread|private:me|company:|selectedThread|EventSource|optimistic|attachment|access|error" frontend/src/**/*.test.ts frontend/src/**/*.test.tsx tests/e2e
```

Expected:

- thread switching, history/send, realtime and route guard behavior are covered by unit or Playwright tests;
- gaps are recorded in `Regression Safety Matrix`.

---

## Task 5: Deployment, Docs And Dead-Code Candidate Audit

**Files:**

- Modify: `docs/MT_8_6_POST_THREAD_RUNTIME_AUDIT.md`
- Inspect: `docs/**`
- Inspect: `scripts/**`
- Inspect: `infra/**`
- Inspect: `package.json`
- Inspect: `backend/package.json`
- Inspect: `frontend/package.json`

- [ ] **Step 1: Audit stable docs for old chat contract drift**

Run:

```bash
rg -n "primaryConversationId|primary conversation|primary_conversation|conversation id|conversationId|threadId|portal_chat_threads|company thread|private:me|lock_to_single_conversation" docs README.md
```

Expected:

- stable docs describe `threadId` as browser contract;
- Chatwoot conversation id is described as backend-only mapping;
- superseded primary-conversation language is marked as superseded or internal compatibility.

- [ ] **Step 2: Audit deploy scripts and runbooks for source provenance**

Run:

```bash
rg -n "DEPLOY_SOURCE|allow-dirty-preview|preview-label|CHATWOOT_ACCOUNT_ID|CHATWOOT_PORTAL_INBOX_ID|DEFAULT_TENANT|webhook|compose|install-production|deploy-production" scripts infra docs/PRODUCTION_DEPLOYMENT.md docs/MT_10_PRODUCTION_CLEAN_REINSTALL_RUNBOOK.md docs/PRODUCTION_DEPLOYMENT_SESSION_LOG.md
```

Expected:

- deploy archive records source provenance;
- old global `CHATWOOT_*` values are not runtime authority;
- tenant webhook sync remains tenant-aware;
- any drift is recorded against `F-PROD-002` or as a new finding.

- [ ] **Step 3: Build a dead-code candidate list without deleting code**

Run:

```bash
rg -n "primaryConversationId|primary_conversation|legacy|compat|deprecated|unused|old|fallback|CHATWOOT_ACCOUNT_ID|CHATWOOT_PORTAL_INBOX_ID" backend frontend tests scripts infra docs package.json
```

For each candidate, record:

- runtime/test references from `rg`;
- route/script/package/deploy references;
- migration/schema impact;
- whether the candidate is a public/runtime entrypoint;
- whether compatibility is intentionally retained.

Expected:

- `Dead-Code Candidates` contains only evidence-backed candidates;
- no code is deleted in this task.

---

## Task 6: Findings Classification

**Files:**

- Modify: `docs/MT_8_6_POST_THREAD_RUNTIME_AUDIT.md`
- Possibly create: `docs/Findings/F-MT86-001-company-thread-access-revalidation-gap.md` if that exact risk is present, or another exact `F-MT86-*` finding file for the actual risk.
- Inspect: `docs/Findings/README.md`
- Inspect: `docs/Findings/*.md`

- [ ] **Step 1: Classify every existing finding against MT-9**

Use this table in the audit report:

```markdown
| Finding         | Status   | MT-9 Impact                                                         | Decision                                                                                                                                  |
| --------------- | -------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `F-PROD-002`    | open     | Affects production provenance, not chat runtime correctness.        | Keep open until chosen release source of truth contains deployed commits or drift is documented. Production smoke must record provenance. |
| `F-MT-004`      | deferred | Required first gate for `MT-9`.                                     | Carry into `MT-9`; do not close in `MT-8.6`.                                                                                              |
| `F-AUTH-001`    | open     | Relevant before multi-instance production.                          | Classify based on current `MT-9` deploy expectations.                                                                                     |
| `F-CHAT-UI-003` | open     | UI polish/accessibility risk, not tenant/admin boundary by default. | Classify based on current frontend audit evidence.                                                                                        |
| `F-IOS-001`     | open     | Mobile UX risk, not tenant/admin boundary by default.               | Classify based on current frontend audit evidence.                                                                                        |
```

- [ ] **Step 2: Create new finding files for actionable risks**

Create one file per risk using the registry schema. Example for a concrete
high-risk chat runtime finding:

```markdown
# F-MT86-001. Company Thread Access Revalidation Gap

- `status`: `open`
- `found_in`: `MT-8.6 Post-Thread Runtime Audit`
- `risk`: `high`
- `urgency`: before `MT-9`
- `area`: backend chat realtime, company thread access
- `evidence`:
  - `backend/src/modules/chat-realtime/...` shows the event can be delivered without rechecking current Chatwoot person attributes.
  - The current test set has no revoked-access realtime regression.
- `fix_short`: Add current-access revalidation before company-thread SSE delivery and cover revoked access with a backend test.
- `acceptance`:
  - A revoked company member does not receive future realtime events.
  - The regression test fails before the fix and passes after the fix.
```

Only create this example file if that exact risk is present. For other risks,
use the same required fields and evidence standard.

- [ ] **Step 3: Classify audit candidates**

Use these categories exactly:

```text
must-fix-before-MT-9
safe-pre-MT-9-cleanup
dead-code-candidate
defer
do-not-touch
```

Expected:

- a candidate with no clear risk or evidence is not classified as required work;
- a candidate that changes behavior becomes a separate implementation plan;
- a `must-fix-before-MT-9` finding blocks MT-9 until fixed and verified.

---

## Task 7: Regression Safety Matrix And Follow-Up Slice Decision

**Files:**

- Modify: `docs/MT_8_6_POST_THREAD_RUNTIME_AUDIT.md`
- Possibly create later: separate plan files under `docs/superpowers/plans/`

- [ ] **Step 1: Fill the regression safety matrix**

Use the critical boundary list from the spec and map each row to tests:

```markdown
| Boundary                                                      | Existing Tests | Gap | Decision |
| ------------------------------------------------------------- | -------------- | --- | -------- |
| tenant resolution by host                                     |                |     |          |
| session tenant binding                                        |                |     |          |
| tenant PWA metadata and cache isolation                       |                |     |          |
| branding asset storage boundary planned for MT-9              |                |     |          |
| runtime Chatwoot token vs admin-verification token separation |                |     |          |
| registration eligibility via Chatwoot person contact          |                |     |          |
| `GET /api/chat/threads` fail-closed behavior                  |                |     |          |
| company thread history/send access removal                    |                |     |          |
| send ledger idempotency scope                                 |                |     |          |
| attachment send authority                                     |                |     |          |
| realtime fanout with revoked access                           |                |     |          |
| webhook conversation-to-thread routing                        |                |     |          |
| Chatwoot webhook signature and tenant matching                |                |     |          |
| frontend selected thread state and no unsafe fallback         |                |     |          |
```

Expected:

- every row has an explicit test reference or explicit gap;
- gaps that affect runtime safety become findings or a separate regression test plan;
- no refactoring is approved before safety gaps are classified.

- [ ] **Step 2: Decide whether follow-up plans are needed**

Write one of these outcomes in `Final Decision`:

```markdown
MT-8.6 audit found no required cleanup/refactoring/dead-code slice before MT-9.
The next step is `MT-9` starting with `F-MT-004`.
```

or:

```markdown
MT-8.6 audit found required work before MT-9.
The next step is a separate focused implementation plan for the first open
`must-fix-before-MT-9` finding listed in `New Findings`.
```

When a follow-up is needed, create the separate plan only after this audit report
exists and the classification is clear.

---

## Task 8: Final Docs Verification And Checkpoint Commit

**Files:**

- Modify: `docs/MT_8_6_POST_THREAD_RUNTIME_AUDIT.md`
- Modify: `docs/WORK_LOG.md`
- Possibly modify: `docs/IMPLEMENTATION_PLAN.md`

- [ ] **Step 1: Update `docs/WORK_LOG.md`**

Record only the completed audit outcome. Keep it short and keep exactly one
`Recommended Next Step` block at the end.

If no blockers remain before MT-9, set the next step to:

```markdown
## Recommended Next Step

- Start `MT-9` with the Chatwoot permissions spike and separate encrypted
  per-tenant admin-verification token boundary from `F-MT-004`.
```

If blockers remain, set the next step to the first focused blocker plan.

- [ ] **Step 2: Update `docs/IMPLEMENTATION_PLAN.md` if the phase status changed**

If audit is complete, set `MT-8.6` status to completed and record whether
follow-up slices are deferred or required before `MT-9`.

- [ ] **Step 3: Scan docs for unfinished markers**

Run:

```bash
rg -n "TB[D]|TO""DO|implement[ ]later|fill[ ]in|заглу[ш]|safe[-]cleanup-before-MT-9" docs/MT_8_6_POST_THREAD_RUNTIME_AUDIT.md docs/WORK_LOG.md docs/IMPLEMENTATION_PLAN.md docs/Findings
```

Expected:

- command exits `1` with no matches.

- [ ] **Step 4: Run final docs diff check**

Run:

```bash
git diff --check
git status --short
```

Expected:

- `git diff --check` exits `0`;
- changed files belong only to the completed audit scope and finding docs.

- [ ] **Step 5: Make checkpoint commit**

Run:

```bash
git add docs/MT_8_6_POST_THREAD_RUNTIME_AUDIT.md docs/WORK_LOG.md docs/IMPLEMENTATION_PLAN.md docs/Findings
git diff --cached --check
git commit -m "docs: complete mt-8.6 runtime audit"
```

Expected:

- commit succeeds;
- no secrets, `.env`, generated reports or runtime artifacts are staged.

---

## Self-Review Checklist

Before marking this plan complete:

- every spec requirement maps to a task above;
- production provenance is handled before functional production smoke;
- `F-MT-004` remains a deliberate `MT-9` gate;
- no concrete cleanup/refactoring/dead-code slice is preselected before audit evidence;
- every actionable risk has a finding file;
- report exit criteria decide either "start MT-9" or "write focused blocker plan";
- final checks are recorded with command evidence.
