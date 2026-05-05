# План Реализации

## Главный Принцип

`v2` строится фазами. Мы не прыгаем сразу в "полный чат", не рисуем половину экранов заранее и не открываем одновременно все подсистемы.

Каждая фаза должна иметь:

- конкретную цель;
- набор deliverables;
- проверку готовности;
- понятный exit criterion.

Пока фаза не закрыта, следующая не начинается.

## Current Program Status

Фазы `0`-`9` уже дали рабочий single-tenant baseline: auth/session, registration, password reset, protected shell, chat read/send/attachments/realtime, PWA hardening и production deployment foundation.

Этот single-tenant runtime model теперь superseded как целевая архитектура. Дальнейшее движение идет через Multi-Tenant Program:

- shared SaaS: один portal deploy обслуживает много B2B tenants;
- dedicated install: один portal deploy обслуживает одного tenant и остается поддерживаемой business-моделью;
- tenant определяется по `Host`/domain до auth/session/chat/admin runtime;
- production domain convention: `lk.<client-domain>`;
- runtime больше не строится вокруг глобальных `CHATWOOT_ACCOUNT_ID` / `CHATWOOT_PORTAL_INBOX_ID`;
- shared SaaS runtime не включается во время промежуточных MT-фаз: пока `MT-4`, `MT-5`, `MT-6` и `MT-7` не закрыты, customer runtime разрешен только для default tenant / one-tenant mode или должен hard-fail для non-default tenants;
- schema/code/runtime changes начинаются только после MT-0 governance update.

Подробная архитектурная программа хранится в `docs/MULTI_TENANT_PORTAL_ARCHITECTURE_PLAN.md`. Этот файл фиксирует короткий roadmap и mandatory phase order.

## Multi-Tenant Program

### MT-0. Governance Update

#### Цель

Зафиксировать multi-tenant direction в устойчивых документах до любых schema/code/runtime changes.

#### Deliverables

- `docs/ARCHITECTURE.md` помечает старую single-tenant model как superseded;
- `docs/DECISIONS.md` фиксирует tenant-aware architecture decisions;
- `docs/IMPLEMENTATION_PLAN.md` получает MT-\* roadmap;
- old branch `feature/phase-10-portal-branding-admin` явно остается unmerged as-is;
- branding/admin возвращается позже как tenant-owned feature после tenant foundation.

#### Checks

- docs review;
- `pnpm exec prettier --check` по измененным docs;
- `git diff --check`.

#### Exit Criteria

- governance docs согласованы;
- код, schema, migrations и runtime не менялись;
- следующий implementation scope - `MT-1. Tenant Schema Foundation`.

### MT-1. Tenant Schema Foundation

#### Цель

Добавить базовую persistence-модель tenant без переписывания всех runtime flows сразу.

#### Deliverables

- `portal_tenants` schema и migration;
- no `portal_tenants.mode`; tenant identity is company + domain + exact Chatwoot connection;
- no admin-verification token in MT-1 schema; store only runtime Chatwoot connection secrets needed for portal operation;
- `portal_tenant_domains` deferred for first implementation pass; `portal_tenants.primary_domain` is enough for `lk.<client-domain>`;
- encrypted tenant secret helper design;
- default tenant bootstrap script for dedicated compatibility;
- tenant repository/bootstrap tests.

#### Exit Criteria

- один default tenant можно создать и загрузить;
- existing dedicated flow имеет понятный путь через one-tenant model.

### MT-2. Tenant Resolution Middleware

#### Цель

Научить backend reliably определять tenant до auth и остальных tenant-owned routes.

#### Deliverables

- host normalization;
- host-based tenant resolver;
- trusted proxy / forwarded host rule;
- transitional runtime guard: non-default tenants cannot use customer runtime while persistence/auth/chat/webhooks are still not fully tenant-scoped;
- typed `request.tenant`;
- public `GET /api/tenant`;
- tenant-aware origin guard;
- controlled unknown-host response;
- dev/test host strategy.

#### Exit Criteria

- backend может identify tenant before auth routes;
- non-default tenant customer runtime remains disabled or hard-fails until tenant isolation phases are complete;
- tenant A origin не может mutating request against tenant B host;
- неизвестный host не fallback-ится в default tenant.

