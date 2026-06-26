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
  auth/session/chat/admin runtime. Production supports custom client domains
  such as `lk.<client-domain>` and provider-owned subdomains such as
  `<tenant-slug>.<PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX>`. Unknown host получает
  controlled failure, а не fallback в default tenant.
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

## D-008. Email-code auth proofs остаются в `verification_records`

- дата: `2026-05-05`
- решение:
  отдельные таблицы для password reset или first-password setup не создаем.
  Registration, password reset, logged-in first-password setup и passwordless
  email-code login используют общий persistence layer `verification_records`,
  а сценарий различается через `purpose = registration`,
  `purpose = password_reset`, `purpose = password_setup` или
  `purpose = passwordless_login`. Continuation token поля остаются там же.
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
  Production default: portal deployment owns an internal S3-compatible MinIO
  service and a persistent Docker volume for branding binaries. This is part of
  the provider-operated portal stack, not a B2B-client provisioning
  responsibility. External managed S3-compatible storage is a future operator
  mode that requires a separate compose/profile/runbook slice; it is not part
  of the current default one-VM install path.
- причина:
  shared SaaS и dedicated install должны использовать одну архитектуру. Local
  files в контейнере легко потерять при redeploy, трудно масштабировать на
  несколько инстансов и опасно кешировать между tenants. Tenant isolation
  обеспечивается не bucket naming вручную, а связкой `tenant_id`, `asset_id`,
  tenant-scoped DB lookup, tenant-prefixed object key, content hash/version и
  backend-controlled read endpoints.

## D-014B. Tenant admin auth имеет отдельную session boundary

- дата: `2026-06-06`
- решение:
  tenant admin auth в `MT-9B` использует отдельные tenant-scoped login
  challenges, отдельную signed httpOnly cookie `portal_admin_session`,
  отдельную таблицу admin sessions и tenant-scoped audit events. Customer
  session cookie не считается admin session, а admin cookie не считается
  customer session.
- причина:
  admin authority не должна смешиваться с customer auth/session runtime.
  Browser получает только portal admin session cookie, но не Chatwoot token или
  admin-verification token.

## D-014C. Legal documents and support phone are tenant-owned portal data

- дата: `2026-06-18`
- решение:
  пользовательское соглашение, политика обработки персональных данных и телефон
  поддержки не являются frontend constants. Tenant admin загружает active legal
  documents в portal через PDF/DOCX/TXT upload без inline-редактора. Backend
  извлекает текст, хранит active version в `portal_legal_documents`, отдает
  public legal reader routes and blocks registration until both active versions
  exist. Телефон поддержки хранится в branding settings и отдается browser как
  public `supportContact` metadata.
- причина:
  legal copy and support contact are operator-owned tenant configuration.
  Browser не должен быть source of truth для legal versions or contact
  fallbacks, а registration consent должен фиксировать actual active document
  versions from backend authority.

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
  shell/assets и имеет только узкое исключение для scoped chat avatar proxy
  image routes из `/api`; остальные `/api/*`, attachments и authority routes
  не перехватываются service-worker cache boundary.
- граница:
  read-only cached auth/chat open offline only until backend `sessionExpiresAt`.
  Old browser auth cache fields/formats are not a compatibility contract and
  may be discarded when the offline auth shape changes. attachments/voice
  остаются online-only. Background Sync используется только как progressive
  enhancement для text outbox drain; foreground drain on app
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

## D-024. Customer profile is portal-mediated and contact-linked

- дата: `2026-06-05`
- решение:
  customer profile is a protected portal route, not a Chatwoot browser surface.
  The page exposes read-only `Имя`, `Email` and `Телефон` from portal user plus
  linked Chatwoot contact data. Avatar upload goes through portal backend,
  validates image type and size, updates only the current linked Chatwoot
  contact, and returns a portal-owned `/api/profile/avatar` URL. Browser never
  receives Chatwoot tokens or direct Chatwoot avatar URLs.
- причина:
  profile is a customer-facing product area, but Chatwoot contact remains the
  system of record for contact-side phone/avatar data. Portal backend must keep
  the same authority boundary as chat: session, tenant and contact link are
  checked before reading or updating anything in Chatwoot.

## D-025. Visible chat identity uses portal-owned URLs and role labels

- дата: `2026-06-06`
- решение:
  chat transcript, thread list and group info may show tenant/contact avatars,
  but all visible avatar URLs must be portal-owned `/api/.../avatar` routes.
  Group member avatars are shown only when backend can map the participant or
  ledger-known author to a current contact; unknown group authors keep initials
  fallback. In group transcripts, `agent` messages are marked with compact
  `Поддержка` badges only on the first message of each support block.
- причина:
  group chat identity must be clearer for end users without leaking direct
  Chatwoot asset URLs or turning display names into authority. Role-aware visual
  grouping prevents support and group member messages with the same display name
  from merging into one visual block.

## D-026. Tenant lifecycle provisioning is operator-owned

