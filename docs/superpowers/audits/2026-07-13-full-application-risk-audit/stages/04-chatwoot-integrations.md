# Stage 04: Chatwoot And Integrations Review

Status: complete

Verdict effect: no new Critical or High hypothesis was established. Four new
Medium integration candidates require canonical validation. One Low response
budget question remains `needs_follow_up` for the measured load stage. The
Chatwoot contract evidence promotes `BACK-006` and `BACK-007` from contract
follow-up to candidates, and rejects `ARCH-010` as an unsupported failure path
for the production Chatwoot contract. This stage does not remove the final
`GO` blocker recorded as `SEC-DEEP-001`.

## Frozen Target And Review Boundary

- Repository revision: `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`
- Frozen source:
  `/home/evluk/projects/chatwoot-client-portal-v2-audit-source-2026-07-13`
- Scope: Chatwoot credentials and Account/Platform/Public API calls, API
  Channel webhooks, message recovery and realtime, tenant provisioning, and
  the tenant-aware Telegram bridge
- Product source mutation: none
- Production or external Chatwoot/Telegram mutation: none
- Dynamic checks: existing synthetic Vitest suites only
- External contract access date: 2026-07-14

## Outcome Summary

| ID         | Status          | Severity | Integration failure hypothesis                                                                   |
| ---------- | --------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `INT-001`  | candidate       | Medium   | Chatwoot API Channel webhook failures are terminal, but the portal has no durable reconciliation |
| `INT-002`  | candidate       | Medium   | An ambiguous Telegram side effect can be replayed after the delivery row is failed or reclaimed  |
| `INT-003`  | candidate       | Medium   | Telegram webhook cutover can precede config activation, causing `200 ignored` update loss        |
| `INT-004`  | candidate       | Medium   | Concurrent same-tenant provisioning can create orphan Chatwoot resources and clobber run status  |
| `INT-005`  | needs_follow_up | Low      | Chatwoot JSON responses are buffered without a response-byte budget                              |
| `BACK-006` | candidate       | Medium   | Source-ID recovery is limited to the latest 20 Chatwoot messages                                 |
| `BACK-007` | candidate       | Medium   | Portal lease fencing cannot make a non-unique Chatwoot message side effect exactly once          |
| `ARCH-010` | rejected        | Low      | Supported signed payloads and tenant-scoped mapping close the missing-identity-field hypothesis  |

This report does not duplicate the canonical webhook load findings
`SEC-STD-A13-001`, `SEC-STD-A13-003` and `SEC-STD-A13-004`, the redirect finding
`SEC-STD-A18-002`, or architecture candidates `ARCH-001`, `ARCH-002` and
`ARCH-008`.

## Version And External Contract Sources

The repository's stable baseline identifies production Chatwoot CE as
`v4.15.1` (`docs/roadmap/work-log.md:74-79`). That is the compatibility target
for this stage. No production request was made to rediscover the version.

Primary sources used:

- [Chatwoot v4.15.1 release](https://github.com/chatwoot/chatwoot/releases/tag/v4.15.1)
- [v4.15.1 message finder](https://raw.githubusercontent.com/chatwoot/chatwoot/v4.15.1/app/finders/message_finder.rb)
- [v4.15.1 message builder](https://raw.githubusercontent.com/chatwoot/chatwoot/v4.15.1/app/builders/messages/message_builder.rb)
- [v4.15.1 webhook listener](https://raw.githubusercontent.com/chatwoot/chatwoot/v4.15.1/app/listeners/webhook_listener.rb)
- [v4.15.1 webhook trigger](https://raw.githubusercontent.com/chatwoot/chatwoot/v4.15.1/lib/webhooks/trigger.rb)
- [v4.15.1 message schema](https://raw.githubusercontent.com/chatwoot/chatwoot/v4.15.1/db/schema.rb)
- [Chatwoot Get messages API](https://developers.chatwoot.com/api-reference/messages/get-messages)
- [Chatwoot Create message API](https://developers.chatwoot.com/api-reference/messages/create-new-message)
- [Chatwoot Create conversation API](https://developers.chatwoot.com/api-reference/conversations/create-new-conversation)
- [Telegram Bot API](https://core.telegram.org/bots/api)

The local `../chatwoot-ce-stable` checkout is `v4.13.0-1-g38c6b79b4`. It was
read only as a historical implementation aid where public API prose was
incomplete. Every contract that affects a disposition below was then checked
against the official `v4.15.1` tag. The local checkout is not treated as proof
of current production behavior.

## Chatwoot Call And Credential Inventory

| Call family          | API surface and authority                                                                                             | Config source                                                                                           | Deadline/retry/parser disposition                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Customer runtime     | Account API contacts, contact inboxes, conversations, history, send, avatar, inbox/member reads and custom attributes | Tenant `apiAccessToken`, encrypted at rest and decrypted only in backend                                | Shared abortable deadline; no automatic retry; typed parsers fail closed                                |
| Admin admission      | Account agents list                                                                                                   | Separate tenant admin-verification token, encrypted at rest                                             | Shared abortable deadline; unsafe/partial rows are dropped                                              |
| Tenant provisioning  | Platform accounts/users/tokens/membership plus Account API inbox/webhook/attribute setup                              | Platform token from operator env; generated runtime/admin tokens are encrypted before tenant activation | Shared deadline; resumable IDs, but no single-owner run lease (`INT-004`)                               |
| API Channel webhook  | Signed POST from Chatwoot to tenant host                                                                              | Dedicated `channel_api.secret`, encrypted per tenant                                                    | Raw-body HMAC, timestamp window and delivery ID dedupe; upstream does not retry failures (`INT-001`)    |
| Public presence/read | API Channel public `update_last_seen` and `toggle_typing`                                                             | Backend-resolved opaque inbox/contact identifiers; no Chatwoot token sent to browser                    | Backend admission precedes call; bounded deadline; no retry                                             |
| Telegram bridge      | Telegram Bot API and Chatwoot native Telegram webhook/account contact APIs                                            | Tenant bot token and route/header secrets encrypted in bridge config                                    | Bounded body/request limits; Postgres update dedupe; external-effect gaps remain (`INT-002`, `INT-003`) |

The browser receives no Account API, Platform API, admin-verification, API
Channel webhook or Telegram bot token. Runtime client construction is tenant
specific (`backend/src/runtimeChatwootClientFactory.ts:19-31`), and the
Platform token remains limited to operator provisioning paths.

All shared Chatwoot JSON callers keep the abort timer active through body
parsing. They do not retry automatically, which avoids implicit duplicate
mutations but makes the explicit ledgers and recovery lookups correctness
critical. The client maps expected response shapes and does not expose upstream
error bodies or credentials.

## Chatwoot Contract Calibration

### Message windows and source identifiers

The official `v4.15.1` finder returns the latest 20 messages without a cursor,
20 before a cursor, and up to 100 after a cursor. The current public Get
messages documentation describes the same before/after limits. The message
builder accepts caller-supplied `source_id`, but the `messages.source_id` index
in the official schema is non-unique.

The normal portal transcript pagination is compatible with those limits:
before pages are 20, after responses are sliced into bounded 20-message portal
pages, and the next cursor drains the remaining response. The defect is the
special source-ID recovery path, not ordinary history pagination.

### Webhook signing, payload and delivery semantics

The official `v4.15.1` API Channel listener creates a unique delivery ID and
uses the channel's dedicated secret. The trigger signs
`<timestamp>.<raw-json-body>` with HMAC-SHA256 and defaults to a five-second
open/read timeout. Portal verification uses the same raw-body construction and
a five-minute timestamp tolerance.

Official `v4.15.1` message webhook data includes account, inbox and
conversation data. Conversation/typing webhook data includes the account and
conversation `inbox_id`. This supports the portal's mismatch checks. More
importantly, a tenant-specific signature and a tenant-scoped conversation
mapping remain mandatory even when an optional representation omits a duplicate
identity field.

The official `v4.15.1` trigger catches failures for API inbox webhooks, marks
message events failed and does not re-raise to `WebhookJob`. There is therefore
no upstream retry for a transient portal 5xx, timeout or connection failure.

## Chat, Webhook And Realtime State Machines

### Controls that held

- Private/group thread access is re-resolved before history/send operations;
  Chatwoot conversation IDs are never accepted directly from the browser.
- Text and attachment sends carry a portal client key and a tenant/thread/user
  ledger. Conditional processing tokens fence late portal DB writes.
- Webhook signature verification precedes parsing effects, and present
  account/inbox mismatches fail with 403.
- Chatwoot delivery IDs are tenant scoped and unique; payload hashes are a
  fallback for older deliveries.
- The frontend has a visible-thread stale-realtime refresh after 30 seconds, so
  an open active transcript can eventually recover from a silent webhook.
- Typing events are textless, tenant/thread scoped and best effort.

### INT-001: API Channel webhook failures are terminal without reconciliation

- Portal evidence: message webhook handling can fail before acceptance while
  recording unread state and finding the mapping
  (`backend/src/modules/chatwoot-webhooks/service.ts:352-390`). After delivery
  recording, snapshot fanout and push are best effort at lines 398-425.
- Upstream evidence: official `v4.15.1` `Webhooks::Trigger` catches API inbox
  errors, updates the message status to `failed` and returns normally from the
  job. Only selected agent-bot failures are promoted to retryable errors.
- Failure path: Chatwoot emits `message_created`; the portal times out or
  returns 5xx before it records the delivery; Chatwoot never sends that event
  again. The visible active thread may recover by snapshot refresh, but unread
  state, inactive-thread notification, push and realtime delivery have no
  durable catch-up source. For portal-created incoming messages, Chatwoot may
  additionally mark an otherwise accepted message failed.
- Counterevidence: message history remains in Chatwoot, page load/fallback reads
  can recover transcript data, and normal signed deliveries pass targeted
  tests. The impact is notification/status consistency, not loss of the
  Chatwoot message row itself.
- Validation contract: add a durable, tenant-scoped reconciliation cursor or
  inbox event queue that can repair missed message IDs without chatty polling;
  test portal downtime/timeout, inactive threads and recovery exactly once.

### BACK-006: source-ID recovery searches only the latest 20 messages

- Portal evidence:
  `backend/src/integrations/chatwoot/messageClient.ts:201-218` calls the messages
  endpoint once without `before`/`after` and scans that response for the client
  key.
- Contract evidence: official `v4.15.1` returns only the latest 20 for that
  request.
- Failure path: Chatwoot accepts an ambiguous portal send; at least 20 newer
  messages exist by recovery time; the retry cannot find the accepted message
  and executes another create with the same source ID.
- Counterevidence: common immediate retries find recent messages, and normal
  transcript pagination is correct.
- Validation contract: use an exact indexed upstream lookup if available, or
  bounded cursor recovery tied to the send time/ID; reproduce an accepted
  message outside the latest window and require one canonical result.

### BACK-007: portal lease fencing cannot fence the Chatwoot side effect

- Portal evidence: failed and stale send rows can be reacquired
  (`backend/src/modules/chat-messages/repository.ts:162-191`). Processing tokens
  fence only portal updates at lines 228-282. The sender returns the created
  message even if the conditional confirmation returns null
  (`backend/src/modules/chat-messages/sendLedger.ts:314-340`).
- Contract evidence: official `v4.15.1` accepts `source_id` but does not enforce
  uniqueness on `messages.source_id`.
- Failure path: request A reaches Chatwoot but its response times out; request B
  reacquires the failed ledger row, misses A in the latest-20 recovery window
  or before A is visible, then creates another message. Both upstream rows are
  allowed even though only one portal token can win the later DB update.
- Counterevidence: the 15-second client deadline is shorter than the two-minute
  stale lease, immediate source lookup often recovers the first row, and the
  exact overlap has not yet been run against a controlled Chatwoot instance.
- Validation contract: make the upstream idempotency boundary authoritative or
  serialize creation through a durable single-owner outbox; run the controlled
  timeout/visibility overlap and require one external effect.

### ARCH-010 rejection: optional duplicate identity fields do not open routing

Supported `v4.15.1` message payloads carry account/inbox/conversation identity,
and typing payloads carry account plus conversation inbox identity. Present
mismatches are rejected. If an equivalent signed representation omits one
duplicate field, the request still requires the tenant-specific API Channel
secret and an existing conversation mapping scoped to that tenant. No
cross-tenant or attacker-controlled supported path was established, so
`ARCH-010` is rejected. Requiring every duplicate field would be acceptable
hardening, not a demonstrated defect.

## Telegram Bridge State And External Effects

### Controls that held

- Telegram officially repeats webhook delivery for non-2xx responses and sends
  the configured secret in `X-Telegram-Bot-Api-Secret-Token`; the bridge uses
  that exact contract plus an unguessable path secret.
- Tenant, inbox and bot ownership are checked before webhook replacement.
  Unknown existing webhook owners are rejected; bot replacement through an
  existing config is rejected.
- A partial unique index prevents one non-archived bot ID from being active in
  multiple configs. Contact-inbox lookup is tenant-account/inbox scoped and
  phone matching is exact after E.164 normalization.
- Telegram `update_id` is an ordinary Bot API Integer. Telegram states ordinary
  Integer fields fit signed 32-bit unless specifically noted; `update_id` has
  no larger exception. JavaScript number plus PostgreSQL bigint-number mode is
  therefore safe for the supported contract. Larger chat/user IDs are stored
  as text before persistence.
- Processed/failed delivery rows have tenant-scoped 30-day maintenance cleanup;
  live `processing` rows are preserved.
- Explicit admin setup by a current authorized tenant admin, with the same
  inbox and current bot-token proof, is allowed to re-enable an old config. No
  unprivileged archived/disabled re-enable path was established; the deferred
  security proof question is rejected as an authority bypass.

### INT-002: ambiguous external effects can be replayed

- Evidence: the service performs Telegram prompts/link confirmations or
  Chatwoot forwarding, then marks the delivery processed best effort
  (`backend/src/telegram-bridge/service.ts:303-434`). A thrown external call
  marks the row `failed` and returns 500 at lines 446-460. Failed rows and
  ten-minute-stale processing rows are deliberately reacquired.
- Upstream contract: Telegram repeats non-2xx webhook requests. Chatwoot
  `v4.15.1` accepts the forwarded native Telegram webhook by enqueuing a job;
  its Telegram message `source_id` is the Telegram `message_id`, but the
  Chatwoot message index is non-unique.
- Failure path A: Chatwoot accepts/enqueues the update but the portal sees a
  timeout, marks failed and returns 500; Telegram retries and the bridge
  forwards the same update again.
- Failure path B: the external effect succeeds, the processed mark fails and
  the portal returns 200; if that response is lost, Telegram retries, receives
  503 until the row is stale, then the bridge replays the effect.
- Impact: duplicate Chatwoot messages, duplicate phone prompts or duplicate
  link/not-found confirmations. Attempt-count fencing prevents an old worker
  from overwriting a new portal row, but cannot cancel either external effect.
- Validation contract: use a durable outbox/effect ledger with an authoritative
  idempotency key, or reconcile the exact Chatwoot/Telegram effect before
  replay; test both post-accept timeout and post-effect DB failure schedules.

### INT-003: webhook cutover can silently drop updates while config is rotating

- Evidence: new admin setup inserts status `rotating`
  (`backend/src/modules/telegram-bridge-admin/service.ts:161-205`), calls and
  confirms Telegram `setWebhook` at lines 336-351, and only then updates the row
  to `active` at lines 353-371. The operator CLI has the same external-before-
  activation order (`backend/src/telegram-bridge/configureWebhook.ts:279-305`).
- Runtime evidence: any non-active config becomes `inactive_config`
  (`backend/src/telegram-bridge/configRepository.ts:183-192`), which the service
  maps to disabled/ignored. The HTTP server maps that result to 200
  (`backend/src/telegram-bridge/server.ts:82-121`). Existing tests explicitly
  assert disabled/ignored is 200.
- Failure path: Telegram webhook mutation succeeds; process exit or DB failure
  prevents final activation; an update arrives during the gap and receives
  `200 ignored`. Telegram considers it delivered and does not retry it.
- Existing-config variant: a rotated bot token can already own the webhook
  while the DB still holds the old token. Forwarding to Chatwoot can enqueue an
  old-token path that Chatwoot later discards, while the portal records the
  update processed.
- Counterevidence: setup is low-frequency, it verifies bridge health first,
  preserves pending Telegram updates during `setWebhook`, and a prompt rerun
  can repair the configuration. It cannot recover updates already acknowledged
  with 200.
- Validation contract: model cutover as a generation-aware state machine. A
  route that Telegram already owns must either process with committed secrets
  or return retryable 503 until activation; inject a post-`setWebhook` DB
  failure and prove no update is acknowledged/lost.

## Tenant Provisioning External State

### INT-004: same-tenant provisioning has no single-owner lease

- Evidence: `createOrResumeRun` returns the same run after a slug conflict but
  does not claim an owner or generation
  (`backend/src/modules/tenant-provisioning/repository.ts:151-185`). Status and
  terminal updates are unconditional by run ID at lines 84-101 and 195-219.
- External path: both callers can see a null account/user/inbox ID and execute
  Platform/Account API creates before storing the immutable winner
  (`backend/src/modules/tenant-provisioning/service.ts:113-279` and
  `serviceHelpers.ts:124-189`). The immutable-ID conditional update detects the
  conflict only after the second external resource already exists.
- Failure path: two operator invocations for one slug create different
  Chatwoot accounts or users; one ID is stored, the other caller fails and can
  later mark the shared run `failed` even after the first caller progressed or
  completed. The losing external account/user remains orphaned.
- Counterevidence: provisioning is operator-only and low-frequency; account
  recovery searches the managed tenant slug; immutable portal IDs prevent a
  silent switch to the losing resource. User creation has no equivalent
  recovery lookup.
- Validation contract: acquire a short DB-backed run lease/generation before
  any external effect, make status/terminal writes owner-conditional, and add a
  two-caller test that produces one account, one user set, one inbox and one
  completed run.

## Response Bounds And Load Disposition

### INT-005: JSON response bodies have no byte budget

`backend/src/integrations/chatwoot/request.ts:89-102` calls
`Response.json()` directly. The deadline stays active, but no content-length or
streamed byte cap exists. Runtime message/contact endpoints are mostly bounded
by Chatwoot pagination, while operator lists such as accounts, inboxes, agents,
webhooks and custom attributes can grow with the instance/account.

No production response sizes, proxy caps or memory measurements were available,
and the upstream is trusted configuration rather than direct user input. This
is therefore Low `needs_follow_up`, not a demonstrated availability failure.
Task 8 should measure realistic and adversarial provider response sizes, set a
per-call-family row/byte budget, and verify abort/backpressure without exposing
tokens.

## Verification And Limitations

- Targeted integration/runtime Vitest: 33 files and 227 tests passed across
  Chatwoot clients, provisioning, signed webhooks, realtime/unread/push,
  Telegram config/admin/runtime/dedupe and server response mapping.
- Official `v4.15.1` sources confirmed the latest/before/after message windows,
  non-unique message source IDs, signed API Channel delivery construction,
  payload identity fields and terminal API inbox webhook failure behavior.
- Telegram official documentation confirmed non-2xx retry, the secret header,
  pending-update retention and supported integer bounds.
- Frozen portal source remained detached and unmodified; local Chatwoot source
  was read only; no production/external request was mutated.
- No controlled Chatwoot timeout overlap, portal-downtime webhook delivery,
  parallel provisioning run, Telegram post-cutover DB failure, provider
  response-size measurement or real Telegram delivery was executed. Those are
  canonical/load/dynamic validation inputs, not claims of completed proof.