### MT-3. Tenant-Aware Chatwoot Client

#### Цель

Убрать runtime authority из глобальных Chatwoot env и передать Chatwoot config через current tenant.

#### Deliverables

- Chatwoot client принимает tenant config;
- registration/chat/webhook services получают tenant Chatwoot account/inbox/token;
- tenant Chatwoot verification script проверяет account/inbox/token match;
- старые `CHATWOOT_*` env names остаются только bootstrap/dev input where needed.

#### Exit Criteria

- runtime service не использует global `CHATWOOT_ACCOUNT_ID` / `CHATWOOT_PORTAL_INBOX_ID` as authority.

### MT-4. Tenant-Scoped Persistence

#### Цель

Сделать customer/chat persistence tenant-safe.

#### Deliverables

- `tenant_id` в tenant-owned tables;
- tenant-scoped unique constraints;
- default tenant backfill;
- repositories require tenant scope;
- tests for same email/contact/conversation IDs across tenants.

#### Exit Criteria

- persistence layer не может читать customer/chat records без tenant scope.

### MT-5. Tenant-Aware Customer Auth

#### Цель

Изолировать registration/login/session/password reset по tenant.

#### Deliverables

- registration uses resolved tenant;
- login uses `tenant_id + email`;
- sessions store and validate `tenant_id`;
- `/api/auth/me` verifies current tenant;
- password reset, verification locks and continuation tokens are tenant-scoped.

#### Exit Criteria

- same email can exist independently in tenant A and tenant B;
- tenant A session/code/token rejected on tenant B host.

### MT-6. Tenant-Aware Chat Runtime

#### Цель

Изолировать chat context, send, attachments and SSE by tenant.

#### Deliverables

- tenant-scoped contact links;
- tenant-scoped primary conversation mappings;
- tenant-scoped send ledger;
- attachment/text send uses tenant Chatwoot config;
- SSE stream and fanout include tenant identity.

#### Exit Criteria

- tenant A user cannot see or affect tenant B chat runtime.

### MT-7. Tenant-Aware Webhooks And Provisioning

#### Цель

Изолировать inbound Chatwoot events и provisioning scripts.

#### Deliverables

- tenant-specific webhook endpoint or resolver;
- tenant-specific webhook secret verification;
- webhook delivery dedupe includes `tenant_id`;
- tenant webhook configure and health scripts.

#### Exit Criteria

- Chatwoot event from tenant A cannot fan out or dedupe against tenant B.

### MT-8. Tenant-Aware Frontend/PWA

#### Цель

Сделать browser/PWA identity tenant-specific.

#### Deliverables

- frontend consumes public tenant/branding context;
- dynamic tenant-aware manifest endpoint;
- tenant-specific `id`, `start_url`, `scope`, name, colors and icons;
- service worker no-store/network-first handling for tenant dynamic metadata;
- local multi-host testing guide.

#### Exit Criteria

- two tenant hosts can show different public tenant/PWA identity safely.

### MT-9. Tenant Admin And Branding Rebuild

#### Цель

Вернуть branding/admin только после tenant foundation.

#### Deliverables

- revisit archived `feature/phase-10-portal-branding-admin`;
- port only useful ideas that fit tenant-aware model;
- run Chatwoot permissions spike and choose admin verification token strategy before implementation;
- tenant-scoped admin login via Chatwoot administrator role;
- tenant-scoped branding settings and audit events.

#### Exit Criteria

- tenant A admin/branding cannot authenticate or mutate tenant B.

### MT-10. Deployment And Runbook Update

#### Цель

Описать repeatable production operations для dedicated и shared modes.

#### Deliverables

- deployment docs for dedicated and shared modes;
- tenant provisioning runbook;
- custom domain runbook;
- secret rotation note;
- backup/restore note for tenant config and portal DB;
- acceptance checklist.

#### Exit Criteria

- dedicated one-tenant install and shared SaaS install can be explained and repeated.

## Historical Product Phases

Фазы ниже остаются историей already-built product baseline и источником feature intent. Для нового runtime work они подчиняются MT-\* программе.

## Phase 0. Project Foundation

### Цель

Подготовить чистый каркас нового проекта.

