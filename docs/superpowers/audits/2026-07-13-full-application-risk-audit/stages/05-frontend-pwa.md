# Stage 05: Frontend State, Browser Boundaries And Offline PWA

Status: complete

Verdict effect: no new Critical or High hypothesis was established. Three new
frontend/PWA candidates require canonical validation: customer/admin session
lifecycle invalidation, bounded offline-data retention, and private avatar
CacheStorage cleanup. The existing Medium attachment-validation finding is
confirmed and extended to unbounded voice recording. Four observed or
browser-specific behaviors remain `needs_follow_up`; none is treated as closed
without the required installed-PWA or real-iOS evidence. This stage does not
remove the final `GO` blocker recorded as `SEC-DEEP-001`.

## Frozen Target And Review Boundary

- Repository revision: `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`
- Frozen source:
  `/home/evluk/projects/chatwoot-client-portal-v2-audit-source-2026-07-13`
- Scope: frontend routing, tenant/customer/admin startup and session state,
  browser API contracts, chat/profile/settings/admin UI state, IndexedDB,
  localStorage, service worker caching, push markers, offline text outbox,
  attachment/voice admission, focus and narrow-layout behavior
- Product source mutation: none
- Production or external-service mutation: none
- Browser connector: unavailable; regular Playwright was used for the bounded
  Chromium smoke
- Excluded dynamic environments: production, installed Android PWA and real
  iOS Safari/PWA

## Outcome Summary

| ID          | Status          | Severity | Frontend/PWA failure hypothesis                                                                  |
| ----------- | --------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `FRONT-001` | candidate       | Medium   | Open customer/admin shells do not invalidate themselves at declared session expiry               |
| `FRONT-002` | candidate       | Medium   | Offline page/marker retention is not invoked or cardinality bounded in production                |
| `FRONT-003` | candidate       | Low      | Local device-data removal leaves identity-scoped private avatar bytes in CacheStorage            |
| `FRONT-004` | candidate       | Medium   | Attachment and voice payloads reach expensive upload/conversion paths without local admission    |
| `FRONT-005` | needs_follow_up | Medium   | A missed other-thread push client message can leave open-app unread UI stale until later refresh |
| `FRONT-006` | needs_follow_up | Medium   | Closed-app Background Sync recovery is statically mitigated but lacks installed-Android proof    |
| `FRONT-007` | needs_follow_up | Medium   | The observed iOS keyboard/visual-viewport pan requires a focused real-device experiment          |
| `FRONT-008` | needs_follow_up | Low      | Native audio controls can exceed the narrow incoming-bubble width                                |

`FRONT-004` maps to the existing open finding
`docs/findings/F-CHAT-005-frontend-attachment-validation.md`.
`FRONT-005` through `FRONT-008` preserve the existing finding evidence instead
of duplicating or silently closing it.

## Router, Tenant And Session Boundaries

### Controls that held

- `TenantProvider` resolves the host-scoped tenant before customer or admin
  session providers render. Authoritative tenant failures clear startup tenant,
  auth and chat fallbacks; transient failures may use the host-scoped cache.
- Customer and tenant-admin sessions use separate providers, route guards,
  cookies and login flows. Customer post-login redirects are restricted to the
  `/app` route family rather than accepting an arbitrary URL.
- Public, protected and admin routes are explicit in `AppRoutes.tsx`; removed
  registration routes are absent from the live application. Their remaining
  Playwright references are the already-recorded `BASE-001`, not a live route
  compatibility requirement.
- Startup requests use attempt IDs, mounted checks, cancellation or abort
  signals so late tenant/auth/branding results cannot overwrite a newer
  attempt. Chat bootstrap, selected-thread and realtime update paths similarly
  compare request/thread identity before applying state.
- Customer logout clears the current tenant/user IndexedDB records, startup
  auth/chat fallbacks and establishes a local signout marker when cached reopen
  must remain blocked.

### FRONT-001: open shells do not follow the declared session lifecycle

