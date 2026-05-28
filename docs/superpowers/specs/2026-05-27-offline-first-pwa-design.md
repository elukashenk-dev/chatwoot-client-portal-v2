# Offline-first PWA Design

## Status

- `status`: draft for user review
- `scope`: внеочередной product/runtime slice
- `target branch`: `docs/offline-first-pwa-spec` for this spec, later a
  `feature/offline-first-pwa` implementation branch
- `related docs`:
  - `AGENTS.md`
  - `docs/architecture/overview.md`
  - `docs/roadmap/implementation-plan.md`
  - `docs/design/portal-ui-ux-baseline.md`
  - `docs/product/b2b-product-goal.md`

## Problem

Текущий portal уже является installable PWA: service worker кеширует app shell,
static assets, icons and navigation fallback; push notifications, update flow
and local app badge также реализованы.

Но runtime behavior пока не offline-first:

- `/api/*` deliberately не перехватывается service worker-ом;
- tenant context and current session must load online before UI opens;
- chat composer disables send while offline;
- failed network sends become transient failed optimistic messages, not durable
  queued sends;
- chat read model lives in React state only and disappears after reload.
- на плохой связи startup может зависнуть на splash: `/api/tenant`,
  `/api/auth/me` or route chunks may be pending for too long without a clear
  user-facing state.

Для B2B customer PWA это слабый installed-app experience. Пользователь ожидает,
что установленный кабинет откроется без сети, покажет последние доступные
данные и примет сообщение как local intent с последующей доставкой.

## Goals

Build an offline-first baseline that preserves the existing authority model:

- after a successful online session, the installed PWA opens offline;
- startup never leaves the user on an indefinite splash screen;
- slow or unstable connectivity turns into a clear state: opening saved data,
  asking to retry, or explaining that first online access is required;
- tenant identity, authenticated user shell, thread list and latest messages are
  available from local device storage;
- user can compose text messages offline;
- offline text messages are stored in a durable local outbox;
- queued text messages are delivered to portal backend after connectivity
  returns;
- backend remains the only authority for auth/session, send, Chatwoot access and
  realtime;
- browser still never receives Chatwoot tokens, Chatwoot conversation authority
  or direct Chatwoot runtime access;
- storage, boot and composer boundaries stay compatible with the planned
  immediate SMS fallback follow-up, without implementing SMS fallback in this
  MVP.

## Non-goals For MVP

These are outside the first Offline-first PWA MVP:

- first login on a new device;
- registration;
- password reset;
- tenant discovery on a never-opened host;
- full historical search;
- media and files history beyond already cached message snapshots;
- offline attachment send;
- offline voice attachment send;
- cross-device unread counters;
- durable authoritative unread state;
- SMS fallback gateway, SMS fallback metadata endpoint, native `sms:` UI and
  SMS Chatwoot inbox integration;
- admin and branding flows.

Reason: each item either needs online authority, large binary storage, external
mail/Chatwoot state, separate infrastructure, or a separate product decision.

## Current Code Baseline

Relevant current files:

- `frontend/public/sw.js`
  - precaches shell URLs and icons;
  - handles navigation fallback;
  - stale-while-revalidate style static cache;
  - skips `/api/*` and tenant dynamic metadata;
  - handles push notification delivery to visible clients;
  - persists local app badge count in IndexedDB.
- `frontend/src/pwa/serviceWorkerRuntime.ts`
  - service worker registration;
  - update flow;
  - push subscription helpers;
  - push-to-client listener;
  - app badge clear.
- `frontend/src/features/tenant/lib/TenantProvider.tsx`
  - blocks app shell until `/api/tenant` succeeds.
- `frontend/src/features/auth/lib/AuthSessionProvider.tsx`
  - blocks protected routes until `/api/auth/me` succeeds.
- `frontend/src/features/chat/pages/ChatPage.tsx`
  - loads threads and selected thread messages from backend;
  - disables composer offline;
  - resyncs on online and visibility lifecycle.
- `frontend/src/features/chat/pages/useOptimisticTextSend.ts`
  - supports non-durable optimistic text sends and retry with same
    `clientMessageKey`.
- `backend/src/modules/chat-messages/sendLedger.ts`
  - already supports backend idempotency/replay by `clientMessageKey`.

## Recommended Approach

Use an app-layer IndexedDB offline store plus foreground sync. Implement the
frontend app storage layer with the small `idb` Promise wrapper instead of
hand-written `IDBRequest`/`IDBTransaction` boilerplate. Keep service worker
focused on app shell/static assets, push and optional sync wakeups. Add a
bounded startup coordinator first, so poor connectivity falls back to saved data
or an actionable retry state instead of an indefinite splash.

### Why This Approach

- Cross-browser behavior is more predictable than relying on Background Sync.
- Existing React state/data loaders can read/write snapshots explicitly.
- Existing backend idempotency by `clientMessageKey` fits durable local outbox.
- `/api/*` can remain backend-authoritative and not be silently cached by the
  service worker.
- Tests can exercise the store and sync controller without requiring a real
  service worker runtime for every case.
- `idb` keeps IndexedDB close to the browser API while adding promises,
  `openDB`, typed schemas and transaction completion helpers. This is enough for
  our scoped cache/outbox model without adopting a heavier local database layer.

### Alternative Considered: Shell-only Offline

This would only improve offline navigation fallback and error messaging. It is
safe and small, but it does not meet the product goal because chat cannot open
or accept messages offline.

### Alternative Considered: Longer Splash Timeout Only

This is rejected. A longer timeout would eventually show an error, but users
would still stare at a blocked app while valid saved data may already exist on
the device. The better behavior is stale-if-slow startup: try online, but open
valid saved data quickly when the network is slow.

### Alternative Considered: Service Worker Background Sync As Primary

This is not recommended as the primary architecture. One-off Background Sync has
limited browser availability and cannot be treated as guaranteed delivery.
It can be added as a progressive enhancement after foreground sync works.

