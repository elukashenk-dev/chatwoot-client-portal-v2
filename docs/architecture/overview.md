# Архитектурный Фундамент

## Назначение Документа

Этот документ фиксирует текущий устойчивый архитектурный baseline `chatwoot-client-portal-v2`.

Его задача:

- коротко описать, что мы строим;
- зафиксировать главные границы ответственности;
- отделить актуальную архитектуру от superseded transitional-решений;
- дать понятную карту для следующих фаз.

Подробности по решениям, очередности работ и истории изменений живут в отдельных документах:

- `docs/architecture/decisions.md` - принятые решения;
- `docs/roadmap/implementation-plan.md` - roadmap и MT-фазы;
- `docs/architecture/multi-tenant-reference.md` - подробный multi-tenant technical reference;
- `docs/roadmap/work-log.md` - короткий список реально завершенных шагов.

## Что За Продукт

`Chatwoot Client Portal v2` - это отдельный tenant-aware клиентский портал поверх Chatwoot.

Целевая бизнес-модель:

- shared SaaS: один portal deploy обслуживает много B2B-компаний;
- dedicated install: отдельный portal deploy обслуживает одного tenant и отдельный Chatwoot;
- dedicated install не является отдельной архитектурой, а работает как multi-tenant portal с одним tenant.

Каждая B2B-компания в портале - это отдельный `tenant`.

Tenant владеет:

- своим доменом;
- своими portal users и sessions;
- своей Chatwoot-связкой: `chatwoot_base_url`, `chatwoot_account_id`, `chatwoot_portal_inbox_id`;
- своими encrypted Chatwoot runtime secrets;
- своим webhook secret;
- tenant-admin auth/audit и branding settings.

Текущий пользовательский контур:

- существующий Chatwoot contact может пройти registration eligibility check;
- пользователь подтверждает email, задает пароль и входит в портал;
- password reset работает через email-code flow;
- пользователь открывает защищенную клиентскую зону;
- пользователь видит личный чат и, при наличии доступа, групповые чаты;
- backend загружает историю сообщений, отправляет текст, отправляет один файл и доставляет realtime-обновления;
- пользователь может открыть установленный PWA при плохой связи после
  предыдущего online входа, видеть сохраненный чат и ставить текстовые
  сообщения в локальную durable outbox;
- пользователь может открыть full-screen страницы чата: информация, медиа и
  файлы, поиск, настройки уведомлений;
- пользователь может управлять chat notifications: включение новых сообщений,
  звук, подключение Web Push на конкретном устройстве и overrides на уровне
  конкретного чата;
- пользователь может открыть `Профиль`, увидеть read-only `Имя`, `Email`,
  `Телефон` и загрузить/заменить свой аватар;
- групповые чаты показывают аватары участников через portal proxy URLs, а
  сообщения поддержки в группе отмечаются компактным badge `Поддержка`;
- PWA manifest, icons и iOS Home Screen metadata резолвятся tenant-aware.

Проект не является модификацией Chatwoot core. Chatwoot остается внешней системой по отношению к этому репозиторию.

## Ключевые Принципы

### `v2` - Самостоятельный Проект

- текущий repository является source of truth для portal behavior;
- architecture docs описывают актуальное состояние, а не migration bridge;
- внешние клиентские portal-проекты не используются как reference.

### Browser Не Имеет Chatwoot Authority

- браузер не хранит Chatwoot tokens;
- браузер не открывает прямой Chatwoot runtime;
- браузер не делает direct auth/send/realtime against Chatwoot;
- весь доступ к Chatwoot идет только через portal backend.

### Backend - Authority-Зона Портала

Portal backend отвечает за:

- tenant resolution;
- auth и sessions;
- registration и password reset;
- access control;
- profile read and avatar update boundary;
- chat thread/access resolution;
- send authority;
- attachment/avatar upload validation and proxying;
- realtime fanout;
- unread/read/typing/notification sync;
- Chatwoot webhook validation.

### Chatwoot - System Of Record Для Chat Domain

Chatwoot остается источником истины для:

- contacts;
- conversations;
- messages;
- attachments.

Portal database хранит только portal-owned данные и локальные технические связи:

- tenants;
- portal users;
- portal sessions;
- verification records;
- portal user -> Chatwoot contact links;
- portal-owned chat thread mappings;
- send ledger;
- webhook delivery bookkeeping;
- notification preferences, push subscriptions and push delivery bookkeeping.

