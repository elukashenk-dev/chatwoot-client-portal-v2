# Auditor B Independent Challenger Report

Auditor B independently reviewed all nine recovered families against the
historical tree at `a61b4975ae7b59e244c0b5bbc4efd02466aa075c` and the current
tree at `0c25c7575221ed19b21390abb8a5f1e364f2e06f`.

The exact 26 route/control/sink/deployment files used by these families are
byte-identical across the two roots. Current applicability is therefore
decided from current source, not inferred from commit age. Targeted checks ran
against the execution worktree only after the relevant product-file hashes
were matched to the immutable current root. No product code, source root,
dependency, environment, migration, production service, or external system
was changed.

## Disposition Summary

| Family      | Historical | Current | Proposed disposition    | Severity | Confidence |
| ----------- | ---------- | ------- | ----------------------- | -------- | ---------- |
| DEEP-R1-F01 | unclear    | present | needs_follow_up         | Unknown  | medium     |
| DEEP-R1-F02 | reachable  | present | confirmed_medium_or_low | Medium   | medium     |
| DEEP-R1-F03 | reachable  | present | confirmed_medium_or_low | Medium   | high       |
| DEEP-R1-F04 | reachable  | present | duplicate: F-LOAD-006   | Low      | high       |
| DEEP-R1-F05 | reachable  | present | duplicate: F-AUTH-002   | Low      | high       |
| DEEP-R1-F06 | reachable  | present | confirmed_medium_or_low | Medium   | high       |
| DEEP-R1-F07 | reachable  | present | duplicate: F-LOAD-002   | Medium   | high       |
| DEEP-R1-F08 | unclear    | present | duplicate: F-AUTH-001   | Low      | high       |
| DEEP-R1-F09 | reachable  | present | confirmed_medium_or_low | Medium   | high       |

No family supports Critical severity. F01 remains open only on a concrete
attacker-origin/deployment fact, not on a suspected high-impact sink.

<a id="deep-r1-f01-mark-read-csrf-origin-enforcement"></a>

## DEEP-R1-F01 Mark-read CSRF origin enforcement

Candidate: `W01R-C002`. Instance key and ledger row were not supplied.

Disposition: `needs_follow_up`; severity `Unknown`; confidence `medium`.

### Validation Rubric

- [x] Source identified: a cross-origin POST carrying the victim's customer
      session cookie.
- [x] Closest control identified: authenticated customer session plus
      `SameSite=Lax`; the exact tenant-origin validator exists but is not called.
- [x] Sink identified: current thread resolution followed by Chatwoot
      `updatePublicConversationLastSeen`.
- [ ] A realistic attacker-controlled, script-capable sibling origin for a
      real victim deployment is not established by the immutable evidence.
- [x] Both baselines are independently closed as unchanged code with the same
      proof gap.

### Evidence And Validation

Historical and current affected locations are identical:

- entrypoint/control: `backend/src/modules/chat-presence/routes.ts:42-56`;
- available but unused control: `backend/src/lib/origin.ts:47-58`;
- cookie behavior: `backend/src/modules/auth/sessionCookie.ts:6-14`;
- authority and external-effect sink:
  `backend/src/modules/chat-presence/service.ts:118-191`;
- route registration: `backend/src/app.ts:469-473`.

The route authenticates a cookie and validates the thread label, but never
checks `Origin`. The service rechecks the user's thread authority before the
Chatwoot write. The ordinary route/service tests passed, and the positive route
test at `routes.test.ts:90-111` confirms that no Origin header is required.

Repository architecture documents prove two supported domain modes, including
provider-owned sibling subdomains
(`docs/architecture/overview.md:126-136`). They do not prove that a tenant or
internet attacker can execute arbitrary script on such a sibling origin.
Custom-domain mode can also be cross-site, where `SameSite=Lax` is effective.

### Attack Path