## Research Notes For Poor Connection UX

External guidance points to the same product rule: a PWA should not expose a
blank or endless loading state when network quality is poor.

Sources reviewed:

- MDN PWA caching guide: cache app UI for offline operation and responsiveness;
  static UI should render without waiting for network.
- MDN PWA best practices: installed PWAs are expected to feel fast and
  responsive, and should provide a custom offline experience instead of generic
  browser failure.
- MDN offline/background operation guide: intermittent connectivity should be
  smoothed over with cached resources and background refresh when possible.
- MDN `navigator.onLine`: online status is heuristic and unreliable, so it
  should provide hints only, not gate functionality.
- MDN `AbortSignal.timeout()`: modern fetch can be bounded with explicit
  timeout signals, with fallback needed for older browsers.
- web.dev adaptive serving: network quality information can be used as a
  progressive enhancement to defer heavy work or enable offline mode sooner on
  slow connections.
- established UX response-time guidance: short waits can use simple progress,
  but longer waits need specific status and actions; an indefinite spinner is
  treated by users as a broken app.

Local implication:

- app shell and route chunks must be cache-first from the service worker;
- authenticated API JSON remains backend-authoritative and is not generically
  service-worker cached;
- startup API checks must be raced against local IndexedDB snapshots and clear
  deadlines;
- `navigator.onLine` and Network Information API are only hints; request
  outcomes, timeout outcomes and valid local snapshots decide the boot state.
- browser storage is best-effort even with persistence requests; eviction or
  corruption must become a controlled online-required state, not a broken app;
- real-device behavior matters for PWA APIs, so closure must include at least a
  documented Chrome/Android and Safari/iOS Home Screen smoke matrix or an exact
  blocker if a device is unavailable.

## Architecture

### High-level Flow

Online happy path:

1. App loads `/api/tenant`, `/api/auth/me`, `/api/chat/threads`,
   `/api/chat/messages`.
2. Successful responses update React state.
3. The same responses update the offline IndexedDB store under
   `tenantSlug + userId`.
4. Service worker continues to cache shell/static assets only.

Offline app open after previous online session:

1. App shell loads from service worker cache.
2. Tenant provider tries `/api/tenant`.
3. On network failure, provider reads cached tenant context for current host.
4. Auth provider tries `/api/auth/me`.
5. On network failure, provider reads `last_active_identities` for current
   host to locate the scoped `tenantSlug:userId` auth snapshot.
6. Auth provider opens protected shell only if the located auth snapshot is
   still inside `offlineAccessUntil`.
7. Chat page reads cached threads and latest selected thread snapshot.
8. UI shows an explicit saved-data state.

Poor connection app open after previous online session:

1. App shell loads from service worker cache.
2. Startup begins online checks and local cache reads in parallel.
3. If online tenant/session checks finish quickly, app opens in normal online
   mode and refreshes offline snapshots.
4. If online checks are still pending after the slow-start deadline, splash copy
   changes from generic loading to unstable-connection status.
5. If valid cached tenant/auth data is available after the cache-fallback
   deadline, app opens from saved data and keeps background revalidation
   best-effort.
6. If there is no valid saved data after the online-required deadline, app
   leaves splash and shows a controlled state with retry.

Offline text send:

1. User sends text while offline.
2. Composer creates a durable outbox item with `clientMessageKey`.
3. The local message appears in the transcript with status `queued` only after
   the IndexedDB transaction commits.
4. The outbox drain runs on online, visibility resume, app startup and after a
   successful backend request.
5. Drain sends queued text to `/api/chat/messages`.
6. Backend validates current tenant/session/thread authority and sends to
   Chatwoot.
7. On success, local queued message is reconciled with canonical backend
   `sentMessage`.

### Boundaries

Frontend offline store owns:

- cached public tenant context;
- last active identity pointer for offline auth lookup;
- cached current user snapshot;
- cached thread list;
- cached latest chat message snapshots;
- local text outbox state;
- metadata needed to expire or invalidate cached snapshots;
- push stale markers that force foreground refresh before trusting cached chat
  freshness.

Backend owns:

- tenant resolution;
- auth/session validity;
- current user identity;
- thread access;
- send authority;
- Chatwoot conversation mapping;
- Chatwoot send;
- replay/idempotency via send ledger.

Service worker owns:

- app shell/static asset cache;
- update lifecycle;
- push notification bridge;
- local badge support;
- optional future background sync wakeup.

Service worker must not become a hidden API cache authority for authenticated
chat JSON.

### Startup Anti-hang State Machine

Startup should be managed by an explicit boot coordinator instead of open-ended
provider-level loading. The coordinator can live as small shared frontend
helpers; it does not need a global framework.

Boot inputs:

- service worker app shell readiness;
- route chunk load readiness;
- `/api/tenant` result;
- `/api/auth/me` result for protected routes;
- cached tenant context for current host;
- `last_active_identities` and valid `auth_snapshots`;
- optional network hints from `navigator.onLine` and `navigator.connection`.

Boot states:

```text
checking_online
slow_connection
opening_saved_data
ready_online
ready_cached
online_required
session_check_required
boot_error
```

Default timing constants:

```text
BOOT_SLOW_NOTICE_MS = 1200
BOOT_CACHE_FALLBACK_MS = 2500
BOOT_ONLINE_REQUIRED_MS = 8000
BOOT_REQUEST_TIMEOUT_MS = 10000
```

Rules:

- do not block startup indefinitely on `/api/tenant`, `/api/auth/me` or lazy
  route chunk requests;
- start online requests and local cache reads together when a route can use
  cached data;
- if online requests finish before `BOOT_CACHE_FALLBACK_MS`, prefer online data
  and update snapshots;
- if online requests are pending and valid cached data exists after
  `BOOT_CACHE_FALLBACK_MS`, open `ready_cached`;
- if no valid cached data exists by `BOOT_ONLINE_REQUIRED_MS`, leave splash and
  show an actionable online-required state;
