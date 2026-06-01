# Журнал Решений

Этот файл хранит только актуальные устойчивые решения, которые нужны для
дальнейшей разработки.

Что сюда не дублируем:

- правила работы агента и git workflow - они живут в `AGENTS.md`;
- полное описание текущей архитектуры - оно живет в `docs/architecture/overview.md`;
- порядок фаз и roadmap - они живут в `docs/roadmap/implementation-plan.md`;
- подробный multi-tenant design - он живет в
  `docs/architecture/multi-tenant-reference.md`;
- список выполненных работ - он живет в `docs/roadmap/work-log.md`;
- временные review risks - они живут в `docs/findings/`.

## D-001. Multi-Tenant Portal - целевая архитектура

- дата: `2026-05-05`
- решение:
  `chatwoot-client-portal-v2` строится как tenant-aware portal. Один shared SaaS
  deploy может обслуживать много B2B tenants. Dedicated install остается
  поддерживаемой business-моделью, но реализуется как такой же multi-tenant
  portal с одним tenant.
- причина:
  shared и dedicated режимы должны жить в одной архитектуре без двух кодовых
  баз. Проект еще не в production, поэтому foundation можно менять правильно,
  не сохраняя single-tenant модель ради совместимости.

## D-002. Browser не получает Chatwoot authority

- дата: `2026-04-20`
- решение:
  browser никогда не хранит Chatwoot tokens и не ходит напрямую в Chatwoot для
  auth, send или realtime. Все Chatwoot runtime-действия идут через portal
  backend.
- причина:
  portal backend должен оставаться единственной authority-зоной для tenant,
  auth, session, access control, send и realtime fanout.

## D-003. Tenant определяется по Host/domain

- дата: `2026-05-05`
- решение:
  production tenant resolution строится по normalized `Host`/domain до
  auth/session/chat/admin runtime. Production convention:
  `lk.<client-domain>`. Unknown host получает controlled failure, а не fallback
  в default tenant.
- причина:
  host-based tenancy дает естественные browser origin boundaries для cookies,
  service worker, PWA install identity и same-origin API. Body/query/header
  tenant selection в production слишком легко подделать или забыть проверить.

## D-004. `X-Forwarded-Host` доверяем только в trusted proxy режиме

- дата: `2026-05-05`
- решение:
  `X-Forwarded-Host` учитывается только при `PORTAL_TRUST_PROXY=true`. По
  умолчанию backend берет обычный `Host`. В production trusted proxy mode
  допустим только если backend закрыт от прямого internet traffic и получает
  запросы через контролируемый reverse proxy.
- причина:
  host выбирает tenant до auth/session/chat runtime. Если публичный клиент
  сможет произвольно подставить forwarded host, он сможет попытаться выбрать
  чужой tenant.

## D-005. Chatwoot runtime config принадлежит tenant

- дата: `2026-05-05`
- решение:
  runtime не строится вокруг глобальных `CHATWOOT_ACCOUNT_ID` и
  `CHATWOOT_PORTAL_INBOX_ID`. Chatwoot base URL, account ID, portal inbox ID,
  runtime API token и webhook secret берутся из current tenant.
  Single-tenant `CHATWOOT_*` env names больше не являются ни runtime
  authority, ни bootstrap/dev input. Bootstrap выполняется только через
  tenant-owned `DEFAULT_TENANT_CHATWOOT_*` variables.
- причина:
  один portal deploy может обслуживать tenants с разными Chatwoot accounts или
  installations. Global Chatwoot env возвращают single-tenant assumption и риск
  cross-tenant routing/data leaks.

## D-006. Tenant не имеет `mode`

- дата: `2026-05-05`
- решение:
  в `portal_tenants` нет поля `mode`. Tenant определяется как company + domain +
  точная Chatwoot-связка:
  `chatwoot_base_url`, `chatwoot_account_id`,
  `chatwoot_portal_inbox_id`, encrypted runtime API token и encrypted webhook
  secret. Shared/dedicated определяется фактически по Chatwoot connection.
  `Hybrid` - только описание deployment, а не свойство tenant.
