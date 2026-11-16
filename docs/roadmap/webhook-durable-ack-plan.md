# Durable Chatwoot webhook acknowledgement

User approved implementation and local validation only (2026-11-16). No message
resend, Chatwoot mutation, commit, push or deployment belongs to this task.

## Contract

After signature, account/inbox and local mapping validation, accepted delivery
and processing obligation commit together. HTTP acceptance performs no external
calls, unread resolution, snapshot or push work. Duplicate deliveries do no work.
A database failure returns an error, never a false successful acknowledgement.

Postgres owns recoverable work. Created messages have distinct semantic keys;
updates coalesce by conversation with generation fencing so a concurrent event
cannot be lost when a worker completes. One worker per backend, bounded claims,
leases, bounded retries and retained exhausted jobs. Re-resolve current tenant
and mapping before execution; SSE retains its existing session/access checks.
No Redis, Chatwoot core changes or message-send endpoints.

Unread insertion and its job checkpoint are atomic. Source-scoped per-user/thread displayed-message-id watermarks serialize clears
with delayed insertion; replay must not resurrect a
message already read. Push keeps its existing unique attempt claim (best effort,
not exactly-once external delivery). Completed work retention: 30 days, bounded
cleanup. No deletion of pending or exhausted work.

## Load model

One short local transaction per new delivery; tenant admission capped at 1,000
outstanding work keys. Updates collapse to one key per conversation. Idle worker
poll: 10 seconds, one active job; retry backoff capped at five minutes, ten
attempts. Lease: five minutes, renewed every 30 seconds; job external-call budget 120 seconds, abortable on shutdown/lease loss. Recipient resolution is capped at 1,000 candidate links, realtime fanout at 500 connections per tenant/thread; overflow retains failed work for
operator inspection rather than silently discarding unread obligations.
Existing multi-process SSE limitation (F-LOAD-003) is not a new cross-node bus.

## Verification and closure

- Receiver: signatures/tenant/private/unmapped invariants; immediate durable ACK
  despite blocked external work; rollback and duplicate behavior.
- Queue: migration, created-event dedupe, coalesced concurrent generations,
  lease recovery/fencing, atomic unread checkpoint, read-before-worker race,
  failure retry/exhaustion, tenant isolation and admission bounds.
- Runtime: startup recovery, wakeup, shutdown before database close; current
  tenant configuration and mapping checks; no message resend.
- Targeted tests during implementation; backend suite, lint/build/diff check
  at closure, relevant real Postgres concurrency tests, independent full diff
  review. Do not rerun unrelated production-release scenarios.

## Progress

- Diagnosis complete; local implementation in `fix/webhook-durable-ack`.
- Implementation is present; receiver/queue/worker/app targeted checks and real
  Postgres concurrency scenarios passed. Independent final-diff review found no
  remaining Critical/Important issue. Final backend regression passed.
- Design review Important findings (source-configuration race and clock-domain
  race) accepted and fixed, with concurrent configuration and clock-skew tests.
- Operations contract: [webhook-processing.md](../operations/webhook-processing.md).

## Review corrections

All seven Important findings are accepted, fixed and independently re-reviewed:
validated source and mapping locks; database receipt/lease clock; final unread
checkpoint ownership assertion; crash-only attempt exhaustion; source-scoped
message-ID read watermarks and unread rows/indexes. Migration 0026 preserves
existing unread rows via deterministic source-key backfill. The worker aborts
sibling lookups after failure and handles shutdown racing a pending claim.

| Finding                                       | Disposition and evidence                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Validated source changes before acceptance    | accepted; locked source validation and real PostgreSQL concurrent reconfiguration test                             |
| Application/database clock mismatch           | accepted; DB receipt and lease clocks, clock-skew regression                                                       |
| Lease expires during unread checkpoint        | accepted; final ownership assertion rolls back the transaction, real PostgreSQL fault test                         |
| Repeated crashes bypass retry limit           | accepted; claim exhausts the tenth expired attempt, regression test                                                |
| Conversation moves to another inbox           | accepted; locked mapping validation and real PostgreSQL race test                                                  |
| Delayed event resurrects already-read message | accepted; canonical message-ID watermark, delayed-event/newer-message tests                                        |
| Source change reuses old message IDs          | accepted; source-scoped unread rows, count/clear/unique indexes and preserving migration, collision/backfill tests |