- abort or settle startup-critical fetches at `BOOT_REQUEST_TIMEOUT_MS` using
  `AbortSignal.timeout()` when supported, with an `AbortController` fallback;
- after opening cached data, continue background revalidation only through the
  normal backend APIs and auth/session checks;
- if background revalidation succeeds, upgrade UI from `ready_cached` to
  `ready_online`;
- if background tenant revalidation returns an authoritative tenant rejection,
  invalidate cached data for that host/tenant and move to `online_required`;
- if background revalidation returns `401`, follow the session rejection flow;
- use `navigator.onLine` and `navigator.connection` only to tune copy and
  timing, never as the sole proof of connectivity.

Slow-network timing may be made more aggressive when
`navigator.connection.effectiveType` is `slow-2g`/`2g` or
`navigator.connection.saveData` is true, but this must be progressive
enhancement because support is not universal.

### Startup Outcomes

The user should always leave the initial splash through one of these outcomes:

- `ready_online`: fresh tenant/session data loaded from backend.
- `ready_cached`: valid saved tenant/session/chat data opened locally while the
  app waits for a reliable backend response.
- `online_required`: first device access, missing tenant cache, missing auth
  identity or no valid cached session; show retry and explain that connection
  is required.
- `session_check_required`: saved session is expired by `offlineAccessUntil`;
  show retry and explain that the app needs connection to verify access.
- `boot_error`: unexpected local corruption or unsupported storage failure;
  show retry and a local reset option only if the implementation can make that
  reset scoped and safe.

## Hardening Addendum

These requirements keep the MVP from becoming browser-lab-only.

### Browser And Device Matrix

Automated E2E may run in Chromium, but release confidence for this feature needs
real installed-PWA checks because service worker, storage, push and Home Screen
behavior vary by browser.

Minimum closure matrix:

- desktop Chrome/Chromium production preview for automated Playwright proof;
- Chrome on Android as installed PWA for offline reload and queued send smoke;
- Safari on iOS/iPadOS Home Screen PWA for offline reload, storage retention and
  slow-start copy smoke, unless the user explicitly defers iOS support.

If a device is unavailable, the final closure plan must record the exact blocker
and keep Chromium E2E plus unit/build checks green.

### Storage Eviction Or Corruption

The service worker can still open the app shell while IndexedDB is empty,
evicted, blocked by private mode or corrupted. Treat that as a controlled
runtime outcome:

- do not infer identity from React state, URL, service worker cache or stale
  globals;
- show the same online-required/session-check-required states used for first
  access when required records are missing;
- show `Сохраненные данные недоступны. Нужно подключение.` when local storage
  opens but the expected offline records are unusable;
- never show cached protected data from a partially readable scope;
- keep composer drafts visible when an outbox write fails, but do not render a
  queued message.

### Local Clock Rollback

Cached auth depends on device time. If the current device clock is suspiciously
earlier than the saved auth timestamps, the app must fail closed:

- compare `Date.now()` with `lastVerifiedAt` and `savedAt`;
- allow only a small tolerance for normal clock skew, for example 5 minutes;
- if the clock appears rolled back beyond the tolerance, do not open protected
  cached data and require online session verification.

This does not make offline auth cryptographically authoritative. It only avoids
accidentally extending the local display window by trusting a bad local clock.

### App, Service Worker And IndexedDB Version Compatibility

The app can have old tabs, an old service worker and a new IndexedDB schema at
the same time. The MVP must tolerate that:

- a service worker update must not delete IndexedDB records or outbox data;
- schema upgrades must be additive and idempotent;
- old tabs must not write records that corrupt new schema assumptions;
- build assets and route chunks required for startup must be precached from the
  actual production build manifest;
- if code/database versions are incompatible, show controlled update/retry copy
  rather than a permanent splash.

### Reconnect Freshness

Push delivery is not guaranteed and push permission may be disabled. After a
cached open, the first successful backend connectivity signal must refresh the
thread list and current thread before the UI treats cached chat data as fresh.

### Minimal Observability

Add privacy-safe client/runtime events or structured logs where the existing
telemetry/logging surface allows it:

- boot outcome and reason: online, cached, online-required, session-check,
  storage-unavailable;
- storage persistence granted/denied/unsupported;
- quota or IndexedDB write failure category;
- outbox drain outcome category, without message text;
- service worker asset manifest/version used for the current page.

Do not log message content, email, Chatwoot IDs exposed only to backend, tokens,
or raw cached payloads.

## Offline Store Model

Use IndexedDB through a small typed wrapper built on `idb` in frontend app code.
This avoids callback/event boilerplate while keeping the storage model close to
native IndexedDB semantics.

Do not use Dexie for this MVP. Dexie is useful for richer local database
queries/reactivity, but this portal needs explicit scoped cache/outbox
operations with backend authority, not a broader local-first database runtime.

The service worker may still use a tiny native IndexedDB helper while it remains
a non-bundled `frontend/public/sw.js` file. Do not introduce a second
application storage abstraction in the service worker.

Database name:

```text
portal-offline
```

Schema version:

```text
1
```

Versioning rules:

- keep the database name stable across feature slices;
- use IndexedDB schema version upgrades for new stores, including the planned
  SMS `sms_fallback_metadata` store;
- never create a new database name only to add stores, because that can orphan
  existing offline data and outbox records;
- migrations must be idempotent and must leave unknown future stores untouched.
- app code and service worker code that open this database must share the same
  version/store contract for the currently shipped build; when that contract
  changes, both open paths must be updated in the same slice.

Stores:

```text
tenant_contexts
last_active_identities
local_device_signouts
auth_snapshots
chat_thread_lists
chat_message_snapshots
chat_text_outbox
sync_leases
push_stale_markers
```

### `tenant_contexts`

Key:

```text
host
```

Value:

```ts
type OfflineTenantContextRecord = {
  host: string
  savedAt: string
  tenant: {
    displayName: string
    primaryDomain: string
    publicBaseUrl: string
    slug: string
  }
}
```

Rules:

- save only after successful `/api/tenant`;
- use only when current host matches the record key;
- never synthesize tenant from path, query or user input;
- use cached tenant only for network error, request timeout, or offline startup;
- if `/api/tenant` returns an authoritative tenant rejection such as disabled,
  forbidden, not found, or a slug/domain mismatch, invalidate the cached tenant
  for this host, clear the host `last_active_identities` pointer, stop outbox
  drain for the affected tenant, and require an online tenant/auth check before
  showing protected data again.

### `last_active_identities`

Key:

```text
host
```

Value:

```ts
type OfflineLastActiveIdentityRecord = {
  host: string
  savedAt: string
  tenantSlug: string
  userId: number
}
```

Rules:

- save only after successful online `/api/auth/me` or login;
- overwrite when the same host successfully authenticates as another user;
- clear on successful logout when the record points to the current tenant/user;
- use only to locate a scoped `auth_snapshots` record during offline startup;
- if missing, protected shell must require online session verification.

### `local_device_signouts`

Used when a user removes saved data while offline or while the backend is
unreachable.

Key:

```text
host
```

Value:

```ts
type OfflineLocalDeviceSignoutRecord = {
  createdAt: string
  host: string
  tenantSlug: string
  userId: number
}
```

Rules:

- create only after an explicit user action such as
  `Удалить сохраненные данные с этого устройства`;
- clear all local offline records for this `tenantSlug:userId`, including
  `auth_snapshots`, chat caches, outbox records, push stale markers and the
  `last_active_identities` pointer;
- protected shell must not reopen from cache while this marker exists;
- on the next online startup, call `/api/auth/logout` best-effort to clear the
  httpOnly session cookie, then remove this marker;
- if the user explicitly logs in again, remove this marker after successful
  login and recreate the normal offline snapshots.

### `auth_snapshots`

Key:

```text
tenantSlug:userId
```

Value:

```ts
type OfflineAuthSnapshotRecord = {
  lastVerifiedAt: string
  offlineAccessUntil: string
  savedAt: string
  sessionExpiresAt: string
  tenantSlug: string
  user: {
    email: string
    fullName: string | null
    id: number
  }
  userId: number
}
```

Rules:

- save only after successful `/api/auth/me` or login;
- clear on successful logout for this tenant/user;
- do not store session token or cookie material;
- cached access is local display permission only, not backend authority;
- after `offlineAccessUntil`, protected shell must require online session
  check.
- if current device time is more than 5 minutes earlier than `lastVerifiedAt`
  or `savedAt`, treat the cached auth snapshot as untrusted and require online
  session verification.

`offlineAccessUntil` must be stricter than raw cookie/session expiry:

```text
offlineAccessUntil = min(sessionExpiresAt, lastVerifiedAt + OFFLINE_AUTH_GRACE)
```

MVP default for `OFFLINE_AUTH_GRACE` is 24 hours. The implementation plan may
make it backend-configured, but the frontend must never treat
`sessionExpiresAt` alone as permission for long-lived offline access.

`sessionExpiresAt` is derived from backend session metadata added to
`/api/auth/me` and login responses. If backend only knows cookie TTL today, the
offline slice should add explicit session expiry metadata to the public auth
response.

### `chat_thread_lists`

Key:

```text
tenantSlug:userId
```

Value:

```ts
type OfflineChatThreadListRecord = {
  activeThreadId: string
  savedAt: string
  tenantSlug: string
  threads: ChatThreadSummary[]
  userId: number
}
```

Rules:

- save only after successful `/api/chat/threads`;
- render as cached when online thread loading fails and auth snapshot is valid;
- selected thread must be one of cached threads.

### `chat_message_snapshots`

Key:

```text
tenantSlug:userId:threadId
```

Value:

```ts
type OfflineChatMessageSnapshotRecord = {
  savedAt: string
  snapshot: ChatMessagesSnapshot
  tenantSlug: string
  threadId: string
  userId: number
}
```

Rules:

- save latest ready or bootstrap-ready snapshots after successful backend load;
- do not cache `unavailable` as the long-term thread state;
- merge canonical sends and realtime snapshots into this record;
- keep bounded message count per thread, for example latest 50 messages;
- older history can remain online-only in MVP.

### `chat_text_outbox`

Key:

```text
tenantSlug:userId:threadId:clientMessageKey
```

Value:

```ts
type OfflineTextOutboxRecord = {
  attemptCount: number
  clientMessageKey: string
  content: string
  createdAt: string
  errorCode: string | null
  errorMessage: string | null
  lastAttemptAt: string | null
  nextAttemptAt: string | null
  replyTo: ChatMessageReplyPreview | null
  replyToMessageId: number | null
  sendOwnerId: string | null
  sendingLeaseExpiresAt: string | null
  sendingStartedAt: string | null
  status: 'queued' | 'sending' | 'failed'
  tenantSlug: string
  threadId: string
  updatedAt: string
  userId: number
}
```

Rules:

- text content max remains current backend max `4000`;
- no attachments in this store for MVP;
- `clientMessageKey` is generated once and reused for retries;
- create the record before clearing composer text;
- local queued messages render with status `queued` only after the IndexedDB
  transaction commits;
- if durable write fails, keep the composer draft and show a controlled local
  storage error instead of rendering a queued message;
- sending messages render with existing sending UI;
- failed messages render with retry UI and error copy;
- successful canonical backend response removes the outbox record;
- when marking a record `sending`, also set `sendOwnerId`,
  `sendingStartedAt`, `sendingLeaseExpiresAt`, `lastAttemptAt`, and increment
  `attemptCount`;
- stale `sending` records whose `sendingLeaseExpiresAt` is in the past are due
  for recovery and may be retried by another tab;
