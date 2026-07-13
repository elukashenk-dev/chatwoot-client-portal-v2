# Stage 00: Baseline And Regression Safety Net

Status: complete
Frozen commit: `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`
Source worktree:
`/home/evluk/projects/chatwoot-client-portal-v2-audit-source-2026-07-13`

## Toolchain And Repository Inventory

| Measure                                                              | Observed value                            |
| -------------------------------------------------------------------- | ----------------------------------------- |
| Node.js                                                              | `v24.13.0`                                |
| pnpm                                                                 | `10.33.0`                                 |
| Tracked files                                                        | 934                                       |
| Backend TypeScript files                                             | 343                                       |
| Frontend TypeScript/TSX files                                        | 381                                       |
| Backend test files                                                   | 125                                       |
| Frontend test files                                                  | 127                                       |
| Playwright spec files                                                | 19                                        |
| Workspace packages                                                   | 3 projects / 53 top-level package entries |
| Backend direct Fastify method registrations found by inventory regex | 53                                        |
| Backend route/module registration files                              | 21                                        |
| Frontend unique declared route paths                                 | 19                                        |
| Drizzle `pgTable` declarations                                       | 24                                        |
| Drizzle SQL migrations                                               | 25                                        |

The frozen source installed with `pnpm install --frozen-lockfile`; the lockfile
was already current and no tracked source changed.

## Runtime Entrypoints And Contracts

- `backend/src/server.ts` loads validated environment, opens the isolated
  portal database, runs migrations and starts the Fastify application.
- `backend/src/app.ts` assembles tenant resolution, customer/admin auth,
  branding/legal/profile, chat, notification, realtime and webhook modules.
  Request-scoped Chatwoot clients are created only from the resolved tenant.
- `backend/src/telegram-bridge/server.ts` is a separate Fastify process with
  its own health route, bounded body size, redacted request URL logging and
  tenant-config lookup behind route/header secrets.
- `frontend/src/app/AppRoutes.tsx` declares separate customer and tenant-admin
  route/session boundaries. `frontend/src/app/routePaths.ts` exposes 19 unique
  paths; the active customer entry route is `/auth/login`, and password login
  is secondary at `/auth/login/password`.
- `frontend/public/sw.js` is a 1,689-line service worker with app-shell cache,
  scoped chat-avatar cache, Web Push handling and durable text-outbox recovery.
  Detailed correctness and boundedness review is deferred to the frontend/PWA
  and load stages.
- `infra/production/compose.yaml` defines isolated portal Postgres, internal
  object storage/init, portal backend, Telegram bridge and portal web services.
- The current schema exposes 24 tables across tenant, customer/admin auth,
  chat, notification, branding/legal, provisioning and Telegram domains.

## API And Schema Inventory

The backend inventory found 53 direct `app.get/post/patch/delete` statements
across 21 route/module files. The active groups include:

```text
health and tenant metadata/PWA; customer auth/code-login/password-reset/
password-setup; profile; legal documents; tenant-admin auth; branding/assets;
Telegram bridge admin; chat threads/messages/attachments/media/search;
support availability; notification settings/push; read/typing; SSE;
Chatwoot webhook; standalone Telegram bridge health/update
```

The 24 declared tables are:

```text
portal_tenants; portal_users; portal_legal_acceptances; portal_sessions;
portal_user_contact_links; portal_chat_threads; portal_chat_message_sends;
portal_rate_limit_buckets; chatwoot_webhook_deliveries;
verification_records; portal_admin_login_challenges; portal_admin_sessions;
portal_admin_audit_events; portal_branding_assets; portal_branding_settings;
portal_legal_documents; portal_user_notification_preferences;
portal_chat_notification_preferences; portal_push_subscriptions;
portal_push_deliveries; portal_chat_unread_messages;
tenant_provisioning_runs; telegram_bridge_configs;
telegram_bridge_deliveries
```

Schema/migration equivalence, index suitability and repository scope remain
for the backend/data stage.

## Initial Automated Baseline

`pnpm test` completed with exit code 0 from the frozen source:

- backend: 125 files, 842 tests passed;
- frontend: 127 files, 732 tests passed;
- production environment upgrade/ingress script checks passed.

This is evidence for the existing unit/integration baseline only. Lint, build
and browser runtime checks remain assigned to Stage 09 dynamic validation.

## Regression Safety-Net Map