1. A victim authenticates on the target tenant origin.
2. An attacker executes script on a same-scheme sibling origin in the same
   registrable site and sends a credentialed POST to the victim tenant's
   mark-read endpoint.
3. The host-only victim cookie is eligible for the target host and
   `SameSite=Lax` does not distinguish same-site sibling origins.
4. The route performs no exact-Origin comparison; normal session and thread
   checks succeed for the victim.
5. The backend marks the victim's Chatwoot conversation last-seen state.

### Attack Path Facts

- Assumptions/Context: impact crosses from attacker origin to victim read-state
  integrity, but requires a script-capable same-site sibling.
- In-scope status: the customer mutation route and tenant domains are in scope;
  sibling-origin ownership is unresolved.
- Exposure/Vector: public HTTPS `/api` route; `remote` if the sibling origin
  exists, otherwise no proved vector.
- Identity/Auth scope: victim customer cookie; the attacker does not learn the
  cookie. The route is customer-authenticated, not public.
- Cross-boundary behavior: verified browser-to-backend mutation and backend-to-
  Chatwoot write; attacker control of the first step is the blindspot.
- Preconditions: victim logged in, target thread ready, attacker controls
  same-site script origin, and browser sends credentials. The first two are
  ordinary; the third is unknown for a real deployment.
- Attacker input/category: Origin/request trigger; CSRF/read-state integrity.
- Mitigations/controls: signed HttpOnly host cookie, SameSite=Lax, current user
  and thread authorization, five-second read throttle. None is an Origin check.
- Impact surface/target reach: one victim thread read marker per authorized
  target; no cross-tenant data read or admin action.
- Secrets: no secret disclosure.
- Strongest counterevidence: the shipped portal does not provide arbitrary
  tenant HTML/JavaScript hosting, and custom domains need not be same-site.
  This is dispositive against confirmation until domain ownership is known,
  but it does not prove the missing route control safe.
- Confidence/blindspot: medium; obtain a deployment domain-ownership inventory
  or a real-browser test using the actual provider/custom-domain topology.

Severity is left `Unknown`; if the sibling-origin precondition is proved, the
bounded read-state effect calibrates to Low, not High/Critical. Final policy:
`needs_follow_up`.

<a id="deep-r1-f02-unsigned-delivery-identifier-replaydedupe-bypass"></a>

## DEEP-R1-F02 Unsigned delivery identifier replay/dedupe bypass

Candidates: `W01R-C003`, `CAND-R01-W02-009`. Instance key and ledger row were
not supplied.

Disposition: `confirmed_medium_or_low`; severity `Medium`; confidence `medium`.

### Validation Rubric

- [x] Source: a previously valid signed webhook request whose unsigned
      `x-chatwoot-delivery` header is changed within tolerance.
- [x] Closest control: HMAC covers timestamp, delimiter, and raw body only.
- [x] Sink: tenant/key uniqueness accepts each changed header, followed by
      realtime and push effects.
- [x] Preconditions and strongest counterevidence are explicit.
- [x] Identical historical/current code and a synthetic signature check close
      both baselines.

### Evidence And Validation

Identical historical/current locations:

- root control: `backend/src/modules/chatwoot-webhooks/signature.ts:9-13,33-46,59-96`;
- attacker-selected key: `backend/src/modules/chatwoot-webhooks/service.ts:131-141,275-281`;
- signature/tenant gates: `service.ts:234-263`;
- uniqueness sink: `backend/src/modules/chatwoot-webhooks/repository.ts:93-112`
  and `backend/src/db/schema.ts:319-343`;
- post-claim effects: `service.ts:381-420`.

A synthetic check using a fixed raw body, timestamp, and synthetic secret
returned `baseVerified=true` and `changedDeliveryVerified=true` after changing
only the delivery header. Existing webhook tests passed. F-SEC-012 is not a
duplicate: it addresses expensive unread-recipient work before a legitimate
dedupe claim; moving that claim earlier does not bind or replace the mutable
delivery key and therefore does not close this tuple.