- retry stale `sending` records with the original `clientMessageKey`, because
  backend send ledger idempotency is the final protection against duplicate
  sends after uncertain network outcomes.

### `sync_leases`

Fallback coordination store used to avoid duplicate sends from two tabs when
the Web Locks API is unavailable.

Key:

```text
tenantSlug:userId:threadId:clientMessageKey
```

Value:

```ts
type OfflineSyncLeaseRecord = {
  expiresAt: string
  ownerId: string
}
```

Rules:

- prefer `navigator.locks.request('portal-outbox:<tenantSlug>:<userId>')` for
  outbox drain coordination when the browser supports Web Locks;
- use `sync_leases` only as the IndexedDB fallback for browsers without Web
  Locks;
- fallback lease is short, for example 30 seconds;
- if a tab crashes, another tab can retry after expiry;
- backend send ledger remains the final duplicate-send protection.

### `push_stale_markers`

Key:

```text
tenantSlug:userId:threadId:chatwootMessageId
```

Value:

```ts
type OfflinePushStaleMarkerRecord = {
  chatwootMessageId: number
  createdAt: string
  tenantSlug: string
  threadId: string
  userId: number
}
```

Rules:

- service worker may create this marker from a safe push payload;
- persisted markers require a trusted user binding: either backend includes
  `portalUserId` in the encrypted Web Push payload, or the service worker can
  match the push subscription to a cached user binding created during online
  push registration;
- if the service worker cannot bind the push to a `tenantSlug:userId`, it may
  notify visible clients but must not persist a stale marker;
- do not store message body from push in MVP;
- when a visible app client exists, prefer `postMessage` and let the foreground
  app mark the thread stale immediately;
- when no app client exists, consume the marker on next app startup and refresh
  affected thread data before treating cached latest messages as current;
- foreground app applies a marker only after auth resolves and the thread is
  present in the current user's scoped cached thread list or online thread
  response;
- `private:me` markers must never be shared across users on the same device;
- delete stale markers after a successful thread refresh.

## Storage Persistence And Quota

Offline data is best-effort browser storage, so the app must make durability
visible in behavior:

- request persistent storage with `navigator.storage.persist()` after a trusted
  login or before enabling the offline feature, when supported;
- use `navigator.storage.estimate()` when available to detect very low quota
  before queueing sends;
- handle `QuotaExceededError` from every outbox or cache write;
- do not show `queued` or clear composer text until the outbox record is
  committed;
- if storage is unavailable or evicted, fall back to online-only behavior and
  require a fresh online load;
- if the app shell opens but required IndexedDB records are missing or corrupt,
  show controlled online-required/session-check-required copy instead of
  continuing with partial cached state;
- keep MVP storage text-only: no attachment blobs, generated previews or
  arbitrary API response caches.

## Retention And Pruning

Local offline data is user data and must have explicit retention rules.

Rules:

- successful online logout clears all local data for the current
  `tenantSlug:userId`;
- local device data removal clears the same scope while offline and blocks
  cached reopen with `local_device_signouts`;
- when the same host authenticates as a different user, do not show previous
  user's cached data and prune previous `last_active_identities` pointer;
- keep only the latest bounded message snapshot per cached thread, for example
  latest 50 messages;
- remove push stale markers after successful refresh, and also prune markers
  older than 7 days;
- prune cached thread/message snapshots for users that are no longer the
  `last_active_identities` user after 30 days, unless they still have unsent
  outbox records;
- retain `queued` and retryable unsent text until sent, explicit user deletion,
  logout, or local device data removal;
- failed outbox records older than 30 days should remain visible only if the
  implementation also offers an explicit user retry/delete path; otherwise they
  must be pruned only after clear user-facing copy explains that old unsent
  local text is being removed from this device;
- retention pruning must never delete backend or Chatwoot-owned data.

## SMS Fallback Compatibility

SMS fallback is planned as the immediate follow-up after this Offline-first PWA
MVP. The MVP should leave clear extension points, but must not implement SMS
fallback behavior yet.

Compatibility requirements:

- the IndexedDB wrapper must support versioned schema upgrades so the SMS slice
  can add a `sms_fallback_metadata` store without replacing the offline store;
- the SMS store will be scoped by `tenantSlug:userId:private:me`, matching the
  chat cache and outbox scoping from this MVP;
- the boot coordinator must expose controlled poor-connection and cached-open
  states that the SMS slice can reuse to decide when emergency SMS UI is
  relevant;
- chat composer offline state must stay extensible: this MVP adds text outbox
  queueing, while the SMS slice will add a separate emergency action for
  `private:me`;
- native SMS actions must not be represented as `chat_text_outbox` records and
  must not reuse `clientMessageKey`;
- cached SMS metadata must use this IndexedDB layer, not a separate
  `localStorage` cache;
- service worker remains app-shell/static only for authenticated API data, so
  SMS metadata must also be cached by app code after authenticated backend
  responses.

Ordering decision:

- implement and close this Offline-first PWA MVP first;
- update the work-log recommended next step to SMS fallback after the MVP
  closure if the user still approves that order;
- start SMS fallback from the post-offline-first baseline, beginning with the
  SMSGate Private Server spike.

## Sync Semantics

### Drain Triggers

Run foreground drain when:

- browser fires `online`;
- app starts and auth/tenant state is ready;
- document becomes visible;
- any successful chat API response marks connectivity restored;
- realtime opens for selected thread.

`navigator.onLine` is only a hint. The app should still treat failed backend
requests as offline/unavailable and should treat successful backend requests as
the reliable signal that foreground drain may resume.

Optional enhancement:

- register a service worker one-off sync only when browser support exists.
  Foreground drain remains required.

### Drain Ordering

For each `tenantSlug + userId`:

1. Select due records ordered by `createdAt`:
   - `queued` records whose `nextAttemptAt` is null or in the past;
   - `failed` records only after explicit user retry;
   - stale `sending` records whose `sendingLeaseExpiresAt` is in the past.
