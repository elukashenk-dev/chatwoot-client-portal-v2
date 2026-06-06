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
- Open architecture gate before tenant admin/branding: `F-MT-004`.

## Recommended Next Step

- Start `MT-9` with the `F-MT-004` Chatwoot permissions spike and separate
  tenant admin-verification token boundary.
