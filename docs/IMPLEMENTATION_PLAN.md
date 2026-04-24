# План Реализации

## Главный Принцип

`v2` строится фазами. Мы не прыгаем сразу в "полный чат", не рисуем половину экранов заранее и не открываем одновременно все подсистемы.

Каждая фаза должна иметь:

- конкретную цель;
- набор deliverables;
- проверку готовности;
- понятный exit criterion.

Пока фаза не закрыта, следующая не начинается.

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
- `quick emoji bar`
  Идет отдельным slice после `Phase 6` как расширение composer UX, а не как отдельная routing-model.
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

Обязательная последовательность:

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

Мы не перепрыгиваем сразу к realtime или "красивому чату", пока не собрали auth, session, protected shell и backend authority.

## Что Нельзя Делать По Ходу Реализации

- тащить куски кода из `v1`;
- смешивать старую и новую архитектуру;
- брать тяжелые библиотеки "на всякий случай";
- строить многоуровневые абстракции до появления реальной боли;
- считать фазу завершенной без тестов и ручной проверки.