- причина:
  один tenant в первой модели связан ровно с одним Chatwoot account и одним
  portal inbox. `mode` добавил бы лишний enum и риск branching по ярлыку вместо
  фактической связи.

## D-007. Tenant scope обязателен для portal-owned data

- дата: `2026-05-05`
- решение:
  portal-owned rows, которые принадлежат компании или пользователю компании,
  должны быть tenant-scoped. Это относится к users, sessions, verification
  records, contact links, chat thread mappings, send ledger и webhook delivery
  bookkeeping. Email, Chatwoot contact ID и Chatwoot conversation ID не считаются
  глобально уникальными без tenant scope.
- причина:
  одинаковые emails и одинаковые Chatwoot IDs могут легитимно существовать в
  разных tenants, особенно при разных Chatwoot installations/accounts.

## D-008. Password reset остается в `verification_records`

- дата: `2026-05-05`
- решение:
  отдельную таблицу `password_reset_records` не создаем. Registration и password
  reset используют общий persistence layer `verification_records`, а сценарий
  различается через `purpose = registration` или `purpose = password_reset`.
  Continuation token поля остаются там же.
- причина:
  текущая модель email-code flows уже единая. Для multi-tenant isolation
  достаточно tenant-aware lookup, индексов и advisory lock key.

## D-010. Portal inbox routing проверяется tenant-aware

- дата: `2026-04-21`
- решение:
  provisioning/verification для tenant должен проверять, что configured portal
  inbox принадлежит current tenant Chatwoot account, является `Channel::Api` и
  имеет `lock_to_single_conversation = true`. Runtime recovery может повторно
  проверить/починить routing только при обнаружении chat anomaly.
- причина:
  это защищает portal UX от случайной Chatwoot admin-настройки
  `Create new conversations`, но не добавляет лишний Chatwoot roundtrip на каждый
  request.

## D-011. Realtime и webhooks имеют tenant boundary

- дата: `2026-05-05`
- решение:
  realtime subscriptions/publications ключуются tenant-aware, а Chatwoot webhook
  signature проверяется secret-ом current tenant, выбранного по Host. Webhook
  payload должен соответствовать current tenant Chatwoot account/inbox до
  delivery bookkeeping и realtime fanout.
- причина:
  webhook и realtime - отдельные runtime boundaries. Даже при tenant-scoped DB
  lookup они могут стать источником cross-tenant delivery, если не проверять
  tenant на входе и в fanout key.

## D-012. PWA install identity резолвится по tenant

- дата: `2026-05-05`
- решение:
  PWA identity не задается одним static manifest. Manifest, `id`, `start_url`,
  `scope`, app name, colors, icon URLs и iOS Home Screen metadata резолвятся
  tenant-aware. До полноценного tenant branding endpoints могут отдавать fallback
  assets, но browser contract уже tenant-owned.
- причина:
  в shared SaaS две компании не должны получать одинаковую установленную app
  identity или stale branding из общего manifest/icon cache.

## D-013. Branding/admin возвращается только tenant-owned

- дата: `2026-05-05`
- решение:
  archived branch `feature/phase-10-portal-branding-admin` не мержится как есть.
  Branding/admin возвращается в `MT-9` только поверх tenant foundation:
  tenant-scoped admin login, tenant-owned branding settings и tenant-scoped audit
  events.
- причина:
  archived branding/admin branch была построена на single-tenant assumptions.
  Global branding/admin session model небезопасна для shared SaaS.

## D-014. Tenant admin verification использует отдельный token

- дата: `2026-05-06`
- решение:
  tenant admin verification в `MT-9` использует отдельный encrypted per-tenant
  Chatwoot admin-verification token, например
  `chatwoot_admin_verification_token_ciphertext`. Runtime Chatwoot token не
  переиспользуется как implicit admin authority, а provisioning/platform-admin
  token не используется для tenant admin login.
- причина:
  admin login - отдельная security boundary. Если runtime token слишком узкий,
  проверка админа не должна ломать чат. Если admin-verification token шире, он
  не должен участвовать в обычном chat runtime.

