# Stage 06: Load, Scalability And Reliability

Status: complete

Verdict effect: no new Critical or High hypothesis was established. Five new
Medium candidates require canonical validation: process-local realtime loses
events across backend replicas, the visible thread-list refresh rebuilds
Chatwoot state and rewrites DB rows every 30 seconds, support availability is
polled by hidden tabs with two upstream calls per poll, presence throttles are
unbounded and process-local, and maintenance performs whole-retention-set
count/delete work without a batch or execution budget. The existing High
`ARCH-008` webhook fanout remains the first likely shared-runtime saturation
path. This stage does not remove the final `GO` blocker recorded as
`SEC-DEEP-001`.

## Frozen Target And Review Boundary

- Repository revision: `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`
- Frozen source:
  `/home/evluk/projects/chatwoot-client-portal-v2-audit-source-2026-07-13`
- Scope: request/tab/event/job frequency, DB queries and indexes, transaction
  and lock duration, Chatwoot/Telegram/push calls, fanout, polling, retry,
  process-local state, browser storage, maintenance and single- versus
  multi-instance behavior
- Product source mutation: none
- Production DB, production services and external providers: not touched
- Measurements: bounded PGlite fixtures and existing targeted unit/integration
  tests only; no production throughput or latency is inferred

## Outcome Summary

| ID         | Status    | Severity | Load/reliability failure hypothesis                                                                                |
| ---------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `LOAD-001` | candidate | Medium   | Process-local SSE hubs lose webhook events when the client and webhook land on different replicas                  |
| `LOAD-002` | candidate | Medium   | The 30-second thread refresh repeats upstream reads and DB writes for every visible tab and group                  |
| `LOAD-003` | candidate | Medium   | Hidden online tabs poll tenant-wide support state and create two Chatwoot calls every 30 seconds                   |
| `LOAD-004` | candidate | Medium   | Read/typing throttle maps grow for the process lifetime and cease to throttle across multiple replicas             |
| `LOAD-005` | candidate | Medium   | Maintenance counts and deletes complete retention sets without matching access-path, row-batch or run-time budgets |

Existing candidates remain canonical rather than being duplicated here:

- `ARCH-008` and `SEC-STD-A13-003/004` own group webhook/push fanout,
  sequential delivery and missing aggregate queue/backpressure;
- `BACK-005` owns DB pool occupancy while a thread-bootstrap transaction and
  advisory lock remain open across Chatwoot I/O;
- `SEC-STD-A03-001` owns the `lower(email)` query/index mismatch;
- `FRONT-002` owns uninvoked offline retention and unbounded active history;
- `FRONT-004`, `SEC-STD-A11-001`, `SEC-STD-A14-001/002` and `INT-005` own
  browser conversion, upload admission, document expansion and upstream
  response-byte budgets respectively.

## Hot-Path Frequency And Work Model

Counts below describe the frozen code path, not measured production demand.
Tenant resolution and authenticated session lookup are additive to most API
rows.