2. Acquire Web Lock for `portal-outbox:<tenantSlug>:<userId>` or fallback
   IndexedDB lease.
3. Mark item `sending` with a fresh local send lease.
4. POST `/api/chat/messages` with original `clientMessageKey`, `content`,
   `replyToMessageId` and `threadId`.
5. On success:
   - remove outbox item;
   - merge canonical `sentMessage`;
   - update cached message snapshot.
6. On network error:
   - return item to `queued`;
   - set `nextAttemptAt` using backoff.
7. On `429`:
   - keep item queued;
   - respect backend `Retry-After`.
8. On `401`:
   - stop drain;
   - mark auth snapshot invalid;
   - require online login.
9. On `403` or `thread_access_denied`:
   - mark item failed with access-denied copy.
10. On `409 client_message_key_conflict`:
    - mark failed with conflict copy and do not auto-retry.
11. On `chat_send_in_progress`:
    - delay retry briefly.

### Reconciliation

Canonical backend messages win over local queued messages.

When a backend snapshot contains a message with a `clientMessageKey` matching a
local outbox item:

- if canonical message is present, remove local outbox item;
- display canonical message;
- preserve timeline ordering by canonical `createdAt`.

If backend accepts a send but returns no `sentMessage`, keep current behavior:
treat it as failed/unavailable and let user retry.

## UX Contract

### Startup And Poor Connection

The initial splash may be brief, but it must not be an unbounded spinner.

Initial copy:

```text
Открываем кабинет.
```

After `BOOT_SLOW_NOTICE_MS` if online startup is still pending:

```text
Связь отвечает медленно. Проверяем сохраненные данные.
```

If valid saved data opens:

```text
Связь нестабильна. Показываем сохраненные данные.
```

If saved data is available, include the last successful refresh time where the
surface can show it without clutter:

```text
Данные сохранены сегодня в 14:35.
```

If this is first access or saved data is not usable:

```text
Нужно подключение к интернету.
Для первого входа и проверки доступа требуется соединение.
```

If saved auth is expired:

```text
Нужно проверить сессию.
Подключитесь к интернету, чтобы продолжить.
```

Actions:

- primary: `Повторить`;
- secondary, only when valid saved data exists: `Открыть сохраненные данные`;
- do not show technical diagnostics, raw timeout names or browser network
  labels to normal users.

The spinner can stay as a short progress cue, but after the slow-start deadline
the state text must explain what is happening. After the online-required
deadline, the UI must become actionable.

### Offline Shell

When using cached data, show a concise system-owned alert:

```text
Нет соединения. Показываем сохраненные данные.
```

If there are queued sends:

```text
Сообщения будут отправлены, когда соединение восстановится.
```

If the app shell opens but local saved records are unavailable or unusable:

```text
Сохраненные данные недоступны. Нужно подключение.
```

These are system-owned copy under the current UI/UX baseline.

### Composer

Text composer:

- enabled offline when selected thread is cached and writable from last known
  state;
- sending creates queued local message only after the outbox record commits;
- keep draft text and reply target until durable outbox write succeeds;
- if outbox write fails, keep the draft visible and show a local storage error;
- send button remains primary action.

Attachments and voice:

- disabled offline in MVP;
- copy:

```text
Файлы можно отправить после восстановления соединения.
```

### Message Statuses

Add local status `queued` in frontend presentation only.

Visual semantics:

- `queued`: clock icon, label `В очереди`;
- `sending`: existing sending status;
- `failed`: existing retry status;
- `sent`: canonical backend status.

Backend does not need a new message status for queued items because queued
messages do not exist on backend yet.

### Session Expiry

If app is offline and `last_active_identities` is missing, the scoped
`auth_snapshots` record is missing, or `offlineAccessUntil` is expired:

- protected app does not open;
- show a controlled state requiring connection to verify session;
- do not clear local outbox automatically unless user explicitly logs out
  online or the backend later rejects session.

If app comes online and `/api/auth/me` returns `401`:

- stop outbox drain;
- mark local auth invalid;
- clear `last_active_identities` only when it points to the rejected
  tenant/user;
- show login route;
- keep outbox records encrypted by browser storage only in the sense of origin
  isolation, not cryptographic protection;
- after successful login as the same tenant/user, queued text can drain;
- after login as a different user, do not show previous user's cached chat or
  queued messages.

### Local Device Data Removal

When protected cached data is visible, or when the app cannot verify session
because it is offline, the user must have a controlled way to remove saved data
from this device.

Copy:

```text
Удалить сохраненные данные с этого устройства
```

Rules:

- require explicit confirmation because this discards cached chats and unsent
  local outbox text for the current tenant/user;
- remove only the current `tenantSlug:userId` local data plus the current host
  identity pointer;
- create `local_device_signouts` so the protected shell cannot reopen from cache
  while the backend session cookie may still exist;
- when online later, call `/api/auth/logout` best-effort to clear the httpOnly
  cookie and then show login;
- do not present this as a full account logout until the backend confirms
  logout.

## Security And Privacy

Must preserve these invariants:

- no Chatwoot token in browser storage;
- no Chatwoot direct API endpoint in browser sync logic;
- no cross-tenant cache reuse;
- no cross-user cache reuse;
- unknown host cannot use default tenant cache;
- local outbox sends still pass backend tenant/session/thread checks;
- logout clears local offline data for current tenant/user;
- offline local device data removal clears current user local data and blocks
  cached reopen until online auth/logout is resolved;
- authoritative tenant rejection invalidates cached tenant data for that host;
- persisted push stale markers are scoped to `tenantSlug:userId`;
- dynamic tenant metadata remains `no-store` at HTTP level, but successful app
  code may store a scoped copy in IndexedDB for offline open;
- service worker does not cache authenticated API JSON generically.
- local browser storage is origin-isolated but not encrypted by this
  application; shared-device privacy relies on bounded offline access and
  explicit local data removal, not on cryptographic secrecy.

Data stored locally:

