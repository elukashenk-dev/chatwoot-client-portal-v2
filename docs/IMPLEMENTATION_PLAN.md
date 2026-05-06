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
MT-8R. Codebase Audit And Refactoring Readiness
```

## Active Roadmap

### MT-8R. Codebase Audit And Refactoring Readiness

Цель:

После большого `MT-1`-`MT-8` multi-tenant pass проверить состояние кода и
подготовить controlled refactoring plan перед `MT-8.5` UI/UX review и `MT-9`
admin/branding. Задача этапа - не "улучшить все", а понять риски, выбрать
ограниченные refactoring slices и защитить baseline проверками.

Non-goals:

- не начинать `MT-9` tenant admin/branding implementation;
- не менять UI/UX baseline в рамках audit без отдельного UI polish slice;
- не переписывать модули "потому что можно красивее";
- не смешивать refactoring, new feature work, schema/runtime changes и dead
  code removal в один большой commit;
- не читать и не использовать старый `../chatwoot-client-portal`.

Шаги:

1. Code audit:
   - составить карту backend/frontend/shared/scripts/tests areas;
   - проверить tenant boundaries: resolution, auth/session, persistence, chat,
     realtime, webhooks, Chatwoot client, PWA metadata;
   - отметить зоны с высоким change risk перед `MT-9`.
2. Technical debt analysis:
   - найти крупные файлы, слабые тестовые зоны, запутанные зависимости,
     дублирование tenant/runtime logic, fragile local/provisioning paths;
   - не чинить найденное сразу, сначала классифицировать.
3. Code smells review:
   - фиксировать только конкретные actionable issues;
   - для реальных рисков создавать отдельные files в `docs/Findings/`;
   - не превращать subjective style preferences в обязательный refactor.
4. Refactoring assessment:
   - разложить candidates по категориям:
     `must-fix-before-MT-9`, `safe-pre-MT-9-cleanup`, `defer`,
     `do-not-touch`;
   - для каждого candidate указать affected area, expected behavior impact,
     risk, required tests and rollback strategy.
5. Refactoring slices:
   - выполнять только выбранные bounded slices;
   - один slice = один понятный scope, одна ветка/commit checkpoint;
   - без behavior changes, если они явно не согласованы;
   - после каждого slice выполнять targeted tests and review.
6. Dead code removal:
   - удалять только после evidence: `rg`, typecheck/build/test или явная
     устаревшая doc/runtime ссылка;
   - не удалять public/runtime entrypoints без отдельного подтверждения.
7. Повторное code review:
   - проверить, что refactoring не ослабил tenant isolation, auth/session,
     webhook/realtime boundaries и PWA tenant identity.

Deliverables:

- `docs/MT_8R_CODEBASE_AUDIT.md` с audit summary, technical debt map,
  findings index, refactoring candidates and выбранным next slice plan;
- finding files в `docs/Findings/` для actionable risks;
- отдельные small commits для approved refactoring/dead-code slices, если они
  будут выполняться в рамках `MT-8R`.

Required checks:

- baseline checks перед refactoring: backend tests/build/lint, frontend
  typecheck/tests/build, root lint/code-health или documented blocker;
- для каждого refactoring slice: targeted tests for affected area, build/lint,
  Prettier и `git diff --check`;
- для browser/runtime-sensitive changes: Playwright или documented blocker;
- final повторное code review после выбранных slices.

Exit criteria:

- общее состояние проекта понятно и задокументировано;
- каждый найденный риск либо закрыт, либо записан как finding/deferred;
- approved refactoring slices выполнены маленькими контролируемыми steps;
- нет открытых `must-fix-before-MT-9` findings;
- baseline checks после refactoring зеленые или blocker явно зафиксирован;
- можно переходить к `MT-8.5` UI/UX baseline review без ощущения, что мы
  строим branding поверх непонятного кода.

### MT-8.5. Portal UI/UX Baseline Review

Цель:

Внимательно проверить текущий portal UI/UX и зафиксировать базовый visual/layout
каркас до начала `MT-9` branding/admin. Branding должен настраивать уже
принятый продуктовый интерфейс, а не строиться поверх еще спорного shell.

Scope:

- провести review всех customer-facing portal states: login, registration,
  email-code verification, password reset, отказ/ошибка доступа, loading/error
  states, app shell, chat empty state, chat with messages, attachments, voice и
  realtime states;
- проверить mobile/PWA и desktop поведение для нескольких tenants;
- решить, какие элементы являются baseline layout и не должны меняться через
  branding;
- решить, какие элементы станут tenant-brandable в `MT-9`: display name, logo,
  PWA icon, colors, support copy, auth/chat header accents;
- определить набор preview screens для `MT-9` branding admin: login,
  registration/forms, chat и PWA/app identity preview;
- зафиксировать findings или UI polish slices до `MT-9`, если текущий shell не
  подходит как branding baseline.

Required checks:

- manual UI/UX walkthrough на локальных tenants;
- browser screenshots или Playwright screenshots для ключевых mobile/desktop
  states;
- frontend review affected areas без code changes, если review only;
- если будут UI fixes: targeted frontend tests, Playwright или documented
  blocker, frontend typecheck/build, Prettier/lint/code-health и
  `git diff --check`.

Exit criteria:

- portal UI shell принят как baseline для branding;
- список brandable vs non-brandable элементов согласован;
- preview screens для `MT-9` определены и должны использовать реальные portal
  components, а не отдельную нарисованную копию;
- blocker/finding список перед `MT-9` пуст или явно deferred отдельным решением.

### MT-9. Tenant Admin And Branding Rebuild

Цель:

Вернуть admin/branding только как tenant-owned feature поверх готовой
multi-tenant foundation и утвержденного `MT-8.5` UI/UX baseline.

Scope:

- провести Chatwoot permissions spike для выбранной separate per-tenant
  admin-verification token strategy;
- добавить encrypted tenant admin-verification token storage, например
  `chatwoot_admin_verification_token_ciphertext`;
- реализовать tenant-scoped admin login через Chatwoot administrator role внутри
  current tenant Chatwoot account;
- реализовать tenant-owned branding settings;
- реализовать production-grade tenant branding assets: DB metadata plus
  S3-compatible object storage, локально через MinIO/compatible service без
  local-files fallback;
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
- branding assets не могут прочитаться или перезаписаться из другого tenant;
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
