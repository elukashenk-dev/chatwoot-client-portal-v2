# Work Log

Короткая карта значимых завершенных шагов в `chatwoot-client-portal-v2`.

Мелкие UI-polish правки, preview labels, временные findings, промежуточные
эксперименты и детальные проверки здесь не перечисляются.

## Product Baseline

- Создан отдельный проект `v2`: frontend, backend, docs, isolated Postgres,
  env/bootstrap tooling и базовый workspace.
- Собран рабочий portal baseline поверх Chatwoot: auth/session, registration,
  password reset, protected app shell, chat read model, text send, attachments,
  realtime и PWA foundation.
- Chat domain закреплен как backend-owned portal layer: browser не получает
  Chatwoot authority, а Chatwoot остается system of record для contacts,
  conversations, messages и attachments.
- Подготовлен production deployment baseline: Dockerfiles, production
  compose/Caddy, installer/runbook и webhook secret sync flow.
- Старый `../chatwoot-client-portal` снят с reference-scope и больше не
  используется как источник контекста.
- Продуктовая рамка уточнена: `v2` - брендируемый tenant-aware клиентский
  PWA-слой поверх Chatwoot для B2B-компаний.

## Multi-Tenant Program

- Принята multi-tenant архитектура: shared SaaS обслуживает много tenants одним
  portal deploy, dedicated install остается supported как один tenant в той же
  архитектуре.
- Production domain convention зафиксирован как `lk.<client-domain>`.
- `MT-0`-`MT-8` завершены: tenant определяется по Host/domain, runtime Chatwoot
  config принадлежит current tenant, persistence/auth/chat/webhooks/frontend/PWA
  стали tenant-aware.
- Post-MT runtime review закрыт: tenant URL/domain, portal inbox routing и
  webhook payload validation приведены к tenant-safe модели.
- Для `MT-9` зафиксированы ключевые deferrals: tenant admin verification через
  отдельный encrypted per-tenant Chatwoot admin-verification token; branding
  assets хранятся как metadata в portal DB plus S3-compatible object storage.

## Codebase Readiness

- `MT-8R Codebase Audit And Refactoring Readiness` завершен: выполнены baseline
  inventory, technical debt analysis, code smells review, refactoring assessment
  и final review.
- `MT-8R-5A Password Policy Alignment` закрыт: registration и password reset
  backend используют единое правило пароля.
- Открытых `must-fix-before-MT-9` code findings не осталось; remaining findings
  назначены на `MT-8.5`, `MT-9`, `MT-10` или future focused experiments.
- Frontend review cleanup Task 1 закрыт: неиспользуемая зависимость
  `@preline/collapse` удалена после usage audit; frontend typecheck, tests,
  build и `git diff --check` прошли.
- Frontend review cleanup Task 2 закрыт: auth field/link style variants
  вынесены в shared UI без изменения UX; focused auth tests, frontend
  typecheck/tests/build, root lint и `git diff --check` прошли.
- Frontend review cleanup Task 4 закрыт: повторяемые Tailwind radius/shadow/text
  значения вынесены в CSS-first tokens/utilities без redesign; frontend
  typecheck/tests/build, root lint и `git diff --check` прошли.
- Frontend review cleanup Task 3 закрыт: chat header/message action menus
  получили keyboard focus entry, Escape/focus restore и hover/focus-only
  message action trigger без изменения chat bubble baseline; finding
  `F-CHAT-UI-002` закрыт, targeted chat tests, frontend typecheck/tests/build,
  root lint и `git diff --check` прошли.
- Frontend review cleanup Task 5 закрыт узким composer split: textarea rendering
  и textarea ref/resize/focus behavior вынесены в `ComposerTextarea` и
  `useComposerTextarea`; `ChatPage`, `MessageBubble`, send/attachment/voice
  orchestration и визуальный baseline не менялись; focused composer tests,
  frontend typecheck/tests/build, root lint и `git diff --check` прошли.

## MT-8.5 UI/UX Baseline

- Создана и отполирована `MT-8.5` product UI/UX спецификация branded
  UI-system: screen-by-screen cleanup, brandable matrix, text limits, fallback
  logic, content ownership, visual hierarchy, branding intensity и
  Implementation Done Checklist.
- Добавлены tenant bootstrap/lazy route splash и app loading/welcome screen.
- Auth baseline переработан для customer-facing portal: login, registration,
  password reset, OTP и set-password экраны приведены к общей структуре,
  нейтральным текстам, brandable slots и mobile/PWA ограничениям.
- Registration/password-reset OTP формы объединены через
  `OtpVerificationFormLayout`; registration/password-reset set-password формы
  объединены через `PasswordSetupFormLayout`.
- Chat UI начал переход к принятому customer-support паттерну: компактный header,
  tenant mark, future menu entry для `Чат / Центр поддержки`, action menu,
  composer alignment и более компактные transcript bubbles.
- Default auth branding assets добавлены в `frontend/public/default-branding/`.