Portal database всегда отдельная от runtime-базы Chatwoot.

### Tenant Boundary Обязательна

- tenant определяется до auth/session/chat/admin runtime;
- production tenant resolution идет по `Host`/domain;
- production domain convention: `lk.<client-domain>`;
- неизвестный host получает controlled failure, а не fallback в default tenant;
- `X-Forwarded-Host` учитывается только при `PORTAL_TRUST_PROXY=true`;
- browser не выбирает tenant через body/query/header по своему желанию;
- tenant-owned database rows читаются и пишутся только с `tenant_id`;
- tenant-specific Chatwoot config приходит из tenant runtime config;
- глобальные `CHATWOOT_ACCOUNT_ID` и `CHATWOOT_PORTAL_INBOX_ID` не являются runtime authority.

### Boring Architecture

Мы предпочитаем:

- простые модули;
- явные границы;
- маленькие сервисы;
- предсказуемые API;
- минимально достаточные зависимости.

Мы избегаем:

- универсальных абстракций без реальной боли;
- скрытых fallback chains;
- browser-direct Chatwoot access;
- больших transitional layers;
- смешивания разных product domains в одном модуле.

## Tenant Model

Tenant = company + domain + exact Chatwoot connection.

В `portal_tenants` нет поля `mode`.

Runtime-модель определяется фактической Chatwoot-связкой:

```text
buhfirma -> chatwoot.shared.ru / account 3
stroyfirma -> chatwoot.shared.ru / account 5
zubi -> chatwoot.zubi.ru / account 1
```

Если несколько tenants смотрят в один `chatwoot_base_url`, но разные accounts - это shared Chatwoot instance.

Если tenant смотрит в отдельный Chatwoot - это dedicated Chatwoot instance.

`hybrid` не является tenant mode. Это только описание deploy, где один portal обслуживает tenants с разными типами Chatwoot-связок.

Минимальная tenant identity:

- `slug`;
- `display_name`;
- `status`;
- `primary_domain`;
- `public_base_url`;
- `chatwoot_base_url`;
- `chatwoot_account_id`;
- `chatwoot_portal_inbox_id`;
- encrypted Chatwoot runtime token;
- encrypted Chatwoot webhook secret.

`public_base_url` должен соответствовать `primary_domain`.

Tenant со статусом не `active` не допускается до public/auth/chat/webhook runtime.

## Runtime Flows

### Browser Flow

1. Browser приходит на tenant domain, например `lk.buhfirma.ru`.
2. Frontend общается только с same-origin `/api`.
3. Backend резолвит tenant по host.
4. Frontend получает только public tenant context.
5. Chatwoot secrets и Chatwoot authority в браузер не попадают.

### Auth, Registration И Password Reset

- session хранится в `httpOnly` cookie;
- session row содержит `tenant_id`;
- session lookup всегда проверяет current tenant;
- email не считается глобально уникальным;
- корректная уникальность пользователя - `tenant_id + email`;
- registration eligibility ищет exact email match только внутри current tenant Chatwoot account;
- registration и password reset используют общую таблицу `verification_records`;
- сценарий различается через `purpose`: `registration` или `password_reset`;
- отдельная таблица `password_reset_records` не создается;
- verification/advisory-lock логика tenant-aware.

### Chat

- один portal user принадлежит одному tenant;
- portal user связывается с одним Chatwoot contact внутри current tenant account;
- публичная модель чата строится вокруг portal-owned `threadId`, а не вокруг
  Chatwoot conversation id;
- browser может запрашивать только `threadId`: `private:me` или
  `group:<chatwoot_group_contact_id>`;
- backend валидирует каждый `threadId` через tenant, session, linked person
  contact и текущие Chatwoot contact attributes;
- backend хранит authoritative thread mapping в `portal_chat_threads`;
- Chatwoot conversation id остается внутренней backend-связью конкретного
  portal thread и не является browser authority;
- Chatwoot contact/conversation IDs не считаются глобально уникальными без tenant scope;
- portal inbox tenant должен быть `Channel::Api`;
- portal inbox tenant должен иметь `lock_to_single_conversation = true`;
- `private:me` привязан к linked person contact;
- `group:<id>` доступен только если linked person contact содержит этот ID
  группового Chatwoot contact в разрешенном portal attribute list, а сам
  group contact включен для portal;
