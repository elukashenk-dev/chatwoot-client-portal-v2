# Архитектурный Фундамент

## Назначение документа

Этот документ фиксирует стартовую и текущую архитектурную рамку `chatwoot-client-portal-v2`.

Его задача:

- зафиксировать, что именно мы строим;
- определить source of truth;
- выбрать стек;
- зафиксировать ключевые технические ограничения;
- не дать новому проекту снова превратиться в смесь старых и новых решений.

Это не "раз и навсегда завершенная архитектурная энциклопедия". Это стабильный фундамент, на который дальше будут нарастать более детальные документы по API, database schema, deployment и тестированию.

## Что За Продукт

`Chatwoot Client Portal v2` - это отдельный tenant-aware клиентский портал поверх Chatwoot.

Целевая бизнес-модель:

- shared SaaS: один portal deploy обслуживает много B2B-компаний;
- dedicated install: отдельный portal deploy обслуживает одного tenant и отдельный Chatwoot;
- dedicated install не является отдельной архитектурой, а работает как multi-tenant portal с одним tenant.

Каждая B2B-компания в портале - это отдельный `tenant`. Tenant владеет своим доменом, пользователями, sessions, Chatwoot account/inbox, webhook secret, branding и будущими admin-настройками.

Пользовательский сценарий MVP:

- существующий Chatwoot contact может пройти eligibility check;
- подтвердить email;
- задать пароль;
- войти в портал;
- открыть защищенную клиентскую зону;
- увидеть свой основной чат;
- загрузить историю сообщений;
- отправить текст;
- отправить один файл;
- получать realtime-обновления.

Проект не является модификацией Chatwoot core. Chatwoot остается внешней системой по отношению к этому репозиторию.

## Ключевые Принципы

### 1. `v2` - это новый проект, а не рефакторинг `v1`

- код из `v1` не переносится;
- старый проект больше не используется как reference или источник product context;
- не переносим из старого проекта код, идеи, зависимости, runtime-подходы, данные или выводы.

### 2. Browser не должен иметь прямую operational authority над Chatwoot

- браузер не хранит Chatwoot tokens;
- браузер не открывает прямой Chatwoot runtime;
- браузер не делает direct auth/send/realtime against Chatwoot;
- весь доступ к Chatwoot идет только через portal backend.

### 3. Backend - единственная authority-зона портала

Portal backend отвечает за:

- auth;
- session;
- eligibility;
- verification;
- password setup;
- password reset;
- access control;
- chat context resolution;
- send authority;
- realtime fanout.

### 4. Chatwoot - system of record для chat domain

Chatwoot остается источником истины для:

- contacts;
- conversations;
- messages;
- attachments.

Portal database хранит только portal-owned данные и локальные технические связи:

- portal tenants;
- portal users;
- portal sessions;
- verification records for registration and password reset email-code flows;
- portal user -> Chatwoot contact links;
- portal user -> authoritative Chatwoot conversation mappings;
- send ledger;
- webhook delivery bookkeeping;
- tenant-owned branding/admin settings when those modules return.

Для `v2` эта portal database должна жить отдельно от runtime-базы самого `Chatwoot`, а не внутри нее.

### 5. Предпочитаем boring architecture

Мы сознательно выбираем:

- простые модули;
- явные границы;
- маленькие сервисы;
- предсказуемые API;
- минимально достаточные зависимости.

Мы сознательно избегаем:

- "умных" универсальных абстракций без реальной необходимости;
- скрытых fallback chains;
- переходных совместимостей ради старого кода;
- больших generated UI layers в начале проекта.

### 6. Tenant boundary является обязательной runtime-границей

- tenant должен быть определен до auth/session/chat/admin runtime;
- production tenant resolution идет по `Host`/domain;
- принята production domain convention: `lk.<client-domain>`;
- неизвестный host hard-fails, а не падает в default tenant;
- browser не выбирает tenant через request body или произвольный параметр;
- tenant-owned database rows читаются и пишутся только с `tenant_id`;
- tenant-specific Chatwoot config приходит из tenant runtime config, а не из глобальных `CHATWOOT_ACCOUNT_ID` / `CHATWOOT_PORTAL_INBOX_ID`;
- old single-tenant env names могут остаться только как bootstrap/dev input, но не как runtime authority;
- переходное состояние, где tenant resolution уже включен, а users/sessions/chat/webhooks еще не tenant-scoped, считается unsafe для shared SaaS runtime;
- до завершения tenant-scoped persistence, customer auth, chat runtime и webhooks customer runtime должен работать только в default-tenant/one-tenant режиме или hard-fail для non-default tenants.

