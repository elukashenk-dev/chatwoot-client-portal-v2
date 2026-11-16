# Portal webhook processing

The portal acknowledges a mapped, signed Chatwoot message event only after one
Postgres transaction commits the delivery dedupe record and durable work. It
performs no Chatwoot API request, unread fanout, push or history refresh in that
HTTP request. A database/admission failure returns an error; this is not an
availability guarantee during a real portal or network outage.

The worker starts with the backend listener, drains persisted work on startup,
and receives coalesced local wakeups after acceptance. Idle recovery polling runs
every 10 seconds. Shutdown aborts worker Chatwoot requests and waits for retry
persistence before closing the database. No message-send API is used.

| Budget                     | Limit                                            |
| -------------------------- | ------------------------------------------------ |
| Active jobs                | 1 per backend process                            |
| Outstanding work           | 1,000 keys per tenant, including exhausted jobs  |
| Concurrent contact lookups | 5                                                |
| Recipient candidate links  | 1,000 per job; overflow is retained as a failure |
| SSE connections            | 5 per user/thread; 500 per tenant/thread         |
| Job external-work budget   | 120 seconds; aborts Chatwoot fetches             |
| Lease / renewal            | 5 minutes / 30 seconds                           |
| Attempts / retry delay     | 10 / exponential, at most 5 minutes              |
| Completed-job retention    | 30 days; cleanup at most 100 rows per minute     |

Created messages retain separate semantic obligations. Updates coalesce by
source configuration and conversation, with generation fencing. An update
arriving during processing remains pending after that worker finishes.
Receipt and lease times use the database clock. Read watermarks retain the
highest canonical message id in the latest displayed snapshot, separately per
source configuration/user/thread. Unread inserts and their checkpoint commit
together, serializing with reads. A delayed notification cannot resurrect an
already displayed message, and newer messages remain unread. Historical pages
do not advance the watermark.

Push retains the existing unique per-message/subscription attempt claim. This
prevents duplicate attempts on recovery, but a process crash after that claim and
before external delivery can miss a push; this is best-effort push, not
exactly-once delivery. No message text or access token is stored in the queue.
SSE continues checking session authority and current thread access before sending.
The existing process-local SSE limitation (F-LOAD-003) still applies; this is not
a cross-process event bus.

## Local and future operational inspection

`portal_webhook_work` exposes `pending`, `done` and `exhausted` states, attempt
count, eligibility/lease timestamps, tenant and source identifiers. Worker logs
use fixed event codes (`webhook_work_retry`, `webhook_work_exhausted`,
`webhook_lease_lost`, `webhook_worker_unavailable`) and job id, without payloads or
credentials. Exhausted work is retained, consumes admission capacity, and is not
silently re-enabled by new updates. Investigate the upstream failure or budget
before approving a targeted requeue; no automatic resend or Chatwoot status
correction is part of this mechanism.

Migration 0025 creates the queue and read-watermark tables. Migration 0026 adds
a source key to unread rows and backfills existing rows from each tenant's current
Chatwoot configuration, preserving rows and isolating count/clear/deduplication
across source changes. Existing Chatwoot data and historical portal deliveries
are not rewritten or backfilled into the queue. Before production migration,
check unread-table size and allow for its transactional backfill/index rebuild.
The 0024 Drizzle snapshot id chain was repaired to permit generation; its SQL is
unchanged. Before a future deployment, review the local diff and migration and
obtain production authorization. The current task ends after local validation.