### Attack Path

1. An in-scope compromised/misconfigured TLS-terminating upstream observes one
   valid raw body, timestamp, and signature.
2. Within the five-minute tolerance, it replays that signed tuple while
   changing only `x-chatwoot-delivery` for each request.
3. HMAC verification and payload tenant invariants continue to pass.
4. Each new delivery header becomes the database uniqueness key and is
   recorded as a new accepted event.
5. Each accepted key can repeat realtime publication and asynchronous push
   delivery, and persists another delivery row.

### Attack Path Facts

- Assumptions/Context: a signed request must be observable; the threat model
  explicitly includes a compromised/misconfigured trusted upstream.
- In-scope/Exposure/Vector: real public webhook route behind Caddy; remote
  signed-integration path, not an unauthenticated internet path.
- Identity/Auth scope: tenant webhook secret authenticates the body; the flaw
  is missing binding of the dedupe identifier.
- Cross-boundary behavior: verified upstream-to-portal acceptance and
  portal-to-browser/push fanout.
- Preconditions: capture one valid request, replay before tolerance expires,
  preserve body/timestamp/signature, vary the header. Plausible for a
  compromised TLS terminator; not proved for an ordinary internet attacker.
- Attacker input/category: delivery header; replay/resource and notification
  integrity.
- Mitigations: HMAC, five-minute window, tenant/account/inbox invariants,
  tenant-scoped uniqueness, current delivery visibility checks. They constrain
  provenance and time but not new-key cardinality.
- Impact/target reach: repeated database writes and per-event realtime/push
  effects in one tenant; shared backend/provider pressure is possible.
- Secrets: the exploit can reuse a captured signature and need not recover the
  secret.
- Counterevidence: TLS and HMAC exclude ordinary remote attackers, unread rows
  have their own uniqueness, and effects are best-effort. These reduce
  likelihood/impact but do not defeat the in-scope trusted-upstream path.
- Blindspots/confidence: actual proxy compromise/capture telemetry is absent;
  medium confidence.

Shared-service resource impact is potentially high but the privileged upstream
precondition lowers likelihood; the matrix calibrates to Medium. Final policy:
reportable `confirmed_medium_or_low`.

<a id="deep-r1-f03-existing-portal-admin-authority-after-chatwoot-revocation"></a>

## DEEP-R1-F03 Existing portal-admin authority after Chatwoot revocation

Candidates: `W01R-C010`, `CAND-R01-W02-002`, `CAND-R01-W06-008`. Instance key
and ledger row were not supplied.

Disposition: `confirmed_medium_or_low`; severity `Medium`; confidence `high`.

### Validation Rubric

- [x] Source: a still-valid portal admin cookie held by a principal whose
      Chatwoot administrator state was revoked after session creation.
- [x] Closest control: tenant/token/expiry lookup only; the live eligibility
      service is not called.
- [x] Sink: protected branding, legal-document, and bridge-admin operations.
- [x] Preconditions, tenant boundary, and 12-hour window are explicit.
- [x] Both baselines are byte-identical and fully traced.

### Evidence And Validation

Identical historical/current locations:

- root control: `backend/src/modules/tenant-admin/adminAuthService.ts:59-80`;
- persistence predicate: `adminAuthRepository.ts:399-420`;
- guard: `adminSessionGuard.ts:19-47`;
- unused live authority control: `adminVerification.ts:54-68,77-157`;
- lifetime: `adminAuthPrimitives.ts:11-14`;
- representative sinks: `branding/routes.ts:188-225` and
  `legal-documents/routes.ts:182-207`.

The ordinary admin login/session test passed. F-SEC-003 is not a duplicate: it
rechecks authority immediately before session creation. That remediation does
not revoke or revalidate a session after later upstream role removal.

### Attack Path