| Boundary                  | Backend tests                                                                                                                                                                                                                                                                                                                  | Frontend tests                                                                                                                                                                                                                                                                         | Playwright specs                                                                                                                                                                       | Current gap                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Tenant resolution         | `backend/src/modules/tenants/routes.test.ts`; `backend/src/modules/tenants/repository.test.ts`; `backend/src/modules/tenants/service.test.ts`                                                                                                                                                                                  | `frontend/src/features/tenant/lib/TenantProvider.test.tsx`                                                                                                                                                                                                                             | `tests/e2e/pwa-runtime-smoke.spec.ts`; `tests/e2e/customer-branding-runtime.spec.ts`                                                                                                   | No dedicated cross-host browser isolation scenario                                    |
| Customer auth/session     | `backend/src/app-auth.integration.test.ts`; `backend/src/app-passwordless-login.integration.test.ts`; `backend/src/modules/auth/service.test.ts`; `backend/src/modules/password-reset/service.test.ts`; `backend/src/app-password-setup.integration.test.ts`; `backend/src/app-password-setup-email-proof.integration.test.ts` | `frontend/src/features/auth/api/authClient.test.ts`; `frontend/src/features/auth/lib/AuthSessionProvider.offline.test.tsx`; `frontend/src/features/auth/pages/PasswordlessLoginPages.test.tsx`; `frontend/src/features/auth/pages/LoginPage.test.tsx`                                  | `tests/e2e/auth-email-flows.spec.ts`; `tests/e2e/auth-guard-negative.spec.ts`; `tests/e2e/auth-session.spec.ts`; `tests/e2e/auth-smoke.spec.ts`                                        | Browser scenarios still target removed registration and primary password-login UI     |
| Tenant-admin auth/session | `backend/src/app-admin-auth.integration.test.ts`; `backend/src/modules/tenant-admin/adminAuthRepository.test.ts`; `backend/src/modules/tenant-admin/adminAuthService.test.ts`; `backend/src/modules/tenant-admin/adminVerification.test.ts`                                                                                    | `frontend/src/features/admin-auth/lib/AdminSessionProvider.test.tsx`; `frontend/src/features/admin-auth/pages/AdminLoginPage.test.tsx`; `frontend/src/app/layouts/AdminPublicRoute.test.tsx`                                                                                           | `tests/e2e/admin-login-ui.spec.ts`                                                                                                                                                     | No browser cross-host admin isolation scenario                                        |
| Persistence               | Repository tests across `backend/src/modules/**/repository.test.ts`; `backend/src/test/testDatabase.cache.test.ts`; `backend/src/test/testDatabase.isolation.test.ts`                                                                                                                                                          | Not applicable                                                                                                                                                                                                                                                                         | Not applicable                                                                                                                                                                         | No explicit committed-schema versus migration drift gate identified                   |
| Chat read/send            | `backend/src/modules/chat-threads/service.test.ts`; `backend/src/modules/chat-messages/service.test.ts`; `backend/src/modules/chat-messages/repository.test.ts`; `backend/src/modules/chat-messages/routes.test.ts`                                                                                                            | `frontend/src/features/chat/pages/ChatPage.test.tsx`; `frontend/src/features/chat/pages/ChatPage.optimistic-send.test.tsx`; `frontend/src/features/chat/pages/ChatPage.history.test.tsx`                                                                                               | `tests/e2e/chat-read-model.spec.ts`; `tests/e2e/chat-search-page.spec.ts`                                                                                                              | Browser login helper is stale before chat assertions execute                          |
| Attachments               | `backend/src/modules/chat-messages/service.attachment-proxy.test.ts`; `backend/src/modules/chat-messages/routes.attachment-proxy.test.ts`; `backend/src/modules/profile/avatarValidation.test.ts`; `backend/src/modules/branding/assetValidation.test.ts`                                                                      | `frontend/src/features/chat/components/MessageComposer.test.tsx`; `frontend/src/features/profile/pages/UserProfilePage.test.tsx`; `frontend/src/features/admin-branding/components/BrandingAssetControls.test.tsx`                                                                     | `tests/e2e/chat-read-model.spec.ts`; `tests/e2e/profile-page.spec.ts`; `tests/e2e/admin-branding-assets.spec.ts`                                                                       | Customer attachment/profile specs use stale login helper                              |
| Webhooks/SSE              | `backend/src/modules/chatwoot-webhooks/service.test.ts`; `backend/src/modules/chatwoot-webhooks/repository.test.ts`; `backend/src/modules/chat-realtime/hub.test.ts`; `backend/src/modules/chat-realtime/routes.test.ts`                                                                                                       | `frontend/src/features/chat/api/chatRealtimeClient.test.ts`; `frontend/src/features/chat/pages/useChatRealtimeConnection.test.tsx`; `frontend/src/features/chat/pages/ChatPage.realtime-fallback.test.tsx`                                                                             | `tests/e2e/chat-read-model.spec.ts`; `tests/e2e/chat-customer-read-and-typing.spec.ts`                                                                                                 | Browser login helper is stale; webhook signature remains backend-tested only          |
| Unread/read/typing        | `backend/src/modules/chat-unread/repository.test.ts`; `backend/src/modules/chat-presence/service.test.ts`; `backend/src/modules/chatwoot-webhooks/service.typing.test.ts`                                                                                                                                                      | `frontend/src/features/chat/pages/ChatPage.unread-indicators.test.tsx`; `frontend/src/features/chat/pages/useChatReadSync.test.tsx`; `frontend/src/features/chat/pages/useChatTypingSync.test.tsx`                                                                                     | `tests/e2e/chat-customer-read-and-typing.spec.ts`; `tests/e2e/chat-notifications.spec.ts`                                                                                              | Browser login helper is stale                                                         |
| Push                      | `backend/src/modules/chat-notifications/pushDeliveryService.test.ts`; `backend/src/modules/chat-notifications/pushSubscriptionService.test.ts`; `backend/src/modules/chat-notifications/recipientResolver.test.ts`                                                                                                             | `frontend/src/features/chat/pages/notificationBrowserPush.test.ts`; `frontend/src/pwa/serviceWorkerNotificationOptions.test.ts`; `frontend/src/pwa/serviceWorkerPushStaleMarkers.test.ts`                                                                                              | `tests/e2e/chat-notifications.spec.ts`                                                                                                                                                 | No real push-provider delivery test; customer browser login helper is stale           |
| Offline auth/cache/outbox | Backend send/session invariants above                                                                                                                                                                                                                                                                                          | `frontend/src/features/offline/offlineStore.test.ts`; `frontend/src/features/offline/offlineOutboxStore.test.ts`; `frontend/src/features/offline/outboxDrain.test.ts`; `frontend/src/features/offline/bootCoordinator.test.ts`; `frontend/src/pwa/serviceWorkerBackgroundSync.test.ts` | `tests/e2e/offline-first-pwa.spec.ts`; `tests/e2e/chat-background-sync-real-network.spec.ts`                                                                                           | Both browser specs use stale login helper; real-device iOS remains unverified         |
| Branding/legal/storage    | `backend/src/app-branding.integration.test.ts`; `backend/src/app-legal-documents.integration.test.ts`; `backend/src/modules/branding/repository.test.ts`; `backend/src/modules/legal-documents/repository.test.ts`; `backend/src/integrations/object-storage/brandingStorage.test.ts`                                          | `frontend/src/features/admin-branding/components/AdminBrandingForm.test.tsx`; `frontend/src/features/branding/lib/BrandingProvider.test.tsx`; `frontend/src/features/auth/components/LegalConsentCheckboxes.test.tsx`                                                                  | `tests/e2e/admin-branding-settings.spec.ts`; `tests/e2e/admin-branding-assets.spec.ts`; `tests/e2e/admin-branding-real-preview.spec.ts`; `tests/e2e/customer-branding-runtime.spec.ts` | Customer branding assertions include removed registration UI                          |
| Telegram                  | `backend/src/app-telegram-bridge-admin.integration.test.ts`; `backend/src/telegram-bridge/server.test.ts`; `backend/src/telegram-bridge/service.test.ts`; `backend/src/telegram-bridge/updateDedupeRepository.test.ts`; `backend/src/modules/telegram-bridge-admin/service.test.ts`                                            | `frontend/src/features/admin-telegram-bridge/components/AdminTelegramBridgeForm.test.tsx`; `frontend/src/features/admin-shell/pages/AdminTelegramBridgePage.test.tsx`                                                                                                                  | None                                                                                                                                                                                   | Browser admin setup flow has no Playwright coverage                                   |
| Deploy/restore            | `backend/src/buildConfig.test.ts`; `backend/src/scripts/installMaintenanceCleanupTimer.test.ts`; root `pnpm test:ops`                                                                                                                                                                                                          | Not applicable                                                                                                                                                                                                                                                                         | Not applicable                                                                                                                                                                         | No automated backup/restore rehearsal; operations stage must inspect runbooks/scripts |