| Path                             | Frequency unit                                                                    | DB, external, lock and stored work per execution                                                                                                                                     | Bound and first 10x/100x pressure                                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant resolution                | every `/api/*` request except health                                              | one unique-domain tenant SELECT plus two secret decryptions; no write or external call                                                                                               | indexed and fail-closed; DB request rate and decrypt CPU scale linearly. Measure before introducing a short, revocation-aware cache                              |
| Auth request/verify              | per login/reset/setup attempt                                                     | process-local auth bucket; verification/challenge/user/session reads and writes; password hashing or SMTP on applicable paths                                                        | input/cooldown/expiry are bounded, but local rate limiting is bypassable across replicas (`F-AUTH-001`) and email rollback/lease candidates remain               |
| Customer/admin `me`              | per startup/refresh/protected request                                             | indexed token/session/user read; customer session renewal writes near its window, while admin auth touches the session on every protected request                                    | token indexes hold; admin write amplification is `ARCH-005`, and expired admin retention is `ARCH-006`                                                           |
| Thread list                      | startup, focus/online/visibility and each 30-second visible-tab refresh           | linked-person DB read plus Chatwoot person read; private thread upsert; for each of at most 20 groups, one sequential Chatwoot contact read and one upsert; one grouped unread query | bounded to 20 groups but steady state can issue 21 upstream calls, 21 conflicting INSERT attempts and 21 UPDATEs per refresh (`LOAD-002`)                        |
| Message snapshot/history/context | startup, selected-thread refresh and cursor navigation                            | thread/context DB reads; one Chatwoot page per snapshot/history side; one batched ledger-author query; bounded reply-target calls                                                    | Chatwoot page size bounds memory; context loads at most two pages concurrently. Upstream latency and cold bootstrap pool occupancy dominate                      |
| Message search/media             | explicit user action/cursor page                                                  | up to eight sequential Chatwoot history pages, at most 20 search results, bounded page mapping and ledger queries                                                                    | expensive but explicitly bounded; upstream request latency is the first pressure, not an unbounded repository scan                                               |
| Text send                        | per user send/retry                                                               | one shared DB rate-bucket mutation; context/bootstrap; durable send-ledger claim/finalization; normally one Chatwoot create or recovery lookup                                       | 20/minute per user/thread and idempotency bound ordinary retries; `BACK-005/006/007` and `ARCH-002` own cold/ambiguous overlaps                                  |
| Attachment send                  | per user upload/retry                                                             | request body up to 40 MiB, DB rate-bucket and send ledger, validation then Chatwoot upload                                                                                           | five/minute per user/thread, but body admission precedes the limiter (`SEC-STD-A11-001`) and browser voice preparation is `FRONT-004`                            |
| Message webhook                  | per Chatwoot delivery                                                             | DB delivery claim/dedupe/mapping, snapshot/recovery calls, bulk unread insert, local SSE publish and detached push work                                                              | private path is bounded; group recipient discovery and overlapping detached delivery are the High `ARCH-008`/A13 paths                                           |
| SSE connect/reconnect            | per selected chat/tab/reconnect                                                   | tenant/session/thread admission reads, one in-memory subscription, one 25-second timer; messages rebuild a snapshot per local subscription                                           | five streams per tenant/user/thread key but no global admission; file descriptors/timers grow with legitimate tabs and cross-replica locality fails (`LOAD-001`) |
| Unread/read/typing               | unread per refresh/event; read per selected-thread activity; typing per UI signal | indexed grouped unread query or delete/count transaction; read/typing resolve context and normally call Chatwoot once; process-local 5s/3s throttles                                 | unread queries are tenant/user indexed; throttle memory and multi-replica effectiveness fail (`LOAD-004`)                                                        |
| Support availability             | startup plus each 30-second online-tab interval                                   | no portal DB query after request admission; two parallel Chatwoot calls for inbox details and members                                                                                | fixed two-call fanout, but hidden tabs continue and no tenant cache/singleflight exists (`LOAD-003`)                                                             |
| Push delivery                    | per accepted message and recipient subscription                                   | recipient resolution; two settings reads and a full visible-thread rebuild per recipient; subscription query; insert, provider call and status update per subscription               | subscription cardinality is unbounded (`SEC-STD-A10-004`); group delivery is sequential and lacks aggregate queue admission (`ARCH-008`, A13)                    |
| Service-worker recovery          | per foreground drain/background-sync opportunity                                  | reads the complete outbox store, serially processes every due row under an identity lease and backs retry off to at most 60 seconds                                                  | leases/idempotency hold, but terminal/history/marker cardinality and full-store reads remain `FRONT-002`; installed Android recovery remains `FRONT-006`         |
| Telegram update                  | per Telegram webhook attempt                                                      | one config lookup, atomic dedupe claim/update and a sequential branch of Chatwoot/Telegram calls with request deadlines                                                              | shared DB dedupe bounds normal duplicates; accepted-but-ambiguous effects and cutover loss remain `INT-002/003`                                                  |
| Maintenance cleanup              | operator/scheduler run, global or per tenant                                      | sequential COUNT then whole-set DELETE for eight table families; no cross-family transaction, row batch, run lease or time budget                                                    | oldest/high-cardinality tables drive DB scan, WAL, locks and replica lag; measured push path and unbounded deletion are `LOAD-005`                               |