1. A legitimate administrator creates a portal admin session.
2. Chatwoot later disables/unconfirms the agent, changes its role, or removes
   it from the tenant account.
3. The former administrator continues using the unexpired portal cookie.
4. Every admin guard trusts the stored role snapshot and extends `lastSeenAt`
   without calling live Chatwoot verification.
5. The principal can read or mutate tenant admin resources until logout,
   portal-row deletion, or fixed 12-hour expiry.

### Attack Path Facts

- Context/In-scope: real tenant-admin authority boundary; same-tenant but
  crosses the current upstream revocation decision.
- Exposure/Vector/Auth scope: remote HTTPS, admin-cookie authenticated.
- Identity: stored Chatwoot agent id/email/administrator snapshot; effective
  portal admin privilege remains active.
- Preconditions: prior legitimate login, later upstream revocation, retained
  cookie, session not expired. Plausible during offboarding/incident response.
- Attacker input/category: continued requests with retained cookie;
  authorization staleness.
- Controls: live check at challenge request, signed HttpOnly cookie,
  tenant-scoped token hash, expiry, Origin checks on mutations. None rebinds
  current Chatwoot role after session creation.
- Impact/target reach: one tenant's branding, legal documents, and integration
  configuration; no cross-tenant authority proved.
- Secrets: no direct secret read proved, though admin control paths are
  sensitive.
- Counterevidence: fixed 12-hour TTL, tenant binding, explicit logout, and
  initial live verification. These bound duration/scope but do not implement
  revocation.
- Blindspots/confidence: no external telemetry needed for the deterministic
  control gap; high confidence.

Medium impact with a realistic remote previously-authorized actor calibrates to
Medium. Final policy: reportable `confirmed_medium_or_low`.

<a id="deep-r1-f04-non-evicting-presence-throttle-maps"></a>

## DEEP-R1-F04 Non-evicting presence throttle maps

Candidate: `R01-W03R-C005`. Instance key and ledger row were not supplied.

Disposition: `duplicate` of `F-LOAD-006`; severity `Low`; confidence `high`.

### Validation Rubric

- [x] Source: authorized read/typing successes across tenant/user/thread keys.
- [x] Closest control: short throttle windows without TTL/size eviction.
- [x] Sink: process-lifetime Maps and local-only throttling.
- [x] Preconditions, overwrite/delete behavior, and 10x/100x growth are clear.
- [x] Both unchanged baselines and exact finding remediation are mapped.

### Evidence And Validation

Identical locations: `backend/src/app.ts:137-140,241-263`,
`chat-presence/service.ts:6-12,118-206,208-310`. Tests confirm shared stores
across request-scoped services and typing-off deletion. Read keys are never
deleted; typing-on keys remain when no successful off arrives. F-LOAD-006 names
the same stores, controls, sinks, growth impact, and adds TTL/size-bounded
eviction plus cross-replica design; its remediation closes the complete tuple.

### Attack Path And Facts

1. Authenticated users successfully touch distinct authorized threads.
2. Each new `(tenant,user,thread)` key enters a process-global Map.
3. Read keys never expire; typing keys rely on a later successful off request.
4. Long-lived processes accumulate state; separate replicas also permit window
   bypass because stores are local.

- Scope/vector/auth: in-scope runtime, remote authenticated customer.
- Boundary/impact: shared-process memory and upstream-throttle correctness;
  no data or tenant-authority bypass.
- Preconditions: many legitimate user/thread combinations or churn over a long
  process lifetime; one user has bounded authorized thread cardinality.
- Controls/counterevidence: authorization, key overwrite, frontend debounce,
  typing-off delete, process restart. These make single-attacker rapid
  exhaustion weak but do not bound SaaS lifetime growth.
- Target/secrets: single process; no secrets.
- Confidence: high static evidence. Impact is gradual availability/scalability,
  calibrated Low for security criticality.