## D-014A. Branding assets хранятся через object storage

- дата: `2026-05-06`
- решение:
  branding-файлы tenant-а, включая logo и PWA app icon, не хранятся как local
  filesystem files внутри portal backend/frontend контейнера. Production-модель:
  metadata в portal DB, binary content в S3-compatible object storage. Для
  локальной разработки используется тот же подход через MinIO или совместимый
  local object storage, а не временная альтернативная схема.
- причина:
  shared SaaS и dedicated install должны использовать одну архитектуру. Local
  files в контейнере легко потерять при redeploy, трудно масштабировать на
  несколько инстансов и опасно кешировать между tenants. Tenant isolation
  обеспечивается не bucket naming вручную, а связкой `tenant_id`, `asset_id`,
  tenant-scoped DB lookup, tenant-prefixed object key, content hash/version и
  backend-controlled read endpoints.

## D-015. Feature boundaries не смешиваем в `shared`

- дата: `2026-04-23`
- решение:
  крупные portal-возможности добавляются как отдельные feature/module slices.
  Во frontend `shared/` остается недоменным слоем для generic UI/lib/theme
  primitives. В backend portal-owned области заводятся как отдельные modules
  вместо наращивания giant files.
- причина:
  портал уже шире, чем auth + chat. Без явных boundaries будущие документы,
  задачи, тарифы, уведомления, branding и service requests быстро распухнут в
  общий скрытый monolith.

## D-016. Root lint включает code-health guard

- дата: `2026-04-23`
- решение:
  root `pnpm lint` включает `pnpm code-health`. Production `ts/tsx` файлы
  ограничены `500` строками, test `ts/tsx` файлы - `1000` строками. Временный
  allowlist не должен расти; когда файл снова укладывается в лимит, его нужно
  убрать из allowlist.
- причина:
  проекту нужен ранний автоматический сигнал о giant files до того, как новые
  portal domains снова раздуют рабочие области.

## D-018. Portal realtime использует API Channel webhook secret

- дата: `2026-05-07`
- решение:
  для tenant portal inbox `Channel::Api` callback настраивается через API
  Channel `webhook_url`, а подпись входящих Chatwoot webhooks проверяется
  tenant-stored secret, синхронизированным из API Channel `secret`. Account
  webhook secret не является source of truth для portal realtime.
- причина:
  Chatwoot `v4.13.0` добавил dedicated signing secrets для API Channel
  webhooks. Portal получает customer chat events из tenant portal API inbox, и
  после обновления должен проверять `X-Chatwoot-Signature` именно через
  `channel_api.secret`.

## D-019. Portal chat использует portal-owned threads

- дата: `2026-05-15`
- решение:
  публичный chat contract строится вокруг backend-controlled `threadId`.
  Browser отправляет и подписывается на `private:me` или
  `group:<chatwoot_group_contact_id>`, но не получает Chatwoot conversation
  id как authority. Backend валидирует thread access через tenant/session,
  linked person contact и текущие Chatwoot contact attributes, затем мапит
  thread на внутренний Chatwoot conversation через `portal_chat_threads`.
  Chatwoot conversation создается лениво только при первом send под
  tenant-aware advisory lock и повторным resolve внутри lock.
- group-правило:
  group thread доступен только если person contact пользователя содержит ID
  группового Chatwoot contact в разрешенном portal attribute list, а сам
  group contact включен для portal. Group send в Chatwoot получает Markdown
  author prefix, чтобы агент видел, какой участник группы написал сообщение.
  Portal transcript показывает автора через structured metadata и скрывает
  technical prefix.
- realtime/webhook-правило:
  SSE subscriptions и fanout ключуются по `tenant + threadId`. Webhook routing
  резолвит Chatwoot conversation id только через `portal_chat_threads`, а
  group-thread fanout перед доставкой конкретному subscriber повторно
  проверяет текущий доступ пользователя к thread.
- причина:
  portal-owned `threadId` сохраняет backend authority, не раскрывает Chatwoot
  IDs браузеру как право доступа и позволяет добавлять личный и групповые чаты без
  отдельной portal admin panel.