The review's additional claim that PostgreSQL 16 lacks `sha256(bytea)` was
rejected_with_evidence and withdrawn by the reviewer: PostgreSQL 16.13 exposes
`pg_catalog.sha256(bytea)` with only `plpgsql` installed, and the SHA-256 test
digest matches. Migration 0026 applied successfully on that local server. No
extension or algorithm change is required. Review was voluntarily read-only;
the reviewer's effective environment permissions were unrestricted.

Transient unavailable Chatwoot snapshots now retain the durable obligation for
retry rather than silently completing it. Worker/processor tests and backend
lint/build passed after this final code correction, which was also re-reviewed.

The initial broad backend run passed 953 tests; 12 failures came from affected
files while the reviewed schema/fixtures were changing. These are not accepted
as final evidence. The final affected selection includes all six failed files,
app wiring, message/unread/thread integration and real PostgreSQL fault tests.
Frontend lint/build passed; frontend code and release tooling are unchanged.

## Local closure — 2026-11-16

- Final runtime tree: Node 24.22.1, backend suite **963 passed**, 140 files passed.
  Nine environment-gated cases are skipped in that command: the six new webhook
  PostgreSQL cases passed separately against PostgreSQL 16.13; three unchanged
  push-subscription registration concurrency cases were not selected for this
  bounded webhook fix. There are no failing tests.
- Final affected selection: 86 passed, followed by 21 worker/processor tests
  after the final unavailable-snapshot correction. The subsequent full backend
  run includes that correction. Six real PostgreSQL tests cover duplicate
  ownership, admission timeout, read/insert race, source reconfiguration, lease
  expiry rollback and mapping inbox mutation.
- Root lint/code-health and frontend/backend builds passed. Backend lint/build
  were repeated after the final runtime change. Drizzle generation reports no
  schema changes. Migration 0026 preserves pre-existing unread data.
- Documentation contract checks and both working-tree/staged whitespace checks
  passed after preserving the incident record and closing the findings.
- HTTP/listener lifecycle integration tests cover ACK with blocked external work,
  restart recovery and shutdown ordering. There is no frontend/UI change; no
  browser acceptance step or production smoke was run for this local-only task.
- Final independent review has no remaining Critical/Important finding. Closed
  F-SEC-012/F-SEC-013 and seven temporary review records were removed from the
  active registry after history/reference audit; dispositions are retained above.
  Historical audit references remain; live links now point to the operational
  contract. Incident evidence is preserved at
  [2026-11-16-chatwoot-false-failure.md](../operations/incidents/2026-11-16-chatwoot-false-failure.md).
- Task-owned disposable PostgreSQL container stopped. Existing project worktrees
  and prior deployment-document changes were preserved. No production writes,
  message resends, status corrections, commit, merge or push.

Stop here as requested. The local diff is ready for a separately authorized
git/release step; production approval and migration preflight remain future work.

## Production release authorization — 2026-11-16

The user subsequently requested production deployment with only necessary checks.
This supersedes the local-only stop for release work; message resend and Chatwoot
status correction remain outside scope. The previously tested runtime tree is
unchanged. Publication to main and standard preparation are necessary steps of
this authorized release. No release-tooling change is planned.

Read-only Timeweb preflight confirms current `ddbe936`, PostgreSQL 16.13, one
active tenant (`provgroup`), 707 unread rows / 385024 bytes, 25 applied migrations
and no transactions older than 30 seconds. Migration 0025 is additive; 0026 adds
a required source key and changes unread uniqueness. The previous runtime cannot
write that schema, so activation must use the reviewed `forward-only` policy,
never `backward-compatible`. Before activation, preserve a protected fresh portal
DB backup and the matching env/source evidence; do not restore or discard new
production data automatically. Prepare builds images without cutover, and the
normal activation runs startup migrations before accepting requests.

Reuse the completed 963-test backend run, six PostgreSQL checks, lint/build and
independent implementation review. Required release checks are exact source/main
provenance, protected backup validity, migration policy review, standard prepared
manifest/image/tenant validation, bounded Compose/all-active-tenant smoke and
post-release schema/queue/log readback. No unrelated application, ops-suite or
production send tests will be repeated.
