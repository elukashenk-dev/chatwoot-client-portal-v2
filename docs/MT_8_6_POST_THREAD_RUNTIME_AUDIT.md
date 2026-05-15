# MT-8.6 Post-Thread Runtime Audit

Date: 2026-05-15
Status: completed with evidence blockers before MT-9

## Executive Summary

- Production smoke: blocked after public endpoint checks because the approved
  test account was rejected by production login.
- Automated baseline checks: pass except local Playwright e2e, blocked because
  the local frontend origin was unavailable on `127.0.0.1:5173`.
- MT-9 readiness: no required chat/runtime cleanup, refactoring or dead-code
  slice was found before `MT-9`, but `MT-8.6` is not release-valid until the
  production provenance/authenticated smoke blockers and local Playwright blocker
  are resolved or explicitly accepted by the operator.

## Production Provenance And Smoke

### Release Provenance

| Check                                        | Result  | Evidence                                                                                                                                                                                                                                                                                  |
| -------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local branch and commit                      | pass    | `git rev-parse --abbrev-ref HEAD` -> `docs/mt-8-6-post-thread-runtime-audit`; `git rev-parse HEAD` -> `947bf3bb1a90de41eda8519a541e0978cb7b890c`.                                                                                                                                         |
| Local working tree state                     | pass    | `git status --short` returned no output before creating this report.                                                                                                                                                                                                                      |
| Production `DEPLOY_SOURCE.txt`               | blocker | `PORTAL_PROD_SSH_HOST` was unset in the audit shell, so the required SSH command was not run: `ssh "$PORTAL_PROD_SSH_HOST" 'set -euo pipefail; cd /opt/chatwoot-client-portal-v2; cat DEPLOY_SOURCE.txt; docker compose --env-file .env.production -f infra/production/compose.yaml ps'`. |
| Deployed commit contains post-thread runtime | blocker | Cannot validate until production `DEPLOY_SOURCE.txt` is available. Next unblock action: export the production SSH target for this shell and rerun the required provenance command.                                                                                                        |
| `F-PROD-002` impact                          | open    | `docs/Findings/F-PROD-002-release-source-remote-drift.md`; production smoke is not release-valid without deployed source provenance.                                                                                                                                                      |

Local recent commit evidence:

```text
947bf3b (HEAD -> docs/mt-8-6-post-thread-runtime-audit) docs: add mt-8.6 implementation plan
bd3631c docs: plan post-thread runtime audit
0afc71e (feature/phase-chat-thread-frontend-runtime) test: complete chat thread runtime verification
d16a390 feat: switch portal chat threads in ui
60aa040 (feature/phase-chat-thread-realtime-webhooks) feat: publish realtime by chat thread
```

### Functional Smoke

| Flow                                                      | Result  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://lk.provgroup.ru/api/health`                      | pass    | `curl -fsS https://lk.provgroup.ru/api/health` -> `{"app":"chatwoot-client-portal-v2","environment":"production","status":"ok"}`.                                                                                                                                                                                                                                                                                                                  |
| `https://lk.provgroup.ru/api/tenant`                      | pass    | `curl -fsS https://lk.provgroup.ru/api/tenant` -> `{"tenant":{"displayName":"PROVGROUP","primaryDomain":"lk.provgroup.ru","publicBaseUrl":"https://lk.provgroup.ru","slug":"provgroup"}}`.                                                                                                                                                                                                                                                         |
| `https://lk.provgroup.ru/api/tenant/manifest.webmanifest` | pass    | `curl -fsS https://lk.provgroup.ru/api/tenant/manifest.webmanifest` returned tenant-aware manifest with `name` = `PROVGROUP Личный кабинет`, `id` = `https://lk.provgroup.ru/`, `start_url` = `/`, `scope` = `/`, and tenant fallback icon URLs under `/api/tenant/icons/...v=provgroup-fallback-v1`.                                                                                                                                              |
| Login with approved test account                          | blocker | Browser opened `https://lk.provgroup.ru`, was redirected to `/auth/login`, showed `PROVGROUP Личный кабинет`, and displayed a "Доступна новая версия приложения" update prompt. After clicking `Обновить` and retrying the approved test email with the provided password, login remained on `/auth/login` with alert `Неверный email или пароль.` Next unblock action: verify or reset the production test user's credentials, then repeat smoke. |
| Private thread history/send                               | blocker | Login blocker prevented reaching authenticated chat runtime.                                                                                                                                                                                                                                                                                                                                                                                       |
| Company thread listing/send                               | blocker | Login blocker prevented checking whether production test contacts have company threads configured.                                                                                                                                                                                                                                                                                                                                                 |
| Chatwoot admin author prefix view                         | blocker | No separate logged-in Chatwoot admin browser/session was available, and login blocker prevented sending a message to verify. Next unblock action: provide an already-authenticated Chatwoot admin session after portal login is unblocked.                                                                                                                                                                                                         |
| Realtime delivery                                         | blocker | Login blocker prevented authenticated realtime validation; no second authenticated browser/device was available in this audit step.                                                                                                                                                                                                                                                                                                                |

## Automated Baseline Checks

| Command                         | Result  | Evidence                                                                                                                                                                                                                    |
| ------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --dir backend test`       | pass    | Exit 0. Vitest: 36 files passed, 220 tests passed.                                                                                                                                                                          |
| `pnpm --dir frontend test`      | pass    | Exit 0. Vitest: 16 files passed, 93 tests passed.                                                                                                                                                                           |
| `pnpm --dir backend build`      | pass    | Exit 0. `tsc -p tsconfig.json` completed with no diagnostics.                                                                                                                                                               |
| `pnpm --dir frontend typecheck` | pass    | Exit 0. `tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json` completed with no diagnostics.                                                                                                            |
| `pnpm --dir frontend build`     | pass    | Exit 0. `tsc -b && vite build && node ./scripts/stamp-service-worker.mjs`; Vite built 124 modules and stamped the service worker.                                                                                           |
| `pnpm lint`                     | pass    | Exit 0. Code health OK: 245 files checked; backend and frontend ESLint completed.                                                                                                                                           |
| `pnpm test:e2e`                 | blocker | Exit 1. Playwright ran 25 tests and all 25 failed because local service `http://127.0.0.1:5173` was unavailable: `page.goto: net::ERR_CONNECTION_REFUSED` and `apiRequestContext.get: connect ECONNREFUSED 127.0.0.1:5173`. |
| `git diff --check`              | pass    | Exit 0. No whitespace errors reported.                                                                                                                                                                                      |

## Audit Map