- tenant display metadata;
- last active tenant/user pointer for current host;
- local device signout marker after explicit offline data removal;
- current user public profile;
- thread summaries;
- latest message snapshots;
- unsent text message content;
- user-scoped push stale markers without message body.

Data not stored locally in MVP:

- passwords;
- session tokens;
- Chatwoot API tokens;
- admin tokens;
- attachment blobs;
- arbitrary API responses.

## Service Worker Changes

MVP service worker changes should stay narrow:

- use a generated precache list from the Vite build output or equivalent
  manifest so route-level lazy chunks open offline after first production load;
- verify that protected-route chunks needed for chat startup are either
  precached or have a controlled cached fallback, so `Suspense` does not become
  another indefinite boot spinner;
- keep `/api/*` passthrough;
- keep tenant dynamic metadata excluded from CacheStorage;
- optionally expose a message channel for foreground app to ask whether the
  active service worker is ready;
- expose enough build/cache version information for the app to detect an
  incompatible old service worker or missing route chunk and show update/retry
  copy instead of hanging;
- when safe push payloads arrive, notify visible clients or persist
  `push_stale_markers` without storing message body;
- persist push stale markers only when the payload or subscription binding
  identifies the target portal user;
- optionally register one-off Background Sync only as progressive enhancement.

Do not implement API response caching in service worker for this slice.

## Backend Changes

Expected backend changes are small:

- add explicit session expiry metadata to login and `/api/auth/me` responses,
  for example:

```ts
type AuthUserResponse = {
  session: {
    expiresAt: string
  }
  user: AuthenticatedPortalUser
}
```

- keep old frontend tests updated for the new response shape;
- no new Chatwoot API surface is required for MVP;
- no new database table is required for MVP because durable queued text lives
  locally until backend receives the send.
- push payload generation should include enough non-secret user binding for the
  service worker to persist stale markers under `tenantSlug:userId`, or the
  service worker must skip persistent markers when that binding is unavailable.

Backend send ledger already provides the required idempotency boundary.

## Testing Strategy

### Frontend Unit Tests

Add focused tests for:

- IndexedDB opens stable `portal-offline` database and upgrades schema version
  without replacing existing stores;
- app/service-worker IndexedDB store contract stays aligned when the schema
  changes;
- IndexedDB wrapper read/write/delete by tenant/user/thread scope;
- retention pruning removes old markers/snapshots without touching unsent
  outbox;
- corrupt or missing records return controlled empty states;
- storage eviction or blocked IndexedDB maps to controlled online-required or
  session-check-required UI;
- boot coordinator transitions from `checking_online` to `slow_connection`
  after `BOOT_SLOW_NOTICE_MS`;
- slow `/api/tenant` with valid cached tenant opens from saved tenant data after
  `BOOT_CACHE_FALLBACK_MS`;
- slow `/api/auth/me` with valid identity/auth snapshot opens protected shell
  from saved auth data after `BOOT_CACHE_FALLBACK_MS`;
- hanging startup with no valid cache leaves splash and shows
  `online_required` after `BOOT_ONLINE_REQUIRED_MS`;
- startup request timeout maps to controlled slow/offline behavior, not an
  unhandled error;
- cached tenant provider fallback on network error;
- authoritative `/api/tenant` rejection invalidates cached tenant and blocks
  protected cached open;
- `last_active_identities` locates cached auth only for current host;
- cached auth fallback within `offlineAccessUntil`;
- cached auth rejects snapshots when device time is rolled back beyond the
  allowed skew from saved auth timestamps;
- missing identity or expired cached auth blocks protected shell;
- `local_device_signouts` blocks cached protected shell after offline local data
  removal;
- cached chat thread/message fallback;
- offline text send creates queued outbox record only after durable commit;
- storage write failure keeps composer draft/reply target and does not render
  `queued`;
- outbox drain sends original `clientMessageKey`;
- stale `sending` outbox records recover after `sendingLeaseExpiresAt`;
- outbox drain uses Web Locks when available and `sync_leases` fallback when
  unavailable;
- successful drain reconciles queued message to canonical backend message;
- `401`, `403`, `409`, `429` drain outcomes;
- push stale marker is persisted only with user binding and forces refresh
  before cached thread freshness is trusted;
- reconnect after cached open refreshes the thread list and selected thread even
  when no push stale marker exists;
- logout clears offline data for current tenant/user;
- offline local device data removal clears current tenant/user data without
  claiming backend logout;
- attachments and voice remain disabled offline.

### Service Worker Tests

Extend existing service worker asset tests to check:

- production service worker references build asset precache manifest or
  equivalent generated asset list;
- protected route chunks required for offline chat startup are covered by the
  generated precache or controlled fallback strategy;
- built service worker exposes a cache/build version that can be compared by
  the foreground app when update or chunk-load failures occur;
- `/api/*` passthrough remains present;
- tenant dynamic metadata remains excluded;
- push handling does not store message body and writes only user-scoped
  stale-marker metadata when persistence is needed;
- push handling skips persistent stale markers when no user binding is
  available;
- optional sync registration code is guarded by feature detection.

### Backend Tests

Add/adjust tests for:

- login response includes `session.expiresAt`;
- `/api/auth/me` response includes `session.expiresAt`;
- expired sessions still return `401`;
- push payload generation includes non-secret portal user binding or explicitly
  documents that persistent stale markers are disabled;
- existing tenant/session isolation remains unchanged.

### Playwright E2E

Add focused offline-first browser tests:

Primary offline reload/send flow:

1. Open portal online and login as seeded user.
2. Load chat.
3. Simulate hanging or very slow `/api/tenant` and `/api/auth/me` responses.
4. Reload app.
5. Confirm splash changes to unstable-connection copy and then opens saved
   protected shell without indefinite waiting.
6. Set browser context offline.
7. Reload app.
8. Confirm protected shell opens from saved data.
9. Send a text message offline.
10. Confirm queued message appears only after local durable write.
11. Restore online.
12. Confirm queued send POSTs to backend and reconciles to sent state.