## Query, Index And Transaction Review

### Controls that held

- Tenant domain, session token, verification expiry, webhook delivery time,
  send status/time, rate-limit reset, Telegram delivery time and primary
  thread/mapping lookups have matching unique or ordered indexes.
- Unread count/clear operations include tenant and user in their predicates and
  use matching tenant/user/thread indexes. The thread-list count is one grouped
  query rather than one query per thread.
- Message pages are upstream-paginated. Ledger authors for a page are loaded in
  one `IN` query. Search and media scans stop after eight upstream pages.
- Chat send rate limiting is DB-backed and race-safe across backend instances.
  Webhook and Telegram dedupe identities are also durable/shared.
- Maintenance does not hold one transaction across all table families. This
  limits the blast radius of a failure between families, although each
  individual unbounded DELETE can still be expensive.

### Material query and lock paths

- `SEC-STD-A03-001`: auth repositories compare `lower(email)`, while the live
  unique index is `(tenant_id, email)`. The bounded measurement below confirms
  the planner mismatch; it is not a new Task 8 finding.
- `BACK-005`: `transactionWithThreadBootstrapLock()` acquires a transaction
  advisory lock and invokes a handler that performs Chatwoot recovery/create
  work. With the default node-postgres pool, waiters can occupy the same small
  pool while one external request controls transaction duration.
- `LOAD-002`: `upsertPrivateThread()` and `upsertGroupThread()` first execute
  `INSERT ... ON CONFLICT DO NOTHING`; on the normal existing-row path they
  then execute an unconditional UPDATE of `updated_at`. Therefore a read-like
  thread-list refresh writes every known thread even when its mapping did not
  change.
- `ARCH-008`: group recipient discovery loads every active tenant contact link
  and performs Chatwoot contact lookup in batches of five. Push delivery then
  calls `listCurrentUserThreads()` and performs per-subscription work for each
  resolved recipient. The concurrency-five helper reduces instantaneous
  pressure but does not bound total work.
- `LOAD-005`: `portal_push_deliveries` has indexes beginning with
  `(tenant_id, thread_id, ...)` and `(tenant_id, portal_user_id, created_at)`.
  Global retention filters only `created_at`; the inactive-subscription
  anti-join filters `subscription_id` and recent `created_at`. Neither access
  pattern has a direct leading index, and neither delete path is batched.

No additional hot request-path missing foreign-key index or hidden repository
N+1 was proved beyond the explicit thread-list, group-recipient and push loops
above. Branding-setting asset references are extremely low-cardinality
tenant-singleton rows and were not promoted solely for lacking standalone FK
indexes.

## Process-Local, Durable And Potentially Unbounded State

| State                            | Classification                                                                    | Single-instance behavior                                                                                           | Multi-instance behavior                                                    |
| -------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Auth rate-limit map              | memory-bounded to 10,000 entries                                                  | expired/old entries are pruned                                                                                     | each replica owns a separate allowance; existing `F-AUTH-001`              |
| Realtime subscription maps       | lifecycle-cleaned, per-key bounded to five, globally proportional to open streams | close removes both map entries; each stream owns a timer                                                           | publish reaches only streams on the webhook-receiving process (`LOAD-001`) |
| Read throttle map                | process-lifetime unbounded                                                        | every successfully read user/thread key remains until restart                                                      | duplicate calls pass through different replicas (`LOAD-004`)               |
| Typing throttle map              | conditionally cleaned                                                             | successful `off` deletes; missing/failed `off` leaves a key until restart                                          | duplicate `on` calls pass through different replicas (`LOAD-004`)          |
| DB rate limits/dedupe/leases     | durable and indexed                                                               | survives restart and coordinates callers                                                                           | shared authority works across replicas, subject to DB/pool capacity        |
| Service-worker ready-client maps | transient worker memory                                                           | explicit not-ready removes entries; dead IDs are filtered by the live-client list and worker restarts clear memory | device-local only; not backend coordination                                |
| IndexedDB pages/outbox/markers   | durable device state, insufficiently retained                                     | tenant/user scope holds but active history and terminal rows can grow                                              | per-device duplication; browser quota is the first failure (`FRONT-002`)   |