| Area                                                             | Authority Boundary                                                                                                                                                                                                                                                                                                                               | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Test Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Decision                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Backend tenant/session authority                                 | Tenant is resolved from request host before auth/chat runtime; session lookup is scoped by current tenant and active user; browser cannot select tenant through chat body/query.                                                                                                                                                                 | `backend/src/app.ts:186` registers tenant context before auth/chat routes; `backend/src/modules/tenants/routes.ts:106` resolves tenant on `/api/*` from `request.hostname`; `backend/src/modules/tenants/service.ts:204` normalizes host, rejects invalid host and disabled tenants; `backend/src/modules/auth/repository.ts:68` checks `portal_sessions.tenant_id`, token hash, expiry and joined `portal_users.tenant_id`; chat services are constructed with `tenantId: requireTenantContext(request).id` in `backend/src/app.ts:128`, `backend/src/app.ts:142`, `backend/src/app.ts:170`.                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `backend/src/modules/tenants/routes.test.ts:139` host-based tenant context; `backend/src/modules/tenants/routes.test.ts:380` trusted `X-Forwarded-Host` only; `backend/src/modules/tenants/routes.test.ts:424` cross-origin tenant mutation rejection; `backend/src/modules/auth/service.test.ts:47` same-email sessions isolated by tenant.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | pass                                                                                           |
| Backend chat-thread listing/runtime context                      | Browser-facing chat list/history/send/realtime accepts portal-owned `threadId`; company access is derived from current person contact attributes and company contact enablement; first send bootstraps Chatwoot conversation only through tenant-scoped `portal_chat_threads` context and advisory lock.                                         | `backend/src/modules/chat-threads/routes.ts:24` exposes `GET /api/chat/threads` after authenticated portal user resolution; `backend/src/modules/chat-threads/contactAttributes.ts:59` parses and deduplicates `portal_client_company_contact_ids` fail-closed; `backend/src/modules/chat-threads/service.ts:120` lists private plus enabled company threads and upserts `portal_chat_threads`; `backend/src/modules/chat-threads/runtime.ts:64` resolves `private:me`/`company:<id>` through linked person contact, current attributes, company lookup and company enablement; `backend/src/modules/chat-threads/runtime.ts:234` re-reads thread under `transactionWithThreadBootstrapLock` before Chatwoot conversation creation; `backend/src/modules/chat-threads/repository.ts:80` advisory lock key includes tenant and Chatwoot contact. Legacy `/api/chat/context` remains private-only compatibility and fails closed for company `threadId`.                                                                                                    | `backend/src/modules/chat-threads/routes.test.ts:78` thread list returns private + company summaries; `backend/src/modules/chat-threads/service.test.ts:441` enabled company listing; `backend/src/modules/chat-threads/service.test.ts:489`, `backend/src/modules/chat-threads/service.test.ts:507`, `backend/src/modules/chat-threads/service.test.ts:521`, `backend/src/modules/chat-threads/service.test.ts:540`, `backend/src/modules/chat-threads/service.test.ts:559` malformed/missing/wrong/disabled fail-closed cases; `backend/src/modules/chat-threads/service.test.ts:236` company first-send bootstrap; `backend/src/modules/chat-threads/service.test.ts:262` parallel bootstrap serialization; `backend/src/modules/chat-context/routes.test.ts:63` compatibility context rejects company thread before legacy private context.                                                      | pass                                                                                           |
| Backend messages/send ledger/attachments/rate limit              | Text and attachment sends require `threadId`, resolve writable thread context before Chatwoot send, scope idempotency by tenant + `portalChatThreadId` + user + `clientMessageKey`, and rate-limit by tenant/user/thread/kind.                                                                                                                   | `backend/src/modules/chat-messages/routes.ts:30` and `backend/src/modules/chat-messages/routes.ts:39` require `threadId` for text and attachment sends; `backend/src/modules/chat-messages/routes.ts:62` consumes rate limit with current tenant and thread; `backend/src/modules/chat-messages/service.ts:907` and `backend/src/modules/chat-messages/service.ts:1041` resolve writable thread context before text/attachment send; `backend/src/modules/chat-messages/service.ts:715` refuses send ledger when `portalChatThreadId` is unavailable; `backend/src/modules/chat-messages/repository.ts:52` ledger scope is tenant + user + `portalChatThreadId` + `clientMessageKey`; `backend/src/db/schema.ts:282` enforces thread-scoped unique index; `backend/src/modules/chat-messages/rateLimit.ts:64` subject key includes user + thread and repository key includes tenant.                                                                                                                                                                      | `backend/src/app.test.ts:225` rejects legacy public `primaryConversationId` selectors on context/messages/send/realtime; `backend/src/modules/chat-messages/repository.test.ts:61` ledger acquire/replay by scope; `backend/src/modules/chat-messages/repository.test.ts:150` same key separate by user; `backend/src/modules/chat-messages/repository.test.ts:280` same key separate by tenant/thread; `backend/src/modules/chat-messages/service.thread-runtime.test.ts:123` company author prefix; `backend/src/modules/chat-messages/service.thread-runtime.test.ts:287` company access denied does not call Chatwoot send; `backend/src/modules/chat-messages/rateLimit.test.ts:35` text rate limit per tenant/user/thread; `backend/src/modules/chat-messages/rateLimit.test.ts:99` attachment budget is independent.                                                                          | pass                                                                                           |
| Backend realtime/webhook routing                                 | SSE subscriptions validate current thread access before subscribe and fanout keys by tenant + threadId; webhook validates tenant secret/signature and payload account/inbox before delivery, maps Chatwoot conversation id through `portal_chat_threads`, dedupes by tenant delivery key and revalidates each subscriber through fresh snapshot. | `backend/src/modules/chat-realtime/routes.ts:51` requires `threadId`, `backend/src/modules/chat-realtime/routes.ts:53` uses current tenant, and `backend/src/modules/chat-realtime/routes.ts:54` validates thread context before subscribe; `backend/src/modules/chat-realtime/hub.ts:32` thread key is tenant + threadId and `backend/src/modules/chat-realtime/hub.ts:101` skips subscribers whose per-user snapshot is no longer ready; `backend/src/modules/chatwoot-webhooks/service.ts:307` verifies signed raw body before payload handling; `backend/src/modules/chatwoot-webhooks/service.ts:330` checks payload account/inbox tenant invariants before delivery recording; `backend/src/modules/chatwoot-webhooks/repository.ts:51` maps Chatwoot conversation id only through tenant-scoped `portal_chat_threads`; `backend/src/modules/chatwoot-webhooks/service.ts:405` records unmapped conversations as unroutable.                                                                                                                        | `backend/src/modules/chat-realtime/routes.test.ts:185` malformed company thread rejects before subscribe; `backend/src/modules/chat-realtime/routes.test.ts:223` removed membership rejects new SSE subscription; `backend/src/modules/chat-realtime/hub.test.ts:74` revoked access skipped during fanout; `backend/src/modules/chat-realtime/hub.test.ts:131` fanout isolated by tenant/thread; `backend/src/modules/chatwoot-webhooks/service.test.ts:137` invalid signature rejected; `backend/src/modules/chatwoot-webhooks/service.test.ts:266` and `backend/src/modules/chatwoot-webhooks/service.test.ts:289` account/inbox mismatch rejected before delivery/fanout; `backend/src/modules/chatwoot-webhooks/service.test.ts:367` company fanout revalidates subscriber access; `backend/src/modules/chatwoot-webhooks/repository.test.ts:113` no recovery from legacy contact mapping alone. | pass                                                                                           |
| Backend test coverage                                            | Required backend audit boundaries have unit/integration references for tenant/session isolation, thread parser/list/runtime, send ledger, attachment send, rate limit, SSE routing, webhook signature/payload/mapping/dedupe and legacy selector rejection.                                                                                      | Required backend test search found coverage across `backend/src/app.test.ts`, `backend/src/modules/tenants/routes.test.ts`, `backend/src/modules/auth/service.test.ts`, `backend/src/modules/chat-threads/*.test.ts`, `backend/src/modules/chat-messages/*.test.ts`, `backend/src/modules/chat-realtime/*.test.ts`, `backend/src/modules/chatwoot-webhooks/*.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Automated baseline from Task 2: `pnpm --dir backend test` passed with 36 Vitest files and 220 tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | pass                                                                                           |
| Frontend chat authority terms / no Chatwoot authority in browser | Frontend chat API uses portal `/api` with credentials and public `threadId`; no frontend chat code stores Chatwoot conversation authority or secrets. Test-only Chatwoot API access is isolated under e2e support helpers.                                                                                                                       | `frontend/src/features/chat/api/chatClient.ts:107` sends `threadId` as the history query parameter; `frontend/src/features/chat/api/chatClient.ts:133` posts text sends with `threadId`; `frontend/src/features/chat/api/chatClient.ts:160` appends multipart attachment `threadId`; `frontend/src/features/chat/api/chatRealtimeClient.ts:12` builds `/chat/realtime?threadId=...` with `EventSource` credentials; `frontend/src/features/chat/types.ts:13` defines browser thread ids as `private:me` or `company:<number>`. `rg` found no `localStorage`/`sessionStorage` in `frontend/src/features/chat`; storage hits are auth flow state only in `frontend/src/features/auth/lib/registrationFlow.ts:21` and `frontend/src/features/auth/lib/passwordResetFlow.ts:20`.                                                                                                                                                                                                                                                                              | `frontend/src/features/chat/pages/ChatPage.test.tsx:895` asserts text send body `threadId = private:me`; `frontend/src/features/chat/pages/ChatPage.test.tsx:705` asserts attachment form `threadId = private:me`; `frontend/src/features/chat/pages/ChatPage.test.tsx:935` asserts realtime URL contains `threadId=private%3Ame`; `tests/e2e/chat-read-model.spec.ts:169`, `tests/e2e/chat-read-model.spec.ts:247` and `tests/e2e/chat-read-model.spec.ts:452` assert the browser/backend chat contract uses `threadId`.                                                                                                                                                                                                                                                                                                                                                                            | pass                                                                                           |
| Frontend selected-thread state and fallback behavior             | Initial selection comes from `GET /api/chat/threads` `activeThreadId`; thread switching only accepts ids present in the backend-provided thread list. Backend thread-list errors move the UI into controlled unavailable/error state and do not silently select a company thread.                                                                | `frontend/src/features/chat/pages/useChatThreadSelection.ts:55` loads threads before messages; `frontend/src/features/chat/pages/useChatThreadSelection.ts:57` chooses backend `activeThreadId` before fallback; `frontend/src/features/chat/pages/useChatThreadSelection.ts:103` ignores unknown thread ids not present in `pageState.threads`; `frontend/src/features/chat/pages/useChatThreadSelection.ts:83` preserves current selection and sets `status: error` after load failure; `frontend/src/features/chat/pages/ChatPage.tsx:419` renders controlled not-ready/error UI; `frontend/src/features/chat/components/ChatNotReadyState.tsx:33` has explicit `thread_access_denied` and `thread_invalid` copy. If the backend response omits the expected active id, frontend falls back to the first backend-provided thread, then `private:me` only if the list is empty (`frontend/src/features/chat/pages/useChatThreadSelection.ts:26`); current backend ordering returns private first, but frontend fallback is not inherently private-only. | `frontend/src/features/chat/pages/ChatPage.thread-selection.test.tsx:113` covers thread-list-before-private-history; `frontend/src/features/chat/pages/ChatPage.thread-selection.test.tsx:152` covers selecting a company thread from the backend list; `frontend/src/features/chat/pages/ChatPage.thread-selection.test.tsx:224` covers stale private history not merging after company switch; `frontend/src/features/chat/pages/ChatPage.test.tsx:268` covers no company fallback after backend rejects person contact authority.                                                                                                                                                                                                                                                                                                                                                                 | pass with coverage note                                                                        |
| Frontend composer/attachment/optimistic send behavior            | Text sends create optimistic messages scoped by selected `threadId`; attachment sends are not optimistic and only merge backend-confirmed responses into the still-selected thread. Composer controls are disabled while chat is not ready/offline/sending.                                                                                      | `frontend/src/features/chat/pages/useOptimisticTextSend.ts:177` creates optimistic text send with current `threadId`; `frontend/src/features/chat/pages/useOptimisticTextSend.ts:85` posts the optimistic send's `threadId`; `frontend/src/features/chat/pages/useOptimisticTextSend.ts:105` rejects backend confirmation for a different active thread; `frontend/src/features/chat/pages/useOptimisticTextSend.ts:122` updates page state only if selected thread still matches; `frontend/src/features/chat/lib/optimisticTextMessages.ts:108` filters visible optimistic messages by `threadId`; `frontend/src/features/chat/pages/ChatPage.tsx:190` captures selected thread for attachments, `frontend/src/features/chat/pages/ChatPage.tsx:213` rejects mismatched active thread and `frontend/src/features/chat/pages/ChatPage.tsx:219` merges only if selected thread still matches; `frontend/src/features/chat/pages/ChatPage.tsx:364` and `frontend/src/features/chat/pages/ChatPage.tsx:458` disable composer until ready/online.            | `frontend/src/features/chat/pages/ChatPage.optimistic-send.test.tsx:106` covers pending optimistic bubble replacement and `threadId` send body; `frontend/src/features/chat/pages/ChatPage.optimistic-send.test.tsx:175` covers retry with same client message key; `frontend/src/features/chat/pages/ChatPage.test.tsx:629` covers multipart attachment `threadId`; `frontend/src/features/chat/pages/ChatPage.runtime.test.tsx:276` covers request-detected offline disables send; `frontend/src/features/chat/components/MessageComposer.test.tsx:44` covers attachment/voice controls around draft state.                                                                                                                                                                                                                                                                                        | pass                                                                                           |
| Frontend/browser test coverage                                   | Frontend unit tests cover thread selection, private/company switch, stale response guards, text/attachment/realtime private contract, optimistic retry and offline/error states. Playwright e2e currently covers private-thread browser contract but not company-thread switching/send/realtime.                                                 | Required coverage search plus file-list equivalent found chat runtime tests in `frontend/src/features/chat/pages/ChatPage.test.tsx`, `ChatPage.thread-selection.test.tsx`, `ChatPage.optimistic-send.test.tsx`, `ChatPage.runtime.test.tsx`, composer/transcript component tests and `tests/e2e/chat-read-model.spec.ts`. The exact required glob command exited `2` because `frontend/src/**/*.test.tsx` did not expand in this shell; an equivalent two-step `rg` file-list and filter search was used to verify frontend tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Automated baseline from Task 2: `pnpm --dir frontend test` passed with 16 Vitest files and 93 tests. `pnpm test:e2e` was attempted but blocked by unavailable local `127.0.0.1:5173`; e2e thread coverage that exists is private-thread only in `tests/e2e/chat-read-model.spec.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | gap: company-thread browser e2e                                                                |
| Stable docs chat contract drift                                  | Current stable architecture/roadmap/decisions describe browser `threadId` and backend-only Chatwoot conversation mapping; one older UI baseline still says "one primary conversation model".                                                                                                                                                     | `docs/ARCHITECTURE.md:199` says portal chat is built around portal-owned `threadId`, `docs/ARCHITECTURE.md:205` says `portal_chat_threads` is the authoritative mapping, and `docs/ARCHITECTURE.md:206` keeps Chatwoot conversation id backend-internal. `docs/DECISIONS.md:120` marks the old primary-conversation decision superseded and `docs/DECISIONS.md:292` records `D-019` threadId. `docs/IMPLEMENTATION_PLAN.md:44` says runtime no longer uses global Chatwoot env authority and `docs/IMPLEMENTATION_PLAN.md:48` says browser no longer uses `primaryConversationId`. Drift: `docs/MT_8_5_PORTAL_UI_UX_BASELINE.md:480` still lists "one primary conversation model" under locked Chat Shell behavior without a superseded note. Historical plans/specs under `docs/superpowers/` intentionally contain migration-era primary-conversation language.                                                                                                                                                                                         | Docs-only audit; no runtime tests required.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | candidate docs debt for Task 6 classification; not a proven runtime blocker                    |
| Production/deploy source provenance and tenant runtime authority | Deploy docs/scripts require source provenance and tenant-owned bootstrap/runtime config; old global `CHATWOOT_*` values are explicitly superseded and are not passed by production compose.                                                                                                                                                      | `scripts/deploy-production-archive.sh:140` refuses dirty deploy archives unless preview-approved, `scripts/deploy-production-archive.sh:167` writes `DEPLOY_SOURCE.txt`, and `scripts/deploy-production-archive.sh:226` includes it in the archive. `docs/PRODUCTION_DEPLOYMENT.md:20` marks old global Chatwoot env deployment superseded, `docs/PRODUCTION_DEPLOYMENT.md:71` documents the source gate, and `docs/MT_10_PRODUCTION_CLEAN_REINSTALL_RUNBOOK.md:239` documents `DEPLOY_SOURCE.txt`. `infra/production/compose.yaml:36`-`44` passes `DEFAULT_TENANT_*`, not global `CHATWOOT_*`. `scripts/install-production.sh:546`-`605` writes tenant bootstrap env and `scripts/install-production.sh:812`-`839` configures the tenant API Channel webhook.                                                                                                                                                                                                                                                                                            | Script/runbook audit only; production provenance remains blocked in Task 1 until deployed `DEPLOY_SOURCE.txt` is read from VM.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | pass for script/docs design; production source verification blocker remains under `F-PROD-002` |
| Dead-code candidate evidence quality                             | Required dead-code search found candidates, but none can be removed inside Task 5; each candidate was checked against runtime route/script/package/deploy references, schema impact and compatibility risk.                                                                                                                                      | `/api/chat/context` is still registered in `backend/src/app.ts:208`, listed in `docs/ARCHITECTURE.md:333`, and covered by tests; frontend has no runtime `getChatContext` import. `portal_chat_message_sends.primary_conversation_id` is still not-null schema and is written/read by the send ledger repository. Env-based `createChatwootClient({ env })` is not production request authority because app runtime uses `forTenant(config)`, but tests and `.env.example` still reference old globals. `AuthPlaceholderPage` had only its definition in `frontend/src/features/auth/pages/AuthPlaceholderPage.tsx`; `frontend/src/app/AppRoutes.tsx` routes real auth pages instead.                                                                                                                                                                                                                                                                                                                                                                     | Evidence collected by required `rg` plus targeted `nl -ba`/`rg` reads.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | candidates recorded below for Task 6 classification; no deletion in this task                  |

