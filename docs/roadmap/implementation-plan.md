# План Реализации

Этот файл хранит только актуальный roadmap: что уже закрыто крупными блоками,
что делаем следующим и какие future slices пока не открываем.

Что сюда не дублируем:

- подробную архитектуру - см. `docs/architecture/overview.md`;
- устойчивые решения - см. `docs/architecture/decisions.md`;
- подробный multi-tenant design - см.
  `docs/architecture/multi-tenant-reference.md`;
- короткую карту завершенного baseline - см. `docs/roadmap/work-log.md`;
- активные review risks - см. `docs/findings/`;
- правила closure flow, git и работы агента - см. `AGENTS.md`.

## Принцип

Новый крупный scope начинается только после closure flow из `AGENTS.md`:
implementation/review/fixes/targeted checks/required automated tests или
documented blocker.

Исторические single-tenant фазы и уже исполненные execution plans больше не
являются активным roadmap. Реальное состояние проекта определяется кодом и
stable docs.

## Current Status

Завершено:

- рабочий portal baseline поверх Chatwoot: primary email-code access,
  secondary password login, password reset, protected app shell, chat
  read/send/attachments/realtime, notifications, profile and PWA foundation;
- production deployment baseline на `lk.provgroup.ru`;
- `MT-0`-`MT-8` multi-tenant program;
- `MT-8R Codebase Audit And Refactoring Readiness`;
- `MT-8.5 Portal UI/UX Baseline Review`;
- portal-owned chat thread runtime: `private:me`, group threads, tenant-scoped
  access validation, send ledger, webhook/realtime routing;
- chat-adjacent pages: info, media/files, search/context, notifications;
- backend-owned unread state, safe Web Push, app badge, customer read sync and
  two-way typing;
- Offline-first PWA MVP and follow-ups: app shell cache, scoped IndexedDB
  snapshots, durable text outbox, foreground drain, Background Sync progressive
  enhancement and unified startup/connection UX;
- read-only `Профиль` with avatar upload synced to the linked Chatwoot contact;
- group member avatars and group support `Поддержка` badge in portal transcript.

Текущий baseline:

- один portal deploy может обслуживать несколько tenants;
- dedicated install остается тем же runtime с одним tenant;
- tenant определяется по `Host`/domain;
- runtime Chatwoot config берется из tenant; global `CHATWOOT_*` env values are
  not backend runtime authority;
- browser работает с portal-owned APIs and `threadId`, not Chatwoot authority;
- Chatwoot remains system of record for contacts/conversations/messages/files;
- portal backend owns auth/session/profile/proxy/send/realtime/read/typing and
  notification boundaries;
- clean production source is tracked through `origin/main` and
  `DEPLOY_SOURCE.txt`.

## Current Roadmap

### MT-9. Tenant Admin And Branding Rebuild (Completed)

Status: completed. The section records the closed tenant-owned admin/branding
baseline; new branding work requires a separate feature intake.

Completed gates:

- `F-MT-004` is closed by `MT-9A`;
- Chatwoot permissions/source spike is documented in
  `docs/spikes/2026-06-06-chatwoot-admin-agents-permissions.md`;
- runtime Chatwoot token and admin-verification token are separate security
  boundaries;
- admin-verification token is stored as a nullable encrypted per-tenant secret.
- `MT-9B` backend foundation is closed: tenant-scoped admin login challenges,
  email code verification, separate admin session cookie, logout and audit
  events are implemented without browser Chatwoot authority.
- `MT-9C` frontend foundation is closed: separate React admin login/session UI,
  protected read-only `/admin/branding` shell and admin/customer route-session
  separation are implemented without browser Chatwoot authority.
- `MT-9D` branding settings foundation is closed: tenant-owned branding
  settings persistence, public/admin branding APIs, tenant admin audit events
  and first admin UI data wiring are implemented without binary asset upload or
  browser object keys.
- `MT-9E` branding asset storage backend is closed: S3-compatible object
  storage, admin upload/delete routes, tenant-scoped public asset reads and
  custom PWA icon routing are implemented with image signature validation,
  opaque public asset versions and no browser object keys/checksums.
- `MT-9F` admin branding asset controls are closed: tenant admins can upload,
  replace and delete logo, PWA icon and configured auth/chat image slots from
  the protected admin console, with preview wiring over portal-owned asset URLs.
- `MT-9G` customer runtime branding is closed: saved public branding colors,
  copy and portal-owned image asset URLs are applied to customer auth, chat,
  chat-info and empty chat runtime surfaces; tenant PWA manifest colors now use
  tenant branding settings without exposing object-storage authority.
- `MT-9H` final branding QA/docs/deploy readiness is closed for production
  push readiness: backend/frontend unit suites, branding/PWA Playwright gates,
  production build/lint, production object-storage compose/init smoke and local
  runtime upload/readback smoke passed. Real-device installed PWA smoke remains
  a production post-deploy check.

Branding slice map:

- `MT-9A` - admin verification token boundary. Closed.
- `MT-9B` - tenant admin backend auth/session/audit foundation. Closed.
- `MT-9C` - tenant admin login UI and protected admin shell. Closed.
- `MT-9D` - tenant-owned branding settings, public/admin branding APIs, first
  settings form and live preview. Closed.
- `MT-9E` - branding asset storage backend: S3-compatible object storage,
  admin upload/delete routes, tenant-scoped public asset reads and custom PWA
  icon routing with image signature validation and cache-version guards. Closed.
- `MT-9F` - admin asset controls: upload/replace/delete UI for logo, PWA icon
  and configured auth/chat image slots, wired to the storage-backed backend
  routes. Closed.