### Deliverables

- базовая структура `frontend/`, `backend/`, `docs/`;
- выбранный package manager и root scripts;
- lint/format setup;
- базовая TypeScript configuration;
- env conventions;
- архитектурные документы;
- базовый README.

### Exit Criteria

- проект устанавливается одной командой;
- frontend и backend можно запустить локально;
- документация отражает реальные решения;
- дальше можно начинать код без повторного "выбора основы".

## Phase 0.5. PWA Foundation

### Цель

Сделать портал installable web app foundation, а не обычным сайтом.

### Deliverables

- `manifest.webmanifest`;
- app icons и `apple-touch-icon`;
- service worker registration;
- service worker foundation без вмешательства в `/api`;
- standalone display configuration;
- базовые meta tags для browser/mobile install flow;
- локальная проверка доступности manifest и service worker.

### Exit Criteria

- Chromium-браузеры видят installable foundation на подходящем origin;
- iOS/iPadOS получают корректный Home Screen web app metadata;
- app запускается в standalone-режиме после установки;
- PWA foundation не ломает текущий frontend runtime.

## Phase 1. Backend Auth Foundation

### Цель

Поднять backend authority для auth и session.

### Deliverables

- Fastify app scaffold;
- env parsing;
- cookie session setup;
- базовый error model;
- `POST /api/auth/login`;
- `POST /api/auth/logout`;
- `GET /api/auth/me`;
- `portal_users` schema и migrations;
- auth tests.

### Exit Criteria

- backend-authenticated session работает end-to-end;
- browser может определить, авторизован пользователь или нет;
- нет `localStorage`-auth fallback.

## Phase 2. Registration Flow

### Цель

Собрать новый registration flow без наследия `v1`.

### Deliverables

- eligibility check;
- verification request;
- verification confirm;
- set password completion;
- email delivery adapter contract;
- таблицы verification domain;
- frontend registration pages;
- backend and browser tests.

### Exit Criteria

- eligible existing contact может зарегистрироваться;
- неeligible пользователь корректно получает отказ;
- verification flow проходит последовательно и без ручных костылей.

## Phase 3. Password Reset

### Цель

Добавить отдельный и безопасный password reset flow.

### Deliverables

- reset request endpoint;
- reset confirm endpoint;
- reset persistence;
- frontend reset pages;
- outward-safe copy без disclosure account existence;
- tests.

### Exit Criteria

- reset flow работает отдельно от registration;
- старый пароль перестает работать после reset;
- новый пароль принимается.

## Phase 4. Protected App Shell

### Цель

Собрать защищенную клиентскую оболочку без еще не готового interactive chat.

### Deliverables

- frontend router;
- protected routes;
- app shell;
- auth bootstrap;
- logout UX;
- базовая empty/protected state page.

### Exit Criteria

- неавторизованный пользователь не попадает в защищенную часть;
- авторизованный пользователь стабильно попадает в portal shell.

## Phase 5. Chat Read Model

### Цель

Сначала собрать chat как read-first feature.

### Deliverables

- `chat-context` backend module;
- linked contact resolution;
- authoritative primary conversation resolution;
- `Channel::Api` portal inbox routing expectation: `Reopen same conversation`;
- deploy-time portal inbox routing setup command;
- anomaly-triggered portal inbox routing auto-fix;
- `GET /api/chat/context`;
- `GET /api/chat/messages`;
- transcript rendering;
- bounded pagination;
- controlled ready/not_ready states.

### Exit Criteria

- пользователь видит свой chat state;
- история грузится предсказуемо;
- frontend не строит chat context самостоятельно.

## Phase 6. Text Send And First Conversation Bootstrap

### Цель

Добавить text send на чистой conversation-based модели.

### Deliverables

- text composer;
- `POST /api/chat/messages`;
- first conversation bootstrap only when no authoritative portal conversation exists;
- replacement bootstrap when the mapped primary was deleted and no portal conversations remain;
- backend contact-link recovery by exact authenticated user email -> Chatwoot contact match;
- authoritative conversation mapping persistence;
- send through mapped conversation even if it was resolved in Chatwoot;
- if multiple portal conversations exist and no valid mapping exists, choose newest active conversation, else newest resolved conversation;
- no multi-conversation synthetic transcript in this phase;
- send ledger;
- retry semantics;
- tests на first-send и false-negative recovery.