- Customer evidence: the provider receives and persists `session.expiresAt`,
  but expiry is read only when opening an offline snapshot
  (`frontend/src/features/auth/lib/offlineAuthSession.ts:70-80`). After state
  becomes `authenticated`, `AuthSessionProvider.tsx:360-456` exposes manual
  refresh/startup effects but has no expiry timer, visibility recheck or online
  lifecycle listener.
- Admin evidence: `AdminSessionResponse` includes `session.expiresAt`
  (`frontend/src/features/admin-auth/api/adminAuthClient.ts:32-37`), while
  `AdminSessionProvider.tsx:26-64` stores only `session.admin`. It also checks
  authority only at startup, explicit refresh or logout.
- Error-path evidence: chat maps a 401 into `refreshSession()` through
  `useChatRuntimeErrorHandlers.ts:12-20`. Profile, notification settings,
  branding/legal and Telegram admin clients throw feature-local errors without
  invalidating the provider, so their protected layouts can remain in the
  authenticated state.
- Failure path: a customer opens a cached transcript, or an admin opens a
  populated console; the backend session expires while the tab remains open.
  The already-rendered protected data remains visible. Offline, the shell can
  remain open indefinitely until navigation/reload. Online, a non-chat API may
  return 401 while the guard continues rendering a stuck authenticated shell.
- Counterevidence: backend cookies and server routes still enforce authority;
  this does not create a server-side privilege escalation. Startup cached auth
  rejects an already-expired snapshot, and chat eventually refreshes the
  session on its own 401 paths.
- Validation contract: retain `expiresAt` in both providers, schedule a local
  invalidation at that timestamp, re-evaluate on visibility/online transitions,
  and centralize 401-to-session invalidation for protected clients. The design
  should avoid periodic polling: one local timer plus bounded lifecycle checks
  is sufficient. Tests must cover customer cached/online and admin expiry,
  hidden-tab wakeup, clock movement and late-request fencing.

## Frontend/Backend API Contract Comparison

The current frontend request paths were compared with backend route
registrations and response discriminants. Every live customer, chat, profile,
branding, legal, notification, admin-auth and Telegram-admin path has a current
backend handler. No removed route, stale current client or required legacy
reader/writer was found.

Response handling is deliberately feature-local and generally typed. The main
cross-feature gap is not a path or payload mismatch but the 401 lifecycle split
described in `FRONT-001`. The stale password/registration browser fixtures are
already isolated as `BASE-001` and must be rewritten rather than supported by a
compatibility shim.

## Chat And User-Visible State

### Controls that held

- Selected-thread bootstrap, older-page loads and realtime refreshes fence
  stale results by request/thread identity. Optimistic text sends preserve one
  `clientMessageKey` across retries and the offline outbox uses the same key.
- Offline background send is text only. Attachment and voice controls remain
  online-only and do not enter the durable text outbox.
- Thread/user/tenant IDs scope offline snapshots, pages, outbox rows, push
  markers and service-worker avatar keys. Cross-identity reads are rejected by
  record parsers and current-identity checks.
- A visible online chat refreshes the thread-list unread projection on focus,
  online, visibility and every 30 seconds while visible
  (`useChatForegroundUnreadRefresh.ts:81-113`). Direct push delivery applies
  supplied unread counts without opening the target thread.
- Profile avatar input already checks its local type/size policy. Admin
  branding operations serialize user mutations and ignore stale load results.
  Notification settings serialize updates rather than racing multiple writes.

### FRONT-004: attachment and voice admission remains backend-first

- Existing finding evidence: `MessageComposer.tsx:225-277` computes a retry
  signature and immediately invokes `onSendAttachment`; it does not reject an
  empty file, a file above 40 MiB, an over-255-character name or an unsupported
  media type before upload. The backend remains authoritative, but the browser
  spends bandwidth and the user waits for a predictable rejection.
- Additional voice evidence: `useVoiceRecorder.ts:75-88,110-126,209-255`
  accumulates recorder chunks with no duration or byte ceiling. On stop, all
  chunks are transformed into a voice file before attachment send. WebKit
  conversion can require additional array-buffer, decoded-audio and encoded
  buffers, amplifying local memory/CPU before the backend 40 MiB check.