## D-020. Portal schema очищается под thread-only baseline

- дата: `2026-05-16`
- решение:
  так как портал еще не используется реальными клиентами, сохранять старые
  portal users и старые chat mappings не нужно. Portal DB можно destructive
  reset-ить, а migration history сжать в один clean baseline. Целевая схема
  содержит `portal_chat_threads` как единственную таблицу chat thread mapping,
  а send ledger scope строится только через
  `tenant_id + portal_chat_thread_id + user_id + client_message_key`.
- причина:
  это убирает transitional слой до выхода к реальным клиентам и оставляет
  production baseline проще: browser работает только с `threadId`, backend
  хранит только thread-owned mappings, а старые portal данные не считаются
  обязательством совместимости.

## D-021. Служебные portal traces имеют retention policy

- дата: `2026-05-18`
- решение:
  portal database не должна бесконечно копить служебные следы, которые не
  являются пользовательской историей переписки. Maintenance cleanup удаляет
  только portal-owned service rows по tenant-safe условиям:
  confirmed/failed send ledger старше `90` дней, зависшие processing sends
  старше `24` часов, webhook delivery bookkeeping старше `30` дней,
  истекшие rate-limit buckets старше `24` часов, истекшие sessions старше
  `7` дней и истекшие verification records старше `30` дней.
- граница:
  cleanup не удаляет `portal_chat_threads`, tenants, users, Chatwoot contacts,
  Chatwoot conversations, Chatwoot messages или Chatwoot uploads. Если агент
  удалил conversation в Chatwoot, portal thread может быть восстановлен через
  replacement conversation, но old Chatwoot conversation остаётся внешним
  удаленным объектом, а не portal-owned историей.
- причина:
  Chatwoot остается system of record для истории чата. Portal DB хранит
  authority mappings и короткоживущие runtime/service traces; без retention они
  постепенно превращаются в мусор, но удалять пользовательские thread mappings
  автоматически нельзя.

## D-022. Offline-first PWA не переносит backend authority в браузер

- дата: `2026-05-29`
- решение:
  установленный PWA может открывать сохраненные tenant/auth/chat snapshots при
  плохой связи и хранить durable text outbox в frontend-domain offline модуле.
  Browser storage scoped by tenant/user/thread помогает UX, но не становится
  source of truth: backend остается authority для session, send, freshness,
  Chatwoot access и final delivery status. Service worker кэширует app
  shell/assets и не перехватывает `/api/*`.
- граница:
  attachments/voice остаются online-only. Background Sync используется только
  как progressive enhancement для text outbox drain; foreground drain on app
  open/online/visibility остается primary path, особенно для iOS/iPadOS.
- причина:
  offline-first нужен для устойчивого UX при плохой связи, но выдача Chatwoot
  или send authority в browser нарушила бы главный security boundary портала.

## D-023. Chat notifications tenant-scoped and privacy-preserving

- дата: `2026-05-27`
- решение:
  chat notifications хранятся и доставляются только в tenant/user/thread scope.
  Push subscriptions принадлежат portal user внутри tenant, а push delivery из
  Chatwoot `message_created` webhooks проходит через portal backend. Публичный
  push payload содержит безопасный chat-title context и routing metadata, но не
  содержит текст сообщения, автора, attachment names, Chatwoot IDs или internal
  portal IDs в user-visible copy. User-facing settings используют
  Telegram-like модель: новые сообщения вкл/выкл и звук вкл/выкл на глобальном
  и chat-level уровне. Web Push - это per-device connection state, а не
  отдельный user/chat behavior toggle. Global выключатели новых сообщений и
  звука являются hard-off: chat-level override не может включить delivery или
  звук обратно, если соответствующий global setting выключен.
- граница:
  notification center, email/digest notifications и tenant-admin notification
  policy screen остаются отдельными future scopes.
- причина:
  системные уведомления полезны для чата, но они легко раскрывают sensitive
  данные на lock screen или в notification tray. Tenant scope и минимальный
  payload сохраняют privacy и multi-tenant isolation.
