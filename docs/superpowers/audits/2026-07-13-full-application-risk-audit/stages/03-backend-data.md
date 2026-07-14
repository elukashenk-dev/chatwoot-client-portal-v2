# Stage 03: Backend And Persistence Review

Status: complete

Verdict effect: no new Critical or High hypothesis was established. Seven new
Medium and one new Low candidates require canonical validation, while two of
the seven Medium candidates remain `needs_follow_up` until the exact Chatwoot
contract and an overlap schedule are reproduced. The stage does not remove the
final `GO` blocker recorded as `SEC-DEEP-001`.

## Frozen Target And Review Boundary

- Repository revision: `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`
- Frozen source:
  `/home/evluk/projects/chatwoot-client-portal-v2-audit-source-2026-07-13`
- Scope: customer/admin auth lifecycle, tenant-scoped repositories, Drizzle
  schema and migrations, transaction/lock/idempotency paths, public validation
  and backend-owned external-call failure mapping
- Product source mutation: none
- Production or external Chatwoot mutation: none
- Dynamic probes: local Fastify injection and existing synthetic tests only

## Outcome Summary

| ID         | Status          | Severity | Backend/data failure hypothesis                                                                 |
| ---------- | --------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `BACK-001` | candidate       | Medium   | Legal acceptance records the version active at submit time, not the version actually presented  |
| `BACK-002` | candidate       | Medium   | Delayed reset-email cleanup can restore stale state over a newer resend                         |
| `BACK-003` | candidate       | Medium   | Admin login challenge can remain permanently in `sending` after crash/unclassified mail failure |
| `BACK-004` | candidate       | Medium   | Drizzle snapshots 0023 and 0024 share one identity and parent                                   |
| `BACK-005` | candidate       | Medium   | Conversation bootstrap holds a DB transaction and advisory lock across Chatwoot I/O             |
| `BACK-006` | needs_follow_up | Medium   | Source-ID recovery searches one default Chatwoot message page and can miss an accepted send     |
| `BACK-007` | needs_follow_up | Medium   | A stale send worker can execute an external side effect after its lease was taken over          |
| `BACK-008` | candidate       | Low      | Malformed JSON and oversized JSON are returned as generic 500 responses                         |

`ARCH-002`, `ARCH-005` and `ARCH-006` were independently supported by this
stage and are not duplicated. The broader `lower(email)` query/index mismatch
is recorded under the already canonical `SEC-STD-A03-001` remediation theme;
Task 8 owns measured query-plan and load validation.

## Boundary Disposition

| Reviewed boundary                       | Disposition     | Evidence result                                                                                  |
| --------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| Customer session resolution/renewal     | confirmed       | Tenant, active-user and expiry checks hold; renewal uses conditional persistence                 |
| Passwordless and password-setup cleanup | confirmed       | Failed-delivery cleanup is generation/ownership fenced                                           |
| Passwordless legal completion           | candidate       | Presented legal versions are not bound to acceptance (`BACK-001`)                                |
| Password-reset delivery/continuation    | candidate       | Delivery rollback race plus canonical sibling-proof generation defect                            |
| Tenant-admin challenge/session          | candidate       | Stuck delivery state plus existing attempt/role/write/retention candidates                       |
| Tenant-owned repository scope           | confirmed       | No reachable cross-tenant request read/write was established                                     |
| Migration metadata                      | candidate       | Snapshot identity/parent collision reproduced (`BACK-004`)                                       |
| Thread bootstrap transaction            | candidate       | External I/O is awaited inside transaction-scoped advisory lock (`BACK-005`)                     |
| Message/Telegram external idempotency   | needs_follow_up | Static lease/recovery gaps need exact upstream overlap evidence (`BACK-006`, `BACK-007`, Task 6) |
| Public route validation/error mapping   | candidate       | Zod/uploads are bounded; core JSON parser status mapping is wrong (`BACK-008`)                   |
| Backend HTTP request deadlines          | confirmed       | Chatwoot, Telegram and attachment-proxy requests use abortable bounded deadlines                 |

## Customer And Admin Lifecycle

### Controls that held

- Customer session reads remain tenant-scoped and require an active user and
  unexpired session. Explicit renewal uses a conditional update rather than a
  blind token replacement.
- Passwordless-login failed-delivery cleanup proves ownership of the currently
  pending record before restoring or deleting it. Password-setup applies the
  same ownership pattern and completes password assignment, proof consumption,
  session revocation and new-session creation inside one transaction.
- Password-reset and password-setup completion re-read the proof under their
  scoped lock. Existing canonical `SEC-STD-A07-001` still covers the missing
  generation fence between sibling reset proofs.