Multi-tab drain flow:

1. Seed one queued outbox record.
2. Open two app tabs for the same tenant/user.
3. Restore online in both tabs.
4. Confirm only one backend send occurs for the same `clientMessageKey`.

Stale sending recovery flow:

1. Seed an outbox record already marked `sending` with expired
   `sendingLeaseExpiresAt`.
2. Reload app online.
3. Confirm the record retries with the same `clientMessageKey`.

If production-like service worker testing needs `vite preview` and HTTPS-like
secure context, document the exact local runner or blocker in the plan.

Background Sync should remain an optional enhancement test, not the primary E2E
proof. The required browser proof is foreground offline reload, durable queue
and online reconciliation.

Manual or device-level closure checks:

- Android Chrome installed PWA opens cached shell and queues one text while
  offline;
- iOS/iPadOS Home Screen PWA opens cached shell and leaves splash with the
  documented copy under poor connectivity, unless iOS support is explicitly
  deferred;
- browser storage removal/eviction simulation shows online-required copy, not a
  blank shell.

## Rollout Plan

Recommended implementation slices:

1. Anti-hang startup UX, boot deadlines and controlled poor-connection states.
2. Offline data foundation, storage persistence checks and auth/tenant cached
   open, retention pruning, local device data removal and versioned IndexedDB
   upgrade support for the next SMS metadata store.
3. Cached chat read model and push stale invalidation.
4. Durable text outbox, foreground drain, multi-tab coordination and composer
   state boundaries that can later host a separate SMS emergency action.
5. Service worker production precache hardening and optional sync hooks.
6. E2E runtime validation and docs update.
7. Post-MVP handoff: update roadmap/work-log next step to SMS fallback and
   start the SMSGate Private Server spike from the new baseline.
8. Optional Background Sync progressive enhancement.

Each slice should close with:

- implementation;
- code review of affected area;
- targeted tests;
- regression fixes;
- repeat targeted tests;
- required auto-tests for browser/runtime behavior;
- work-log update only after the full offline-first baseline changes durable
  product/runtime behavior.

## Acceptance Criteria

MVP is accepted when:

- after one successful online login and chat load, app shell opens offline;
- startup never stays on an indefinite splash during hanging or slow
  `/api/tenant`, `/api/auth/me` or route chunk loading;
- slow connection states use clear user copy and show a retry action when
  saved data cannot be opened;
- evicted, unavailable or corrupt local storage shows controlled online-required
  or session-check-required UI instead of partial protected data;
- suspicious local clock rollback blocks cached protected access and requires an
  online session check;
- cached tenant name/user/thread/messages are visible offline;
- authoritative tenant rejection invalidates cached tenant data and blocks
  protected cached open;
- offline auth lookup uses current host plus `last_active_identities` and
  cannot infer user identity from unsafe client state;
- offline protected access is bounded by `offlineAccessUntil`, not raw session
  expiry alone;
- user can remove saved current-user data from this device even when offline;
- offline state is explicit and system-owned;
- text messages can be queued offline;
- `queued` appears only after durable outbox write commits;
- storage write failure keeps the composer draft and reply target visible;
- queued text messages survive reload;
- queued text messages send after online restore;
- stale `sending` records recover after their local send lease expires;
- canonical backend response replaces local queued message;
- multi-tab foreground drain does not duplicate sends;
- incoming push marks affected cached threads stale only under user-scoped
  markers and refreshes them before treating cached messages as current;
- expired or rejected backend session stops sync and requires login;
- logout clears current user offline data;
- `/api/*` is still not generically cached by service worker;
- app shell/service worker/cache version changes do not lose queued text or
  leave old tabs on an indefinite splash;
- real-device closure includes Android installed PWA and iOS/iPadOS Home Screen
  smoke coverage or a documented device blocker;
- tenant and user cache keys prevent cross-tenant/cross-user leakage;
- retention pruning keeps storage bounded without deleting unsent user text
  unexpectedly;
- IndexedDB schema/versioning and composer boundaries can accept the next SMS
  fallback metadata/action slice without introducing a second offline storage
  layer;
- tests cover local store, sync controller, auth/session fallback and one
  Playwright offline reload/send flow or a documented runner blocker.

## Immediate Post-MVP Follow-up

- SMS fallback gateway, metadata cache and native `sms:` emergency action.

## Deferred Follow-ups

- Offline attachment and voice outbox.
- Cached media and files page.
- Cached search over local latest messages.
- Authoritative backend unread counters.
- Cross-device unread sync.
- Durable PWA app badge count backed by server state.
- Notification center.
- Background Sync as non-critical delivery enhancement.

## User Review Questions

Please review these decisions before implementation planning:

1. Startup should leave generic splash after 1.2 seconds, try saved data after
   2.5 seconds, and show an actionable online-required state after 8 seconds
   when no valid cache exists.
2. MVP accepts text-only offline sends; files and voice remain online-only.
3. Cached protected shell is allowed only after prior online session and only
   until `offlineAccessUntil`, calculated from session expiry and a 24-hour
   offline grace.
4. The 24-hour offline grace is the MVP default unless product wants a shorter
   security window.
5. Latest chat cache is bounded to recent messages, not full history.
6. Service worker does not cache authenticated `/api/*` responses; app code
   stores selected scoped data in IndexedDB.
7. Push notifications may mark cached threads stale, but message text from push
   is not stored locally by the service worker in MVP, and persisted stale
   markers require user binding.
8. SMS fallback is the immediate follow-up after this MVP, but this MVP only
   prepares storage/boot/composer boundaries and does not render SMS UI.
9. Offline local data removal discards cached chats and unsent local outbox for
   the current user on this device, then performs backend logout best-effort
   when online.
10. Real-device installed PWA smoke checks are part of closure for Android and
    iOS unless the user explicitly defers a platform.