## CI Gates

`.github/workflows/ci.yml` runs frozen install, `pnpm lint`, `pnpm build` and
`pnpm test` on pushes and pull requests to `main`. Root `pnpm test` contains
workspace Vitest plus ops script checks; `pnpm test:e2e` is a separate command
and is not called by CI.

## Environment Requirements

- Unit/integration baseline uses Node.js 24, pnpm 10 and test-isolated portal
  databases; no production system is required.
- Local browser checks require portal Postgres, backend and frontend. Branding
  asset scenarios also require portal-owned local S3-compatible storage.
- Email-code scenarios require Mailpit at the configured local URL.
- Chatwoot-mutating fixtures require `E2E_CHATWOOT_BASE_URL`,
  `E2E_CHATWOOT_ACCOUNT_ID`, `E2E_CHATWOOT_PORTAL_INBOX_ID` and
  `E2E_CHATWOOT_API_ACCESS_TOKEN`. They must pass the local-only host gate
  before use.
- Playwright global setup runs portal migrations, bootstraps the default tenant
  and seeds a test portal user from local `.env` values.

## Candidates

### BASE-001: Playwright customer runtime is stale after unified code login

- Status: `candidate`
- Severity hypothesis: Medium
- Confidence: high
- Evidence: current routes in `frontend/src/app/routePaths.ts:17-24` and
  `frontend/src/app/AppRoutes.tsx:130-180`; stale browser flows in
  `tests/e2e/auth-email-flows.spec.ts:58-190`,
  `tests/e2e/auth-guard-negative.spec.ts:33-174`,
  `tests/e2e/auth-session.spec.ts:5-103`, and eleven additional affected
  customer-runtime files found by the same stale login/registration patterns.