- Counterevidence: text/caption length is locally bounded; backend attachment
  validation rejects invalid payloads before Chatwoot; offline attachment send
  is disabled.
- Validation contract: mirror the user-visible backend file limits before
  upload, impose a conservative voice duration/byte ceiling before expensive
  conversion, stop recording at the bound, keep the backend authoritative, and
  test retry-key stability and supported browser MIME fallbacks.

### FRONT-005: other-thread push stale marker remains a runtime follow-up

The production symptom in
`docs/findings/F-CHAT-008-unread-indicators-missing-for-other-thread-push.md`
matches the static path: the service worker can set the app badge and persist a
marker when a ready React client does not accept the push, but
`useChatPushStaleMarkerRefresh.ts:42-60` consumes only the selected thread.

A full thread-list refresh on foreground/online/focus and the 30-second visible
interval is counterevidence to permanent staleness. Because the symptom was not
consistently reproduced here, it remains `needs_follow_up`. Validation must
refresh unread projection for known non-selected marker threads without opening
them or clearing their unread state.

## Offline Storage And Service Worker Boundaries

| Store/cache family           | Scope/key                                       | Bound/cleanup disposition                                                                                  |
| ---------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| tenant/startup context       | host                                            | Replaced online; authoritative tenant failure clears it                                                    |
| last identity/signout        | host plus tenant/user values                    | Exact-scope checks; current-user removal clears identity and preserves signout guard when required         |
| auth snapshot                | tenant/user; startup localStorage also host     | Declared session expiry checked on cached startup; cleared on logout/removal                               |
| thread list/message snapshot | tenant/user/thread                              | Latest message snapshot bounded to 50; current-user removal clears it                                      |
| message pages                | tenant/user/thread/page cursor                  | One record per loaded cursor; no per-thread byte/page cap; inactive TTL function is not invoked            |
| text outbox                  | tenant/user/thread/client message key           | Text only; lease/dedupe/retry state; current-user removal clears it; queued/sending rows protect snapshots |
| push stale markers           | tenant/user/thread                              | Intended seven-day prune exists but is not invoked                                                         |
| service worker static cache  | revision; avatar request adds tenant/user query | Old revisions deleted on activation; no current-identity avatar purge on logout/removal                    |

### FRONT-002: retention policy is dead and active history is unbounded

- `pruneOfflineData()` defines seven-day stale-marker and 30-day inactive-user
  snapshot/page cleanup (`offlineStore.ts:431-497`). The only repository call is
  in `offlineStore.test.ts`; no production lifecycle invokes it.
- Latest/startup message snapshots are correctly trimmed to 50 messages
  (`offlineChatCache.ts:60-73`), but every older history cursor is stored as a
  separate `chat_message_pages` record (`offlineChatCache.ts:129-145`). There is
  no per-user/thread record or byte budget, and the intended prune deliberately
  retains all data for the active identity.
- Failed outbox rows are not part of the retention pass. Storage pressure is
  checked when offline-queue availability initializes, not as historical pages
  accumulate.
- Failure path: an active user loads long histories across many chats, while
  markers/pages for former identities also remain because prune never runs.
  Storage grows until browser eviction/quota failure or explicit current-user
  removal, risking loss of the PWA data that is meant to be reliable.
- Counterevidence: all records are tenant/user scoped, normal logout/removal
  clears the current user, and snapshots are bounded. There is no demonstrated
  cross-tenant read.
- Validation contract: invoke cleanup only from a bounded idle/startup
  lifecycle, not per request; add per-user and per-thread page/byte limits;
  protect queued/sending outbox work; expire terminal outbox/markers; and test
  10x/100x history cardinality without a full hot-path scan.

### FRONT-003: device-data removal does not purge private avatar bytes

- Chat avatar proxy responses are cached under request URLs augmented with
  tenant and user identity (`frontend/public/sw.js:251-300`). This prevents a
  different current identity from selecting an old user's cached avatar in the
  normal application path.
- Current-user removal clears IndexedDB and startup records
  (`offlineStore.ts:293-386`) but sends no CacheStorage purge command. The
  service worker deletes the cache only when a different revision activates
  (`sw.js:73-84`).