## Regression Safety Matrix

| Boundary                                                      | Existing Tests                                                                                                                                                                                                                                                                                                                                                                                                                    | Gap                                                                                                                                                                                                            | Decision                                                                                                                                           |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| tenant resolution by host                                     | `backend/src/modules/tenants/routes.test.ts:139` covers host-based public tenant context, `routes.test.ts:283` covers unknown-host fail-closed behavior, `routes.test.ts:307` covers inactive tenant blocking before runtime, `routes.test.ts:380` covers trusted `X-Forwarded-Host`, and `routes.test.ts:424` covers cross-origin tenant mutation rejection.                                                                     | production deployed-source provenance remains blocked by missing `DEPLOY_SOURCE.txt`, so production host evidence is not release-valid yet.                                                                    | pass for local regression safety; production provenance must be resolved before using production smoke as release evidence.                        |
| session tenant binding                                        | `backend/src/modules/auth/service.test.ts:47` covers same-email session isolation by tenant; `backend/src/modules/registration/service.test.ts:865` covers same-email verification/continuation isolation; Task 3 audit verified `portal_sessions.tenant_id` and joined `portal_users.tenant_id` checks.                                                                                                                          | none identified in Task 3 backend read-only audit.                                                                                                                                                             | pass; no pre-MT-9 cleanup or regression slice required.                                                                                            |
| tenant PWA metadata and cache isolation                       | `backend/src/modules/tenants/routes.test.ts:167` covers tenant-specific manifest and `no-store`, `routes.test.ts:233` covers tenant-aware PWA icon/iOS metadata redirects and `Vary: Host`, and `tests/e2e/pwa-runtime-smoke.spec.ts` covers manifest/icon/service-worker runtime when e2e is available. Production public manifest curl returned tenant-aware `PROVGROUP` metadata.                                              | local Playwright e2e is blocked by unavailable `127.0.0.1:5173`; production unauthenticated PWA endpoints pass, but authenticated production smoke remains blocked.                                            | pass for backend/unit and public production endpoint evidence; rerun Playwright after local stack is available for release-valid browser coverage. |
| branding asset storage boundary planned for MT-9              | Stable decisions cover the future boundary: `docs/DECISIONS.md` `D-014A`, `docs/ARCHITECTURE.md` `MT-9 Tenant Admin And Branding`, and `docs/IMPLEMENTATION_PLAN.md` require portal DB metadata plus S3-compatible object storage/MinIO, without local-file storage. No runtime branding assets are implemented in `MT-8.6`.                                                                                                      | no code-level tests yet because branding asset storage is intentionally an `MT-9` feature.                                                                                                                     | defer to `MT-9`; start asset work only with backend tests for tenant-scoped metadata/object-key isolation.                                         |
| runtime Chatwoot token vs admin-verification token separation | `docs/Findings/F-MT-004-admin-chatwoot-token-boundary.md`, `docs/DECISIONS.md` `D-014`, and `docs/IMPLEMENTATION_PLAN.md` require a separate encrypted per-tenant admin-verification token. Current runtime token encryption/decryption is covered by `backend/src/modules/tenants/secrets.test.ts` and tenant bootstrap/verify script tests, while no admin token field exists yet.                                              | `F-MT-004` remains deferred and unimplemented; no admin-verification token tests exist yet because `MT-9` has not started.                                                                                     | required first `MT-9` gate, not `MT-8.6` cleanup. Do not start tenant admin before the permissions spike and separate-token tests.                 |
| registration eligibility via Chatwoot person contact          | `backend/src/modules/registration/service.test.ts:137` rejects missing Chatwoot contact, `service.test.ts:165` requires eligibility when no active pending verification exists, `service.test.ts:689` completes registration and creates the portal user/contact link, and `tests/e2e/auth-email-flows.spec.ts:48` covers eligible Chatwoot contact registration when e2e is available.                                           | local Playwright e2e is blocked; production login/test-account smoke is blocked, so release-valid browser registration/auth evidence is incomplete.                                                            | pass for backend authority; browser/release evidence must be rerun after local stack and production test-account blockers are resolved.            |
| `GET /api/chat/threads` fail-closed behavior                  | `backend/src/modules/chat-threads/routes.test.ts:78` covers thread listing; `service.test.ts:489`, `507`, `521`, `540`, and `559` cover malformed/missing/wrong/disabled company attribute/contact fail-closed cases; `backend/src/modules/chat-context/routes.test.ts:63` proves company `threadId` fails closed before legacy private context.                                                                                  | no company-thread Playwright e2e; local e2e is blocked.                                                                                                                                                        | pass for backend safety; browser company-thread e2e is deferred coverage, not a `must-fix-before-MT-9` code blocker.                               |
| company thread history/send access removal                    | `backend/src/modules/chat-messages/service.thread-runtime.test.ts:287` covers company access denied without Chatwoot send; `backend/src/modules/chat-realtime/routes.test.ts:223` rejects removed membership for new SSE subscription; `backend/src/modules/chat-realtime/hub.test.ts:74` skips revoked access during fanout; `backend/src/modules/chatwoot-webhooks/service.test.ts:367` revalidates company fanout subscribers. | no authenticated production/company-thread smoke because production login was blocked; no company-thread browser e2e because local frontend origin was unavailable.                                            | pass for backend authority; production and Playwright blockers remain evidence blockers, not proven runtime defects.                               |
| send ledger idempotency scope                                 | `backend/src/modules/chat-messages/repository.test.ts:61` covers acquire/replay by scope, `repository.test.ts:150` separates same key by user, `repository.test.ts:280` separates same key by tenant/thread, and `backend/src/db/schema.ts` contains the thread-scoped unique index.                                                                                                                                              | legacy `primary_conversation_id` column/index still exists but remains used by schema/repository and was classified `do-not-touch`.                                                                            | pass; do not remove legacy ledger schema before a dedicated migration plan.                                                                        |
| attachment send authority                                     | `backend/src/modules/chat-messages/routes.test.ts` and `service.thread-runtime.test.ts` cover attachment send through the same resolved writable thread context; `frontend/src/features/chat/pages/ChatPage.test.tsx:629` covers multipart `threadId`; `tests/e2e/chat-read-model.spec.ts:365` covers private attachment browser contract when e2e is available.                                                                  | no company attachment e2e and local e2e is blocked; private e2e does not assert multipart body `threadId`.                                                                                                     | pass for backend/frontend unit authority; company attachment e2e is deferred browser coverage.                                                     |
| realtime fanout with revoked access                           | `backend/src/modules/chat-realtime/routes.test.ts:185` rejects malformed company thread before subscribe, `routes.test.ts:223` rejects removed membership, `hub.test.ts:74` skips revoked access, and `hub.test.ts:131` isolates fanout by tenant/thread.                                                                                                                                                                         | no company realtime browser/e2e and local e2e is blocked.                                                                                                                                                      | pass for backend safety; expected high-risk revalidation finding was not present.                                                                  |
| webhook conversation-to-thread routing                        | `backend/src/modules/chatwoot-webhooks/repository.test.ts:113` proves no recovery from legacy contact mapping alone; `backend/src/modules/chatwoot-webhooks/service.test.ts:367` covers company fanout through thread mapping; Task 3 audit verified routing maps Chatwoot conversation id only through tenant-scoped `portal_chat_threads`.                                                                                      | authenticated production webhook/realtime smoke is blocked by login/test-account and Chatwoot admin session blockers.                                                                                          | pass for local regression safety; production smoke remains an evidence blocker.                                                                    |
| Chatwoot webhook signature and tenant matching                | `backend/src/modules/chatwoot-webhooks/service.test.ts:137` rejects invalid signatures, `service.test.ts:266` and `289` reject account/inbox mismatch before delivery/fanout, and `backend/src/modules/tenants/routes.test.ts:484` verifies current-tenant webhook secret by Host.                                                                                                                                                | production `DEPLOY_SOURCE.txt` and authenticated webhook smoke were not verified.                                                                                                                              | pass for backend safety; resolve production provenance/smoke blockers before release-valid evidence.                                               |
| frontend selected thread state and no unsafe fallback         | `frontend/src/features/chat/pages/ChatPage.thread-selection.test.tsx:113` covers thread-list-before-history, `:152` covers company-thread selection from backend list, `:224` covers stale private history guard, and `frontend/src/features/chat/pages/ChatPage.test.tsx:268` covers no company fallback after backend contact-authority rejection. Task 4 audit found no Chatwoot authority in browser storage.                 | no company-thread Playwright e2e; frontend fallback to first backend-provided thread is coverage-sensitive but not proven unsafe because backend owns the list and errors render controlled unavailable state. | pass with deferred browser coverage; no unsafe fallback finding or pre-MT-9 code cleanup required.                                                 |