Final policy: exact duplicate `F-LOAD-006`.

<a id="deep-r1-f05-admin-membership-enumeration-through-challenge-behavior"></a>

## DEEP-R1-F05 Admin membership enumeration through challenge behavior

Candidate: `W04-CAND-007`. Instance key and ledger row were not supplied.

Disposition: `duplicate` of `F-AUTH-002`; severity `Low`; confidence `high`.

### Validation Rubric

- [x] Source: unauthenticated email submitted to the admin challenge route.
- [x] Closest control: exact Origin and per-process tenant/IP limiter, but
      distinct eligibility response.
- [x] Sink: live Chatwoot administrator lookup exposed as 200 versus explicit 403.
- [x] Preconditions and privacy impact are explicit.
- [x] Both baselines and exact finding remediation are mapped.

### Evidence And Validation

Identical locations: `adminAuthRoutes.ts:76-86`,
`adminAuthService.ts:82-107`, `adminAuthPrimitives.ts:92-105,156-166`, and
`auth/rateLimit.ts:17-37,86-132`. Targeted integration checks reproduced
eligible success and ineligible `TENANT_ADMIN_NOT_ELIGIBLE`/403. F-AUTH-002
uses the same oracle and requires indistinguishable public responses while
keeping internal delivery/audit outcomes; that closes the complete tuple.

### Attack Path And Facts

1. A remote caller submits candidate addresses to the public admin request
   route from the tenant origin or a direct client supplying that Origin.
2. The backend performs live tenant Chatwoot agent verification.
3. Eligible administrators receive the challenge response; unknown/agent
   addresses receive a distinct 403/code.
4. The caller builds a list of tenant administrators for targeting.

- Scope/exposure/vector: public HTTPS auth surface; remote.
- Identity/auth: unauthenticated caller; Origin is CSRF context, not identity.
- Preconditions: know tenant host and candidate emails; operate within or
  distribute around five requests/minute per process/tenant/IP.
- Controls: Origin, tenant/IP limiter, no challenge/session for ineligible
  users, identical unknown-versus-agent outcome.
- Impact: role/membership privacy and targeting, not account takeover.
- Counterevidence: low request rate and no credential/session issuance keep
  impact narrow; they do not remove the oracle.
- Target/secrets/confidence: one tenant; no secret disclosure beyond role
  membership; high confidence.

This is a real but low-impact enumeration issue, calibrated Low. Final policy:
exact duplicate `F-AUTH-002`.

<a id="deep-r1-f06-unthrottled-repeated-profile-avatar-upstream-writes"></a>

## DEEP-R1-F06 Unthrottled repeated profile-avatar upstream writes

Candidate: `W04-CAND-010`. Instance key and ledger row were not supplied.

Disposition: `confirmed_medium_or_low`; severity `Medium`; confidence `high`.

### Validation Rubric

- [x] Source: repeated/concurrent authenticated same-origin multipart uploads.
- [x] Closest control: 15 MiB per-file/request bounds and MIME allowlist, but no
      request/aggregate admission limit.
- [x] Sink: full buffering followed synchronously by authenticated Chatwoot
      contact-avatar PUT.
- [x] Authority, concurrency, memory, and upstream-write preconditions are
      explicit.
- [x] Both unchanged baselines and tests are closed.

### Evidence And Validation

Identical locations:

- route/source/buffering: `backend/src/modules/profile/routes.ts:20-22,51-69,108-165,208-223`;
- validation: `avatarValidation.ts:4-49`;
- service sink: `profile/service.ts:174-215`;
- Chatwoot PUT: `integrations/chatwoot/client.ts:859-900,1510-1544`;
- limiter exclusion: `auth/rateLimit.ts:17-37`.

The profile route tests passed. The positive upload test proves one accepted
request reaches the service. No exact open finding closes this route: the chat
attachment prebuffer finding has a different route, limit, admission control,
and Chatwoot effect; the branding race finding requires tenant-admin authority
and writes portal object storage rather than the user's Chatwoot contact.