- если thread существует в portal DB, но Chatwoot conversation еще нет, первый
  send может bootstrap-нуть conversation только под tenant-aware advisory lock,
  scoped by target Chatwoot contact/thread;
- если mapped conversation удален в Chatwoot и fresh resolve не находит
  оставшихся portal conversations для того же thread target, следующий send
  может bootstrap-нуть replacement conversation под тем же lock;
- несколько portal conversations для одного portal thread target внутри tenant
  portal inbox считаются anomaly, а не целевой UX;
- group thread messages, отправленные из portal в Chatwoot, получают
  Chatwoot-visible Markdown author prefix; portal transcript показывает автора
  по structured metadata и не заставляет клиента видеть technical prefix.
- agent/group member avatars в transcript, thread list and chat info are
  exposed only as portal-owned `/api/.../avatar` URLs;
- unknown group authors keep initials fallback instead of inferred avatar URLs;
- group transcript visually labels `agent` messages with `Поддержка` only at
  the first visible message of each support block.

### Realtime И Webhooks

Realtime-путь:

```text
Chatwoot signed webhook -> portal backend -> tenant-scoped SSE fanout -> browser
```

Правила:

- Chatwoot webhook secret tenant-specific;
- для tenant portal `Channel::Api` inbox source of truth для подписи - API
  Channel webhook secret (`channel_api.secret` в Chatwoot v4.13+), а не account
  webhook secret;
- webhook tenant определяется по host callback URL;
- webhook signature валидируется tenant webhook secret;
- payload account/inbox должен соответствовать tenant Chatwoot config;
- доставка webhook записывается для dedupe/recovery;
- webhook routing резолвит Chatwoot conversation id обратно в
  `portal_chat_threads`;
- realtime fanout key включает tenant и `threadId`;
- перед доставкой group-thread event конкретному subscriber backend повторно
  валидирует актуальный доступ пользователя к thread;
- browser не подписывается напрямую на Chatwoot events.

Presence/read/typing rules:

- portal user read sync goes through backend and Chatwoot Public API only after
  latest incoming messages are visible near the transcript bottom;
- group read sync uses Chatwoot's shared group contact semantics and is
  intentionally `any participant read`;
- portal typing sync and agent typing display are transient: no messages,
  unread rows, push notifications or read receipts are created by typing events.

Callback route:

```text
/api/chatwoot/webhooks
```

### PWA Identity

Tenant-aware PWA endpoints:

- `/api/tenant/manifest.webmanifest`;
- `/api/tenant/apple-touch-icon.png`;
- `/api/tenant/icons/:iconName`.

Правила:

- manifest `id`, `name`, `short_name`, `start_url`, `scope`, colors и icon URLs строятся по current tenant;
- iOS Home Screen icon тоже tenant-aware;
- tenant PWA icon routes могут использовать активный tenant-owned `pwa_icon`
  asset из branding storage, а при его отсутствии сохраняют fallback redirects;
- versioned tenant PWA icon routes отдают immutable cache только при совпадении
  requested asset version с active asset version и проверяют asset id перед
  streaming; unversioned Apple icon route остается `no-store`;
- tenant dynamic metadata отдается с `no-store`;
- service worker не кэширует tenant dynamic metadata;
- production service worker кэширует только app shell/assets, не перехватывает
  `/api/*` и не становится source of truth для backend данных;
- browser offline state хранится в scoped IndexedDB `portal-offline`; текстовая
  outbox является frontend-domain модулем, а backend остается authority для
  session, send и freshness;
- installability в production требует HTTPS;
- iOS/iPadOS используют Add to Home Screen, а не Chromium-style install prompt.

## Data Model

Минимальный runtime-набор таблиц portal database:

- `portal_tenants`;
- `portal_users`;
- `portal_sessions`;
- `verification_records`;
- `portal_user_contact_links`;
- `portal_chat_threads`;
- `portal_chat_message_sends`;
- `portal_rate_limit_buckets`;
- `chatwoot_webhook_deliveries`;
- `portal_user_notification_preferences`;
- `portal_chat_notification_preferences`;
- `portal_push_subscriptions`;
- `portal_push_deliveries`;
- `portal_chat_unread_messages`.
- `portal_branding_settings`;
- `portal_branding_assets`.

Принципиальные правила:

- все customer-owned и chat-owned таблицы имеют `tenant_id`;
- уникальность users, contact links, chat threads, send ledger и webhook
  deliveries учитывает tenant scope;
- `portal_users.email` не является глобально уникальным;
- `verification_records` обслуживает registration и password reset;
- continuation token fields остаются в `verification_records`;
- tenant Chatwoot secrets хранятся encrypted/backend-only;
- encryption key для tenant secrets задается через `PORTAL_TENANT_SECRET_KEY`;
- single-tenant `CHATWOOT_*` env values не являются runtime source of truth и
  не используются как bootstrap/dev input; bootstrap идет только через
  tenant-owned `DEFAULT_TENANT_CHATWOOT_*` values.

## API Surface

API `v2` остается простым и явным:

- `REST JSON` для большинства запросов;
- `multipart/form-data` только для attachment upload;
- request/response contracts валидируются на backend;
- frontend общается с backend same-origin.

Основные route groups:

- `/api/health`;
- `/api/tenant`;
- `/api/tenant/manifest.webmanifest`;
- `/api/tenant/apple-touch-icon.png`;
- `/api/tenant/icons/:iconName`;
- `/api/auth/login`;
- `/api/auth/logout`;
- `/api/auth/me`;
- `/api/auth/register/request`;
- `/api/auth/register/verify`;
- `/api/auth/register/set-password`;
- `/api/auth/password-reset/request`;
- `/api/auth/password-reset/verify`;
- `/api/auth/password-reset/set-password`;
- `/api/profile`;
- `/api/profile/avatar`;
- `/api/branding`;
- `/api/branding/assets/:assetId`;
- `/api/admin/auth/request`;
- `/api/admin/auth/verify`;
- `/api/admin/auth/me`;
- `/api/admin/auth/logout`;
- `/api/admin/branding`;
- `/api/admin/branding/assets/:kind`;
- `/api/chat/threads`;
- `/api/chat/threads/:threadId/info`;
- `/api/chat/messages`;
- `/api/chat/messages/attachment`;
- `/api/chat/threads/:threadId/attachments/:messageId/:attachmentId`;
- `/api/chat/threads/:threadId/attachments/:messageId/:attachmentId/thumb`;
- `/api/chat/threads/:threadId/avatar`;
- `/api/chat/threads/:threadId/messages/:messageId/avatar`;
- `/api/chat/threads/:threadId/participants/:participantUserId/avatar`;
- `/api/chat/threads/:threadId/media`;
- `/api/chat/threads/:threadId/search`;
- `/api/chat/threads/:threadId/messages/context`;
- `/api/chat/support-availability`;
- `/api/chat/threads/:threadId/read`;
- `/api/chat/threads/:threadId/typing`;
- `/api/notifications/settings`;
- `/api/chat/threads/:threadId/notification-settings`;
- `/api/notifications/push/public-key`;
- `/api/notifications/push/subscriptions`;
- `/api/chat/realtime`;
- `/api/chatwoot/webhooks`.

## Repository Shape

```text
chatwoot-client-portal-v2/
  docs/
  backend/
    src/
      config/
      db/
      integrations/
      lib/
      modules/
      scripts/
      test/
      types/
  frontend/
    src/
      app/
      assets/
      features/
      pwa/
      shared/
      test/
```

### Backend Modules

- `health` - readiness/health endpoints;
- `tenants` - host resolution, tenant runtime config, secret handling, public tenant context and PWA identity;
- `auth` - login, logout, current user and session handling;
- `registration` - eligibility, verification request/confirm and password setup completion;
- `password-reset` - reset request, verification and password update;
- `profile` - read-only current user profile, avatar upload and current-avatar proxy;
- `branding` - tenant-scoped public/admin branding settings read model,
  backend-owned asset upload/read/delete routes and admin update boundary;
- `portal-users` - portal user persistence helpers;
- `chat-threads` - portal-owned thread listing, access validation and Chatwoot conversation mapping;
- `chat-messages` - history, text send, attachment send, attachment proxy, media, search and send ledger;
- `chat-support` - tenant-scoped support availability and working-hours state;
- `chat-notifications` - tenant/user/thread scoped notification preferences, Web Push subscriptions and push delivery;
- `chat-presence` - customer read sync and portal typing sync through backend authority;
- `chat-unread` - backend-owned unread rows and counts for visible threads;
- `chat-realtime` - SSE admission, stream lifecycle and backend fanout;
- `chatwoot-webhooks` - signed webhook validation, delivery bookkeeping and scoped fanout;
- `maintenance` - portal-only retention cleanup for service traces;
- `tenant-admin` - separate admin login/session/audit boundary for tenant-owned admin flows;
- `integrations/chatwoot` - Chatwoot API client;
- `integrations/email` - email delivery adapter.

