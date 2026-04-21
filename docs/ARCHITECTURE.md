# Архитектурный Фундамент

## Назначение документа

Этот документ фиксирует стартовую архитектуру `chatwoot-client-portal-v2`.

Его задача:

- зафиксировать, что именно мы строим;
- определить source of truth;
- выбрать стек;
- зафиксировать ключевые технические ограничения;
- не дать новому проекту снова превратиться в смесь старых и новых решений.

Это не "раз и навсегда завершенная архитектурная энциклопедия". Это стабильный фундамент, на который дальше будут нарастать более детальные документы по API, database schema, deployment и тестированию.

## Что За Продукт

`Chatwoot Client Portal v2` - это отдельный клиентский портал поверх существующего self-hosted Chatwoot.

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
- при необходимости старый проект используется только как reference;
- переносим не код, а знания о продукте, найденных рисках и ошибках.

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

- portal users;
- verification records;
- password reset records;
- portal user -> Chatwoot contact links;
- portal user -> authoritative Chatwoot conversation mappings;
- send ledger;
- webhook delivery bookkeeping.

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

## Принятый Продуктовый Контур

Для `v2` принимаем следующие бизнес-правила:

- один портал-деплой = один business = один Chatwoot account;
- один портал-деплой использует один выделенный Chatwoot `Channel::Api` inbox;
- один portal user связан с одним Chatwoot contact;
- основной чат портала - один primary conversation;
- если contact существует, но в выделенном inbox еще нет portal conversation, первый send может bootstrap-нуть первый conversation;
- если внутри выделенного portal inbox позже окажется несколько conversation для этого contact, authoritative primary conversation остается первый созданный portal conversation;
- отправка сообщений остается conversation-based, а не transport-based;
- realtime-маршрутизация строится через backend и persisted authoritative conversation mapping.

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
- один primary chat;
- загрузка истории;
- text send;
- `reply state`;
- `quick emoji bar`;
- `message calendar`;
- single-file attachment send;
- `voice recording and send`;
- backend-authenticated realtime.

### Out Of Scope

- multi-chat UX;
- conversation switching;
- search по истории;
- advanced filters;
- offline outbox;
- mobile app;
- Chatwoot core customization;
- browser-direct Chatwoot widget/runtime.

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
5. Chatwoot шлет signed webhooks в portal backend.
6. Portal backend валидирует событие, резолвит portal routing и отправляет обновление в browser через SSE.

## Prototype Reference Rules

- HTML-прототипы в `frontend/screens/` остаются visual и UX reference, а не кодовой основой.
- HTML, inline scripts, inline styles и `Tailwind Play CDN` из prototype files в код не переносим.
- `verify` и `set-password` экраны переиспользуются по одной базовой конструкции для двух auth-сценариев.
- `provgroup_chat_loading_screen.html` трактуем как внутреннее состояние route `/app/chat`, а не как отдельный product route.
- legacy `empty / not-ready / unavailable` chat screens не считаем самостоятельными продуктовыми экранами `v2`.

## Confirmed Chat UX Scope

Следующие chat-возможности уже подтверждены как продуктовый scope `v2` и не должны теряться из плана только потому, что ранние фазы заняты foundation-работой:

- `reply state`;
- `quick emoji bar`;
- `message calendar`;
- `voice recording and send`.

Эти возможности внедряются позже, отдельными slices, поверх backend-owned chat model.

## Authority Model

### Auth Authority

- только portal backend;
- browser знает только о portal session;
- Chatwoot auth не доступен браузеру.

### Chat Context Authority

- portal backend выбирает и возвращает current chat context;
- browser не выбирает conversation самостоятельно по косвенным признакам;
- browser не имеет права считать какой conversation "главный" без backend response.

### Send Authority

- backend отправляет сообщение в Chatwoot conversation API;
- browser не отправляет напрямую в Chatwoot;
- idempotency и send recovery принадлежат backend-слою.

### Realtime Authority

- Chatwoot webhook -> portal backend -> portal browser;
- routing строится только по backend-owned conversation mapping;
- browser не делает direct subscription к Chatwoot events.

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
  Переиспользуемые ui, lib, api-client, form helpers, constants.

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
  бизнес-модули: `auth`, `registration`, `password-reset`, `chat-context`, `chat-messages`, `chat-realtime`, `chatwoot-webhooks`.
- `lib/`
  общие ошибки, guards, utilities.

## Модули Домена, Которые Должны Появиться В `v2`

### Backend Modules

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
  Signed webhook validation, delivery bookkeeping, route resolution, scoped fanout.
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

## Начальная Модель Данных

Минимальный ожидаемый набор таблиц в portal database:

- `portal_users`
- `verification_records`
- `password_reset_records`
- `portal_user_contact_links`
- `portal_user_chatwoot_conversations`
- `portal_chat_message_sends`
- `chatwoot_webhook_deliveries`

Принципиальные замечания:

- transport table в `v2` не создается;
- `portal_user_chatwoot_conversations` хранит authoritative mapping;
- `portal_chat_message_sends` нужен для idempotency и recovery;
- webhook delivery bookkeeping нужен для dedupe и безопасной обработки повторных доставок.

## Session И Security Model

- только `httpOnly` cookie session;
- cookie должна быть `secure` в production;
- same-origin API обязателен;
- для mutating routes нужен CSRF-safe подход:
  - как минимум строгая origin check стратегия;
  - при необходимости добавим explicit CSRF token layer;
- никаких auth tokens в `localStorage`;
- никаких Chatwoot secrets в frontend;
- все env secrets доступны только backend;
- signed Chatwoot webhooks обязательны;
- upload validation делается на backend.

## API Подход

API `v2` остается простым и явным:

- `REST JSON` для большинства запросов;
- `multipart/form-data` только для attachment upload;
- response shape должен быть стабильным и скучным, без неоднозначных "универсальных" оберток;
- request/response contracts валидируются на backend и типизируются на frontend.

Предварительный набор route groups:

- `/api/auth/*`
- `/api/registration/*`
- `/api/password-reset/*`
- `/api/chat/*`
- `/api/integrations/chatwoot/webhooks`

Окончательные endpoint names мы утвердим на этапе scaffold backend API.

## Правила Реализации

- начинаем не с "красивого экрана", а с архитектурного каркаса;
- каждый слой должен иметь одну четкую ответственность;
- сначала строим happy path, затем edge cases;
- не открываем новую большую фазу, пока предыдущая не закрыта тестами и ручной проверкой;
- если возникает желание добавить новый абстрактный слой, сначала доказываем, что без него уже больно;
- новые решения должны быть понятны не только ИИ, но и человеку без глубокого бэкграунда.

## Что Считать Успешным `v2`

`v2` считается удачным только если одновременно выполнены все условия:

- код реально проще читать, чем `v1`;
- архитектурные роли не смешаны;
- бизнес-правила зафиксированы документально;
- нет возврата к browser-direct authority модели;
- новая кодовая база не требует transitional layers из старой версии;
- критичные пользовательские сценарии проходят стабильно и повторяемо.
