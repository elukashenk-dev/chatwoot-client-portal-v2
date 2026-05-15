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
  follow-ups ведутся через `docs/Findings/`.

## Chat Thread Planning

- Принят production-grade план перехода от одного private chat к portal-owned
  `threadId`: личный чат плюс optional company threads через Chatwoot contact
  attributes, без выдачи Chatwoot authority в browser.
- По chat thread plan зафиксированы design/security gates в `docs/Findings/`;
  company threads нельзя включать до закрытия affected findings.
- Следующий implementation scope выбран как private-only safety gate:
  `threadId = private:me`, без включения company threads, company sends и
  company realtime.
- `F-CHAT-THREAD-003` закрыт: plan теперь содержит конкретную fail-closed
  coverage matrix и тесты для malformed attributes, missing/wrong/disabled
  contacts, forged `threadId` и membership removal.
- Private-only safety gate реализован: browser/public chat API использует
  `threadId = private:me` и `activeThread`, старые public
  `primaryConversationId` selectors fail-closed, company threads пока не
  включены.
- Header и левое меню показывают текущий выбранный thread как `Личный чат`;
  frontend больше не хранит Chatwoot conversation id как authority.
- `F-CHAT-SEC-001` закрыт: authenticated chat send получил DB-backed fixed-window
  limiter для text/attachment sends, scoped by tenant/user/thread, с отдельным
  attachment budget и controlled `429` до Chatwoot outbound.
- `F-CHAT-THREAD-002` закрыт для текущего private-only runtime: добавлен общий
  public `threadId` parser/resolver boundary, `company:<id>` трактуется только
  как Chatwoot company contact id и fail-closed до Chatwoot lookup/send/realtime.

## Current Baseline

- Текущий runtime baseline поддерживает shared SaaS модель и dedicated модель как
  один tenant.
- Локально заведены tenants `buhfirma`, `zubi` и `stroyfirma` на одном portal
  deploy.
- Production preview environment доступен на `lk.provgroup.ru` для проверки
  текущего `MT-8.5` UI на реальных устройствах.
- Основные source-of-truth документы: `ARCHITECTURE.md`, `DECISIONS.md`,
  `IMPLEMENTATION_PLAN.md`, `MULTI_TENANT_PORTAL_ARCHITECTURE_PLAN.md` и
  `MT_8_5_PORTAL_UI_UX_BASELINE.md`.
- Открытый архитектурный gate перед admin/branding: `F-MT-004` остается deferred
  до реализации `MT-9`, стратегия уже выбрана.

## Recommended Next Step

- Закрыть `F-CHAT-THREAD-007`: ввести строгий parser и cardinality bound для
  `portal_client_company_contact_ids` перед любым `GET /api/chat/threads` с
  company threads. Company behavior не включать до закрытия
  `F-CHAT-THREAD-001`, `F-CHAT-THREAD-004`, `F-CHAT-THREAD-005`,
  `F-CHAT-THREAD-006`, `F-CHAT-WEBHOOK-003` и `F-CHAT-RT-002`.
