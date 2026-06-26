# Work Log

Короткая карта крупных завершенных этапов в `chatwoot-client-portal-v2`.
Мелкие fixes, transient regressions, подробные test runs, deploy logs и
execution-plan детали здесь не хранятся.

## Core Product

- `v2` закреплен как самостоятельный tenant-aware клиентский portal поверх
  Chatwoot.
- Собран рабочий customer portal baseline: auth/session, registration,
  password reset, protected app shell, chat read/send, attachments, realtime,
  notifications, profile и PWA foundation.
- Browser не получает Chatwoot authority; portal backend остается единственной
  authority-зоной для auth, session, profile, send, realtime, webhooks,
  notifications, read/typing sync и Chatwoot access.
- Chatwoot остается system of record для contacts, conversations, messages и
  attachments; portal database хранит только portal-owned данные и runtime
  links.

## Tenant And Runtime Baseline

- `MT-0`-`MT-8` завершены: tenant определяется по Host/domain, runtime
  Chatwoot config принадлежит tenant, persistence/auth/chat/webhooks/frontend
  metadata/PWA identity стали tenant-aware.
- Dedicated install работает как тот же multi-tenant runtime с одним tenant;
  shared SaaS остается целевой моделью для многих tenants.
- Single-tenant `CHATWOOT_*` runtime compatibility удалена; bootstrap идет
  через tenant-owned `DEFAULT_TENANT_CHATWOOT_*`.
- Clean schema baseline принят: `portal_chat_threads` является единственной
  portal chat mapping schema, migration history сжата, старые portal users и
  старые chat mappings не сохраняются.
- Portal maintenance cleanup добавлен для service traces: send ledger,
  webhook deliveries, expired rate-limit buckets, sessions and verification
  records; Chatwoot-owned data and `portal_chat_threads` не удаляются.

## Chat And PWA Baseline

- Portal-owned `threadId` runtime реализован: `private:me` и групповые
  `group:<id>` threads валидируются backend через tenant/session/contact
  boundary, а Chatwoot conversation IDs не являются browser authority.
- Group send добавляет Chatwoot-visible Markdown author prefix; portal transcript
  показывает authors через structured metadata.
- Chat info, media/files, search, bounded history context, support availability
  and working hours работают как chat-adjacent full-screen pages/flows через
  backend authority.
- Attachment, thread, message and participant avatars are exposed only through
  portal-owned proxy URLs; browser does not receive direct Chatwoot asset URLs.
- Group member avatars render in group info and transcript when backend can map
  a participant/contact; unknown group authors keep initials fallback.
- Support messages in group transcripts are visually marked with compact
  `Поддержка` badges only on the first message of each support block.
- Customer read sync and two-way typing are implemented through backend
  Chatwoot Public API/webhook boundaries; portal user-sent messages still show
  `Отправлено`, not fake support-read receipts.
- Chat notifications are tenant/user/thread scoped: global settings,
  chat-level overrides, sound, Web Push subscription lifecycle, safe push
  routing metadata, backend-owned unread counts and app badge updates.
- Offline-first PWA MVP is implemented: app shell cache, scoped IndexedDB
  tenant/auth/chat snapshots, durable text outbox, foreground drain,
  Background Sync progressive enhancement and unified startup/connection UX.

## Profile Baseline

- `Профиль` is available from the grouped right chat menu as a protected
  full-screen app route.
- Profile fields are read-only: `Имя`, `Email`, `Телефон`.
- Profile data uses portal user plus linked Chatwoot contact boundary; missing
  contact fails closed without exposing Chatwoot authority.
- Avatar upload/replace goes through portal backend, validates JPEG/PNG/GIF up
  to `15 MB`, updates only the current linked Chatwoot contact and returns a
  portal-owned `/api/profile/avatar` URL.

## Production Baseline

- Production Chatwoot CE is `v4.15.1`; portal webhook signing uses the tenant
  API Channel `channel_api.secret`.
- Primary production Chatwoot admin/runtime URL is `https://app.lancora.ru`;
  no legacy Chatwoot host is part of the active production runtime baseline.