## New Candidates

### LOAD-001: realtime event delivery is process-local

- `createChatRealtimeHub()` creates two in-memory subscription maps
  (`backend/src/modules/chat-realtime/hub.ts:64-188`), and `buildApp()` creates
  one hub per Node process (`backend/src/app.ts:137`).
- Webhook handling publishes a message/typing event only through the hub owned
  by the process handling that HTTP request. There is no shared broker,
  Postgres notification channel or cross-process event log.
- Failure path: with two backend replicas, an SSE stream is admitted on replica
  A and the corresponding signed webhook reaches replica B. B has no matching
  local subscription, so A's client receives no event. Message snapshots can
  repair after the visible-tab health fallback observes 30 seconds without
  activity; transient typing has no equivalent repair.
- Counterevidence: the reference production compose currently runs one backend
  service, the frontend has a bounded snapshot fallback, and DB unread/push
  state is shared. This is a horizontal-scaling reliability failure, not a
  single-instance data-isolation failure.
- Validation contract: run two backend processes against one isolated DB,
  deliberately cross-route SSE and webhook requests, and require event delivery
  through a bounded shared broker/log with tenant/thread keys, backpressure,
  reconnect semantics and no high-cardinality metric labels.

### LOAD-002: thread-list refresh rebuilds and rewrites state

- A visible online tab refreshes `/api/chat/threads` every 30 seconds and on
  focus/online/visibility, with an in-flight guard
  (`useChatForegroundUnreadRefresh.ts:35-113`).
- `listCurrentUserThreads()` always reads the linked person from Chatwoot,
  upserts the private thread, then sequentially reads and upserts every group
  contact (`chat-threads/service.ts:310-357`). Group membership is capped at 20,
  which makes the exact worst case bounded but still costly.
- On an established 20-group account, one refresh can execute 21 Chatwoot
  contact calls, 21 conflicting INSERT attempts and 21 UPDATEs before the
  unread query. Multiple visible tabs repeat the same tenant/user work.
- Failure path: growth in concurrent users/tabs multiplies external latency,
  Chatwoot request rate, DB index contention and write/WAL volume even when no
  membership or thread mapping changed. Chatwoot becomes the first bottleneck;
  the unconditional `updated_at` writes then add avoidable DB pressure.
- Counterevidence: the interval pauses while hidden, duplicate refreshes inside
  one tab are suppressed, group count is capped and upstream requests have
  deadlines.
- Validation contract: replace periodic reconstruction with a bounded
  tenant/user projection or short-TTL singleflight cache whose invalidation
  preserves disabled/membership changes; update thread rows only on material
  changes. At 1/10/100 concurrent refreshes, assert explicit upstream-call and
  write budgets rather than only response correctness.

### LOAD-003: support availability polling multiplies by hidden tabs

- Every online chat tab starts a 30-second interval
  (`useChatSupportAvailability.ts:7,109-126`). Unlike unread refresh, it does
  not check `document.visibilityState` and has no in-flight singleflight guard.
- Every request invokes `getPortalInboxDetails()` and
  `listPortalInboxMembers()` in parallel
  (`backend/src/modules/chat-support/service.ts:63-79`). The result is
  tenant/inbox-wide rather than user-specific, but it is not cached server-side.
- Failure path: dormant hidden tabs and multiple devices generate two upstream
  calls per tab per interval. At 10x/100x tabs, Chatwoot request capacity and
  failure logging/retry churn scale with tabs rather than tenants.
