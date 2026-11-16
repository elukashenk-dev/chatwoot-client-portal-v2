# Investigation: delivered/read messages become failed

- Status: diagnosis and local fix complete; production migration/release not performed.
- Date: 2026-11-16. Source baseline: `ddbe936`.
- Canonical findings: `F-SEC-013`, related `F-SEC-012`, `F-INT-001`, `F-LOAD-004`.
- Scope: read-only production evidence and local isolated reproduction. No messages
  resent, no status corrections, no production code/configuration/data writes.
- Previous incident: infrastructure repository,
  `docs/incidents/2026-11-13-chatwoot-172-false-delivery-failure.md`.

## Confirmed production sequence

Account 1, inbox 5, conversation display ID 174 (database ID 175). The two
outgoing messages on the screenshot are 7632 and 7636. Times below are UTC;
Samara is UTC+4.

| Message | Created      | Portal message_created accepted timestamp | Current status/error      |
| ------- | ------------ | ----------------------------------------- | ------------------------- |
| 7632    | 11:13:51.068 | 11:13:51.441                              | failed / Net::ReadTimeout |
| 7636    | 12:03:43.447 | 12:03:43.808                              | failed / Net::ReadTimeout |

At 13:01:17.889 and 13:01:17.933, Chatwoot started `message_updated`
webhooks whose message status was `read`. Portal delivery rows for these
events are `accepted`, with received_at 13:01:17.964 and 13:01:18.008.
This field is handler entry time, not an independent commit-time measurement.
At 13:01:22.977 and 13:01:22.995 Chatwoot changed the message rows to
`failed`. Worker warnings at 13:01:23.045 and 13:01:23.056 report
`Net::ReadTimeout`. The jobs took 5165ms and 5137ms. Nginx recorded two
webhook HTTP 499 responses at 13:01:22 (caller closed before a response).
The resulting failed-status events triggered another pair of accepted webhook
rows and another pair of timeouts around 13:01:28.

The installed Chatwoot `lib/webhooks/trigger.rb` applies API-inbox webhook
errors to both message_created and message_updated, via
`Messages::StatusUpdateService`. That service allows read -> failed. Therefore
this warning does not demonstrate that the original message was undelivered.
The effective five-second timeout is corroborated by job timings and the
previous incident; the installed timeout fallback is five seconds.

After production activation at 13:56:44 UTC, a read-only worker-journal check
through 14:15:21 UTC found zero new portal webhook Net::ReadTimeout warnings.
The screenshot failures were recorded before deployment; persistent old failure
statuses are not evidence of a new post-deployment timeout. This observation
window is not proof that the unchanged architectural defect is resolved.

## Why acknowledgement is delayed

`backend/src/modules/chatwoot-webhooks/service.ts` waits for
`publishCurrentSnapshot` after recording accepted delivery. The route waits for
the whole service result. `chat-realtime/hub.ts` serially obtains snapshots for
distinct subscribed users within authority batches. Current code already
coalesces multiple tabs for the same user; the old finding's per-connection
wording must not be used as a description of current implementation.

A snapshot calls Chatwoot for access/context, history and reply targets. It also
calls `listCurrentUserThreads` for unread summary: contact/group lookups are
serial and include thread upserts. Multiple webhook events repeat this work.
There is no independent acknowledgement deadline or durable deferred-work queue.

During 13:01:16..31 the portal container IP made 60 contact requests and 45
conversation-174 history requests, plus one read update and six other requests.
Among 112 completed Chatwoot requests in that window, three took more than five
seconds; maximum was 11732ms. This is aggregate incident evidence, not a trace
assigning each read to one webhook. Exact CPU/DB/network and per-handler stage
contributions cannot be separated retrospectively: the replaced backend
container's ordinary request timings are unavailable and production logging is
warn-level. No claim is made that every request came from webhook fanout.

Local Node 24.22.1 reproduction against compiled current service: signed synthetic
message_updated, immediate mapping/acceptance stubs, and a gated realtime
snapshot. After 5100ms acceptance had completed but the handler response was
still pending. Releasing the snapshot returned accepted. No network was used.
This proves the architectural blocking dependency, not real database latency.

## Bounded correction proposed during diagnosis

1. Keep signature/account/inbox/tenant validation and reject invalid events.
   In one short portal-Postgres transaction, deduplicate and durably enqueue the
   minimal validated event/work intent before acknowledging HTTP 2xx. Do not
   call Chatwoot or compute recipient/snapshot fanout before acknowledgement.
   Do not acknowledge on queue-persistence failure.
2. Process unread/realtime/push with a bounded worker, tenant-scoped ownership,
   leases, capped concurrency, retry/backoff, retention and indexed eligible-job
   selection. Handle crashes/restarts and duplicate delivery without losing
   unread work or multiplying notifications. Coalesce snapshot refreshes per
   tenant/thread/user; preserve session checks before sending to browsers.
3. Set and test explicit queue/work/admission budgets, acknowledgement latency
   and retry limits. Avoid an unbounded in-memory fire-and-forget replacement.
   Reuse existing portal Postgres; introducing Redis is not necessary by default.
   Review migration, process lifecycle and multi-instance ownership before coding.
4. Regression scenarios: slow Chatwoot (>5s), concurrent read updates, many users
   and tabs, duplicate events, worker crash between stages, DB failure before
   enqueue, tenant separation and revoked sessions. Slow snapshot work must not
   delay successful durable acknowledgement; no messages are resent.

Primary implementation boundary: `F-SEC-013` plus the required durable acceptance
ordering from `F-SEC-012`. `F-LOAD-004` contact/history amplification should be
budgeted for this worker; unrelated frontend refresh redesign stays separate.
`F-INT-001` remains a distinct recovery gap for events that never reach durable
acceptance (portal/network outage). Fast acknowledgement cannot alone prevent
Chatwoot marking an event failed during a real outage. An upstream fix preventing
read -> failed on notification errors is a separate Chatwoot scope; core is not
modified by the proposed portal fix.

Existing false statuses can be repaired without resending only after exact
read/delivery evidence and separate authorization. This investigation does not
authorize those data corrections. Increasing WEBHOOK_TIMEOUT alone leaves the
blocking dependency and load amplification intact.

## Diagnosis review

Focused independent read-only review found no Important issue in the evidence or
proposed correction. The reviewer had unrestricted effective permissions and
performed review voluntarily read-only. Implementation must atomically commit
delivery dedupe and durable event/unread-work obligations before acknowledgement.
Only snapshot refreshes may be coalesced; distinct unread obligations must not be
dropped. Worker unread effects and their completion must be transactionally
idempotent; revalidate tenant mappings and session authority at delivery time.
External push effects require their own documented retry/idempotency semantics.
These are implementation requirements, not claims of an implemented queue.

## Local implementation closure

The user approved the fix and local tests, then explicitly requested a stop.
Branch `fix/webhook-durable-ack` implements durable acceptance before background
unread/realtime/push work, bounded recovery and source-scoped read watermarks.
Independent review has no remaining Critical/Important finding. Final backend
suite: 963 passed; six real PostgreSQL concurrency/fault tests passed separately.
Lint, builds and migration consistency checks passed. No message was resent,
no Chatwoot status was repaired, and no production change or git publication
was performed. Existing red statuses are unchanged.

The operational source of truth is
[webhook-processing.md](../webhook-processing.md); implementation, review and
verification records are in
[webhook-durable-ack-plan.md](../../roadmap/webhook-durable-ack-plan.md).
F-SEC-012 and F-SEC-013 are closed in the local implementation; F-INT-001,
F-LOAD-003 and F-LOAD-004 remain separate scopes.
