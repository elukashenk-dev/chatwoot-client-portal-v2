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
