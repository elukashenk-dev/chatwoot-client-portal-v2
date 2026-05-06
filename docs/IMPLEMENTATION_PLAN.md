# План Реализации

Этот файл хранит актуальный roadmap: что уже закрыто крупными блоками, что
делаем следующим и какие future slices пока не открываем.

Что сюда не дублируем:

- подробную архитектуру - см. `docs/ARCHITECTURE.md`;
- устойчивые решения - см. `docs/DECISIONS.md`;
- подробный multi-tenant design - см.
  `docs/MULTI_TENANT_PORTAL_ARCHITECTURE_PLAN.md`;
- историю всех выполненных фаз и проверок - см. `docs/WORK_LOG.md`;
- временные review risks - см. `docs/Findings/`;
- правила closure flow, git и работы агента - см. `AGENTS.md`.

## Принцип

Движение идет фазами. Новую фазу или крупный slice начинаем только после
закрытия текущего scope по closure flow из `AGENTS.md`.

Исторические single-tenant фазы больше не являются активным roadmap. Они уже
дали рабочий baseline и теперь superseded multi-tenant программой.

## Current Status

Завершено:

- рабочий portal baseline поверх Chatwoot: auth, registration, password reset,
  protected app shell, chat read/send/attachments/realtime и PWA foundation;
- production deployment baseline;
- `MT-0`-`MT-8` multi-tenant program;
- post-MT runtime review fixes для tenant URL/domain, portal inbox routing и
  webhook payload validation.

Текущий baseline:

- один portal deploy может обслуживать несколько tenants;
- dedicated install остается тем же runtime с одним tenant;
- tenant определяется по `Host`/domain;
- runtime Chatwoot config берется из tenant, а не из глобальных
  `CHATWOOT_ACCOUNT_ID` / `CHATWOOT_PORTAL_INBOX_ID`;
- customer auth, persistence, chat runtime, webhooks, frontend metadata и PWA
  identity уже tenant-aware.

Следующий активный scope:

```text
MT-9. Tenant Admin And Branding Rebuild
```

## Active Roadmap

### MT-9. Tenant Admin And Branding Rebuild

Цель:

Вернуть admin/branding только как tenant-owned feature поверх готовой
multi-tenant foundation.

Scope:

- провести Chatwoot permissions spike для выбранной separate per-tenant
  admin-verification token strategy;
- добавить encrypted tenant admin-verification token storage, например
  `chatwoot_admin_verification_token_ciphertext`;
- реализовать tenant-scoped admin login через Chatwoot administrator role внутри
  current tenant Chatwoot account;
- реализовать tenant-owned branding settings;
- подключить tenant-scoped audit events для admin/branding действий;
- использовать старую `feature/phase-10-portal-branding-admin` только как
  архив идей, не мержить ее как есть.

Required checks:

- backend tests для admin verification token boundary;
- backend tests для cross-tenant admin login rejection;
- tests или documented blocker для insufficient Chatwoot token permissions;
- frontend tests для tenant admin/branding state;
- Playwright или documented blocker для browser admin/branding flow;
- code review затронутых backend/frontend областей;
- Prettier, lint/code-health и `git diff --check`.

Exit criteria:

- admin tenant A не может войти или менять branding tenant B;
- branding хранится и читается только в tenant scope;
- browser не получает Chatwoot authority;
- runtime Chatwoot token не используется как implicit admin authority;
- `F-MT-004` закрыт реализацией и проверками.

### MT-10. Deployment And Runbook Update

Цель:

Описать repeatable production operations для shared SaaS и dedicated installs.

Scope:

- deployment docs для shared SaaS;
- deployment docs для dedicated one-tenant install;
- tenant provisioning runbook;
- tenant Chatwoot connection verification runbook;
- domain and `lk.<client-domain>` runbook;
- tenant secret rotation notes;
- backup/restore notes для portal DB и tenant config;
- production acceptance checklist.

Required checks:

- docs review;
- local command review against actual scripts;
- Prettier по измененным docs;
- `git diff --check`.

Exit criteria:

- shared SaaS install можно повторяемо объяснить и поднять;
- dedicated install можно повторяемо объяснить и поднять как one-tenant portal;
- tenant provisioning, webhook setup и secret rotation имеют понятные команды.

## Deferred Backlog

Эти slices не являются текущим roadmap и не начинаются до закрытия `MT-9`/`MT-10`
или отдельного явного решения.

### Push Notifications

Status:

- deferred.

Reason:

- push зависит от production-ready service worker lifecycle, notification
  privacy policy, tenant-aware routing and preferences.

Minimum future scope:

- in-app unread/badge state;
- notification preferences;
- Web Push/VAPID strategy;
- push subscription persistence with tenant scope;
- webhook-to-push routing only for relevant tenant user;
- duplicate suppression and expired subscription cleanup.

### Multi-Domain / Custom Domains

Status:

- deferred.

Reason:

- current production convention uses one canonical domain:
  `lk.<client-domain>`.

Minimum future scope:

- optional tenant domain registry;
- domain verification/ownership flow;
- secondary/custom domain routing;
- deployment and certificate runbook updates.

### Broader Portal Product Domains

Status:

- deferred.

Examples:

- documents;
- tasks;
- service requests;
- tariff/billing views;
- notifications center;
- profile expansion.

Rule:

- each domain must enter as a separate feature/module slice with tenant scope,
  tests and explicit backend/frontend boundaries.

## Removed From Active Plan

Убрано из этого файла как неактуальное или дублирующее другие docs:

- подробные historical Phase 0-11 descriptions;
- already-built single-tenant roadmap;
- bootstrap/git/workflow decisions;
- long checklists for completed auth/chat/PWA phases;
- duplicated architecture rules now covered by `ARCHITECTURE.md` and
  `DECISIONS.md`.