## Existing Findings Index

| Finding         | Status   | MT-9 Impact                                                                                                                                                                  | Decision                                                                                                                                                    |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `F-PROD-002`    | open     | Affects production provenance and recovery source of truth, not chat runtime correctness. Production smoke remains release-invalid until deployed source provenance is read. | Keep open. It is not a chat-thread `must-fix-before-MT-9`, but production provenance must be resolved before relying on production smoke/recovery evidence. |
| `F-MT-004`      | deferred | Required first permissions/admin-token boundary gate for `MT-9`.                                                                                                             | Carry into `MT-9` as the first permissions spike and separate admin-verification token task. Do not close in `MT-8.6`.                                      |
| `F-AUTH-001`    | deferred | Relevant before multi-instance backend deployment; current audit evidence does not make it a chat-thread or tenant-admin runtime blocker for a single backend instance.      | Keep deferred. Promote only if `MT-9` deployment expectations require horizontal backend scaling before release.                                            |
| `F-CHAT-UI-003` | deferred | Audio attachment narrow-width risk is UI polish/accessibility, not tenant/admin authority or chat-thread correctness by default.                                             | Keep deferred. Handle in a focused UI polish slice if narrow mobile audio overflow remains important after MT-9 priorities are set.                         |
| `F-IOS-001`     | deferred | iOS keyboard/viewport pan is mobile UX risk; evidence does not show tenant/admin authority impact or chat-thread data leak.                                                  | Keep deferred. Reopen only through a focused iOS touch/keyboard experiment because prior viewport freeze mitigation regressed the shell.                    |

