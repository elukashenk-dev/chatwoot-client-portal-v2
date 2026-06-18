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

- Production Chatwoot CE is `v4.13.0`; portal webhook signing uses the tenant
  API Channel `channel_api.secret`.
- Production portal is deployed at `https://lk.provgroup.ru` as tenant-aware
  one-tenant install for `provgroup`.
- Production deploy source tracking is explicit: clean deploys come from
  reviewed commits, `origin/main` is synced, and `DEPLOY_SOURCE.txt` records
  branch, commit and dirty status.
- Current production source is `main` commit `43f52e9` with profile avatar,
  group member avatars and group support badge slices deployed.

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
- Agent execution governance now uses risk-based efficiency rules: full review
  flow remains mandatory for high-risk auth/security/migration/runtime work,
  while low-risk docs/UI-polish work should avoid duplicate subagent/review
  cycles and verbose generated-output churn.

## Recommended Next Step

- Complete final verification/review for the accepted chat/auth visual polish
  branch, merge it into `main`, and keep first-run legal document copy blocked
  from production rollout until operator-approved legal texts replace the
  current test templates.