## Принятый Продуктовый Контур

Старый single-tenant контур "один portal deploy = один business = один Chatwoot account" superseded. Он остается поддерживаемым только как частный dedicated режим:

```text
one portal deploy -> one tenant -> one Chatwoot account/inbox
```

Новая целевая модель:

- один portal deploy может обслуживать одного или много tenants;
- каждый tenant связан со своим Chatwoot account и одним выделенным portal/API inbox;
- tenant определяется по normalized `Host`/domain до auth и до любых customer/admin runtime действий;
- production host convention: `lk.<client-domain>`, например `lk.buhfirma.ru`, `lk.stroyfirma.ru`, `lk.zubi.ru`;
- один portal user принадлежит одному tenant и связан с одним Chatwoot contact внутри tenant Chatwoot account;
- email не считается глобально уникальным, корректная уникальность - `tenant_id + email`;
- tenant session действует только внутри tenant, для которого она создана;
- основной чат портала остается одним вечным primary conversation, но теперь это `primary conversation per tenant user`;
- portal inbox каждого tenant должен быть настроен как `Conversation Routing -> Reopen same conversation` (`lock_to_single_conversation = true`);
- проверка и восстановление portal inbox routing выполняются tenant-aware;
- если contact существует, но в tenant portal inbox еще нет portal conversation, первый send может bootstrap-нуть первый conversation;
- если mapped primary conversation был удален в Chatwoot и fresh resolve показывает ноль оставшихся tenant portal conversations в выделенном inbox, следующий send может bootstrap-нуть replacement conversation;
- если у authenticated portal user еще нет локального contact link, backend может связать его с Chatwoot contact по exact email match только внутри current tenant;
- несколько portal conversations для одного contact внутри tenant portal inbox считаются legacy/config/data anomaly, а не целевой продуктовой моделью;
- клиентский портал не объединяет несколько Chatwoot conversations в одну synthetic transcript первой версией;
- если mapped primary conversation был resolved в Chatwoot, следующий portal send должен работать с тем же conversation, а не создавать новый;
- отправка сообщений остается conversation-based, а не transport-based;
- realtime-маршрутизация строится через backend, `tenant_id` и persisted authoritative conversation mapping.

## Что Сознательно Не Переносим Из `v1`

- Framework7 frontend runtime;
- legacy browser-direct Chatwoot access;
- `localStorage`-session как auth source of truth;
- transport-centric send model;
- transport fallback как routing authority;
- совместимость со старой архитектурой ради самой совместимости;
- большие transitional layers, которые нужны только чтобы "не переписать до конца".

## Scope `v2` MVP

### In Scope

- eligibility check для регистрации;
- email verification;
- password setup;
- login/logout;
- `/api/auth/me`;
- forgot/reset password;
- защищенный клиентский вход;
- tenant foundation: tenant schema, host resolution, tenant-bound sessions and tenant-aware Chatwoot config;
- один primary chat;
- загрузка истории;
- text send;
- `reply state`;
- `message calendar`;
- single-file attachment send;
- `voice recording and send`;
- backend-authenticated realtime.
- tenant-aware PWA manifest/metadata foundation.

### Out Of Scope

- multi-chat UX;
- conversation switching;
- search по истории;
- advanced filters;
- offline outbox;
- mobile app;
- Chatwoot core customization;
- browser-direct Chatwoot widget/runtime.
- path-based production tenancy;
- platform admin UI before tenant runtime foundation;
- merge старой ветки `feature/phase-10-portal-branding-admin` как есть.

## Рекомендуемый Стек `v2`

### Frontend

- `React`
- `TypeScript`
- `Vite`
- `Tailwind CSS`
- `Preline` headless plugins по мере реальной необходимости
- `Web App Manifest + Service Worker foundation`

### Backend

- `Node.js 24.x`
- `Fastify`
- `TypeScript`
- `Zod`

### Database

- `PostgreSQL`
- `Drizzle ORM`