- Failure path: after “Удалить сохраненные данные с этого устройства”, private
  avatar bytes remain in browser storage until a service-worker revision or
  site-data clear. The same tenant/user identity can reuse the stale response
  after a later login, and browser CacheStorage inspection still finds the
  bytes.
- Counterevidence: a signout/no-identity state cannot retrieve those entries
  through normal runtime routing, and the query key prevents another user from
  receiving them. The impact is deletion/privacy semantics and stale local
  content, not cross-user authorization.
- Validation contract: add an identity-scoped avatar purge message or a
  separately partitioned private-avatar cache; execute and await it during
  logout/device-data removal; retain the app shell; test same-user relogin and
  different-user isolation.

### FRONT-006: closed-app Background Sync is mitigated, not device-proven

The original static hypothesis in
`docs/findings/F-PWA-003-background-sync-closed-app-outbox-may-stall.md` is no
longer an accurate description of the current code. Commit `a18dd83` added
`keepTextOutboxBackgroundSyncPendingIfRetryableWorkExists()`; queued future-due
or active sending-lease work rejects the sync event promise
(`frontend/public/sw.js:723-773`). Targeted tests cover future queued records,
active leases, records becoming due and hanging sends.

The [WICG Background Sync specification](https://wicg.github.io/background-sync/spec/)
allows the user agent to retry a failed sync at a time of its choosing. It does
not replace a real installed-Android acceptance test for the exact close/lock/
restore-network scenario. Therefore the static code-gap hypothesis is
mitigated, severity is calibrated to Medium because next-open foreground
recovery remains, and the finding stays `needs_follow_up` until device proof.

## Browser-Only UX And Accessibility

Static review found semantic buttons/inputs and visible focus treatment on the
audited auth/chat/admin paths. A regular Chromium Playwright smoke exercised:

1. host tenant resolution;
2. public branding load;
3. expected unauthenticated `401 /api/auth/me` handoff;
4. `/auth/login` at a `320x568` viewport;
5. visible email and submit controls, programmatic focus, correct heading and
   no root horizontal overflow (`scrollWidth = clientWidth = 320`).

The smoke passed. It used mocked API responses and Vite development mode, so it
does not claim production service-worker or installed-PWA coverage.

- `FRONT-007` preserves the observed iPhone visual-viewport/keyboard pan from
  `docs/findings/F-IOS-001-keyboard-textarea-viewport-pan.md`. Chromium cannot
  validate or close it; the previously reverted viewport freeze is explicit
  counterevidence against a broad CSS workaround.
- `FRONT-008` preserves
  `docs/findings/F-CHAT-UI-003-audio-attachment-narrow-width.md`: a native audio
  control has `min-width: 220px` inside a narrower incoming bubble. The actual
  iOS/Android native-control layout was not exercised, so it remains Low
  `needs_follow_up` rather than a confirmed browser failure.

## Verification Evidence

Targeted frozen-source checks:

- auth/routes/profile/settings/admin: 11 Vitest files, 84 tests passed;
- chat/offline/outbox/service worker: 10 Vitest files, 118 tests passed;
- combined: 21 files, 202 tests passed;
- regular Playwright login smoke: passed at `320x568` with no horizontal
  overflow and correct focus/route handoff;
- frozen source `git status`: clean after stage checks;
- product source changes: none.

These tests validate current guards; they do not close lifecycle and
real-device candidates whose failing schedules are absent from the suites.

## Handoff To Later Stages

- Task 8 must model the 30-second per-visible-tab unread refresh, offline page
  cardinality, cleanup scan cost, voice conversion memory and service-worker
  cache growth before choosing limits.
- Task 9 must review PWA/service-worker build and deploy gates, supported
  browser policy and CI browser coverage.
- Task 10 must reconcile the stale wording/status of `F-PWA-003` with commit
  `a18dd83` while preserving its required Android acceptance test.
- Canonical validation must keep browser/device evidence distinct from static
  confidence and may promote only reproduced or otherwise closed failure paths.