### Attack Path

1. One authenticated customer opens concurrent same-origin avatar uploads.
2. Each request may buffer up to 15 MiB before service processing.
3. Each accepted body is copied/normalized and synchronously PUT to Chatwoot
   with the tenant API credential.
4. No route, user, tenant, concurrency, or aggregate-byte budget rejects the
   burst.
5. At 10 concurrent max-size requests at least 150 MiB of input bytes are live;
   at 100, 1.5 GiB, before buffer/FormData/runtime overhead, plus 100 upstream
   writes.

### Attack Path Facts

- Context/scope: real customer profile surface; same-user source crosses into
  shared portal/Chatwoot availability.
- Exposure/vector/auth: public HTTPS portal, remote authenticated customer,
  exact Origin required.
- Identity: current portal user; Chatwoot credential remains backend-only.
- Preconditions: valid session, linked contact, concurrent multipart bodies.
  Easy for one account; network bandwidth is the main attacker cost.
- Input/category: up to 15 MiB claimed JPEG/PNG/GIF per request; resource
  exhaustion/upstream write amplification.
- Controls: auth, Origin, one file/part, request and file byte caps, MIME
  allowlist, Chatwoot timeout. They bound one request only.
- Impact/target: shared Node process memory and one tenant's/shared Chatwoot
  request capacity; process crash or upstream degradation is plausible.
- Secrets: backend credential is used but not disclosed.
- Counterevidence: individual requests are bounded and require auth; actual
  container memory/provider limits are unavailable. This limits severity, not
  the deterministic unbounded aggregate admission gap.
- Confidence: high on source/control/sink; runtime collapse threshold depends
  on deployment resources.

High shared-availability impact with authenticated/bandwidth preconditions and
unknown runtime threshold calibrates to Medium. Final policy: reportable
`confirmed_medium_or_low`.

<a id="deep-r1-f07-database-transactionadvisory-lock-convoy-across-chatwoot-calls"></a>

## DEEP-R1-F07 Database transaction/advisory-lock convoy across Chatwoot calls

Candidate: `R01-W05-C007`. Instance key and ledger row were not supplied.

Disposition: `duplicate` of `F-LOAD-002`; severity `Medium`; confidence `high`.

### Validation Rubric

- [x] Source: concurrent authenticated sends/recovery against a cold/stale
      thread.
- [x] Closest control: transaction-scoped advisory lock serializes the key but
      holds a pool connection.
- [x] Sink: handler uses global-db repository calls and waits for Chatwoot while
      the transaction/lock remains open.
- [x] pool/cardinality/precondition counterevidence is explicit.
- [x] Both baselines and exact existing-finding remediation are mapped.

### Evidence And Validation

Identical locations: `chat-threads/repository.ts:59-69,91-108`,
`chat-threads/runtime.ts:220-370,373-420`, `db/client.ts:19-34`, and the
authenticated send path `chat-messages/routes.ts:366-392`. The handler's first
repository read and later writes use the repository's outer `db`, not `tx`;
Chatwoot source-id/conversation calls occur at `runtime.ts:287-290,326-330`.
The node-postgres Pool has no explicit maximum and therefore uses its bounded
default. Twenty text sends/minute per user/thread can admit enough concurrent
cold requests to convoy a typical ten-connection pool.

F-LOAD-002 identifies the same cold/recovery source, transaction/advisory
control, external I/O/global-db effect, pool convoy, and bounded remedy. Moving
external work behind a durable short-transaction claim and testing pool
occupancy closes this complete tuple.

### Attack Path And Facts

1. An authenticated user concurrently sends to a not-yet-bootstrapped or stale
   thread.
2. Each request starts a DB transaction and attempts the same transaction-
   scoped advisory lock.
3. One holder continues; same-key waiters retain pool connections while
   blocked.
