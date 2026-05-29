# Work Log

Короткая карта крупных завершенных этапов в `chatwoot-client-portal-v2`.
Мелкие fixes, refactoring slices, docs-only changes, временные findings и
детальные проверки здесь не перечисляются.

## Core Product

- `v2` закреплен как самостоятельный tenant-aware клиентский portal поверх
  Chatwoot.
- Собран рабочий portal baseline: auth/session, registration, password reset,
  protected app shell, chat read/send, attachments, realtime и PWA foundation.
- Offline-first PWA MVP Slices 01-07 реализовали backend session metadata,
  isolated `idb` offline stores, cached tenant startup, bounded cached auth
  session с `offlineAccessUntil`, local-device data removal и display-only
  cached chat read model с thread/message snapshots, а также durable text
  outbox core с foreground drain, retry/backoff, fallback lease и
  privacy-safe outcome diagnostics; composer/chat UI пишет text sends только в
  durable frontend-domain outbox, показывает queued/sending/failed состояния и
  оставляет attachments/voice online-only; backend остается session, send и
  freshness authority.
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
- Offline/PWA chat connection state показывает один unified notice под header:
  composer больше не дублирует offline warning, а header при потере связи
  показывает `Нет связи` вместо support availability `Проверяем`.
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
- Production deploy source tracking синхронизирован: `origin/main` и
  `DEPLOY_SOURCE.txt` отражают clean `main` baseline.

## Chat Thread Planning

- Принят и реализован production-grade portal-owned `threadId` runtime: личный
  чат `private:me` и групповые чаты через Chatwoot contact attributes, без
  выдачи Chatwoot authority в browser.
- `GET /api/chat/threads`, messages, attachment send, realtime и webhook fanout
  работают через `tenant + threadId`; group send добавляет безопасный
  Chatwoot-visible Markdown author prefix, а portal transcript показывает автора
  через structured metadata.
- Все chat thread security gates закрыты: malformed/forged thread ids,
  person/group contact validation, group membership removal, author
  formatting, realtime fanout и webhook routing проверяются fail-closed.
- `MT-8.6` расширен до destructive clean-schema cleanup по решению владельца
  проекта: старые portal users не сохраняются, migration history сжата в один
  clean baseline, старый context endpoint удален, chat mapping живет только в
  `portal_chat_threads`, send ledger scope живет только через
  `portal_chat_thread_id`.
- Локальная portal DB destructive reset-нута и мигрирована заново под clean
  thread-only schema; production portal clean reinstall выполнен на
  `lk.provgroup.ru` без изменений Chatwoot core.
- Chat thread deleted-conversation recovery добавлен: если Chatwoot conversation
  удален после mapping в portal DB, следующий send восстанавливает thread под
  lock, создает replacement conversation через contact inbox source, повторяет отправку
  и нормализует confirmed portal-send messages в `sent`, даже если Chatwoot
  помечает API-channel delivery status как `failed`.
- Portal maintenance retention добавлен: cleanup module/script с dry-run,
  tenant scope, default TTL для send ledger, webhook deliveries, expired
  rate-limit buckets, sessions и verification records; `portal_chat_threads` и
  Chatwoot-owned data не удаляются.
- Production maintenance cleanup автоматизирован: installer ставит daily
  systemd timer, перед включением выполняет dry-run, timer persistent и
  запускает cleanup внутри `portal-backend` container.
- Strict group contact rename выполнен: portal chat thread model больше не
  поддерживает legacy `company`, публичный `threadId` использует `group:<id>`,
  Chatwoot attribute list переименован в `portal_client_group_contact_ids`, а
  `portal_contact_type` принимает только `person` и `group`.
- Production portal clean reinstall выполнен после strict group rename:
  `lk.provgroup.ru` поднят из clean `main` source, portal DB пересоздана,
  Chatwoot core не трогался.
- Страница `Информация о чате` реализована как full-screen chat-adjacent page:
  backend endpoint отдает tenant/session/thread-scoped details без browser
  Chatwoot authority, frontend открывает страницу из chat menu через reusable
  `ChatFullScreenPanel`.
- Chat info details покрывают тип чата, support label, доступ, `curator_name`,
  дату начала/последней активности и безопасный список участников группового
  чата через active portal users + Chatwoot contact attribute membership.
- Local service governance обновлен: агент может запускать/перезапускать
  локальные portal-сервисы для разработки и проверок; Chatwoot остается внешним
  сервисом и без отдельной необходимости не трогается.