- Production portal is deployed at `https://lk.provgroup.ru` as tenant-aware
  install for `provgroup`, using Chatwoot base URL `https://app.lancora.ru`.
- `https://lk.pronalogi.pro` is provisioned as the first customer tenant:
  portal tenant `pronalogi` is active, uses Chatwoot account `2`, API Channel
  inbox `6`, Chatwoot base URL `https://app.lancora.ru`, and has its tenant
  webhook configured.
- `MT-10` production tenant smoke is complete for the first two customer
  tenants: `pronalogi` (`https://lk.pronalogi.pro`, Chatwoot account `2`, API
  inbox `6`) and `provgroup` (`https://lk.provgroup.ru`, Chatwoot account `1`,
  API inbox `5`) both resolve by tenant host, pass Chatwoot connection
  verification and support customer login plus portal-to-Chatwoot messaging
  through `https://app.lancora.ru`.
- Production service mail sender is `Lancora <no-reply@lancora.ru>` through
  Yandex 360 SMTP for both portal verification emails and Chatwoot service
  mail.
- Custom client-domain ingress/cert automation is available through
  `scripts/configure-tenant-domain-ingress.sh`: it verifies DNS, prepares a
  dedicated host Nginx portal site, backs up changed files, issues/verifies
  Let’s Encrypt TLS and checks `/api/tenant` before and after `tenant:create`.
- Production deploy source tracking is explicit: clean deploys come from
  reviewed commits, `origin/main` is synced, and `DEPLOY_SOURCE.txt` records
  branch, commit and dirty status.
- Current production code source is tracked on the VM in
  `/opt/chatwoot-client-portal-v2/DEPLOY_SOURCE.txt` after each clean archive
  deploy from reviewed `origin/main`.

## Current Baseline

- Main source-of-truth docs are `docs/architecture/overview.md`,
  `docs/architecture/decisions.md`, `docs/roadmap/implementation-plan.md`,
  `docs/roadmap/work-log.md`, `docs/design/portal-ui-ux-baseline.md` and
  `docs/findings/`.
- `docs/superpowers/` execution artifacts are not stable source of truth after
  implementation; completed artifacts were removed during the current docs
  cleanup, while still-relevant deferred/partial artifacts remain there with
  explicit status headers.
- Open risks and deferred follow-ups remain in `docs/findings/` or, for
  preserved execution context, in `docs/superpowers/`.
- `F-MT-004` is closed: tenant admin verification has a separate nullable
  encrypted per-tenant Chatwoot admin-verification token, dedicated backend
  lookup/decryption boundary and fail-closed Agents API parser/service.
- `MT-9B` is closed: tenant admin auth backend foundation has tenant-scoped
  login challenges, separate admin sessions/cookie, email code verification,
  logout and tenant-scoped audit events without Chatwoot authority in browser.
- `MT-9C` is closed: React admin login/session UI uses the separate admin
  auth boundary, `/admin/branding` is a protected read-only console shell, and
  browser admin runtime stores no Chatwoot tokens or offline admin session data.
- `MT-9D` is closed: tenant-owned branding settings persistence,
  public/admin branding APIs, tenant admin audit events and first admin UI data
  wiring are implemented without binary asset upload or browser object keys.
- `MT-9E` is closed: branding asset binary upload/read/delete is backed by
  S3-compatible object storage through backend-owned routes, public/admin
  responses expose portal URLs and safe opaque asset versions only, uploads
  validate image signatures, and tenant PWA icon routes can use an active
  tenant-owned `pwa_icon` asset with fallback icons and cache-version guards
  preserved.
- `MT-9F` is closed: protected tenant admin branding UI can upload, replace and
  delete logo, PWA icon and configured auth/chat image slots, refreshes previews
  through portal-owned asset URLs and keeps settings saves isolated from asset
  operations.
- `MT-9G` is closed: customer auth, chat, chat-info and empty chat runtime
  surfaces consume public tenant branding background/text colors, copy and
  portal-owned image asset URLs, and tenant PWA manifest colors now follow saved
  branding settings without exposing object-storage authority.
- `MT-9H` admin preview parity checkpoint is closed: `/admin/branding` now
  shows read-only real portal preview screens for `Вход`, `Чат` and `Инфо`,
  updates from unsaved draft values and is covered against customer runtime API
  calls and desktop layout overflow.