## New Findings

No new findings were created in Task 6. The audit did not prove a new fully
actionable runtime authority risk that needs a `docs/Findings/F-MT86-*.md`
tracker under the registry schema.

## Technical Debt Map

| Candidate                                                                                                   | Area                                  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Classification          | Decision                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy private-only `/api/chat/context` compatibility boundary still carries primary-conversation internals | backend chat context                  | `backend/src/modules/chat-context/routes.ts:13` accepts `threadId` but delegates to `backend/src/modules/chat-threads/threadResolver.ts:97`, which currently allows only `private:me` through legacy `ChatContextService`; `backend/src/modules/chat-context/routes.test.ts:63` proves `company:<id>` fails closed before legacy context. No browser-visible Chatwoot authority or cross-tenant path was observed.                                                    | `defer`                 | Keep compatibility during MT-8.6. Any removal/deprecation needs a separate plan because this is a public backend route and private-thread runtime still uses legacy service internals.                                                   |
| Stale `docs/MT_8_5_PORTAL_UI_UX_BASELINE.md` wording still says "one primary conversation model"            | docs                                  | `docs/MT_8_5_PORTAL_UI_UX_BASELINE.md:480` conflicts with current `docs/ARCHITECTURE.md:199`-`206`, `docs/DECISIONS.md:292`-`313` and `docs/IMPLEMENTATION_PLAN.md:44`-`49`, which make `threadId` the browser contract and Chatwoot conversation id backend-only.                                                                                                                                                                                                    | `safe-pre-MT-9-cleanup` | Safe docs-only cleanup candidate: add a superseded note or update the historical baseline wording in a docs slice. It does not block Task 7 or MT-9 runtime work.                                                                        |
| Old env-based Chatwoot client/config path remains outside tenant runtime                                    | backend config / Chatwoot integration | `backend/src/config/env.ts:97`-`103` and `backend/src/integrations/chatwoot/client.ts:148`-`159` still support global `CHATWOOT_*`; app runtime uses `createChatwootClientFactory().forTenant(requireTenantContext(request).chatwoot)` in `backend/src/app.ts:106`-`120`; production compose passes only `DEFAULT_TENANT_*` at `infra/production/compose.yaml:36`-`44`; `docs/MT_8R_CODEBASE_AUDIT.md:341`-`353` already deferred env-based tooling cleanup to MT-10. | `defer`                 | Keep as dev/test/bootstrap compatibility until a later config cleanup plan. It is not current production request authority and should not be removed opportunistically before MT-9.                                                      |
| Orphaned `AuthPlaceholderPage`                                                                              | frontend auth                         | `rg` found only `frontend/src/features/auth/pages/AuthPlaceholderPage.tsx`; `frontend/src/app/AppRoutes.tsx:18`-`52` lazy-loads real auth/chat pages and `frontend/src/app/AppRoutes.tsx:79`-`135` routes real auth screens. No package/script/deploy reference, no backend/schema impact and no public route reference were found.                                                                                                                                   | `dead-code-candidate`   | Eligible for a bounded frontend dead-code cleanup slice with frontend typecheck/build. Not required before MT-9.                                                                                                                         |
| No company-thread browser e2e                                                                               | frontend/browser tests                | Task 4 found frontend unit coverage for company thread switching and stale private history suppression, but Playwright coverage currently exercises private-thread browser contract only; Task 2 Playwright run was blocked by unavailable `127.0.0.1:5173`.                                                                                                                                                                                                          | `defer`                 | Add when local browser stack is available or when a future browser-runtime slice touches company thread UX. Do not inflate to `must-fix-before-MT-9` because backend authority and frontend unit coverage protect the critical boundary. |
| No dedicated optimistic private-send-resolves-after-company-switch test                                     | frontend tests                        | Task 4 found implementation guards in `useOptimisticTextSend.ts:122` and `optimisticTextMessages.ts:108`; existing optimistic tests cover pending/retry behavior but not that exact switch timing.                                                                                                                                                                                                                                                                    | `defer`                 | Useful targeted regression test, but not a proven runtime blocker. Add in a future frontend test-hardening slice if chat UI is modified.                                                                                                 |
| No company attachment e2e                                                                                   | frontend/browser tests                | Private attachment browser contract is covered in `tests/e2e/chat-read-model.spec.ts:365`; backend and frontend unit coverage prove `threadId` authority and mismatched active-thread rejection, but there is no company attachment e2e.                                                                                                                                                                                                                              | `defer`                 | Keep as browser coverage gap. Add when e2e stack is available or before a company attachment UX change.                                                                                                                                  |
| No company realtime browser/e2e                                                                             | frontend/browser tests                | Backend realtime/webhook tests cover tenant/thread isolation and revoked access; frontend unit tests cover private realtime merge/recovery and selected-thread guards, but no dedicated company realtime browser/e2e exists.                                                                                                                                                                                                                                          | `defer`                 | Keep as browser coverage gap. Not a pre-MT-9 blocker because backend realtime authority is covered and no unsafe frontend fallback was proven.                                                                                           |