### Frontend Features

- `tenant` - public tenant context and tenant identity metadata;
- `auth` - registration, password reset, login/logout/me UI;
- `admin-auth` - separate tenant-admin login/session UI over backend admin auth;
- `admin-branding` - admin branding API client, draft state, settings form,
  asset upload controls and live preview components;
- `admin-shell` - protected admin console shell and `/admin/branding` page wiring;
- `chat` - threads, transcript, composer, attachments, media, search, support availability, chat-level notifications and realtime updates;
- `profile` - protected read-only profile page and avatar upload flow;
- `offline` - IndexedDB tenant/auth/chat snapshots, local device data removal, durable text outbox and background outbox drain support;
- `settings` - user-level notification settings;
- `pwa` - service worker registration and PWA runtime support;
- `shared` - reusable non-domain UI/lib helpers.

## Next Architecture Work

### MT-9 Tenant Admin And Branding

Текущая крупная зона - tenant-owned admin и branding поверх уже готового
tenant-aware runtime.

Зафиксированное направление:

- branding settings tenant-scoped;
- branding asset metadata хранится в portal DB, binary content - в
  S3-compatible object storage;
- локальная разработка использует тот же object-storage подход через
  MinIO/compatible service;
- tenant admin login отдельный от customer login;
- для admin verification добавлен отдельный encrypted per-tenant Chatwoot
  admin-verification token boundary;
- `MT-9B` добавил backend-only tenant admin auth foundation: login challenges,
  email code verification, отдельный signed admin session cookie, logout и
  tenant-scoped audit events;
- `MT-9C` добавил отдельный React admin login/session UI, защищенный
  `/admin/branding` shell и разделение customer/admin route-session boundaries;
- `MT-9D` добавил tenant-owned branding settings persistence, public/admin
  branding APIs, admin audit events and first admin UI data wiring without
  binary asset upload;
- `MT-9E` добавил S3-compatible branding asset storage, backend-owned
  upload/read/delete routes, tenant-scoped public asset reads, image signature
  validation, opaque public asset versions and custom tenant PWA icon routing
  without exposing object keys/checksums to browser;
- `MT-9F` добавил защищенные admin controls для загрузки, замены и удаления
  logo, PWA icon and auth/chat image slots; admin preview использует только
  portal-owned asset URLs и не получает object-storage keys/checksums;
- `MT-9G` применил public branding к реальным customer auth/chat/chat-info
  surfaces: цвета, тексты, logo, auth/chat фоновые изображения и chat header
  background идут через portal-owned runtime state; PWA manifest colors также
  берутся из tenant branding settings;
- admin code хранится через slow password-hash boundary, admin session token
  хранится только как hash;
- Chatwoot permissions spike по `F-MT-004` закрыт в `MT-9A`;
- runtime Chatwoot token и admin-verification authority - разные security
  boundaries.

### Future Product Areas

Новые portal-owned domains добавляются отдельными slices и не смешиваются с
auth/chat runtime:

- dashboard;
- notification center and broader notification policy;
- documents;
- tasks;
- service requests;
- profile expansion beyond the current read-only/avatar slice.

Chatwoot остается system of record только для chat-domain данных, пока не
появится отдельная внешняя authoritative система.

### Не Является Текущей Целью

- browser-direct Chatwoot runtime;
- path-based production tenancy;
- Chatwoot core customization;
- private client-to-client chats inside portal;
- platform/operator admin.

## Что Считать Успешным `v2`

`v2` считается архитектурно успешным, если:

- tenant boundary применяется до customer/admin runtime;
- browser не получает прямую Chatwoot authority;
- portal database изолирована от Chatwoot database;
- customer/session/chat persistence tenant-scoped;
- Chatwoot account/inbox/token/webhook secret берутся из tenant config;
- dedicated install работает как one-tenant multi-tenant portal;
- shared SaaS работает как many-tenant portal;
- новые product domains добавляются отдельными modules/features, а не раздувают chat/auth;
- актуальная архитектура понятна по текущим docs и codebase.