- Counterevidence: each poll has a recovery deadline, fanout is fixed at two,
  and stale request results are fenced before updating React state.
- Validation contract: pause intervals while hidden, refresh once on visible,
  and add a short tenant-scoped TTL/singleflight projection or event-updated
  cache with bounded stale-on-error behavior. Tests must prove the number of
  Chatwoot calls under many tabs, slow responses and provider failure.

### LOAD-004: presence throttles are unbounded and replica-local

- `buildApp()` owns process-global read and typing maps
  (`backend/src/app.ts:138-139`) and passes them into per-request presence
  services.
- Successful read sync stores `tenant:user:thread` forever
  (`chat-presence/service.ts:118-206`). Typing stores the same shape and removes
  it only after a successful `off` (`service.ts:208-310`). There is no TTL
  eviction, size cap or periodic pruning.
- Failure path: distinct legitimate user/thread activity grows read entries for
  the process lifetime; lost tab-close/typing-off schedules also retain typing
  entries. Horizontal replicas each enforce only their own 5s/3s window, so a
  load balancer can multiply context resolution and Chatwoot presence calls.
- Counterevidence: keys are set only after authorized, successful Chatwoot
  operations; repeat use overwrites one entry; process restart clears memory;
  frontend debouncing removes much ordinary duplication.
- Validation contract: use a size- and TTL-bounded cache with expiry based on
  the throttle window, and decide whether cross-replica throttling is required
  through a shared atomic store or routing strategy. Test high-cardinality
  churn and alternating-replica schedules without per-request cleanup scans.

### LOAD-005: maintenance cleanup has no work budget

- `cleanupPortalMaintenanceData()` builds retention predicates for eight table
  families. Non-dry runs perform a full COUNT and then one DELETE for each
  family (`backend/src/modules/maintenance/cleanup.ts:84-228,363-390`).
- There is no row limit, keyset cursor, `SKIP LOCKED` batch, maximum run time,
  shared run lease/advisory try-lock or pause based on DB pressure. COUNT also
  repeats the candidate access before deletion.
- In a synthetic migrated PGlite fixture with 100,000 push-delivery rows spread
  across 2,000 user prefixes and 1,000 expired rows, the global retention COUNT
  selected a sequential scan and removed 99,000 rows by filter; the generated
  DELETE plan also selected a sequential scan. This validates planner shape for
  the fixture, not production milliseconds.
- A second bounded fixture showed that a direct `created_at` index can change
  the selective global count to an index-only scan. The final index must match
  the chosen global versus tenant-scoped job; an index alone does not bound the
  DELETE or WAL/lock burst.
- Failure path: accumulated push deliveries or another overdue family produces
  a long scan and a large single statement. At 10x/100x retained rows, DB I/O,
  WAL, vacuum debt, replica lag and row/index locks grow with the entire overdue
  set; concurrent operators can duplicate the pressure.
- Counterevidence: retention defaults exist, time indexes support several other
  families, the script supports dry-run/tenant scope, and no single transaction
  encloses all deletes. No production stall was induced.
- Validation contract: choose indexes from real `EXPLAIN` plans; delete by
  primary-key/keyset batches with maximum rows and wall time per run; avoid the
  separate full COUNT; add a nonblocking single-run lease and progress metrics;
  test cancellation/restart, concurrent invocation and bounded transaction/WAL
  behavior on a representative isolated PostgreSQL dataset.

## Bounded Measurements And Test Evidence

### Synthetic query plans

Two disposable PGlite databases were migrated from the frozen repository; no
repository or persistent database was modified.

1. `portal_users`: 50,000 same-tenant rows. The current
   `tenant_id + lower(email)` lookup used a sequential scan and removed 49,998
   rows before the match. A temporary `(tenant_id, lower(email))` expression
   index changed the node to an index scan. Fixture execution changed from
   54.356 ms to 0.090 ms, but only the plan shape is portable. This reconfirms
   `SEC-STD-A03-001`.