- `MT-9G` - apply branding to customer runtime: auth backgrounds/images,
  chat background, chat header background, logo/brand mark and chat info pages
  using real portal components. Closed.
- `MT-9H` - final branding QA/docs/deploy readiness: browser/PWA/cache
  readiness checks, production runbook updates and final documentation cleanup.
  Closed for production push readiness.
  Admin preview parity checkpoint inside `MT-9H` is closed: `/admin/branding`
  uses read-only real portal preview screens for `Вход`, `Чат` and `Инфо`
  without customer runtime API calls.
  Portal object-storage deploy readiness is part of `MT-9H`: production
  branding uploads must work in the default one-VM stack with no external
  storage provisioning for B2B clients.
  Final readiness checkpoint is closed by automated backend/frontend/e2e
  checks, production object-storage compose/init smoke and local runtime
  branding asset upload/readback/delete smoke. Real-device installed PWA smoke
  remains a production post-deploy check.

Remaining scope after `MT-9`:

- no remaining branding implementation scope before production push;
- production push/deploy still requires explicit user approval because remote
  publishing was intentionally deferred until the full branding scope closed;
- run production post-deploy smoke, including installed PWA checks where
  available, after the approved deploy;
- archived branch `feature/phase-10-portal-branding-admin` may be used only as
  an idea archive, not merged as-is.

Required checks:

- backend tests for admin-verification token boundary;
- backend tests for cross-tenant admin login rejection;
- backend tests for admin/customer cookie separation and audit secret boundary;
- tests or documented blocker for insufficient Chatwoot token permissions;
- frontend tests for tenant admin/branding state;
- Playwright or documented blocker for browser admin/branding flow;
- code review of touched backend/frontend areas;
- Prettier, lint/code-health and `git diff --check`.

Exit criteria:

- admin tenant A cannot log in to or change branding for tenant B;
- branding settings and assets are tenant-scoped;
- browser does not receive Chatwoot authority;
- runtime Chatwoot token is not implicit admin authority.

### MT-10. Deployment And Runbook Update

Status:

- dedicated one-tenant clean reinstall flow exists and has been used;
- local operators and GitHub Actions use one exact-commit staged deployment
  authority: non-cutover prepare produces release evidence and prebuilt images,
  while separate activate uses bounded all-tenant smoke, bounded release
  retention and policy-aware exact rollback;
- the first real staged rehearsal is still pending separate explicit approval;
- central MT-10 operations index links routine deploy, clean reinstall,
  provisioning boundaries, domain rules, secret rotation, backup/restore and
  acceptance checklist;
- MT-10A operator CLI tenant lifecycle tooling exists for custom-domain and
  provider-owned subdomain tenants: create, reconcile and archive/deprovision.
  Custom-domain host ingress/cert preparation is automated; broad shared SaaS
  still needs provider DNS/provider-subdomain ingress rehearsal and optional
  operator UI before rollout.

Цель:

Make production operations repeatable for dedicated installs and future shared
SaaS rollout without mixing portal deploys with Chatwoot core maintenance.

Scope:

- shared SaaS deployment docs;
- dedicated one-tenant install/deploy docs;
- tenant provisioning runbook;
- tenant Chatwoot connection verification runbook;
- domain and `lk.<client-domain>` runbook;
- tenant secret rotation notes;
- backup/restore notes for portal DB and tenant config;
- production acceptance checklist.

Required checks:

- docs review against actual scripts;
- Prettier for changed docs;
- `git diff --check`.

Exit criteria:

- dedicated install can be explained and repeated as one-tenant portal;
- tenant Chatwoot verification, webhook setup and secret rotation have clear
  operator guidance;
- shared SaaS install is explained with the explicit gap that broad rollout
  still needs provider DNS/provider-subdomain ingress rehearsal and optional
  operator UI around the existing CLI tooling.

## Deferred Backlog

These slices are not current roadmap and should not start without explicit new
feature intake.

### Notification Center And Advanced Notifications

Status: deferred.

Reason: base chat notifications already exist; notification center, digest/email
notifications and tenant-admin notification policy require separate product,
UX and privacy review.

### Multi-Domain / Custom Domains

Status: deferred.

Reason: current tenant model uses one canonical `primary_domain` per tenant,
either a custom client domain like `lk.<client-domain>` or a provider-owned
subdomain like `<tenant-slug>.<PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX>`.

Minimum future scope:

- optional tenant domain registry;
- domain verification/ownership flow;
- secondary/custom domain routing;
- deployment and certificate runbook updates.

### SMS Fallback Gateway

Status: deferred, not active.

Reason: SMS fallback design/implementation artifacts were not implemented and
are not part of current active roadmap. They are preserved under
`docs/superpowers/` as deferred research and task context. If reopened, start
with a new feature intake against the current offline/PWA/chat runtime and
refresh those artifacts before implementation.

### Broader Portal Product Domains

Status: deferred.

Examples:

- documents;
- tasks;
- service requests;
- tariff/billing views;
- notification center;
- profile expansion beyond the current read-only/avatar slice.

Rule:

- each domain enters as a separate feature/module slice with tenant scope,
  backend/frontend boundaries, tests and explicit runtime validation.

## Removed From Active Plan

Убрано из этого файла как неактуальное или дублирующее stable docs:

- historical Phase 0-11 descriptions;
- already-built single-tenant roadmap;
- completed `MT-8R`, `MT-8.5`, chat-thread runtime and post-thread cleanup
  checklists;
- detailed testing/deploy command lists for completed phases;
- completed `docs/superpowers/` execution plans/specs;
- bootstrap/git/workflow decisions now covered by `AGENTS.md`;
- architecture rules now covered by `docs/architecture/overview.md` and
  `docs/architecture/decisions.md`.
