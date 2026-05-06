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
