# MT-8R Codebase Audit

Этот документ хранит controlled audit перед `MT-8.5` UI/UX baseline и `MT-9`
tenant admin/branding.

Правило этапа:

- сначала inventory и safety checks;
- затем technical debt analysis;
- затем refactoring assessment;
- только после этого bounded refactoring slices.

Широкий "улучшаем все" refactor запрещен.

## MT-8R-1. Baseline Inventory And Safety Check

Дата: `2026-05-06`

Branch:

```text
review/mt-8r-codebase-audit
```

Baseline:

- audit branch создан от текущего MT-8 runtime baseline commit
  `2c0e57b docs: add mt-8r readiness and ui baseline gates`;
- локальный `main` сейчас не является полным MT-8 baseline, поэтому audit идет
  от текущего актуального HEAD, где уже есть MT-8, safety net и post-MT runtime
  fixes.

### Inventory

Backend:

- `backend/src` содержит `80` files;
- backend tests: `22` test files;
- core modules:
  - `tenants` - host resolution, tenant config, public tenant context, PWA
    metadata and encrypted tenant secrets;
  - `auth` - customer session/login/logout;
  - `registration` - eligibility, email code and password setup;
  - `password-reset` - tenant-scoped password reset email-code flow;
  - `portal-users` - portal user persistence helpers;
  - `chat-context` - tenant-scoped Chatwoot contact/conversation context;
  - `chat-messages` - message read/send, attachments and send ledger;
  - `chat-realtime` - SSE admission and tenant-scoped fanout;
  - `chatwoot-webhooks` - signed webhook validation, payload tenant invariants
    and delivery bookkeeping;
  - `integrations/chatwoot` - backend-only Chatwoot API client;
  - `integrations/email` - SMTP/Mailpit email adapter.

Backend DB/runtime:

- Drizzle schema: `backend/src/db/schema.ts`;
- migrations: `backend/drizzle/0000` through `0008`;
- tenant provisioning/verification scripts live in `backend/src/scripts`;
- root Postgres infra lives in `infra/postgres`.

Frontend:

- `frontend/src` contains `112` files;
- frontend tests: `12` test files;
- main feature areas:
  - `tenant` - public tenant context and document/PWA identity metadata;
  - `auth` - login, registration, password reset forms and pages;
  - `chat` - chat page, transcript, composer, optimistic send and realtime;
  - `pwa` - service worker registration/runtime update behavior;
  - `shared` - generic UI and small non-domain helpers;
  - `app/layouts` - auth/app shell, route guards and viewport lock.

Browser/e2e:

- Playwright config exists in `playwright.config.ts`;
- Playwright test directory is `tests/e2e`;
- current e2e specs: `6`;
- `MT-8R-1` did not run Playwright because this step made no browser runtime
  change and the required baseline focus was unit/build/lint safety.

Open findings at start of `MT-8R`:

- `F-AUTH-001` - deferred password reset copy polish;
- `F-CHAT-UI-002` - open chat context menu keyboard accessibility;
- `F-CHAT-UI-003` - open audio attachment narrow-width UI issue;
- `F-IOS-001` - deferred iOS keyboard viewport pan;
- `F-MT-004` - deferred until `MT-9`, strategy already selected.

### Safety Checks

Passed final baseline checks:

- `pnpm --dir backend test` - `22` files, `132` tests passed;
- `pnpm --dir backend build`;
- `pnpm --dir backend lint`;
- `pnpm --dir frontend typecheck`;
- `pnpm --dir frontend test` - `12` files, `76` tests passed;
- `pnpm --dir frontend build`;
- `pnpm code-health` - `201` files checked;
- `pnpm lint`;
- `pnpm exec prettier --check backend/src/modules/tenants/secrets.test.ts`;
- `git diff --check`.

Baseline safety fix made during `MT-8R-1`:

- `backend/src/modules/tenants/secrets.test.ts` now tampers an actual decoded
  ciphertext byte instead of replacing the final `base64url` character;
- reason: changing the final `base64url` character can change only padding bits
  for some ciphertext lengths, producing the same decoded bytes and a flaky
  authenticated-decryption test;
- production encryption code was not changed.

Initial check notes:

- an initial heavily parallel baseline run produced a timeout in
  `tenants/routes.test.ts`;
- targeted `pnpm --dir backend test src/modules/tenants/routes.test.ts` passed
  after rerun: `9` tests passed;