### Exit Criteria

- первый message может bootstrap-нуть conversation только там, где это разрешено моделью;
- обычный send работает через backend;
- duplicate/retry path не создает дубли;
- resolved primary conversation переиспользуется, а не заменяется новым conversation.

## Phase 7. Attachment Send

### Цель

Добавить single-file attachment send без смешивания с text-send логикой.

### Deliverables

- attachment upload validation;
- attachment send route;
- transcript attachment rendering;
- retry/idempotency behavior;
- tests.

### Exit Criteria

- один файл можно отправить и увидеть в transcript;
- backend валидирует размер и type;
- ложный retry не плодит duplicate attachments.

## Confirmed Chat Follow-up Slices

Следующие chat-возможности уже входят в подтвержденный продуктовый scope `v2`, даже если они не открывают отдельную большую фазу раньше времени:

- `message calendar`
  Идет отдельным slice после `Phase 5`, поверх chat read model, и потребует отдельного backend-контракта для date-based navigation.
- `reply state`
  Идет отдельным slice после `Phase 6`, поверх базового composer/send flow.
- `voice recording and send`
  Идет отдельным slice после `Phase 7`, поверх backend-owned attachment/audio pipeline.

## Phase 8. Realtime

### Цель

Подключить backend-owned realtime.

### Deliverables

- signed Chatwoot webhook ingestion;
- delivery bookkeeping;
- route resolution by authoritative conversation mapping;
- SSE stream endpoint;
- frontend realtime connection;
- scoped refresh/update behavior;
- tests и focused browser validation.

### Exit Criteria

- новые сообщения и relevant updates доходят до клиента через backend;
- private/internal noise не ломает клиентский transcript;
- duplicate webhook delivery безопасно дедуплицируется.

## Phase 9. PWA App Hardening

### Цель

Довести PWA-поведение до уровня installed app, а не только installable shell.

### Deliverables

- service worker update flow без внезапного сброса пользователя во время работы в чате;
- явный app-update UX: приложение может сообщить, что доступна новая версия, и применить ее в безопасный момент;
- подтвержденное правило: `/api/*`, SSE realtime и auth/chat responses не кешируются service worker;
- reconnect/resync после возврата из background/sleep через `visibilitychange`, `focus` и `online`;
- offline/connection state UI для chat: понятное состояние "нет соединения" без попытки молча отправлять сообщения;
- installed-PWA mobile viewport polish: safe area, экранная клавиатура, высота composer/transcript, scroll-to-bottom behavior;
- проверка file picker и attachment send в installed/standalone mode;
- browser capability fallback для окружений без service worker, EventSource или install prompt;
- отдельный manual checklist для браузера, Android installed PWA и iOS Home Screen web app;
- решение по offline send queue явно зафиксировано: не добавлять очередь отправки сообщений/файлов, пока это не открыто отдельным product slice.

### Exit Criteria

- портал предсказуемо работает как browser tab и как installed PWA;
- reconnect после сна приложения возвращает chat к актуальному backend snapshot;
- offline state понятен пользователю и не создает ложных duplicate sends;
- service worker не вмешивается в backend authority, auth, chat send и realtime.

## Phase 10. Push Notifications

### Цель

Добавить обязательные push-уведомления для новых клиентски-видимых chat updates.

Перед входом в эту фазу `Phase 9. PWA App Hardening` должна быть закрыта. Сам rollout notifications идет в два слоя:

1. in-app notification state:
   unread counters, badges, preferences UX;
2. browser push:
   subscription, delivery, click-to-open chat.

### Deliverables