2. `portal_push_deliveries`: 100,000 rows, 2,000 active user prefixes and 1,000
   expired rows. Current global `created_at` retention used a sequential scan,
   removing 99,000 rows by filter; its DELETE plan did the same. A separate
   selective fixture with a temporary direct time index used an index-only scan
   for the 1,000 candidates. This supports `LOAD-005` without claiming a
   production latency threshold.

### Targeted regression checks

- Backend realtime, presence, support, thread list, maintenance,
  notification/push, message search/media and Telegram: 11 files, 101 tests
  passed.
- Frontend unread refresh, support polling, realtime connection/health and
  offline outbox: 6 files, 48 tests passed.
- Combined: 17 files, 149 tests passed.

The suites validate current limits, leases and functional behavior. They do not
close multi-process routing, high-cardinality memory, provider-call budgets,
large PostgreSQL deletion or real production response-size candidates because
those failure schedules are absent.

## 10x/100x Priorities

| Priority | First likely bottleneck                                               | Existing/new owner               | Required bounded design                                                                            |
| -------- | --------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1        | Group webhook recipient lookup plus detached sequential push work     | `ARCH-008`, A13                  | dedupe first, durable tenant queue, bounded batches/concurrency, backpressure and idempotent retry |
| 2        | Repeated group thread-list Chatwoot reads and unchanged-row DB writes | `LOAD-002`                       | projection/cache with singleflight and explicit call/write budgets                                 |
| 3        | Cold thread bootstrap holding the DB pool across Chatwoot I/O         | `BACK-005`                       | short durable claim transaction, external work outside the transaction and pool-contention test    |
| 4        | Hidden-tab support polling and multi-instance realtime locality       | `LOAD-003`, `LOAD-001`           | visibility-aware polling, tenant cache and shared bounded realtime transport                       |
| 5        | Unbounded retention deletion and browser/device retained state        | `LOAD-005`, `FRONT-002`          | keyset batches/run budgets plus active-user byte/page/terminal-row limits                          |
| 6        | Upload/parser/voice and upstream-response memory                      | A11, A14, `FRONT-004`, `INT-005` | admission before materialization, expanded-size/time budgets and per-call response-byte limits     |

No numeric requests-per-second capacity is claimed. Production pool size,
Chatwoot provider limits, response distributions, table cardinalities and
database/WAL latency were unavailable and belong to deployment-aware dynamic
validation.

## Non-Defect Modernization Handoff

- Make DB pool maximum, connection acquisition timeout and application
  statement/transaction budgets explicit per process, then size the total
  connection budget across replicas. The current node-postgres default bounds
  one process but provides no deployment-level capacity contract.
- Add bounded, low-cardinality metrics for pool wait/active connections, API
  latency by route family, Chatwoot calls by operation, SSE streams, webhook
  queue/fanout, support cache hits, maintenance batch progress and offline quota
  failures.
- Capture representative PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` baselines and
  table/cardinality distributions in an isolated production-like environment;
  PGlite is useful for planner hypotheses, not production capacity.
- Measure tenant-resolution query/decryption cost before caching it. Any cache
  must retain a short bound or explicit invalidation for suspension and secret
  rotation rather than trading correctness for request reduction.

These opportunities are recorded in `modernization-opportunities.md`; they are
not substitutes for the five candidate fixes.

## Handoff To Later Stages

- Task 9 must determine actual production replica topology, proxy/SSE routing,
  maintenance scheduling/overlap protection, DB pool/env propagation,
  observability and recovery runbooks.
- Task 9 must also collect dependency/advisory evidence before judging whether
  current driver/framework behavior changes any load conclusion.
- Task 11 dynamic validation should prioritize the two-process SSE schedule,
  thread/support call-count harnesses, presence-cardinality churn and batched
  PostgreSQL cleanup design. It must not load-test production.
- Canonical validation must merge `LOAD-002` with any later group-projection
  proposal and keep `LOAD-005` distinct from the already-missing admin retention
  policy (`ARCH-006`).