## Dead-Code Candidates

### `/api/chat/context` compatibility endpoint

- Candidate: legacy private-chat compatibility endpoint and `chat-context`
  primary-conversation service internals.
- Evidence checked: required dead-code search, targeted search for
  `chat-context`, `/api/chat/context`, `getChatContext` and `ChatContext`,
  plus targeted `nl -ba` reads.
- Runtime entrypoint risk: high. Backend still registers the public route in
  `backend/src/app.ts:208`; `backend/src/modules/chat-context/routes.ts:67`
  serves it; `docs/ARCHITECTURE.md:333` lists it; tests cover compatibility and
  legacy selector rejection. Frontend runtime does not call `getChatContext`,
  but backend `chat-threads` still depends on `ChatContextService` for
  private-thread compatibility.
- Decision: `defer`. Not safe to remove before `MT-9` without a dedicated
  deprecation/removal plan and runtime regression checks.

### `primary_conversation_id` send-ledger compatibility

- Candidate: `portal_chat_message_sends.primary_conversation_id` legacy ledger
  column/index and `primaryConversationId` ledger fields.
- Evidence checked: required dead-code search, targeted schema/repository reads
  and migration references.
- Runtime entrypoint risk: high. `backend/src/db/schema.ts:257` keeps the column
  not null; `backend/src/db/schema.ts:276`-`281` keeps the legacy unique index;
  `backend/src/modules/chat-messages/repository.ts:64`-`79` selects it and
  `backend/src/modules/chat-messages/repository.ts:118`-`127` writes it;
  migrations `0005`, `0008` and `0010` reference it, including `0010`
  backfill from conversation id to thread id. Tests still assert ledger behavior
  with `primaryConversationId`.
- Decision: `do-not-touch`. Schema/runtime still use it; removal requires a
  dedicated migration plan, not `MT-8.6` cleanup.

### Global `CHATWOOT_*` compatibility path

- Candidate: global `CHATWOOT_*` env parsing and `createChatwootClient({ env })`
  compatibility path.
- Evidence checked: required dead-code search, `.env.example`, production
  compose, package scripts and targeted client/app reads.
- Runtime entrypoint risk: medium. `backend/src/config/env.ts:97`-`103` parses
  old globals and `backend/src/integrations/chatwoot/client.ts:148`-`159` can
  resolve them; app request runtime instead uses tenant config in
  `backend/src/app.ts:106`-`120`; `infra/production/compose.yaml:36`-`44`
  passes `DEFAULT_TENANT_*`; backend package scripts are tenant bootstrap,
  verify and configure scripts. `.env.example` still contains old globals while
  `.env.production.example` uses `DEFAULT_TENANT_*`.
- Decision: `defer`. Keep until a later config cleanup or `MT-10` plan; it is
  not production runtime authority and is not safe opportunistic deletion.

### `AuthPlaceholderPage`

- Candidate: `frontend/src/features/auth/pages/AuthPlaceholderPage.tsx`.
- Evidence checked: direct `rg` references across
  frontend/tests/backend/scripts/infra/package docs and
  `frontend/src/app/AppRoutes.tsx`.
- Runtime entrypoint risk: low. Only the component definition was found; current
  auth routes lazy-load concrete pages for login, registration and password
  reset. No package/deploy references, schema/migration impact or public route
  reference was found.
- Decision: `dead-code-candidate`. Bounded frontend cleanup candidate; not
  required before `MT-9`.

## MT-9 Gate Matrix

| Gate                                          | Status                          | Evidence                                                                                                                                                                                                    | Next Action                                                                                                           |
| --------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Chat/runtime `must-fix-before-MT-9` blockers  | none proven after Task 7 matrix | The final regression matrix maps every critical boundary to existing backend/frontend tests or an explicit release-evidence gap. No gap proved a chat/runtime code defect that must be fixed before `MT-9`. | No cleanup/refactoring/dead-code implementation slice is required before `MT-9`; keep deferred coverage gaps visible. |
| Production provenance and authenticated smoke | blocked                         | `F-PROD-002` remains open; `PORTAL_PROD_SSH_HOST` was unavailable for `DEPLOY_SOURCE.txt`, and production login with the approved test account was rejected.                                                | Resolve production provenance/test-account blockers before treating production smoke as release-valid.                |
| `F-MT-004` admin token boundary               | deferred into MT-9              | `docs/Findings/F-MT-004-admin-chatwoot-token-boundary.md`                                                                                                                                                   | Start MT-9 with permissions spike and separate admin-verification token design.                                       |
| Tenant admin implementation in MT-8.6         | not implemented                 | Scope guard                                                                                                                                                                                                 | Keep out of MT-8.6.                                                                                                   |
| Branding implementation in MT-8.6             | not implemented                 | Scope guard                                                                                                                                                                                                 | Keep out of MT-8.6.                                                                                                   |

## Task 1 Evidence Log

Commands run:

```bash
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --short
git log --oneline --decorate -5
curl -fsS https://lk.provgroup.ru/api/health
curl -fsS https://lk.provgroup.ru/api/tenant
curl -fsS https://lk.provgroup.ru/api/tenant/manifest.webmanifest
```

Production SSH command not run because `PORTAL_PROD_SSH_HOST` was unset:

```bash
ssh "$PORTAL_PROD_SSH_HOST" 'set -euo pipefail; cd /opt/chatwoot-client-portal-v2; cat DEPLOY_SOURCE.txt; docker compose --env-file .env.production -f infra/production/compose.yaml ps'
```

Browser smoke evidence:

- Opened `https://lk.provgroup.ru`.
- Production redirected to `/auth/login` with page title
  `PROVGROUP Личный кабинет`.
- Clicked the visible `Обновить` prompt before retrying login.
- Login with the approved test email and provided password stayed on
  `/auth/login` and showed `Неверный email или пароль.`
- Authenticated thread, send, Chatwoot admin prefix and realtime checks were not
  reached.

## Task 2 Evidence Log

Commands run:

```bash
pnpm --dir backend test
pnpm --dir frontend test
pnpm --dir backend build
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm lint
pnpm test:e2e
git diff --check
```

High-signal results:

- Backend unit/integration baseline passed: 36 Vitest files, 220 tests.
- Frontend unit baseline passed: 16 Vitest files, 93 tests.
- Backend build, frontend typecheck, frontend production build, lint and
  `git diff --check` passed with exit 0.
- Local Playwright e2e was attempted and is blocked by unavailable local
  frontend origin `http://127.0.0.1:5173`; exact command was `pnpm test:e2e`,
  exit 1, with repeated errors `page.goto: net::ERR_CONNECTION_REFUSED at
http://127.0.0.1:5173/...` and `apiRequestContext.get: connect ECONNREFUSED
127.0.0.1:5173`.
- Targeted checks that still passed despite the e2e blocker: production public
  `/api/health`, `/api/tenant`, and `/api/tenant/manifest.webmanifest` checks
  from Task 1; all non-browser automated baseline commands in Task 2.
- Next unblock action: user starts the local `v2` stack/frontend origin with
  the expected seeded backend, Chatwoot and Mailpit dependencies available,
  then rerun `pnpm test:e2e`.

## Task 3 Evidence Log

Commands run:

```bash
rg -n "primaryConversationId|primary_conversation|conversationId|chatwootConversationId|threadId|portal_chat_threads|portalChatThreadId|clientMessageKey|authorRole|portal_client_company_contact_ids" backend/src backend/drizzle
rg -n "tenantId|tenant_id|resolveTenant|requireTenant|session|portalSession|current tenant|Host|X-Forwarded-Host" backend/src/modules backend/src/app.ts backend/src/server.ts
rg -n "getChatThreads|listThreads|resolveThread|resolve.*Thread|portal_chat_threads|company:<|private:me|advisory|lock" backend/src/modules/chat-threads backend/src/modules/chat-context backend/src/modules/chat-messages
rg -n "send ledger|clientMessageKey|portalChatThreadId|rate limit|attachment|upload|file" backend/src/modules/chat-messages backend/src/modules/chat-rate-limit backend/src/modules/chat-attachments backend/src/test
rg -n "EventSource|SSE|subscribe|publish|fanout|webhook|signature|portal_chat_threads|conversation.*thread|delivery|dedupe" backend/src/modules/chat-realtime backend/src/modules/chatwoot-webhooks backend/src/integrations
rg -n "private:me|company:|portal_chat_threads|portalChatThreadId|clientMessageKey|authorRole|webhook|realtime|access removal|forged|malformed" backend/src/**/*.test.ts
```

Additional verification reads used `nl -ba`/`sed -n` around the high-signal
hits in:

- `backend/src/app.ts`
- `backend/src/db/schema.ts`
- `backend/src/modules/auth/*`
- `backend/src/modules/tenants/*`
- `backend/src/modules/chat-context/*`
- `backend/src/modules/chat-threads/*`
- `backend/src/modules/chat-messages/*`
- `backend/src/modules/chat-realtime/*`
- `backend/src/modules/chatwoot-webhooks/*`

High-signal results:

- Backend tenant/session authority is tenant-bound: request tenant comes from
  host resolution before auth/chat route handling, auth session lookup checks
  both `portal_sessions.tenant_id` and joined `portal_users.tenant_id`, and
  per-request chat repositories/services are constructed with the current
  tenant id.
- Browser-facing chat send/realtime paths use `threadId`; legacy public
  `primaryConversationId` selectors are rejected by strict route schemas.
- Chatwoot conversation id remains in backend-owned boundaries: schema,
  repositories, runtime mapping, webhook routing and Chatwoot integration calls.
- Thread listing and runtime context fail closed for malformed/unavailable
  company attributes, validate the linked person contact before company lookup,
  upsert `portal_chat_threads`, and bootstrap first-send conversation under a
  tenant-scoped advisory lock with a locked re-read.
- Send ledger code scopes by tenant + `portalChatThreadId` + user +
  `clientMessageKey`; text and attachment sends both resolve writable thread
  context before Chatwoot outbound and both refuse ledger-backed send when
  `portalChatThreadId` is unavailable.
- Rate limiting is DB-backed by tenant, send kind, user and public `threadId`,
  with separate text and attachment budgets.
- SSE subscriptions validate current thread access before subscription; fanout
  key is tenant + `threadId`, and each subscriber gets a freshly resolved
  snapshot so revoked company access is skipped.
- Webhook handling validates signature over raw body, then payload account/inbox
  tenant invariants before delivery recording or fanout; routing maps Chatwoot
  conversation id only through tenant-scoped `portal_chat_threads`, and unmapped
  legacy contact mappings stay unroutable.
- The required send-ledger/attachment search exited `2` because
  `backend/src/modules/chat-rate-limit` and
  `backend/src/modules/chat-attachments` do not exist. The command still
  returned the relevant `chat-messages` and `backend/src/test` hits; actual rate
  limit and attachment code lives under `backend/src/modules/chat-messages`.
- No proven backend runtime blocker was identified in Task 3. One compatibility
  debt candidate was added for Task 6 classification: the private-only
  `/api/chat/context` compatibility route still wraps legacy primary-conversation
  internals, but it fails closed for company `threadId`.

## Task 4 Evidence Log

Commands run:

```bash
rg -n "primaryConversationId|conversationId|threadId|activeThread|selectedThread|ChatThread|EventSource|localStorage|sessionStorage|Chatwoot" frontend/src tests/e2e
rg -n "selectedThread|activeThread|setSelected|fallback|defaultThread|private:me|company:" frontend/src/features/chat
rg -n "optimistic|clientMessageKey|attachment|sendMessage|sendAttachment|threadId|disabled|isSending" frontend/src/features/chat
rg -n "thread|private:me|company:|selectedThread|EventSource|optimistic|attachment|access|error" frontend/src/**/*.test.ts frontend/src/**/*.test.tsx tests/e2e
```

The fourth required command exited `2` because the shell did not expand
`frontend/src/**/*.test.tsx` to any path. Equivalent coverage search was run
with explicit file discovery:

```bash
rg --files frontend/src tests/e2e | rg '(\.test\.tsx?$|tests/e2e/)'
rg -n "thread|private:me|company:|selectedThread|EventSource|optimistic|attachment|access|error" $(rg --files frontend/src tests/e2e | rg '(\.test\.tsx?$|tests/e2e/)')
```

Additional verification reads used `nl -ba`/`sed -n` around high-signal hits in:

- `frontend/src/features/chat/api/chatClient.ts`
- `frontend/src/features/chat/api/chatRealtimeClient.ts`
- `frontend/src/features/chat/types.ts`
- `frontend/src/features/chat/pages/ChatPage.tsx`
- `frontend/src/features/chat/pages/useChatThreadSelection.ts`
- `frontend/src/features/chat/pages/useOptimisticTextSend.ts`
- `frontend/src/features/chat/pages/useChatRealtimeConnection.ts`
- `frontend/src/features/chat/lib/optimisticTextMessages.ts`
- `frontend/src/features/chat/lib/chatSnapshot.ts`
- `frontend/src/features/chat/components/MessageComposer.tsx`
- `frontend/src/features/chat/components/ChatNotReadyState.tsx`
- `frontend/src/features/auth/lib/registrationFlow.ts`
- `frontend/src/features/auth/lib/passwordResetFlow.ts`
- `frontend/src/features/chat/pages/ChatPage*.test.tsx`
- `tests/e2e/chat-read-model.spec.ts`

High-signal results:

- Frontend chat runtime uses same-origin `/api` calls with cookies and public
  `threadId`; text, attachment, history and realtime calls do not send
  Chatwoot conversation ids.
- No frontend chat `localStorage`/`sessionStorage` authority source was found.
  Storage usage is limited to auth registration/password-reset flow state with
  email, TTL metadata and continuation tokens; no Chatwoot secret or
  conversation authority storage was observed.
- Test-only Chatwoot API token usage is confined to `tests/e2e/support/chatwoot.ts`
  for creating eligible contacts, not browser runtime code.
- Initial chat load requests `GET /api/chat/threads` before message history and
  uses backend `activeThreadId` first. If the backend response omits that active
  id, frontend falls back to the first backend-provided thread, then `private:me`
  only if the thread list is empty; current backend ordering returns private
  first, but frontend fallback itself is first-returned-thread.
- Backend thread-list/access errors keep the UI in controlled error/unavailable
  state; the frontend test suite explicitly covers that a rejected person
  contact authority does not cause a company-thread fallback.
- No frontend path was observed that silently selects an arbitrary company
  thread after a backend access error; the first-returned-thread fallback should
  be classified in Task 6 as coverage-sensitive behavior rather than a proven
  runtime blocker.
- Text optimistic sends carry their original `threadId`, visible optimistic
  messages are filtered by selected `threadId`, backend confirmations with a
  different active thread fail the optimistic send, and page state is updated
  only if the selected thread still matches.
- Attachment sends are backend-confirmed only, include multipart `threadId`, and
  refuse to merge responses whose active thread does not match the captured
  selected thread.
- Composer disabled state is tied to chat readiness, selected thread, browser
  online state, send state and voice/attachment busy state.
- Frontend unit coverage includes private/company thread switching and stale
  private history suppression. E2E coverage currently exercises private-thread
  browser contract only; local Playwright remains blocked by unavailable
  `127.0.0.1:5173`.

## Task 5 Evidence Log

