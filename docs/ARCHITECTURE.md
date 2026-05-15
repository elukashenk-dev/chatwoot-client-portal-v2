# Архитектурный Фундамент

## Назначение Документа

Этот документ фиксирует текущий устойчивый архитектурный baseline `chatwoot-client-portal-v2`.

Его задача:

- коротко описать, что мы строим;
- зафиксировать главные границы ответственности;
- отделить актуальную архитектуру от superseded transitional-решений;
- дать понятную карту для следующих фаз.

Подробности по решениям, очередности работ и истории изменений живут в отдельных документах:

- `docs/DECISIONS.md` - принятые решения;
- `docs/IMPLEMENTATION_PLAN.md` - roadmap и MT-фазы;
- `docs/MULTI_TENANT_PORTAL_ARCHITECTURE_PLAN.md` - подробный multi-tenant technical reference;
- `docs/WORK_LOG.md` - короткий список реально завершенных шагов.

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
- будущими branding и tenant-admin настройками.

Текущий пользовательский контур:

- существующий Chatwoot contact может пройти registration eligibility check;
- пользователь подтверждает email, задает пароль и входит в портал;
- password reset работает через email-code flow;
- пользователь открывает защищенную клиентскую зону;
- пользователь видит один основной чат;
- backend загружает историю сообщений, отправляет текст, отправляет один файл и доставляет realtime-обновления;
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
- chat context resolution;
- send authority;
- attachment upload validation;
- realtime fanout;
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
- portal user -> authoritative Chatwoot conversation mappings;
- send ledger;
- webhook delivery bookkeeping.

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
stroyfirma -> chatwoot.shared.ru / account 4
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
- основной чат портала - это primary conversation per tenant user;
- browser не выбирает conversation самостоятельно;
- backend хранит authoritative mapping в portal database;
- Chatwoot contact/conversation IDs не считаются глобально уникальными без tenant scope;
- portal inbox tenant должен быть `Channel::Api`;
- portal inbox tenant должен иметь `lock_to_single_conversation = true`;
- если contact существует, но portal conversation еще нет, первый send может
  bootstrap-нуть conversation только под tenant-aware advisory lock, scoped by
  target Chatwoot contact/thread;
- если mapped primary conversation удален в Chatwoot и fresh resolve не находит
  оставшихся portal conversations, следующий send может bootstrap-нуть
  replacement conversation под тем же lock;
- несколько portal conversations для одного contact внутри tenant portal inbox считаются anomaly, а не целевой UX.

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
- browser не подписывается напрямую на Chatwoot events.

Основной callback route:

```text
/api/integrations/chatwoot/webhooks/account
```

Также существует совместимый backend route:

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
- tenant dynamic metadata отдается с `no-store`;
- service worker не кэширует tenant dynamic metadata;
- installability в production требует HTTPS;
- iOS/iPadOS используют Add to Home Screen, а не Chromium-style install prompt.

## Data Model

Минимальный runtime-набор таблиц portal database:

- `portal_tenants`;
- `portal_users`;
- `portal_sessions`;
- `verification_records`;
- `portal_user_contact_links`;
- `portal_user_chatwoot_conversations`;
- `portal_chat_message_sends`;
- `chatwoot_webhook_deliveries`.

Принципиальные правила:

- все customer-owned и chat-owned таблицы имеют `tenant_id`;
- уникальность users, contact links, conversation mappings, send ledger и webhook deliveries учитывает tenant scope;
- `portal_users.email` не является глобально уникальным;
- `verification_records` обслуживает registration и password reset;
- continuation token fields остаются в `verification_records`;
- transport table в `v2` не создается;
- tenant Chatwoot secrets хранятся encrypted/backend-only;
- encryption key для tenant secrets задается через `PORTAL_TENANT_SECRET_KEY`;
- env values legacy single-tenant вида допустимы только как bootstrap/dev input, а не как runtime source of truth.

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
- `/api/chat/context`;
- `/api/chat/messages`;
- `/api/chat/messages/attachment`;
- `/api/chat/realtime`;
- `/api/integrations/chatwoot/webhooks/account`;
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
- `portal-users` - portal user persistence helpers;
- `chat-context` - linked contact and authoritative primary conversation context;
- `chat-messages` - history, text send, attachment send and send ledger;
- `chat-realtime` - SSE admission, stream lifecycle and backend fanout;
- `chatwoot-webhooks` - signed webhook validation, delivery bookkeeping and scoped fanout;
- `integrations/chatwoot` - Chatwoot API client;
- `integrations/email` - email delivery adapter.

### Frontend Features

- `tenant` - public tenant context and tenant identity metadata;
- `auth` - registration, password reset, login/logout/me UI;
- `chat` - context load, transcript, composer, attachments and realtime updates;
- `pwa` - service worker registration and PWA runtime support;
- `shared` - reusable non-domain UI/lib helpers.

## Deferred And Future Areas

### MT-8R Codebase Audit And Refactoring Readiness

Перед `MT-8.5` и `MT-9` нужно провести controlled codebase audit после
`MT-1`-`MT-8`.

Цель:

- понять состояние backend/frontend/shared/tests areas;
- найти technical debt и code smells без немедленного хаотичного refactoring;
- классифицировать candidates как `must-fix-before-MT-9`,
  `safe-pre-MT-9-cleanup`, `defer` или `do-not-touch`;
- выполнять только bounded refactoring slices с targeted checks;
- удалить dead code только при наличии evidence, что он не используется;
- после refactoring повторно проверить tenant isolation, auth/session,
  webhooks/realtime and PWA tenant identity boundaries.

### MT-8.5 Portal UI/UX Baseline Review

Перед `MT-9`, после `MT-8R`, нужно утвердить текущий customer-facing UI shell
как branding baseline.

Цель:

- проверить реальные auth/forms/chat/PWA states на mobile и desktop;
- решить, какие части портала являются fixed product shell;
- решить, какие части станут tenant-brandable;
- определить preview screens для branding admin: login, registration/forms,
  chat и PWA/app identity;
- зафиксировать, что preview в `MT-9` использует реальные portal components, а
  не отдельную приблизительную копию интерфейса.

### MT-9 Tenant Admin And Branding

Branding/admin возвращается после tenant foundation и `MT-8.5` UI/UX baseline.

Archived branch `feature/phase-10-portal-branding-admin` не мержится как есть.

Зафиксированное направление:

- branding tenant-owned;
- branding asset metadata хранится в portal DB, binary content - в
  S3-compatible object storage;
- локальная разработка использует тот же object-storage подход через
  MinIO/compatible service, без local-files storage внутри portal контейнера;
- tenant admin login отдельный от customer login;
- для admin verification нужен отдельный encrypted per-tenant Chatwoot admin-verification token;
- перед MT-9 выполняется Chatwoot permissions spike;
- runtime Chatwoot token и admin-verification authority - разные security concerns.

### Platform Admin

Platform/operator admin - отдельная будущая зона.

Она не должна смешиваться с:

- customer auth;
- tenant admin auth;
- chat runtime;
- tenant-owned branding runtime.

### Product Growth

Новые portal-owned domains добавляются отдельными slices:

- dashboard;
- notifications;
- tariff;
- documents;
- tasks;
- service requests;
- profile;
- service/request workflows around chat.

Chatwoot остается system of record только для chat-domain данных, пока не появится отдельная внешняя authoritative система.

### Не Является Текущей Целью

- browser-direct Chatwoot runtime;
- path-based production tenancy;
- Chatwoot core customization;
- multi-chat UX;
- conversation switching;

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