- Reachability/failure path: a spec enters `/auth/register` or expects password
  controls at `/auth/login`; the current router redirects or renders the
  code-request form before the intended scenario can execute. Fourteen of the
  nineteen Playwright spec files contain one of these stale assumptions.
- Counterevidence: backend and frontend unit/integration tests cover the new
  code-login flow, and `backend/src/app.test.ts:547-550` explicitly verifies
  that legacy registration APIs do not exist. This does not validate the
  browser runtime.
- Validation: run targeted local-only Playwright in Stage 09 and record exact
  failures/blockers.

Affected Playwright files:

```text
tests/e2e/auth-email-flows.spec.ts
tests/e2e/auth-guard-negative.spec.ts
tests/e2e/auth-session.spec.ts
tests/e2e/auth-smoke.spec.ts
tests/e2e/chat-background-sync-real-network.spec.ts
tests/e2e/chat-customer-read-and-typing.spec.ts
tests/e2e/chat-group-member-avatars.spec.ts
tests/e2e/chat-group-support-badge.spec.ts
tests/e2e/chat-notifications.spec.ts
tests/e2e/chat-read-model.spec.ts
tests/e2e/chat-search-page.spec.ts
tests/e2e/customer-branding-runtime.spec.ts
tests/e2e/offline-first-pwa.spec.ts
tests/e2e/profile-page.spec.ts
```

### BASE-002: Stable roadmap documents describe obsolete next work

- Status: `candidate`
- Severity hypothesis: Low
- Confidence: high
- Evidence: `docs/roadmap/work-log.md:281-285` recommends review of absent
  branch `feature/auth-email-code-primary`; `docs/architecture/overview.md:545-550`
  still calls MT-9 the next architecture work; and
  `docs/roadmap/implementation-plan.md:62-69` keeps already-closed MT-9 under
  Active Roadmap.
- Reachability/failure path: a new agent following mandatory source-of-truth
  docs can select a nonexistent branch or reopen completed scope instead of
  using current `main`.
- Counterevidence: the same documents contain later completed-baseline text,
  and code remains source of truth; there is no direct runtime impact.
- Validation: check branch/history and current code baseline during canonical
  validation; documentation is not modified during discovery.

### BASE-003: Pull-request CI does not execute browser regression tests

- Status: `candidate`
- Severity hypothesis: Medium
- Confidence: high
- Evidence: root `package.json:21-25` separates `test` and `test:e2e`, while
  `.github/workflows/ci.yml:28-38` ends after install, lint, build and
  `pnpm test`.
- Reachability/failure path: a browser-only route, service-worker or layout
  regression can merge while CI remains green; the current 14-file stale auth
  mismatch demonstrates that the CI gate does not exercise Playwright.
- Counterevidence: 1,574 backend/frontend tests pass and the repository has 19
  manually runnable Playwright specs. Those checks reduce but do not close the
  browser-runtime gap.
- Validation: confirm current workflow behavior and evaluate a bounded
  critical-browser CI subset during operations/canonical stages.

## Unverified Areas

- No Playwright spec was executed in this stage; Stage 09 owns dynamic browser
  validation and fixture safety gates.
- Schema/migration equivalence, query/index support and transaction behavior
  remain for the backend/data stage.
- External Chatwoot API compatibility remains for the integration stage.
- Production backup/restore, real Web Push delivery and installed iOS PWA
  behavior remain unverified.

No likely Critical issue was identified during baseline inventory.