- Branding reset/default visual parity is corrected: no-assets color reset
  restores production-like auth/chat/info defaults, keeps PWA manifest defaults
  and keeps chat header text readable when only header background changes.
- Auth branding now uses the approved Full Background design model: tenant
  admins can style login screens through a prepared full-screen auth
  background, light/dark appearance presets, overlay protection, field/button
  style presets and real runtime preview parity. Separate auth form background
  controls were removed from the active branding contract.
- Auth legal UX has public terms/privacy pages, informational login legal links
  and explicit registration consent with backend persistence.
- Accepted customer UI visual baseline now uses the branded full-background
  auth/chat direction: Inter auth pages, logo alignment/size controls, explicit
  registration consent, legal reader pages, translucent chat shell/composer,
  glass secondary chat surfaces and runtime/admin preview parity over the
  tenant-owned chat background asset.
- Branding asset storage is packaged as portal-owned production infrastructure:
  the default one-VM production stack runs internal object storage, while
  browser access stays through portal-owned asset URLs.
- `MT-9H` final branding QA/docs/deploy readiness is closed for production
  push readiness: automated backend/frontend/browser gates, production
  build/lint, production object-storage compose/init smoke and local runtime
  asset upload/readback smoke passed. Real-device installed PWA smoke remains a
  production post-deploy check.
- `MT-10` deployment/runbook documentation baseline is added: routine deploy,
  clean reinstall, tenant provisioning boundaries, domain rules, tenant
  Chatwoot verification, secret rotation, backup/restore and production
  acceptance checks are linked from one operations index.
- `MT-10A` operator tenant lifecycle tooling is implemented: CLI tenant
  creation provisions Chatwoot account/admin/service users/API Channel inbox
  and portal tenant secrets, provider-owned subdomain mode derives
  `<tenant-slug>.<PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX>`, reconciliation detects
  Chatwoot account drift, and deprovisioning supports explicit-confirmation
  archive or Chatwoot account delete request.
- `MT-10A` tenant provisioning now reconciles the required Chatwoot contact
  custom attribute definitions for portal operation:
  `portal_enabled`, `portal_contact_type`, `portal_client_group_contact_ids`
  and `curator_name`. Existing tenants can be repaired with the operator
  `tenant:chatwoot:ensure-portal-attributes` command.
- Agent execution governance now uses risk-based efficiency rules: full review
  flow remains mandatory for high-risk auth/security/migration/runtime work,
  while low-risk docs/UI-polish work should avoid duplicate subagent/review
  cycles and verbose generated-output churn.
- Portal-owned backward compatibility is not preserved before a separate
  real-customer data decision: old portal cache/data/API/env/UI contracts are
  removed in the same scope when replaced, unless the user explicitly approves a
  temporary compatibility shim with a removal trigger.
- Tenant legal document and support contact baseline is implemented:
  tenant admins upload active terms/privacy documents as PDF/DOCX/TXT without
  inline editing, backend stores extracted active versions in portal DB,
  registration consent records use those active versions, public legal pages
  load document text from backend, and support phone is tenant branding contact
  metadata instead of a frontend default.
- PWA offline launch regression baseline is added: installed-app cold launch
  from `/` while offline is covered after online chat cache warmup, and
  foreground badge clearing no longer depends on worker-side platform badging.
- Installed PWA startup shell now pre-caches the blocking startup surface
  script, so VPN-like half-open launches can leave the native splash and reach
  cached chat state instead of waiting on a network fetch before first paint.
- Chat avatar proxy cacheability is enabled for offline-first reads: chat
  avatar routes use private cookie-varying cache headers, service worker
  handles only chat avatar proxy images from `/api`, cached avatar entries are
  scoped by current tenant/user identity, and attachment/API routes stay outside
  the service-worker cache boundary.
- Offline read-only auth window follows backend `sessionExpiresAt`, not a
  separate 24 hour browser grace; expired backend sessions and explicit local
  sign-out still require online/session-check before exposing cached chat, and
  cached auth records remember the latest observed client clock to reject later
  rollback behind that observation.