- Admin code verification, session creation and audit persistence share a
  transaction, but expected invalid-code exceptions roll that transaction back;
  that behavior is already canonical `SEC-STD-A04-001`.

### BACK-001: acceptance version is not bound to the presented documents

- Evidence: `backend/src/modules/passwordless-login/acceptLegal.ts:47-52`
  fetches the currently active versions immediately before the acceptance
  transaction and persists those versions at lines 168-180. The public body in
  `backend/src/modules/passwordless-login/routes.ts:113-125` contains only the
  continuation, email and two booleans; it carries no presented version IDs.
- Failure path: a customer views version V1, an administrator activates V2,
  then the customer submits the already-open form. The server records that the
  customer accepted V2 even though V2 was not the document shown to that form.
- Counterevidence: the customer still owns a valid email continuation and both
  documents must be active for access. The race requires a legal-document
  publication between presentation and submission.
- Validation contract: return signed/versioned presentation context and reject
  or re-present when the active versions differ; add a V1-presented/V2-active
  integration test.

### BACK-002: delayed reset cleanup can overwrite a newer resend

- Evidence: reset email delivery is detached with `setImmediate` at
  `backend/src/modules/password-reset/service.ts:293-296`. On failure,
  `cleanupFailedResetDelivery` restores the captured previous row or deletes the
  shared row at lines 216-250 without first proving that `resetRecord` is still
  the current pending generation.
- Failure path: R2 replaces R1 and its SMTP attempt remains pending; after the
  resend window, R3 replaces R2 and is delivered; delayed R2 failure then
  restores R1 over R3. The delivered R3 code stops working and an older state
  can be reactivated.
- Counterevidence: the resend cooldown narrows the timing window and common
  SMTP failures return quickly. The existing test proves only the simple
  single-failure restore path.
- Validation contract: copy the ownership predicate used by passwordless/setup
  cleanup and reproduce delayed R2 failure after successful R3 delivery.

### BACK-003: admin challenge can be stuck in `sending`

- Evidence: request creates/replaces a challenge with status `sending` at
  `backend/src/modules/tenant-admin/adminAuthService.ts:166-196`. A later
  request returns `delivery_in_progress` before checking expiry at lines
  121-132. Cleanup runs only for errors classified as delivery unavailable at
  lines 271-294; an unexpected error or process exit before lines 296-307 leaves
  the row unchanged. Admin challenges are absent from maintenance cleanup.
- Failure path: one crash or unclassified mail error after the committed
  `sending` state permanently blocks new codes for that tenant/email.
- Counterevidence: known SMTP configuration/delivery failures are cleaned up and
  another eligible administrator may still access the tenant.
- Validation contract: make `sending` a recoverable lease with expiry and
  ownership fencing; test crash/unclassified-error recovery.

## Schema, Migrations And Tenant Isolation

- The reviewed schema has 24 portal-owned tables. Tenant-owned request data has
  a direct `tenant_id`, or inherits tenant authority through a tenant-owned
  configuration/parent row. Request repositories consistently add the resolved
  tenant to reads and mutations. No reachable cross-tenant read/write path was
  established in this stage.
- Several child foreign keys reference only the child object ID rather than a
  composite `(tenant_id, id)` key. Current repository scoping prevents a
  demonstrated mismatch, so this remains defense-in-depth rather than a
  finding. A future repository that accepts untrusted numeric IDs would need a
  composite constraint or an equally strong transactional proof.
- Raw email indexes coexist with normalized `lower(email)` predicates in auth,
  password setup/reset and admin challenge repositories. The public-login case
  is already `SEC-STD-A03-001`; the repeated pattern should be corrected as one
  schema/query contract and verified with realistic `EXPLAIN` plans.

### BACK-004: Drizzle migration metadata has a lineage collision

- Evidence: both `backend/drizzle/meta/0023_snapshot.json:2-3` and
  `0024_snapshot.json:2-3` contain ID
  `3f36fcbc-6f46-4e19-a582-889e6dc4a356` and parent
  `b351a68a-92b3-46f8-9fb6-793d0e34604f`, while the journal lists distinct
  sequential migrations 0023 and 0024.
- Direct check: `pnpm exec drizzle-kit check` reports that snapshots 0023 and
  0024 point to a colliding parent. The command currently exits zero despite
  printing the collision, so a shell success gate alone would not detect it.
- Failure path: future schema generation/checking starts from an ambiguous
  migration graph and can produce incorrect or non-reproducible migration
  metadata even though existing SQL files still execute sequentially.
