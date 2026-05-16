# Work Log

Короткая карта крупных завершенных этапов в `chatwoot-client-portal-v2`.
Мелкие fixes, refactoring slices, docs-only changes, временные findings и
детальные проверки здесь не перечисляются.

## Core Product

- `v2` закреплен как самостоятельный tenant-aware клиентский portal поверх
  Chatwoot.
- Собран рабочий portal baseline: auth/session, registration, password reset,
  protected app shell, chat read/send, attachments, realtime и PWA foundation.
- Browser не получает Chatwoot authority; portal backend остается единственной
  authority-зоной для auth, session, send, realtime и Chatwoot access.
- Chatwoot остается system of record для contacts, conversations, messages и
  attachments; portal database хранит только portal-owned данные.

## Multi-Tenant Foundation

- Принята единая multi-tenant архитектура: shared SaaS обслуживает много tenants,
  dedicated install работает как один tenant в той же модели.
- `MT-0`-`MT-8` завершены: tenant определяется по Host/domain, runtime Chatwoot
  config принадлежит tenant, persistence/auth/chat/webhooks/frontend/PWA стали
  tenant-aware.
- `MT-8R Codebase Audit And Refactoring Readiness` завершен; открытых
  `must-fix-before-MT-9` code findings не осталось.
- Для `MT-9` приняты ключевые решения: separate encrypted per-tenant Chatwoot
  admin-verification token и branding assets через portal DB metadata plus
  S3-compatible object storage.

## UI/UX Baseline

- `MT-8.5` product UI/UX baseline создан: brandable matrix, text limits,
  fallback logic, content ownership, visual hierarchy, branding intensity и
  implementation checklist.
- Auth/customer-facing screens приведены к общей структуре для login,
  registration, password reset, OTP и set-password flows.
- Chat UI перешел к customer-support baseline: компактный header, tenant mark,
  support center entry point, action menu, composer alignment и более компактный
  transcript.
- Chat composer footer упрощен до чистого input-row без лишней внутренней
  bordered surface; attachment/voice icon controls остаются без постоянной
  внешней декорации, а send остается primary action.
- Composer attachment/voice controls используют существующий chat accent color
  вместо слабого neutral gray; hover и disabled states сохранены.
- Mobile chat transcript скрывает визуальный scrollbar, сохраняя scroll
  behavior; desktop scrollbar остается доступным.
- Default auth branding assets добавлены в `frontend/public/default-branding/`.

## Production Runtime

- Chatwoot `v4.13.0` compatibility закрыт для API Channel webhook signing:
  tenant webhook sync использует `Channel::Api` webhook URL и `channel_api.secret`.
- Local Chatwoot `v4.13.0` integration проверена на tenants `buhfirma`,
  `stroyfirma` и `zubi`.
- Production Chatwoot CE обновлен до `v4.13.0`; portal `v2` clean reinstall
  выполнен на `lk.provgroup.ru` как tenant-aware one-tenant deployment для
  `provgroup`.
- Production SMTP для portal `v2` переключен на Yandex 360
  `cbr@provgroup.ru`; пользователь подтвердил successful registration code flow.
- Production hardening review завершен без high/critical findings; активные
  follow-ups ведутся через `docs/findings/`.
- `F-PROD-002` закрыт: `main` fast-forward'нут до clean-schema branch,
  `origin/main` синхронизирован, production `DEPLOY_SOURCE.txt` пишет clean
  `main` commit.

## Chat Thread Planning

- Принят и реализован production-grade portal-owned `threadId` runtime: личный
  чат `private:me` и company threads через Chatwoot contact attributes, без
  выдачи Chatwoot authority в browser.
- `GET /api/chat/threads`, messages, attachment send, realtime и webhook fanout
  работают через `tenant + threadId`; company send добавляет безопасный
  Chatwoot-visible Markdown author prefix, а portal transcript показывает автора
  через structured metadata.
- Все chat thread security gates закрыты: malformed/forged thread ids,
  person/company contact validation, company membership removal, author
  formatting, realtime fanout и webhook routing проверяются fail-closed.
- `MT-8.6` расширен до destructive clean-schema cleanup по решению владельца
  проекта: старые portal users не сохраняются, migration history сжата в один
  clean baseline, старый context endpoint удален, chat mapping живет только в
  `portal_chat_threads`, send ledger scope живет только через
  `portal_chat_thread_id`.
- Локальная portal DB destructive reset-нута и мигрирована заново: после reset
  нет старой chat mapping table, нет старой send-ledger колонки, portal users и
  chat threads созданы заново.
- Проверки на чистой схеме прошли: backend tests `202/202`, frontend tests
  `93/93`, Playwright e2e `25/25`, backend build, frontend typecheck/build,
  root lint/code-health, `git diff --check` и local company-thread send через
  реальный backend + локальный Chatwoot.
- `scripts/` проверены на устаревшие portal runtime следы; удалена retired
  production installer option, code-health guard оставлен без старой
  формулировки.
- Production portal clean reinstall выполнен на `lk.provgroup.ru`: portal app
  dir, containers и Docker volumes удалены перед deploy; новая portal DB
  создана с clean thread-only schema; Chatwoot core/DB/uploads/services и
  `chat.provgroup.ru` не трогались.
- Production verification после reinstall: `DEPLOY_SOURCE.txt`, `/api/health`,
  `/api/tenant`, manifest, login HTML, Docker compose health и production DB
  counts проверены; старая portal mapping table и старая send-ledger column
  отсутствуют.

## Current Baseline

- Текущий runtime baseline поддерживает shared SaaS модель и dedicated модель как
  один tenant.
- Локальная portal DB сейчас clean-reset baseline: default tenant и fresh test
  users созданы заново после destructive reset.
- Production portal доступен на `lk.provgroup.ru` для тестирования текущего
  post-reinstall baseline.
- Основные source-of-truth документы живут в `docs/architecture/`,
  `docs/roadmap/` и `docs/design/`.
- Stable docs cleanup выполнен: удален завершенный clean-schema execution plan,
  stable docs приведены к текущему post-reinstall baseline.
- Открытый архитектурный gate перед admin/branding: `F-MT-004` остается deferred
  до реализации `MT-9`, стратегия уже выбрана.

## Recommended Next Step

- Create fresh production test portal user and validate private/company thread
  flows on `lk.provgroup.ru` without modifying Chatwoot admin data.