### Realtime

- `Server-Sent Events` между portal backend и browser
- signed Chatwoot webhooks как upstream trigger

### Testing

- `Vitest` для frontend/backend unit и integration
- `Playwright` для browser end-to-end

### Tooling

- `pnpm`
- `ESLint`
- `Prettier`

### PWA Foundation

- web app manifest обязателен;
- `display: standalone` обязателен;
- нужны app icons для install flow;
- service worker нужен как foundation для installability и дальнейшего offline/app-like поведения;
- Chrome/Edge/Android install prompt зависит от installability criteria;
- iOS/iPadOS устанавливают web app через Add to Home Screen, а не через Chromium-style install prompt;
- продовый deploy для installability должен идти по `HTTPS`.

## Почему Не Берем Более "Магические" Варианты На Старте

На старте сознательно не берем:

- fullstack meta-framework с сильной server/client магией;
- тяжелую generated component library;
- state management library "на всякий случай";
- сложную monorepo-инфраструктуру с лишними внутренними пакетами.

Причина простая: нам нужен читаемый и устойчивый код, который легко сопровождать, а не модный стек с большим количеством скрытых правил.

При этом `Preline` допустим как легкий слой headless plugins, если мы подключаем его адресно, только под реально используемые компоненты.

## Высокоуровневая Схема Системы

Основной поток:

1. Browser загружает frontend portal.
2. Frontend общается только с portal backend по same-origin `/api`.
3. Portal backend читает и пишет portal-owned данные в PostgreSQL.
4. Portal backend ходит в Chatwoot account API для contacts, conversations, messages и attachments.
5. Chatwoot шлет signed webhooks в tenant-specific portal endpoint.
6. Portal backend валидирует tenant webhook secret, резолвит tenant-scoped routing и отправляет обновление в browser через SSE.

Tenant-aware поток:

1. Browser приходит на `lk.<client-domain>`.
2. Backend нормализует `Host` и резолвит `currentTenant`.
3. Auth/session, origin guard, Chatwoot client config, database queries и realtime fanout используют `currentTenant`.
4. Unknown host получает controlled failure без fallback к default tenant.

## Prototype Reference Rules

- HTML-прототипы в `frontend/screens/` остаются visual и UX reference, а не кодовой основой.
- HTML, inline scripts, inline styles и `Tailwind Play CDN` из prototype files в код не переносим.
- `verify` и `set-password` экраны переиспользуются по одной базовой конструкции для двух auth-сценариев.
- `provgroup_chat_loading_screen.html` трактуем как внутреннее состояние route `/app/chat`, а не как отдельный product route.
- legacy `empty / not-ready / unavailable` chat screens не считаем самостоятельными продуктовыми экранами `v2`.

## Confirmed Chat UX Scope

Следующие chat-возможности уже подтверждены как продуктовый scope `v2` и не должны теряться из плана только потому, что ранние фазы заняты foundation-работой:

- `reply state`;
- `message calendar`;
- `voice recording and send`.

Эти возможности внедряются позже, отдельными slices, поверх backend-owned chat model.

## Authority Model

### Auth Authority

- только portal backend;
- browser знает только о portal session;
- session lookup проверяет `tenant_id` и current tenant;
- Chatwoot auth не доступен браузеру.

### Chat Context Authority

- portal backend выбирает и возвращает current chat context;
- chat context resolution получает tenant явно;
- browser не выбирает conversation самостоятельно по косвенным признакам;
- browser не имеет права считать какой conversation "главный" без backend response.

### Send Authority

- backend отправляет сообщение в Chatwoot conversation API;
- backend использует tenant-specific Chatwoot config;
- browser не отправляет напрямую в Chatwoot;
- idempotency и send recovery принадлежат backend-слою.

### Realtime Authority

- Chatwoot webhook -> portal backend -> portal browser;
- routing строится только по tenant-scoped backend-owned conversation mapping;
- browser не делает direct subscription к Chatwoot events.

### Tenant Authority

- tenant resolution идет по normalized host;
- browser получает только public tenant/branding context;
- Chatwoot account ID, inbox ID, API token и webhook secret остаются backend-only tenant config;
- глобальные `CHATWOOT_ACCOUNT_ID` и `CHATWOOT_PORTAL_INBOX_ID` не используются как runtime authority.