- выбрать и зафиксировать browser push strategy: Web Push/VAPID для поддерживаемых браузеров, graceful fallback для неподдерживаемых окружений;
- добавить backend env/config для push: VAPID public/private keys, subject/contact и production origin constraints;
- добавить таблицы для push subscriptions: portal user, endpoint, keys, user agent/device metadata, status, created/updated/last_seen timestamps;
- добавить backend endpoints для subscribe, unsubscribe и refresh subscription, только для authenticated portal user;
- добавить frontend permission UX: объяснение зачем нужны уведомления, request permission только по явному действию пользователя, состояние denied/default/granted;
- добавить in-app unread/badge state и notification preferences до включения real push delivery;
- добавить service worker `push` handler: показывать notification без раскрытия sensitive message content сверх выбранной privacy policy;
- добавить service worker `notificationclick` handler: открывать или фокусировать `/app/chat`;
- связать push trigger с backend-owned chat event path: Chatwoot webhook -> route resolution -> backend snapshot/relevant update -> push только нужному portal user;
- фильтровать private/internal Chatwoot events до push так же, как до transcript fanout;
- не отправлять push автору собственного сообщения из портала;
- добавить notification preferences: минимум global on/off для portal user, с возможностью расширить настройки позже;
- добавить дедупликацию уведомлений по Chatwoot delivery/message scope, чтобы повторный webhook не создавал повторный push;
- добавить обработку expired/invalid subscriptions: mark inactive/remove после push provider errors;
- добавить payload privacy policy: по умолчанию безопасный текст вроде "Новое сообщение в клиентском чате", без вложений/полного текста, пока явно не утверждено иначе;
- добавить observability для push delivery: redacted logs/status counters без записи endpoint keys в logs;
- добавить unit/integration tests для subscribe/unsubscribe, routing, privacy filtering, duplicate suppression и expired subscription cleanup;
- добавить focused browser/manual validation для installed PWA notification permission, background push и click-to-open chat.

### Exit Criteria

- пользователь может включить уведомления из портала;
- unread/badge state и notification preferences работают до и независимо от browser push delivery;
- новое клиентски-видимое сообщение от агента приводит к push-уведомлению нужному пользователю;
- private/internal события и собственные сообщения пользователя не создают push;
- duplicate webhook delivery не создает duplicate notification;
- click по уведомлению открывает или фокусирует клиентский чат;
- неподдерживаемые браузеры получают понятный fallback без поломки portal runtime.

## Phase 11. Hardening

### Цель

Довести `v2` до production-ready baseline.

### Deliverables

- structured logging;
- rate limiting для auth-sensitive endpoints;
- final env schema;
- deployment notes;
- smoke checklist;
- regression checklist;
- release candidate validation.

### Exit Criteria

- есть понятный список runtime dependencies;
- есть повторяемый локальный и staging сценарий проверки;
- критичные риски закрыты или явно зафиксированы.

## Phase Order Is Mandatory

Обязательная последовательность для следующей работы:

1. MT-0 Governance Update
2. MT-1 Tenant Schema Foundation
3. MT-2 Tenant Resolution Middleware
4. MT-3 Tenant-Aware Chatwoot Client
5. MT-4 Tenant-Scoped Persistence
6. MT-5 Tenant-Aware Customer Auth
7. MT-6 Tenant-Aware Chat Runtime
8. MT-7 Tenant-Aware Webhooks And Provisioning
9. MT-8 Tenant-Aware Frontend/PWA
10. MT-9 Tenant Admin And Branding Rebuild
11. MT-10 Deployment And Runbook Update

Historical product baseline order:

1. Foundation
2. PWA Foundation
3. Backend Auth Foundation
4. Registration Flow
5. Password Reset
6. Protected App Shell
7. Chat Read Model
8. Text Send And First Conversation Bootstrap
9. Attachment Send
10. Realtime
11. PWA App Hardening
12. Push Notifications
13. Hardening

Мы не начинаем новые branding/admin/push/product-growth slices поверх single-tenant assumptions. Сначала закрываем tenant foundation и только потом возвращаемся к tenant-owned branding/admin.

## Что Нельзя Делать По Ходу Реализации

- тащить куски кода из `v1`;
- смешивать старую и новую архитектуру;
- продолжать runtime вокруг global `CHATWOOT_ACCOUNT_ID` / `CHATWOOT_PORTAL_INBOX_ID`;
- использовать request body как production tenant selector;
- merge `feature/phase-10-portal-branding-admin` as-is;
- брать тяжелые библиотеки "на всякий случай";
- строить многоуровневые абстракции до появления реальной боли;
- считать фазу завершенной без тестов и ручной проверки.
