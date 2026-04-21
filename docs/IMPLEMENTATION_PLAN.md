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

## Phase 9. Hardening

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
11. Hardening

Мы не перепрыгиваем сразу к realtime или "красивому чату", пока не собрали auth, session, protected shell и backend authority.

## Что Нельзя Делать По Ходу Реализации

- тащить куски кода из `v1`;
- смешивать старую и новую архитектуру;
- брать тяжелые библиотеки "на всякий случай";
- строить многоуровневые абстракции до появления реальной боли;
- считать фазу завершенной без тестов и ручной проверки.