## Целевая Структура Репозитория

```text
chatwoot-client-portal-v2/
  docs/
    ARCHITECTURE.md
    IMPLEMENTATION_PLAN.md
    DECISIONS.md
  frontend/
    src/
      app/
      pages/
      features/
      shared/
  backend/
    src/
      app/
      config/
      db/
      integrations/
      modules/
        tenants/
      lib/
```

### Frontend Structure

- `app/`
  Глобальная инициализация, router, providers, app shell.
- `pages/`
  Route-level screens без тяжелой бизнес-логики внутри.
- `features/`
  Бизнес-фичи: `auth`, `registration`, `password-reset`, `chat`.
- `shared/`
  Только переиспользуемые недоменные ui/lib/theme helpers без бизнес-логики документов, тарифов, задач, уведомлений и других feature-specific правил.

### Backend Structure

- `app/`
  Сборка приложения и регистрация routes/plugins.
- `config/`
  env parsing и runtime configuration.
- `db/`
  schema, migrations, db client.
- `integrations/`
  Chatwoot client, email delivery adapter и другие внешние adapters.
- `modules/`
  бизнес-модули: `tenants`, `auth`, `registration`, `password-reset`, `chat-context`, `chat-messages`, `chat-realtime`, `chatwoot-webhooks`.
- `lib/`
  общие ошибки, guards, utilities.

## Модули Домена, Которые Должны Появиться В `v2`

### Backend Modules

- `tenants`
  Host resolution, tenant runtime config, secret handling и public tenant context.
- `auth`
  Login, logout, current user, session handling.
- `registration`
  Eligibility, verification request, verification confirm, set password completion.
- `password-reset`
  Forgot password, reset confirm.
- `chat-context`
  Resolve linked contact, authoritative primary conversation и ready/not_ready state.
- `chat-messages`
  History, text send, attachment send, idempotency ledger.
- `chat-realtime`
  SSE stream admission, stream lifecycle, backend fanout.
- `chatwoot-webhooks`
  Tenant-specific signed webhook validation, delivery bookkeeping, route resolution, scoped fanout.
- `chatwoot`
  Небольшой integration client, разбитый по зонам ответственности, а не один giant file.

### Frontend Features

- `auth`
  Login/logout/me.
- `registration`
  Registration flow step by step.
- `password-reset`
  Request and confirm reset.
- `chat`
  Context load, transcript render, composer, retry, attachment send, realtime updates.

### Следующий Product Growth Path

После chat MVP новые крупные portal-фичи добавляются отдельными feature-slices, а не доклеиваются в уже существующий `chat` или в общий `components/` слой.

Подтвержденные следующие frontend области:

- `dashboard`
  Главная и центр поддержки.
- `notifications`
  Push permissions, unread badges, notification preferences.
- `branding`
  Tenant-owned theme tokens, logo, иллюстрации и branded assets. Старая branch `feature/phase-10-portal-branding-admin` не мержится как есть; branding возвращается после tenant foundation.
- `tariff`
  Текущий тариф, лимиты и SLA.
- `documents`
  Списки документов, статусы, download/upload entrypoints.
- `tasks`
  Дедлайны, задачи клиента и команды.
- `service-requests`
  Запрос доп. услуги и изменения обслуживания.
- `profile`
  Профиль, команда, настройки.

Правило роста:

- `chat` остается только chat-domain фичей;
- task/document-specific контекст вокруг чата не должен раздувать `ChatPage`;
- page-level orchestration живет в feature pages;
- локальные subcomponents/hooks/test helpers живут рядом с feature-кодом, а не в глобальном общем слое.

### Следующий Backend Growth Path

Для portal-owned domain поверх Chatwoot добавляем отдельные backend modules:

- `dashboard`
- `notifications`
- `notification-preferences`
- `portal-branding`
- `tenant-admin`
- `tariffs`
- `documents`
- `tasks`
- `service-requests`
- `profile`

Chatwoot остается system of record только для `contacts/conversations/messages/attachments`. Личный кабинет, тарифы, документы, задачи, branding и notification preferences считаются portal-owned backend domain, пока не появится отдельная внешняя authoritative система.

## Начальная Модель Данных

Минимальный ожидаемый набор таблиц в portal database:

- `portal_tenants`
- `portal_users`
- `portal_sessions`
- `verification_records`
- `portal_user_contact_links`
- `portal_user_chatwoot_conversations`
- `portal_chat_message_sends`
- `chatwoot_webhook_deliveries`

Принципиальные замечания:

- transport table в `v2` не создается;
- отдельная `password_reset_records` table не создается: password reset использует `verification_records` с `purpose = password_reset`;
- `portal_user_chatwoot_conversations` хранит authoritative mapping;
- `portal_chat_message_sends` нужен для idempotency и recovery;
- webhook delivery bookkeeping нужен для dedupe и безопасной обработки повторных доставок.

Tenant-aware требования к данным:

- все customer-owned и chat-owned таблицы получают `tenant_id`;
- уникальность users, contact links, conversation mappings, send ledger и webhook deliveries должна учитывать tenant scope;
- `portal_users.email` больше не является глобально уникальным;
- Chatwoot contact/conversation IDs не сравниваются глобально без tenant scope, потому что разные Chatwoot installations/accounts могут иметь одинаковые numeric IDs;
- tenant Chatwoot secrets хранятся как backend-only encrypted/secret-managed значения, а не как публичные settings.

## Session И Security Model

- только `httpOnly` cookie session;
- cookie должна быть `secure` в production;
- same-origin API обязателен;
- tenant должен быть resolved до session lookup;
- session table хранит `tenant_id`, а `/api/auth/me` проверяет session только внутри current tenant;
- для mutating routes нужен CSRF-safe подход:
  - как минимум строгая tenant-aware origin check стратегия;
  - при необходимости добавим explicit CSRF token layer;
- никаких auth tokens в `localStorage`;
- никаких Chatwoot secrets в frontend;
- все env secrets доступны только backend;
- signed Chatwoot webhooks обязательны;
- Chatwoot webhook secret является tenant-specific;
- upload validation делается на backend.

## API Подход

API `v2` остается простым и явным:

- `REST JSON` для большинства запросов;
- `multipart/form-data` только для attachment upload;
- response shape должен быть стабильным и скучным, без неоднозначных "универсальных" оберток;
- request/response contracts валидируются на backend и типизируются на frontend.

Предварительный набор route groups:

- `/api/auth/*`
- `/api/tenant`
- `/api/branding`
- `/api/registration/*`
- `/api/password-reset/*`
- `/api/chat/*`
- `/api/chatwoot/webhooks/:tenantSlug`

Окончательные endpoint names мы утвердим на этапе scaffold backend API.

## Правила Реализации

- начинаем не с "красивого экрана", а с архитектурного каркаса;
- перед новым product growth сначала закрываем tenant foundation;
- во время multi-tenant migration не включаем несколько runtime tenants для customer flows, пока не закрыты tenant-scoped persistence/auth/chat/webhooks;
- каждый слой должен иметь одну четкую ответственность;
- сначала строим happy path, затем edge cases;
- не открываем новую большую фазу, пока предыдущая не закрыта тестами и ручной проверкой;
- если возникает желание добавить новый абстрактный слой, сначала доказываем, что без него уже больно;
- новые решения должны быть понятны не только ИИ, но и человеку без глубокого бэкграунда.

## Code Health Guard

Перед следующими крупными slices проект обязан сам сигналить о распухающих файлах.

Для этого:

- в root workspace есть `pnpm code-health`;
- root `pnpm lint` сначала прогоняет `code-health`, потом package linters;
- production `ts/tsx` файлы ограничены `500` строками;
- test `ts/tsx` файлы ограничены `1000` строками;
- временный allowlist разрешен только для уже существующего debt baseline;
- allowlisted file не должен расти без отдельного refactor/debt decision;
- если oversized файл удалось опустить ниже лимита, его нужно убрать из allowlist, а не держать поблажку навсегда.

## Что Считать Успешным `v2`

`v2` считается удачным только если одновременно выполнены все условия:

- код реально проще читать, чем `v1`;
- код можно понимать без обращения к историческому контексту старого портала;
- архитектурные роли не смешаны;
- бизнес-правила зафиксированы документально;
- нет возврата к browser-direct authority модели;
- новая кодовая база не требует transitional layers из старой версии;
- критичные пользовательские сценарии проходят стабильно и повторяемо.