- дата: `2026-06-12`
- решение:
  production portal tenant creation is owned by the provider/operator, not by
  public Chatwoot signup. The `tenant:create` CLI creates or reuses the
  Chatwoot account, client admin, portal service users and API Channel inbox
  through Chatwoot Platform/account APIs, configures the webhook, ensures the
  portal contact custom attribute definitions in the Chatwoot account, and
  writes the portal tenant with encrypted runtime/admin/webhook secrets. Domain mode is
  explicit: custom-domain inputs provide `primary_domain` and `public_base_url`,
  while provider-subdomain inputs derive
  `<tenant-slug>.<PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX>`. Safe lifecycle tooling
  uses reconciliation for Chatwoot account drift and explicit-confirmation
  archive/deprovision commands; physical portal tenant purge remains a separate
  future retention/backup decision.
- причина:
  Chatwoot public signup cannot supply the portal domain, API Channel inbox,
  runtime/admin tokens or signed webhook secret. Provider-owned provisioning
  keeps Chatwoot core untouched while preserving portal backend authority,
  encrypted tenant secrets and Host-based tenant resolution.

## D-027. Portal-owned compatibility is not preserved before real-customer data

- дата: `2026-06-23`
- решение:
  `chatwoot-client-portal-v2` is still a new product. Portal-owned users,
  browser caches, local storage, IndexedDB records, portal database rows,
  tenant fixtures, API contracts, env names, frontend components and CSS hooks
  are not backward-compatibility obligations until a separate architecture
  decision explicitly marks real customer data/runtime compatibility as
  required. When a portal-owned contract or data shape changes, the old field,
  reader, writer, fallback, fixture, test and documentation must be removed in
  the same scope. Old portal-owned cache/data may be discarded and recreated by
  the new online/bootstrap flow.
- граница:
  A temporary compatibility shim is allowed only after explicit user approval,
  with a documented reason, removal trigger and follow-up/finding. This decision
  does not allow destructive changes to Chatwoot-owned production data:
  Chatwoot remains an external system of record and is changed only by separate
  explicit decision.
- причина:
  The project is still before real customer-data compatibility commitments.
  Keeping legacy layers for test-only portal data makes the runtime harder to
  reason about, hides obsolete assumptions and conflicts with the clean-baseline
  approach already used for portal schema and tenant runtime.

## D-028. Customer sessions use bounded idle renewal

- дата: `2026-06-26`
- решение:
  Customer `portal_session` uses a `30` day idle timeout without a separate
  absolute timeout. Login creates `portal_sessions.expires_at = now + 30 days`.
  A successful same-origin `/api/auth/me` may renew only a valid, non-expired
  customer session inside the final `15` days before expiry, only when the
  frontend sends explicit session-check intent. Renewal updates
  `portal_sessions.last_seen_at` and `expires_at = now + 30 days`, then refreshes
  the same signed httpOnly cookie token with a fresh cookie lifetime. Ordinary
  protected customer APIs validate sessions without renewal writes or cookie
  refresh. Tenant-admin sessions and `portal_admin_session` are untouched.
- граница:
  Missing, invalid, revoked, manually logged-out and expired customer sessions
  are not revived. `/api/auth/me` requests without explicit renewal intent, with
  cross-site fetch metadata or with invalid Origin still return the current user
  when the cookie is valid, but do not write `portal_sessions` or refresh the
  cookie. Concurrent renewal attempts for the same observed expiry are
  deduplicated by a conditional update and re-read the effective expiry.
- причина:
  Customer chat UX should not force active users through periodic login, but a
  multi-tenant portal must avoid turning every auth check or protected API call
  into a session write. A renewal window keeps the behavior convenient while
  bounding write load and preserving backend authority over session validity.

## D-029. Registration password is optional after email proof

- дата: `2026-06-26`
- решение:
  Customer registration still requires tenant-scoped Chatwoot contact
  eligibility and email-code verification, but password creation is optional at
  completion. `POST /api/auth/register/set-password` stores a password hash,
  while `POST /api/auth/register/skip-password` creates the same portal user
  with `portal_users.password_hash = null`; both successful completion paths
  consume the one-time registration continuation, link contact/legal acceptance,
  issue the normal signed httpOnly customer `portal_session` cookie and enter
  the protected chat app. Authenticated user snapshots expose
  `passwordConfigured` as `password_hash is not null`.
- граница:
  Password login for a null-hash customer returns the same generic invalid
  credentials as any bad login. A passwordless customer can enter again after
  logout through the public passwordless email-code login flow for already
  registered users, then create the first password later through an email-code
  proof tied to the current customer session. Logged-in first-password setup
  derives user identity from the current session, rejects users who already have
  a hash, stores the first hash only for that current tenant/user and rotates
  customer sessions after success. Tenant-admin sessions and Chatwoot authority
  are not involved.
- причина:
  Known Chatwoot contacts have already proven email control during
  registration, so requiring immediate password setup is unnecessary friction.
  Keeping later password creation behind a fresh email-code proof preserves the
  backend authority boundary, avoids browser-submitted user/email targets and
  lets passwordless rows remain a deliberate state instead of an auth leak.