- Counterevidence: the frozen baseline migrations and integration suite pass;
  no current runtime row corruption was demonstrated.
- Validation contract: regenerate only the 0024 snapshot identity/parent from
  the intended 0023 lineage, then require a clean Drizzle check and migration
  rehearsal from empty and 0023 databases.

## Transactions, Locks And Idempotency

### BACK-005: thread bootstrap holds a transaction across Chatwoot I/O

- Evidence: `transactionWithThreadBootstrapLock` opens a transaction, acquires
  `pg_advisory_xact_lock`, then awaits an arbitrary handler
  (`backend/src/modules/chat-threads/repository.ts:91-107`). The handler performs
  contact-inbox lookup/creation and conversation creation through Chatwoot at
  `backend/src/modules/chat-threads/runtime.ts:240-369`; its repository calls use
  the global DB object rather than the transaction executor.
- Failure/load path: each bootstrap occupies one pool connection throughout
  external latency. Same-contact waiters also open transactions before waiting
  on the lock. At 10x/100x concurrent cold/recovery traffic, slow Chatwoot calls
  can create a connection-pool convoy and delay unrelated portal work.
- Counterevidence: the lock prevents duplicate conversation bootstrap for one
  tenant/contact and Chatwoot HTTP requests have timeouts. Normal established
  threads do not enter this path.
- Validation contract: use a short transaction only to claim/read a durable
  bootstrap lease, perform external I/O outside it, then conditionally publish
  the result; load-test bounded pool occupancy and same-key contention.

### Existing and deferred idempotency observations

- `ARCH-002` is supported: the portal ledger key includes user while Chatwoot
  source lookup is conversation-global, so two group users can alias one
  source ID.
- `BACK-006` remains follow-up because
  `backend/src/integrations/chatwoot/messageClient.ts:201-218` performs source-ID
  recovery through one messages request with no cursor/page iteration. Task 6
  must confirm official/current Chatwoot ordering and default page semantics,
  then reproduce an accepted ambiguous send falling outside that window.
- `BACK-007` remains follow-up because a send row can be reacquired after two
  minutes, while `processingToken` fences only the later DB update. It cannot
  cancel an old in-flight Chatwoot side effect, and callers do not require the
  conditional confirm to succeed before returning their created message
  (`backend/src/modules/chat-messages/sendLedger.ts:210-379`). Reproduce two
  overlapping owners against the real/local Chatwoot contract before
  canonicalizing impact.
- Telegram update processing has the same general external-side-effect/lease
  shape. It is intentionally deferred to Task 6 so one integration finding is
  not duplicated here from static overlap alone.

## Validation, Errors And Timeouts

- Public route bodies/params/queries use bounded Zod schemas, and upload routes
  apply explicit part/file/request limits with controlled multipart errors.
- Chatwoot, Telegram HTTP and attachment proxy clients use abortable request
  deadlines. Their exact upstream contracts, redirect behavior and retry
  semantics remain Task 6 scope; canonical redirect SSRF is already
  `SEC-STD-A18-002`.

### BACK-008: Fastify client parser errors become generic 500 responses

- Evidence: `registerApiErrorHandler` handles only `ApiError` and `ZodError`,
  then maps every other exception to 500
  (`backend/src/lib/errors.ts:32-65`). Fastify content-parser errors are raised
  before route-level Zod/multipart handling.
- Direct probe: a local minimal Fastify app using the production handler returned
  `500 INTERNAL_ERROR` for both malformed JSON and JSON above the configured
  body limit. The standalone Telegram server separately maps 400/413/415,
  demonstrating the intended controlled pattern.
- Impact: ordinary invalid input is reported as server failure, distorts error
  telemetry and can encourage unnecessary retries. No sensitive stack or parser
  detail was returned.
- Validation contract: map only known Fastify parser/status errors to stable
  400/413/415 responses and keep unknown errors at 500; add injection tests.

## Verification And Limitations

- Targeted Vitest: 10 files and 115 tests passed across passwordless/setup/reset,
  admin auth, thread bootstrap, send ledger and Telegram dedupe/service.
- Local Fastify error-mapping probe reproduced `BACK-008` twice.
- `pnpm exec drizzle-kit check` reproduced `BACK-004`; it emitted the collision
  while returning exit code zero.
- Frozen source remained detached and unmodified.
- No production cardinality, query plan, SMTP latency, pool saturation or real
  Chatwoot overlap schedule was available. Task 8 and Task 9 own those dynamic
  proofs; Task 6 owns external contract calibration.