- final backend full suite passed after the deterministic secrets test fix.

### Current Assessment

`MT-8R-1` found no production-code blocker before audit.

The only immediate change was a test safety-net stabilization. The next step
should continue with read-only technical debt analysis, not broad refactoring.

## Next Step

`MT-8R-2. Technical Debt Analysis`

Scope:

- inspect module size, dependency direction and test coverage distribution;
- identify duplicate tenant/runtime logic;
- identify fragile provisioning/local-dev paths;
- identify weak spots before `MT-9`;
- classify candidates as:
  - `must-fix-before-MT-9`;
  - `safe-pre-MT-9-cleanup`;
  - `defer`;
  - `do-not-touch`.

No refactoring should start until candidates are classified.

## MT-8R-2. Technical Debt Analysis

Дата: `2026-05-06`

Scope:

- module size;
- dependency direction;
- test coverage distribution;
- duplicate tenant/runtime logic;
- fragile provisioning/local-dev paths;
- weak spots before `MT-9`.

No production-code refactoring was performed in this step.

### Module Size Map

Largest backend production files:

| File                                             | Lines | Assessment                                                                                                                                        |
| ------------------------------------------------ | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/integrations/chatwoot/client.ts`    |  1572 | Large Chatwoot resource client, already code-health allowlisted. Relevant before `MT-9` because admin verification will need Chatwoot Agents API. |
| `backend/src/modules/chat-messages/service.ts`   |  1143 | Large chat read/send/idempotency/attachment service. Not directly in `MT-9` path unless branding/admin touches chat preview runtime.              |
| `backend/src/modules/registration/service.ts`    |   941 | Large email-code registration flow. Shares concepts with password reset and future admin login, but a broad refactor here is risky.               |
| `backend/src/modules/password-reset/service.ts`  |   747 | Large email-code password reset flow. Same duplication family as registration.                                                                    |
| `backend/src/modules/chat-context/service.ts`    |   636 | Chat context recovery/bootstrap logic. Stable but sensitive; avoid touching without chat-specific tests.                                          |
| `backend/src/modules/registration/repository.ts` |   511 | Large tenant-scoped verification/contact/user repository.                                                                                         |

Largest frontend production files:

| File                                                                      | Lines | Assessment                                                                                                                                        |
| ------------------------------------------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/features/chat/pages/ChatPage.tsx`                           |   461 | Route shell plus runtime orchestration. Below production limit, already close enough that new chat route features should split hooks/state first. |
| `frontend/src/features/chat/components/MessageComposer.tsx`               |   461 | Dense composer UI/control surface. Touch only with targeted composer tests and mobile checks.                                                     |
| `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx` |   440 | Dense message UI and gestures; existing accessibility finding is tracked separately.                                                              |
| `frontend/src/shared/ui/icons.tsx`                                        |   369 | Many inline icons in one file. Not a current risk while icons stay stable.                                                                        |
| `frontend/src/features/chat/components/ChatTranscript.tsx`                |   348 | Transcript grouping/scroll/action orchestration.                                                                                                  |

Largest tests:

| File                                                     | Lines | Assessment                                                    |
| -------------------------------------------------------- | ----: | ------------------------------------------------------------- |
| `backend/src/modules/registration/service.test.ts`       |   997 | At the test limit; do not add many admin-login tests here.    |
| `frontend/src/features/chat/pages/ChatPage.test.tsx`     |   896 | Large but under current allowlist baseline.                   |
| `backend/src/modules/chat-messages/service.test.ts`      |   893 | Large chat behavior suite.                                    |
| `frontend/src/features/auth/pages/RequestPages.test.tsx` |   785 | Registration/password-reset page flows share one large suite. |
| `tests/e2e/chat-read-model.spec.ts`                      |   521 | Largest Playwright spec.                                      |

### Dependency Direction

Backend:

- runtime composition is centralized in `backend/src/app.ts`;
- tenant context is registered before auth/chat/webhook routes;
- tenant-critical repositories accept tenant scope in their factory or method
  inputs;
- cross-module dependencies are mostly expected:
  - chat messages depends on chat context;
  - realtime/webhooks depend on chat message snapshots;
  - auth/chat routes depend on tenant context and auth session helpers;
  - scripts depend on tenant repository/secrets for provisioning.

Frontend:

- `app` composes providers/routes;
- `auth` pages depend on `tenant` shell for tenant identity;
- `chat` depends on `auth` session and `tenant` identity for header/runtime;
- `shared` stays generic;
- no broad `shared` product-domain leakage found in this pass.

### Test Coverage Distribution

Current automated coverage shape:

- backend unit/integration tests cover tenant resolution, auth/session,
  registration, password reset, chat context, chat messages, realtime hub,
  webhooks, Chatwoot client, tenant scripts and repositories;
- frontend tests cover tenant provider, auth pages/forms, chat page/runtime,
  transcript, composer, PWA runtime and viewport lock;
- Playwright specs exist in `tests/e2e` and cover auth smoke/session/guards,
  auth email flows, chat read model and PWA runtime smoke.

Observation:

- Playwright support currently uses default/global Chatwoot env and
  `bootstrapDefaultTenant`, so browser e2e is not yet shaped for multi-tenant
  two-host scenarios;
- this is acceptable for current baseline, but `MT-8.5` and `MT-9` should add
  browser coverage only after choosing exact UI/admin flows.

### Technical Debt Candidates

#### `must-fix-before-MT-9`

- `F-MT-004` remains the only must-fix security gate before `MT-9`
  implementation: run Chatwoot permissions spike and implement separate
  per-tenant admin-verification token boundary.
- No new production-code refactoring blocker was found that must be completed
  before `MT-9`.

#### `safe-pre-MT-9-cleanup`

1. Chatwoot client resource boundary:
   - current file: `backend/src/integrations/chatwoot/client.ts`;
   - reason: `MT-9` will add Agents/Admin verification API behavior;
   - recommended shape: add the new Agents API through a small focused helper or
     resource slice, with tests, rather than growing unrelated message/contact
     code;
   - risk: medium because Chatwoot client is central, but manageable with
     existing client tests.

2. README roadmap pointer:
   - `README.md` still pointed to `MT-9`;
   - fixed in this step to point to `MT-8R`.

#### `defer`

1. Production installer and compose still use global Chatwoot env:
   - finding: `F-MT-008`;
   - defer until `MT-10`, because production deploy is already blocked and this
     is not part of customer runtime/admin branding implementation.

2. Registration/password-reset email-code duplication:
   - duplicated concepts: code generation, continuation token hashing,
     seconds-until helpers, attempt errors, delivery cleanup shape;
   - do not merge the two large services before `MT-9`;
   - for admin login, prefer a small new admin-challenge implementation or
     narrow pure helper extraction only if it clearly reduces duplication
     without changing existing registration/password-reset behavior.

3. Playwright multi-tenant host scenarios:
   - current e2e uses default tenant/global Chatwoot env shape;
   - defer until `MT-8.5`/`MT-9` defines exact UI/admin browser flows.

4. Chat UI accessibility and narrow-audio issues:
   - already tracked as `F-CHAT-UI-002` and `F-CHAT-UI-003`;
   - defer to focused UI polish or `MT-8.5` decisions, not codebase-wide
     refactoring.

5. iOS keyboard viewport pan:
   - already tracked as `F-IOS-001`;
   - do not reopen without focused iOS experiment.

#### `do-not-touch`

- Tenant resolution/auth/session boundaries that are already covered and stable.
- Chat context recovery/bootstrap logic unless a chat-specific finding requires
  it.
- Message send idempotency/ledger behavior unless backed by targeted tests.
- Production installer behavior before `MT-10`, except for documentation/finding
  updates.

### MT-8R-2 Result

The codebase has debt, but no evidence supports a broad refactor before
`MT-8.5`/`MT-9`.

Recommended control rule:

- proceed to focused review of the `safe-pre-MT-9-cleanup` candidates only if
  they directly protect `MT-9`;
- otherwise move to `MT-8.5` after confirming no `must-fix-before-MT-9`
  production-code debt remains.

## Next Step After MT-8R-2

`MT-8R-3. Code Smells Review`

Scope:

- inspect the classified candidate areas in more detail;
- create findings only for concrete actionable bugs/risks;
- decide whether the Chatwoot client boundary needs a small pre-`MT-9` cleanup
  slice or can be handled inside `MT-9` with strict tests;
- do not refactor yet.

## MT-8R-3. Code Smells Review

Дата: `2026-05-06`

Scope:

- inspect classified candidate areas in more detail;
- create findings only for concrete actionable bugs/risks;
- decide whether a pre-`MT-9` cleanup slice is needed;
- do not refactor production code.

No production-code refactoring was performed in this step.

### Reviewed Areas

#### Chatwoot Client Boundary

Current shape:

- `backend/src/integrations/chatwoot/client.ts` remains a large resource client;
- tenant runtime uses `createChatwootClientFactory().forTenant(config)`;
- the old env-based `createChatwootClient({ env })` path still exists for tests and
  legacy production tooling.

Assessment:

- runtime tenant boundary is acceptable for `MT-9`;
- do not split the whole client before `MT-9`;
- when adding Chatwoot Agents/Admin verification behavior, add it as a focused
  method/resource slice with tests;
- old env-based production tooling remains covered by `F-MT-008` and is deferred to
  `MT-10`.

#### Email-Code And Password Policy Family

Concrete smell found:

- registration backend enforces password length + letter + digit;
- password reset frontend enforces the same rule;
- password reset backend currently enforces length only.

Finding created:

- `F-AUTH-002` - password reset backend password policy drift.

Assessment:

- this is not a broad refactor candidate;
- fix it with a narrow backend policy alignment slice before adding new admin
  password/challenge flows in `MT-9`;
- do not merge registration and password reset services as part of this fix.

#### Playwright And E2E Tenant Shape

Current shape:

- Playwright uses one `PLAYWRIGHT_BASE_URL`;
- global setup bootstraps a default tenant;
- Chatwoot e2e helper still reads global `CHATWOOT_*` env for contact creation.

Assessment:

- this is acceptable for current smoke/session/chat tests;
- no new finding is needed because production runtime is already protected and
  production tooling debt is tracked by `F-MT-008`;
- before or during `MT-9`, add targeted browser coverage for admin/branding flows
  using explicit tenant host/domain setup.

#### Frontend Tenant And Route Shell

Current shape:

- `TenantProvider` loads public tenant context once and applies document metadata;
- route guards stay session-owned and backend still resolves tenant by Host;
- lazy route fallback is `null`, but current route chunks are small enough that this
  is not a blocking smell.

Assessment:

- no new tenant route/provider finding was opened;
- `MT-8.5` should review the visible loading/error states as part of the customer
  UI/UX baseline, not as a hidden refactor.

### MT-8R-3 Result

`MT-8R-3` found one concrete actionable issue: `F-AUTH-002`.

No broad code smell justifies a general refactor before `MT-8.5`/`MT-9`.

`F-AUTH-002` should be fixed as a small auth safety slice before implementing new
admin password/challenge behavior.

## Next Step After MT-8R-3

`MT-8R-4. Refactoring Assessment`

Scope:

- turn `MT-8R-1` through `MT-8R-3` evidence into a bounded refactoring plan;
- classify what must be fixed before `MT-9`, what can be deferred, and what should
  stay untouched;
- include `F-AUTH-002` as a narrow pre-`MT-9` safety fix candidate;
- do not start refactoring until the assessment defines exact slices, checks and
  stop conditions.

## MT-8R-4. Refactoring Assessment

Дата: `2026-05-06`

Scope:

- turn `MT-8R-1` through `MT-8R-3` evidence into a bounded refactoring plan;
- classify candidates by urgency and risk;
- define exact next slices, checks and stop conditions;
- do not refactor production code in this step.

No production-code refactoring was performed in this step.

### Assessment Decision

There is no evidence for a broad pre-`MT-9` refactor.

The only approved pre-`MT-9` code slice from `MT-8R` is a narrow backend password
policy alignment for `F-AUTH-002`.

`F-MT-004` remains the first security gate inside `MT-9`: run the Chatwoot
permissions spike and implement the separate encrypted tenant admin-verification
token boundary before tenant admin login is considered complete.

### Candidate Classification