Commands run:

```bash
rg -n "primaryConversationId|primary conversation|primary_conversation|conversation id|conversationId|threadId|portal_chat_threads|company thread|private:me|lock_to_single_conversation" docs README.md
rg -n "DEPLOY_SOURCE|allow-dirty-preview|preview-label|CHATWOOT_ACCOUNT_ID|CHATWOOT_PORTAL_INBOX_ID|DEFAULT_TENANT|webhook|compose|install-production|deploy-production" scripts infra docs/PRODUCTION_DEPLOYMENT.md docs/MT_10_PRODUCTION_CLEAN_REINSTALL_RUNBOOK.md docs/PRODUCTION_DEPLOYMENT_SESSION_LOG.md
rg -n "primaryConversationId|primary_conversation|legacy|compat|deprecated|unused|old|fallback|CHATWOOT_ACCOUNT_ID|CHATWOOT_PORTAL_INBOX_ID" backend frontend tests scripts infra docs package.json
```

Additional verification reads used `nl -ba`/`rg` around high-signal hits in:

- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/MT_8_5_PORTAL_UI_UX_BASELINE.md`
- `docs/PRODUCTION_DEPLOYMENT.md`
- `docs/MT_10_PRODUCTION_CLEAN_REINSTALL_RUNBOOK.md`
- `docs/MT_8R_CODEBASE_AUDIT.md`
- `scripts/deploy-production-archive.sh`
- `scripts/install-production.sh`
- `infra/production/compose.yaml`
- `backend/src/app.ts`
- `backend/src/config/env.ts`
- `backend/src/integrations/chatwoot/client.ts`
- `backend/src/db/schema.ts`
- `backend/src/modules/chat-context/*`
- `backend/src/modules/chat-messages/repository.ts`
- `frontend/src/app/AppRoutes.tsx`
- `frontend/src/features/auth/pages/AuthPlaceholderPage.tsx`

High-signal results:

- Current stable architecture, decisions and roadmap describe browser `threadId`
  as the public chat contract and Chatwoot conversation id as backend-only
  mapping through `portal_chat_threads`.
- `docs/MT_8_5_PORTAL_UI_UX_BASELINE.md` still contains old "one primary
  conversation model" language without a superseded note; recorded as docs debt
  for Task 6 classification, not changed in Task 5.
- Production deployment docs/scripts include a source provenance gate:
  dirty archives require `--allow-dirty-preview` plus `--preview-label`, and
  archives write `DEPLOY_SOURCE.txt` with branch, commit, dirty status, preview
  label and `git status --short`.
- Production compose and installer use `DEFAULT_TENANT_*` bootstrap env and
  tenant-owned runtime config. Old global `CHATWOOT_*` values are documented as
  superseded and not passed by `infra/production/compose.yaml`; production
  provenance remains blocked until the deployed `DEPLOY_SOURCE.txt` is read.
- Tenant webhook sync remains tenant-aware: installer runs
  `configure-tenant-chatwoot-webhook.js --tenant=${DEFAULT_TENANT_SLUG:-default}`
  and stores Chatwoot's API Channel secret in the portal tenant record.
- Dead-code audit identified no safe immediate deletion inside Task 5.
  Candidates were recorded with runtime-entrypoint risk: `/api/chat/context`
  compatibility endpoint, legacy send-ledger `primary_conversation_id`,
  global `CHATWOOT_*` env/client compatibility path and orphaned
  `AuthPlaceholderPage`.

## Task 6 Evidence Log

Documents reviewed:

```bash
sed -n '1,220p' docs/Findings/README.md
sed -n '1,180p' docs/Findings/F-PROD-002-release-source-remote-drift.md
sed -n '1,180p' docs/Findings/F-MT-004-admin-chatwoot-token-boundary.md
sed -n '1,180p' docs/Findings/F-AUTH-001-rate-limit-shared-store.md
sed -n '1,180p' docs/Findings/F-CHAT-UI-003-audio-attachment-narrow-width.md
sed -n '1,180p' docs/Findings/F-IOS-001-keyboard-textarea-viewport-pan.md
```

Classification reasoning:

- `F-PROD-002` remains open because Task 1 could not read production
  `DEPLOY_SOURCE.txt`; it affects release provenance/recovery source of truth,
  not the audited chat-thread runtime authority path.
- `F-MT-004` remains deferred and is carried into `MT-9` as the first
  permissions-spike/admin-token-boundary task; it must not be closed in
  `MT-8.6`.
- `F-AUTH-001` remains deferred because the current risk is multi-instance auth
  rate limit consistency. Task 6 found no evidence that current `MT-9` work
  requires horizontal backend scaling before the admin/branding implementation
  starts.
- `F-CHAT-UI-003` and `F-IOS-001` remain deferred because the evidence is
  UI/mobile polish risk. Neither finding shows tenant authority, admin token or
  chat-thread correctness impact.
- The expected high-risk company realtime revalidation finding was not created:
  Task 3 evidence shows subscriber snapshot revalidation and tests for revoked
  access skip, tenant/thread fanout isolation and webhook company fanout
  revalidation.
- Browser coverage gaps were classified as `defer` rather than
  `must-fix-before-MT-9` because backend authority tests and frontend unit
  guards protect the critical boundaries, while local Playwright remained
  blocked by unavailable `127.0.0.1:5173`.
- Schema and compatibility removal candidates were not marked safe: the
  send-ledger `primary_conversation_id` column/index is still in schema,
  migrations and repository reads/writes, and `/api/chat/context` is still a
  public compatibility route with private-thread service dependency.
- The only `dead-code-candidate` is `AuthPlaceholderPage`, because evidence
  found no imports, route references, package/deploy references or schema
  impact. It still requires a bounded frontend cleanup slice with typecheck and
  build before deletion.

## Task 7 Evidence Log

Decision reasoning:

- The final regression safety matrix now uses the spec's critical boundary list
  one row at a time.
- Every backend authority boundary has targeted unit/integration coverage from
  Tasks 1-6 or an explicit production/browser evidence gap.
- The remaining gaps are evidence/readiness gaps, not proven chat/runtime
  implementation defects: production `DEPLOY_SOURCE.txt` was not available,
  production login with the approved test account failed, Chatwoot admin
  authenticated smoke was not available, and local Playwright could not reach
  `http://127.0.0.1:5173`.
- The Playwright blocker does not prove the local browser runtime is unsafe; it
  blocks release-valid browser evidence until the user starts the local `v2`
  stack and `pnpm test:e2e` is rerun.
- `F-MT-004` remains the first `MT-9` implementation gate and is not closed by
  this audit.
- `safe-pre-MT-9-cleanup` stale `MT-8.5` wording and the `AuthPlaceholderPage`
  `dead-code-candidate` are optional bounded slices, not required before `MT-9`.
- `/api/chat/context`, global `CHATWOOT_*` compatibility and browser/e2e gaps
  remain deferred; `primary_conversation_id` ledger schema/index/runtime path is
  explicitly `do-not-touch`.
- No new finding file was created because Task 7 did not reveal a new
  actionable `must-fix-before-MT-9` risk.

## Final Decision

MT-8.6 audit found no required cleanup/refactoring/dead-code slice before
`MT-9`. No proven chat/runtime `must-fix-before-MT-9` blocker remains after the
final regression safety matrix.

However, the conservative next action before starting `MT-9` is to resolve the
remaining evidence blockers from this audit:

1. Read production `DEPLOY_SOURCE.txt` and close or update `F-PROD-002`
   provenance status.
2. Fix or reset the approved production test account, then repeat authenticated
   production smoke for private thread, company thread, Chatwoot admin author
   prefix and realtime.
3. Start the local `v2` stack/frontend origin on `127.0.0.1:5173` and rerun
   `pnpm test:e2e`.

After those blockers are resolved or explicitly accepted as release-evidence
exceptions by the operator, the next implementation step is `MT-9` starting with
`F-MT-004`: the Chatwoot permissions spike and separate encrypted per-tenant
admin-verification token boundary.