## Chatwoot 4.13 And Production

- Выполнен compatibility fix для Chatwoot `v4.13.0` API Channel webhook signing:
  tenant webhook sync настраивает `Channel::Api` inbox `webhook_url`, сохраняет
  `channel_api.secret`, verifier покрыт `X-Chatwoot-*` headers и HMAC по
  `{timestamp}.{raw_body}`.
- Локальная Chatwoot `v4.13.0` интеграция проверена на tenants `buhfirma`,
  `stroyfirma` и `zubi`; webhook deliveries, transcript fetch и SSE realtime
  smoke прошли.
- Production Chatwoot CE обновлен до `v4.13.0`; upgrade notes зафиксированы в
  `docs/CHATWOOT_4_13_PRODUCTION_UPGRADE_NOTES.md`.
- `MT-10` production clean reinstall flow подготовлен и выполнен для portal `v2`
  на `lk.provgroup.ru`: tenant-aware stack поднят, tenant `provgroup` создан,
  Chatwoot API Channel inbox `5` verified/configured, HTTPS/public health/PWA
  smoke проверены.
- Production SMTP для portal `v2` переключен на Yandex 360 `cbr@provgroup.ru`;
  пользователь подтвердил успешную регистрацию и отправку кода.
- Production PWA cache headers обновлены для preview loop: SPA routes no-store,
  `/sw.js` no-cache/no-store, hashed assets immutable, missing assets возвращают
  404 вместо SPA fallback.
- Backend rate limiting fix закрыт: публичные auth login, registration и
  password reset POST endpoints ограничены по tenant/host + IP + route group;
  targeted app test, backend typecheck, lint, full test suite и
  `git diff --check` прошли.
- Backend Chatwoot outbound timeout fix закрыт: Chatwoot API fetch/body-read
  requests получили `AbortController` timeout helper с controlled unavailable
  errors; focused Chatwoot client/app tests, backend typecheck/lint/full test
  suite, code-health и `git diff --check` прошли.
- Backend follow-up finding `F-AUTH-001` зафиксирован как deferred low risk для
  shared-store rate limiting перед multi-instance deployment.
- Security & Production Hardening Review для `main@7bf94fe` и production
  `lk.provgroup.ru` завершен: high/critical findings не найдено, создан
  `docs/SECURITY_PRODUCTION_HARDENING_REVIEW.md`, добавлены actionable findings
  `F-SSE-001`, `F-PROD-001`, `F-PROD-002` и `F-SCRIPT-001`; backend/frontend
  проверки, `code-health`, production read-only checks и `git diff --check`
  прошли.
- `F-SSE-001` закрыт: chat realtime hub получил лимит 5 SSE subscriptions на
  tenant/user/conversation, `/api/chat/realtime` возвращает controlled `429` до
  открытия SSE stream при превышении лимита, cleanup по disconnect сохранен;
  backend chat-realtime tests, backend typecheck/lint/full tests,
  `code-health` и `git diff --check` прошли.
- `F-PROD-001` закрыт: production Caddyfile получил HSTS, CSP и
  Permissions-Policy baseline без блокировки voice recorder microphone flow,
  `code-health` проверяет наличие этих headers, stack задеплоен на
  `lk.provgroup.ru`; public health/tenant/API/SSE/PWA/static asset checks и
  `curl -I` headers verification прошли.
- `F-SCRIPT-001` закрыт: legacy global account webhook helper, который мог
  печатать raw webhook secret и писать секрет в parent `.env`, удален;
  tenant-aware helper больше не зависит от legacy core, `code-health` запрещает
  reintroduce старых helper-файлов.
- `F-CHATWOOT-001` закрыт: Chatwoot outbound request timeout вынесен в
  валидируемый `CHATWOOT_REQUEST_TIMEOUT_MS` env setting с текущим 15s baseline
  в env examples; app передает настройку в Chatwoot client factory, focused
  env/app tests, backend typecheck/lint/full tests, root lint, `code-health` и
  `git diff --check` прошли.

## Current Baseline

- Текущий runtime baseline поддерживает shared SaaS модель и dedicated модель как
  один tenant.
- Локально заведены несколько tenants на одном portal deploy: `buhfirma`,
  `zubi`, `stroyfirma`.
- Production preview environment доступен на `lk.provgroup.ru` для проверки
  текущего `MT-8.5` UI на реальных устройствах.
- `ARCHITECTURE.md`, `DECISIONS.md`, `IMPLEMENTATION_PLAN.md` и
  `MT_8_5_PORTAL_UI_UX_BASELINE.md` являются основными source-of-truth для
  деталей.
- Открытый архитектурный риск перед admin/branding: `F-MT-004` остается deferred
  до реализации `MT-9`, стратегия уже выбрана.

## Recommended Next Step

- Начинать `MT-9` только с закрытия или явного gating решения по `F-MT-004`;
  следующим security-hardening follow-up держать `F-CHAT-SEC-001`.