- Customer `portal_session` now uses a 30-day idle timeout with a 15-day renewal
  window: explicit same-origin `/api/auth/me` checks can refresh valid customer
  sessions and cookies, ordinary protected APIs do not write sessions, and
  offline auth snapshots persist the refreshed backend `sessionExpiresAt`.
- Lazy-loaded older chat history reuses scoped IndexedDB older-page cache when
  an online history request falls to connection-unavailable, so warmed older
  pages can still render during degraded/offline PWA sessions.
- Chat recovery no longer depends only on a fresh browser `online` event after
  request-detected offline: the open chat now probes backend snapshot recovery
  while the browser hint says online or local text is queued, drains queued text
  after proven recovery, and treats network failure from any same-user text
  outbox thread as a tenant-level offline signal without rewriting another
  thread's transcript.
- Chat recovery requests are bounded for degraded/half-open networks:
  non-startup snapshot, unread, stale-marker, older-history, support
  availability, attachment send and service-worker background text-send paths
  now abort into controlled retry/error handling, and background text recovery
  has a real same-origin service-worker network smoke.
- PWA install prompt is a progressive enhancement: Chromium `beforeinstallprompt`
  is captured for an explicit chat-ready install CTA, iOS keeps manual
  Add-to-Home-Screen instructions, standalone launches suppress install UI, and
  dismissals are scoped to the current tenant host.
- Tenant-aware Telegram bridge baseline is implemented: tenant admins can
  create bridge configs from the portal admin UI after creating a Chatwoot
  Telegram inbox, Telegram updates are handled by a separate bridge service
  with encrypted tenant config, webhook owner preflight, path/header secrets,
  Postgres update dedupe, Chatwoot exact phone lookup, group message
  transformation and production operations runbook.
- Telegram bridge webhook URLs are tenant-owned: admin setup and operator
  webhook configure/info now derive `/telegram-bridge/*` public URLs from
  `tenant.publicBaseUrl`, and the old global
  `TELEGRAM_BRIDGE_PUBLIC_BASE_URL` env contract is removed from runtime,
  Compose, env upgrade helpers and current operations docs.
- Telegram bridge review hardening baseline is implemented: bot replacement
  through an existing bridge is rejected, webhook route secrets are redacted
  from request logs, private phone-contact retries do not repeat external side
  effects, processed/failed bridge delivery rows are covered by retention
  cleanup, admin setup has app-level tenant isolation coverage, and the
  production backend image uses a test-excluding build config.
- Registration completion is password-optional at the backend boundary:
  set-password and skip-password both consume the verified registration
  continuation, create the portal user/contact/legal links, issue a normal
  customer session and keep null-hash password login indistinguishable from
  invalid credentials.
- Password-later backend setup is implemented for passwordless portal users:
  protected password setup derives identity from the current customer session,
  requires an email-code proof before first password storage, rejects already
  configured passwords, rotates customer sessions after success, and guards
  stale delivery cleanup from invalidating newer setup codes.
- Password reset behavior is covered for nullable customer passwords: logged-out
  passwordless users can set their first password through the existing email-code
  reset flow, and reset completion still returns the user to login.
- Frontend auth API contracts now use authenticated registration completion
  responses, expose registration skip-password and protected password-setup
  client methods, and require `passwordConfigured` in authenticated user
  snapshots.
- Frontend auth state handoff is implemented: authenticated backend completion
  responses can hydrate the customer auth context, persist online auth
  snapshots, and ignore stale startup session-check results.
- Registration completion UI now treats password creation as optional: users can
  either set a password immediately or continue to chats without one, and both
  successful paths enter the protected app through the customer auth context.
- Profile security UI now lets passwordless users set their first password while
  logged in through a protected email-code challenge and rotated authenticated
  session handoff; configured-password users see status only.
- Passwordless repeat login is implemented: already registered customer users
  can enter through a tenant-scoped email-code login flow without browser auth
  tokens, successful verification issues the normal customer `portal_session`,
  and passwordless users get an explicit warning before manual logout.

## Recommended Next Step

- Run a manual local browser smoke of the passwordless login/logout flow before
  merge or production deployment.