- `ChatFullScreenPanel` приведен к portal shell layout: chat-adjacent pages
  больше не выходят за `max-w-[500px]` основного portal UI.
- Реализован read-only full-screen slice `Медиа и файлы`: backend media
  endpoint, portal attachment proxy для transcript/media URLs, frontend
  `C. Mixed View` page, chat menu wiring и stale-response handling.
- Attachment proxy для чата и медиа работает через portal authority: allowlist
  tenant Chatwoot/object-storage origins, SSRF guards, timeout/body timeout,
  content-length guard, portal-owned cache policy и local dev loopback handling.
- Страница `Медиа и файлы` merge-ит свежие вложения из текущего transcript
  snapshot, пока Chatwoot media history догоняет.
- Production deploy media slice выполнен на `lk.provgroup.ru`; пользователь
  подтвердил работу `Медиа и файлы` на production tenant.
- Реализован read-only full-screen slice `Поиск по чату`: backend endpoint
  ищет только client-visible text messages в текущем `threadId`, frontend
  показывает вариант `C. Search page + context preview` с author filters,
  context snippets, fresh transcript snapshot merge, pagination по истории и
  jump-back highlight для уже загруженных сообщений.
- Search UX поддерживает устойчивый input focus, стабильный thread header,
  trailing spaces в поле ввода и punctuation-insensitive phrase matching.
- Search jump для найденных сообщений вне текущей ленты открывает bounded
  history fragment прямо в чате с ручным расширением контекста раньше/позже и
  возвратом к последним сообщениям.
- Chat header больше не трактует connection readiness как статус поддержки:
  portal backend отдает tenant-scoped Chatwoot agent availability и working
  hours, frontend показывает `На связи` / `Ответим позже` / `Вне графика`, а
  страница `Информация о чате` содержит read-only блок `Часы работы`.
- Реализован slice `Уведомления`: глобальная страница настроек, chat-level
  overrides, in-portal sound, Web Push/VAPID subscription lifecycle,
  tenant-scoped push delivery из Chatwoot `message_created` webhooks, safe
  chat-title context в PWA push payload без текста сообщения и локальная
  красная точка для чатов с новыми сообщениями вне текущего активного чата,
  плюс минимальный локальный PWA app-icon badge count по показанным системным
  push на поддерживаемых платформах.
- Production deploy notifications slice выполнен на `lk.provgroup.ru`; VAPID
  runtime env подключен, settings UI и push subscription lifecycle доступны на
  реальном tenant.
- Offline-first PWA MVP Slice 08 реализован: production service worker получает
  Vite manifest assets в app shell, отдает revision/status для runtime checks,
  не перехватывает `/api/*`, а push stale markers сохраняются и потребляются
  только в tenant/user/thread/message scope.
- Offline-first PWA MVP реализован: установленный portal открывает сохраненные
  tenant/auth/chat данные при плохой связи после предыдущего online входа,
  текстовые сообщения ставятся в локальную durable outbox и доставляются после
  восстановления соединения; backend остается единственной authority-зоной.
- No-legacy cleanup gate удалил single-tenant `CHATWOOT_*` runtime/env
  compatibility из backend env и Chatwoot client construction; tenant bootstrap
  остается только через `DEFAULT_TENANT_CHATWOOT_*`, а e2e harness использует
  отдельные `E2E_CHATWOOT_*` values.
- Chatwoot webhook callback surface сужен до одного canonical route
  `/api/chatwoot/webhooks`; совместимый
  `/api/integrations/chatwoot/webhooks/account` больше не обслуживается.
- Production deploy Unified Connection Notice выполнен на `lk.provgroup.ru` из
  clean commit `bfeae36`; automated production-origin PWA smoke подтвердил
  stamped service worker, offline launch с сохраненным чатом и один unified
  notice для offline/outbox state.
- Background Outbox Drain follow-up реализован и deployed на `lk.provgroup.ru`
  из clean commit `e91636b`: durable text outbox регистрирует one-off
  Background Sync как progressive enhancement, service worker opportunistically
  drains due text records через тот же tenant/user/thread `portal-offline`
  scope, foreground drain остается primary path, а iOS продолжает полагаться на
  send-on-next-open/online/visibility behavior.

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

- Run real-device Background Outbox Drain smoke: Android Chrome installed PWA
  queues offline text, app is closed, network returns and background sync is
  observed if available; iOS/iPadOS Home Screen preserves queued text and sends
  on next open without promising background delivery.
