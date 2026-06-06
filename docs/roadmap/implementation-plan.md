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

- рабочий portal baseline поверх Chatwoot: auth, registration, password reset,
  protected app shell, chat read/send/attachments/realtime, notifications,
  profile and PWA foundation;
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

## Active Roadmap

### MT-9. Tenant Admin And Branding Rebuild

Цель:

Вернуть admin/branding только как tenant-owned feature поверх готовой
multi-tenant foundation и утвержденного customer-facing UI baseline.

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

Remaining scope:

- tenant-owned branding settings;
- branding asset metadata in portal DB and binary content in S3-compatible
  object storage, local development through the same MinIO/compatible pattern;
- tenant-scoped audit events for branding actions;
- preview screens using real portal components;
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
- routine clean archive deploy flow exists for already bootstrapped production;
- shared SaaS rollout docs remain future expansion of the same tenant-aware
  runtime model.

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

- shared SaaS install can be explained and repeated;
- dedicated install can be explained and repeated as one-tenant portal;
- tenant provisioning, webhook setup and secret rotation have clear commands.

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

Reason: current production convention uses one canonical domain:
`lk.<client-domain>`.

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