4. The holder performs repository work through the outer pool and may await
   Chatwoot source/conversation creation before the transaction releases.
5. Enough waiters can convoy or exhaust the shared pool and delay unrelated
   tenants/requests.

- Scope/vector/auth: real remote authenticated chat write path.
- Boundary: same-tenant trigger can pressure the shared DB pool/cross-tenant
  runtime availability.
- Preconditions: cold/stale conversation plus concurrency; established threads
  bypass the bootstrap. Easy to trigger during first send/recovery but not on
  every send.
- Controls: DB-backed 20/min text-send limiter, same-key serialization,
  Chatwoot timeouts. The lock prevents duplicate creation but converts
  concurrency into connection occupancy.
- Impact: shared DB/request availability; no data or authority bypass.
- Counterevidence: cold path only, bounded per-user rate, normal paths bypass,
  external calls have deadlines. These constrain frequency and keep severity
  below High absent a runtime exhaustion reproduction.
- Target/secrets/confidence: shared backend/DB pool, no secret exposure, high
  static confidence.

Severity calibrates to Medium. Final policy: exact duplicate `F-LOAD-002`.

<a id="deep-r1-f08-process-local-authentication-throttling"></a>

## DEEP-R1-F08 Process-local authentication throttling

Candidate: `R01-W05-C009`. Instance key and ledger row were not supplied.

Disposition: `duplicate` of `F-AUTH-001`; severity `Low`; confidence `high`.

### Validation Rubric

- [x] Source: unauthenticated repeated requests to named auth route groups.
- [x] Closest control: one in-process Map keyed by route group, tenant/host,
      and request IP.
- [x] Sink: password/code/reset/admin verification work can be repeated on each
      replica.
- [x] replica/deployment precondition and single-replica counterevidence are
      explicit.
- [x] Both baselines and exact existing finding are mapped.

### Evidence And Validation

Identical locations: `backend/src/modules/auth/rateLimit.ts:17-37,53-60,86-132`,
`backend/src/app.ts:383-388`, and `infra/production/compose.yaml:66-127`.
Targeted app tests reproduced five allowed requests and a sixth 429 inside one
app instance. The reference Compose declares one backend service and no
replica count; Stage 02 explicitly records actual replica/shared-ingress policy
as unavailable.

F-AUTH-001 names the same process-local source/control/sink and requires shared
atomic counters before multi-instance deployment. Its remedy closes the
replica-bypass tuple. The candidate's observation that there is no separate
account/code key is not independently promoted here: the recovered evidence
does not establish a distinct successful brute-force path or impact beyond the
process-local family.

### Attack Path And Facts

1. A deployment routes public auth requests over multiple backend processes.
2. Each process creates an independent Map and counts the same tenant/IP only
   locally.
3. A caller distributes requests across replicas and receives each replica's
   full allowance.
4. Password, recovery, passwordless, setup, or admin verification work exceeds
   the intended global threshold.

- Scope/exposure/vector: real public HTTPS auth routes; remote.
- Identity/auth: unauthenticated caller; tenant/host and IP form the key.
- Preconditions: multiple processes plus controllable/load-balanced routing.
  Actual deployment state is unknown; reference Compose is single-service.
- Controls: conservative default five/minute per process, bounded 10,000-entry
  cache, tenant/host/IP scoping, endpoint-level proof controls.
- Impact: multiplied guessing/email/DB/Chatwoot work proportional to replica
  count, not an unlimited bypass on the documented single service.
- Counterevidence: single reference backend and no repository evidence of
  horizontal replicas. This makes historical reachability unclear, but the
  code/design issue is currently present and already deferred for scaling.
- Target/secrets/confidence: auth surface/shared runtime, no direct secret
  disclosure; high confidence in exact duplicate mapping.

The scaling-dependent multiplier calibrates to Low. Final policy: exact
duplicate `F-AUTH-001`.