| Category               | Candidate                                     | Area                                       | Decision                                                                                    |
| ---------------------- | --------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `must-fix-before-MT-9` | `F-AUTH-002` password reset policy drift      | backend auth/password reset                | Fix as `MT-8R-5A` before new admin password/challenge work.                                 |
| `MT-9-entry-gate`      | `F-MT-004` admin verification token boundary  | tenant admin, Chatwoot permissions         | Keep deferred to `MT-9`, but it must be the first `MT-9` security spike/implementation.     |
| `safe-inside-MT-9`     | Chatwoot Agents/Admin verification API method | `backend/src/integrations/chatwoot`        | Add as focused resource/method with tests inside `MT-9`; do not split the whole client now. |
| `defer`                | `F-MT-008` production global Chatwoot env     | production installer/compose/runbook       | Fix in `MT-10`; production deploy is already blocked until runbook update.                  |
| `defer-to-MT-8.5`      | `F-CHAT-UI-002`, `F-CHAT-UI-003`              | chat UI accessibility/attachment rendering | Re-evaluate during UI/UX baseline; fix only as focused UI polish if still required.         |
| `defer`                | `F-AUTH-001` password reset copy              | password reset UX copy                     | Keep deferred; account-enumeration-safe copy polish is not a refactoring blocker.           |
| `defer`                | `F-IOS-001` keyboard viewport pan             | iOS composer/viewport behavior             | Keep deferred until a focused iOS experiment.                                               |
| `defer`                | Playwright multi-host scenarios               | browser e2e                                | Add targeted coverage when `MT-8.5`/`MT-9` defines exact UI/admin flows.                    |
| `defer`                | Registration/password-reset service merge     | backend email-code services                | Do not merge services before `MT-9`; duplication is less risky than a broad auth rewrite.   |
| `do-not-touch`         | Tenant resolution/auth/session/chat runtime   | runtime tenant boundaries                  | Leave stable boundaries alone unless a tested bug requires a focused fix.                   |

### Approved Refactoring/Fix Slices

#### `MT-8R-5A. Password Policy Alignment`

Finding:

- `F-AUTH-002`

Affected area:

- `backend/src/modules/registration/routes.ts`;
- `backend/src/modules/registration/service.ts`;
- `backend/src/modules/password-reset/routes.ts`;
- `backend/src/modules/password-reset/service.ts`;
- backend auth/password-reset tests.

Expected behavior impact:

- password reset backend will reject new passwords that do not contain a letter
  or do not contain a digit;
- existing valid passwords such as `NewPass123` remain accepted;
- frontend behavior should not change, because frontend already enforces the
  stronger rule.

Implementation shape:

- use one backend password policy rule for registration and password reset;
- a small pure helper is acceptable if it removes the current backend rule drift;
- do not merge registration and password reset services;
- do not change database schema, sessions, tenant resolution or Chatwoot runtime.

Required checks:

- backend tests for password reset missing-letter and missing-digit rejection;
- targeted backend test run for password reset and registration/auth affected
  tests;
- `pnpm --dir backend test`;
- `pnpm --dir backend build`;
- `pnpm --dir backend lint`;
- Prettier for changed files;
- `git diff --check`.

Rollback strategy:

- revert the small password policy helper/validation edits and tests;
- no migration or data rollback should be needed.

Stop conditions:

- if the fix starts touching tenant resolution, session model, Chatwoot client,
  email delivery or verification persistence, stop and split the work;
- if registration behavior changes beyond sharing the same password rule, stop
  and review separately;
- do not close `F-AUTH-002` until tests prove registration and password reset
  enforce the same backend rule.

### Deferred Slices

#### Chatwoot Client Boundary

Decision:

- no separate pre-`MT-9` Chatwoot client refactor;
- add Agents/Admin verification behavior inside `MT-9` as a focused method or
  resource slice;
- keep tests close to the new Chatwoot API parsing/failure behavior.

Reason:

- the current tenant factory path is already runtime-safe;
- splitting a 1500+ line client before knowing the exact Agents API shape would
  add risk without protecting users.

#### UI Findings

Decision:

- defer `F-CHAT-UI-002` and `F-CHAT-UI-003` to `MT-8.5`;
- do not fix chat UI accessibility/audio layout during backend refactoring.

Reason:

- `MT-8.5` is the dedicated UI/UX baseline review and will decide whether these
  are blockers before branding.

#### Production Tooling

Decision:

- defer `F-MT-008` to `MT-10`;
- do not touch production installer/compose in `MT-8R-5A`.

Reason:

- production deployment is already marked blocked until the multi-tenant runbook
  update;
- `MT-9` can proceed locally against tenant-aware runtime without changing the
  production installer.

### MT-8R-4 Result

Approved next code slice:

```text
MT-8R-5A. Password Policy Alignment
```

After `MT-8R-5A` is fixed, tested and committed, `MT-8R` can either:

- finish with no additional refactoring slices; or
- run a short final review confirming that no open `must-fix-before-MT-9` code
  finding remains.

## Next Step After MT-8R-4

`MT-8R-5A. Password Policy Alignment`

Scope:

- close `F-AUTH-002`;
- align backend password policy between registration and password reset;
- keep the change backend-only unless tests prove frontend drift;
- no schema, tenant runtime, Chatwoot runtime or UI shell changes.

## MT-8R-5A. Password Policy Alignment

Дата: `2026-05-06`

Finding closed:

- `F-AUTH-002`

Scope completed:

- added one shared backend portal password policy helper;
- registration and password reset route schemas now use the same backend password
  schema;
- registration and password reset services now use the same backend password
  assertion;
- password reset backend now rejects passwords missing a letter or missing a
  digit;
- no schema, tenant runtime, Chatwoot runtime or UI shell changes were made.

Additional safety fix:

- `backend/src/modules/tenants/secrets.test.ts` now guards the ciphertext byte
  before tampering it, so backend TypeScript build stays green with strict
  indexed access checks.

Checks passed:

- targeted:
  `pnpm --dir backend test src/modules/password-reset/service.test.ts src/modules/registration/service.test.ts src/app.test.ts`;
- targeted: `pnpm --dir backend test src/modules/tenants/secrets.test.ts`;
- full: `pnpm --dir backend test` - `22` files, `134` tests passed;
- `pnpm --dir backend build`;
- `pnpm --dir backend lint`.

### MT-8R-5A Result

`F-AUTH-002` is closed.

The only approved pre-`MT-9` code fix from `MT-8R-4` is complete.

## Next Step After MT-8R-5A

`MT-8R Final Review`

Scope:

- confirm no open `must-fix-before-MT-9` code findings remain;
- confirm deferred findings are assigned to `MT-8.5`, `MT-9` or `MT-10`;
- run final lightweight docs/checkpoint review before moving to `MT-8.5`.

## MT-8R Final Review

Дата: `2026-05-06`

Scope:

- review open/deferred findings after `MT-8R-5A`;
- confirm `MT-8R` exit criteria;
- update roadmap pointers to the next active scope;
- do not change production code.

No production-code changes were made in this step.

### Findings Review

Closed during `MT-8R`:

- `F-AUTH-002` - password reset backend password policy drift.

Deferred findings after final review:

| Finding         | Target                          | Final review decision                                                                 |
| --------------- | ------------------------------- | ------------------------------------------------------------------------------------- |
| `F-AUTH-001`    | future auth/password reset UX   | Deferred copy polish; not a security/code blocker.                                    |
| `F-CHAT-UI-002` | `MT-8.5`                        | Deferred to UI/UX baseline review and possible focused accessibility polish.          |
| `F-CHAT-UI-003` | `MT-8.5`                        | Deferred to UI/UX baseline review and possible focused attachment/voice polish.       |
| `F-IOS-001`     | future focused iOS experiment   | Deferred; previous broad viewport mitigation regressed into a worse empty-screen bug. |
| `F-MT-004`      | `MT-9` first security gate      | Deferred to `MT-9`; separate admin-verification token strategy is already selected.   |
| `F-MT-008`      | `MT-10` deployment/runbook work | Deferred to `MT-10`; production deployment remains blocked until runbook update.      |

Final finding state:

- no open `must-fix-before-MT-9` code finding remains;
- no `MT-8R` cleanup candidate remains approved for immediate refactoring;
- remaining findings have explicit target phases or future focused experiments.

### Exit Criteria Review

`MT-8R` exit criteria status:

- codebase inventory and risk map: complete;
- technical debt analysis: complete;
- concrete code smells/findings review: complete;
- bounded refactoring assessment: complete;
- approved pre-`MT-9` fix slice: complete;
- dead code removal: no approved evidence-based removal slice was found;
- repeated review after the selected fix: complete;
- baseline checks after refactoring: green from `MT-8R-5A`;
- transition to `MT-8.5`: allowed.

### MT-8R Final Result

`MT-8R Codebase Audit And Refactoring Readiness` is complete.

The project can move to:

```text
MT-8.5 Portal UI/UX Baseline Review
```

Before starting `MT-9`, still required:

- finish `MT-8.5` UI/UX baseline review;
- start `MT-9` with `F-MT-004` Chatwoot permissions spike and separate
  admin-verification token boundary.
