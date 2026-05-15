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
- `F-CHAT-THREAD-007` закрыт: `GET /api/chat/threads` строит private плюс
  enabled company thread summaries из Chatwoot contact attributes, duplicate
  company IDs дают один lookup/thread entry, malformed/oversized lists fail
  closed controlled `403`.
- `F-CHAT-THREAD-004` закрыт validation-only: текущий backend fail-closed
  валидирует person contact до company lookup, а frontend не делает fallback на
  company thread после backend configuration/access error.
- `F-CHAT-THREAD-001` закрыт validation-only: текущий send ledger уже scope-ится
  по `tenant + user + conversation + clientMessageKey`, добавлен regression test
  для разных users с одинаковым key, а thread plan закрепляет будущий scope
  `tenant + portal_chat_thread + user + clientMessageKey`.
- `F-CHAT-THREAD-006` закрыт: текущий private conversation lazy bootstrap теперь
  сериализуется tenant-aware advisory lock по target Chatwoot contact, внутри
  lock выполняется повторный resolve перед Chatwoot create; thread plan требует
  такой же lock/re-read contract для будущих company threads.
- Chat thread rollout gates зафиксированы: `F-CHAT-THREAD-005` закрывать перед
  company send/author formatting, `F-CHAT-RT-002` перед company realtime,
  `F-CHAT-WEBHOOK-003` перед webhook routing/recovery; остальные implementation
  slices идут по основному thread plan.
- Task 2 thread persistence завершен: добавлена таблица `portal_chat_threads`,
  migration `0010` с backfill private threads из legacy mappings, nullable
  `portal_chat_thread_id`/author snapshot для send ledger и repository layer для
  private/company thread records.
- Task 3 thread listing persistence завершен: `GET /api/chat/threads` теперь
  upsert-ит validated private/company records в `portal_chat_threads` через
  tenant-scoped repository; company send/realtime/webhook routing пока не
  включены.
- Task 4 thread runtime context завершен: добавлен внутренний resolver для
  private/company thread context и lazy Chatwoot conversation bootstrap через
  `portal_chat_threads` с tenant-scoped bootstrap lock; company send/realtime/webhook
  routing пока не включены.
- Task 5 messages thread integration завершен: history/send/attachment перешли
  на thread runtime context, send ledger scope переведен на
  `portalChatThreadId + user + clientMessageKey`, company messages получают
  безопасный Chatwoot-visible author prefix и portal `authorRole`;
  `F-CHAT-THREAD-005` закрыт.

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

- Реализовать Task 6 основного thread plan: thread realtime и Chatwoot webhook
  fanout keyed by `threadId`; перед company realtime закрыть `F-CHAT-RT-002`,
  перед webhook routing/recovery закрыть `F-CHAT-WEBHOOK-003`.