<a id="deep-r1-f09-chat-search-history-call-amplification"></a>

## DEEP-R1-F09 Chat search history-call amplification

Candidate: `CAND-R01-W06-002`. Instance key and ledger row were not supplied.

Disposition: `confirmed_medium_or_low`; severity `Medium`; confidence `high`.

### Validation Rubric

- [x] Source: repeated authenticated search with attacker-chosen thread, query,
      and cursor.
- [x] Closest control: current-thread authority, query bounds, 8-page/20-result
      caps; no route/request concurrency or external-call budget.
- [x] Sink: paginated Chatwoot history plus per-missing-reply history lookups.
- [x] exact per-request, 10x, and 100x fan-out is calculated and reproduced at
      the service boundary.
- [x] Both unchanged baselines are closed.

### Evidence And Validation

Identical locations:

- route/source: `backend/src/modules/chat-messages/routes.ts:24-46,326-341`;
- page loop/control: `searchService.ts:26-27,139-270`;
- reply fan-out: `messageMapping.ts:285-325`;
- concrete network client: `integrations/chatwoot/messageClient.ts:14,64-178,181-198,221-278`;
- limiter counterevidence: `auth/rateLimit.ts:17-37` (search absent).

The synthetic check directly produced eight list calls and 160 concurrent-per-
page reply lookups for eight crafted 20-message pages. `messageClient.ts` then
shows that the first list call is up to two HTTP history requests and each
later cursor page up to three (anchor probe, requested page, older probe): up
to 23 base HTTP calls plus 160 reply-target HTTP calls, or 183 per search.
Ten concurrent searches can request up to 1,830 upstream calls; 100 can request
18,300, with bursts of 20 reply lookups per page per request. Existing tests
passed but do not assert an external-call budget.

No existing finding is an exact duplicate. F-SEC-007 concerns a group-info
tenant-user scan and would not change search pagination/reply lookup. F-LOAD-004
concerns periodic thread-list refresh and likewise does not close this route.

### Attack Path

1. A valid thread participant chooses a query that does not match early pages
   and repeatedly calls search.
2. The backend scans up to eight pages to obtain results or exhaust its cap.
3. Each 20-message page resolves every unique missing reply target through
   `Promise.all`, with no per-request concurrency budget.
4. The Chatwoot list client adds cursor validation and older-history probes.
5. Repeated/concurrent requests amplify one customer into large upstream and
   backend work, potentially degrading shared service availability.

### Attack Path Facts

- Scope/exposure/vector/auth: real public portal route, remote authenticated
  customer and current thread participant.
- Identity/boundary: same-tenant data authority is correctly checked; the
  security boundary is bounded shared resource use, including cross-tenant
  backend/Chatwoot capacity.
- Preconditions: a ready conversation with sufficient history; worst reply
  fan-out also needs unique external reply targets. The base 23-call path does
  not require reply structure. Repetition/concurrency is attacker-controlled.
- Input/category: bounded query/cursor and request rate; external-call/resource
  amplification.
- Controls: auth, thread authority, query length, 8-page cap, 20 results,
  Chatwoot deadlines. They bound one request but still allow a high constant
  and do not cap aggregate concurrency.
- Impact/target: single backend process and tenant/shared Chatwoot request
  capacity; latency, socket pressure, provider throttling, and availability.
- Secrets: tenant API credential is used only server-side, not disclosed.
- Counterevidence: maximum pages/results are finite, failures map to controlled
  unavailable responses, and reply targets depend on history. These prevent
  unbounded work inside one call but do not make 183 calls/request or aggregate
  concurrency acceptable.
- Blindspots/confidence: production latency/rate/queue telemetry is absent, but
  source/control/sink/cardinality and service fan-out are deterministic; high
  confidence.

High shared-availability impact with authenticated/history preconditions
calibrates to Medium. Final policy: reportable `confirmed_medium_or_low`.
