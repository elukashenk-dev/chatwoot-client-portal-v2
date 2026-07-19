# Auditor A Validation And Attack-Path Report

Method: bounded validation and attack-path analysis of the nine supplied
families. This is not new discovery and is not a canonical Deep Security Scan.

Baselines:

- historical: `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`;
- current: `0c25c7575221ed19b21390abb8a5f1e364f2e06f`.

All candidate-path files are identical across the two commits. Existing tests
were run against the product-equivalent execution checkout; the checkout has no
product delta from the immutable current commit.

## Validation Closure Table

| Family        | Historical                                               | Current               | Disposition            | Severity | Confidence |
| ------------- | -------------------------------------------------------- | --------------------- | ---------------------- | -------- | ---------- |
| `DEEP-R1-F01` | reachable                                                | present               | confirmed medium/low   | Low      | medium     |
| `DEEP-R1-F02` | reachable mechanism, no lower-privileged attacker path   | present               | rejected               | None     | high       |
| `DEEP-R1-F03` | reachable                                                | present               | confirmed medium/low   | Medium   | high       |
| `DEEP-R1-F04` | reachable                                                | present               | duplicate `F-LOAD-006` | Medium   | high       |
| `DEEP-R1-F05` | reachable                                                | present               | duplicate `F-AUTH-002` | Medium   | high       |
| `DEEP-R1-F06` | reachable operation, no reportable security impact       | present               | rejected               | None     | high       |
| `DEEP-R1-F07` | reachable                                                | present               | duplicate `F-LOAD-002` | Medium   | high       |
| `DEEP-R1-F08` | not reachable in the represented single-process topology | present conditionally | duplicate `F-AUTH-001` | Low      | high       |
| `DEEP-R1-F09` | reachable                                                | present               | confirmed medium/low   | Medium   | high       |

<a id="deep-r1-f01"></a>

## DEEP-R1-F01 — Mark-read CSRF origin enforcement

Disposition: `confirmed_medium_or_low`; Low; medium confidence.

### Validation Rubric

- [x] A same-site sibling origin can initiate a simple cross-origin POST while
      the victim's `SameSite=Lax` cookie remains eligible.
- [x] The route authenticates the cookie but does not invoke the repository's
      exact-origin control.
- [x] The fixed `private:me` identifier reaches the current user's private
      conversation, so guessing a random identifier is not required.
- [x] The service reaches Chatwoot's `update_last_seen` external action.
- [x] Historical and current candidate paths are identical; impact is limited
      to victim conversation read/last-seen state.

### Proof Tuple And Evidence

- Source: a request from a malicious sibling origin within the victim portal's
  schemeful site, using the fixed `private:me` route.
- Closest control: cookie authentication at
  `chat-presence/routes.ts:42-49`; the route omits
  `assertAllowedTenantOrigin`, although that exact control exists at
  `lib/origin.ts:47-58` and is used by neighboring state-changing routes.
- Sink: `chat-presence/service.ts:186-191` invokes the Chatwoot public
  `update_last_seen` operation.
- Impact: unauthorized mutation of the victim's read/last-seen state, which can
  create a false read receipt and interfere with unread-state expectations.
- Preconditions: a logged-in victim, a hostile origin that is cross-origin but
  same-site with the tenant portal, and a reachable private conversation.

The existing route test succeeds without any `Origin` header and returns 204;
the targeted suite passed. The same cookie uses `SameSite=Lax` at
`auth/sessionCookie.ts:6-14` on both baselines.

### Attack Path

1. The victim authenticates to the portal and receives the signed HttpOnly
   session cookie.
2. The victim visits a hostile same-site sibling origin.
3. That origin submits a simple POST to
   `/api/chat/threads/private%3Ame/read`; the route performs no origin check.
4. The backend resolves the victim session and private thread, then calls
   Chatwoot `update_last_seen` as the victim contact.

### Attack Path Facts

- Assumptions/context: cross-user request forgery, but only the victim's own
  conversation metadata is affected.
- In scope/exposure/vector: public portal API through Caddy `/api/*`; remote;
  authenticated-by-cookie but attacker-initiated.
- Cross-boundary/input: verified browser-to-backend boundary crossing; input
  control is yes for the request and fixed thread path.
- Auth scope/impact surface/target reach: customer session; data/integration
  state; one victim conversation per request.
- Mitigations: signed HttpOnly cookie, tenant and thread authorization, 5-second
  process-local repeat throttle. These do not validate origin.
- Counterevidence: exploitation requires a same-site sibling origin and the
  effect does not read data, send messages, change identity or cross tenants.
- Blindspot: repository evidence names and tests the external `update_last_seen`
  call but does not include independent Chatwoot UI/notification semantics.
- Confidence: medium because the source/control/sink is exact while downstream
  user-visible consequence is bounded and partly external.

### Severity And Policy

Impact is medium only in the narrow integrity/notification sense; likelihood is
medium because a hostile same-site sibling is required. Mechanical policy
calibration yields Low/P3, not High/Critical.

<a id="deep-r1-f02"></a>

## DEEP-R1-F02 — Unsigned delivery identifier replay/dedupe bypass

Disposition: `rejected`; None; high confidence.

### Validation Rubric

- [x] The delivery header is not HMAC-covered.
- [x] A changed header selects a new tenant-scoped dedupe key.
- [x] Synthetic execution confirms repeated acceptance and realtime publication
      for the same signed body under two header values.
- [x] The strongest attacker-source counterevidence was traced.
- [x] Historical and current implementations are identical.

### Proof Tuple And Evidence

The mechanism is real: `signature.ts:33-46,59-96` covers timestamp and raw body,
while `service.ts:131-141,275-281` prefers the separate delivery header.
`repository.ts:93-112` and `db/schema.ts:319-343` dedupe only on tenant plus
that selected key. The bounded reproduction in
`poc/reproduction.test.ts` accepted the same body and signature twice after
changing only the delivery header and published twice.

The candidate fails at the realistic lower-privileged source boundary. The
signature and tenant webhook secret remain backend/integration inputs; the
repository search found no browser exposure or route that reveals a valid
signed request. An unauthenticated caller cannot create the starting signed
request. A party already controlling the webhook secret or trusted sender can
sign an arbitrary new body, so the unsigned-header distinction adds no proven
privilege or capability. Accidental trusted-upstream redelivery is a
correctness/reliability scenario, not the claimed attacker path.

### Attack Path Facts

- Assumptions/context: requires prior possession of a still-fresh valid raw
  body, timestamp and HMAC, or compromise of the signing authority.
- In scope/exposure/vector: the route is public and remote, but the required
  authenticated webhook material is not shown attacker-reachable.
- Cross-boundary/input: header control is yes only after an unproven signature
  acquisition; no lower-privileged boundary crossing is established.
- Auth scope/impact surface: signed integration-only; repeated realtime/push
  work is mechanically possible.
- Mitigations: HMAC over timestamp/body, five-minute tolerance, tenant payload
  invariants, TLS reference ingress and backend-held tenant secret.
- Counterevidence: no repository path leaks the signature/secret, and signing
  authority already permits arbitrary fresh signed events. This is dispositive
  for security reportability.
- Blindspot: no external Chatwoot/provider contract proves whether its delivery
  identifier is intended to be HMAC-bound, but that does not supply an attacker
  source.
- Confidence: high for rejection of the supplied security claim; the mechanical
  hardening opportunity remains independently demonstrated.

### Severity And Policy

The required lower-privileged attacker path is absent. Final policy decision is
ignore/rejected with severity None.

<a id="deep-r1-f03"></a>

## DEEP-R1-F03 — Existing portal-admin authority after Chatwoot revocation

Disposition: `confirmed_medium_or_low`; Medium; high confidence.

### Validation Rubric

- [x] A previously eligible administrator can retain a valid portal cookie
      after upstream role/confirmation/account eligibility changes.
- [x] Current-session resolution checks tenant, token hash and expiry only.
- [x] The guard accepts the persisted administrator role without a current
      Chatwoot decision.
- [x] The stale session reaches tenant-admin read and mutation operations.
- [x] `F-SEC-003` does not subsume this tuple because its fix rechecks only
      immediately before session creation.

### Proof Tuple And Evidence

- Source: a valid 12-hour portal-admin session issued before the administrator
  is demoted, disabled or otherwise made ineligible in Chatwoot.
- Closest control: `adminAuthRepository.ts:399-420` verifies only tenant, token
  hash and expiration; `adminAuthService.ts:59-80` touches and returns the
  stored role. The live eligibility rules at
  `adminVerification.ts:54-68,77-157` are not called.
- Sink: `adminSessionGuard.ts:19-47` admits the session to protected operations,
  including branding changes (`branding/routes.ts:188-248`), legal uploads
  (`legal-documents/routes.ts:182-206`) and Telegram bridge setup
  (`telegram-bridge-admin/routes.ts:35-54`).
- Impact: a revoked administrator retains same-tenant privileged read/write
  authority for the remaining session lifetime.
- Preconditions: the actor was legitimately authorized when the session was
  issued, retains the cookie, is later revoked upstream, and acts before the
  12-hour expiry or explicit portal logout.

### Attack Path

1. Chatwoot eligibility is established and the portal issues a session.
2. Chatwoot later revokes the actor's administrator eligibility.
3. The actor sends a protected portal-admin request with the existing cookie.
4. The portal checks only its session row and accepts the stored administrator
   snapshot.
5. The actor reads or mutates tenant-controlled administrative resources.

### Attack Path Facts

- Context/in scope: real tenant-admin authority lifecycle and a meaningful
  upstream-to-portal trust boundary.
- Exposure/vector: public portal API; remote; authenticated using a previously
  legitimate session.
- Identity/cross-boundary: persisted Chatwoot agent id/email/role continues to
  authorize after the upstream identity state changes.
- Preconditions/input: plausible but time-bound; the actor must retain a valid
  session issued before revocation.
- Category/impact: authorization staleness; same-tenant data, branding, legal
  content and integration configuration.
- Mitigations: exact tenant binding, signed cookie, explicit logout and fixed
  12-hour expiration.
- Counterevidence: session snapshot semantics avoid a live upstream call per
  request and the window is bounded. These reduce likelihood/impact but do not
  make revocation effective.
- Blindspots: no repository evidence establishes an external revocation SLA or
  out-of-band invalidation webhook.
- Confidence: high; source, missing control, guard and protected sinks are
  exact.

### Severity And Policy

Impact is high enough to be security-relevant but limited to one tenant and a
previously authorized actor; likelihood is unknown/medium within a 12-hour
window. Mechanical calibration yields Medium/P2, not High/Critical.

<a id="deep-r1-f04"></a>

## DEEP-R1-F04 — Non-evicting presence throttle maps

Disposition: `duplicate` of `F-LOAD-006`; Medium; high confidence.

### Validation Rubric

- [x] Successful authorized user/thread combinations create process-lifetime
      keys.
- [x] Read keys have no delete/expiry path.
- [x] Typing keys are removed only after a successful matching `off` request.
- [x] Cardinality and cross-replica limitations match the existing finding.
- [x] `F-LOAD-006` remediation closes the complete tuple.

### Proof And Attack-Path Facts

`app.ts:137-140,241-263` creates two application-lifetime maps shared by
request-scoped services. `chat-presence/service.ts:118-191` adds one read key
per successful tenant/user/thread tuple without deletion. Lines 208-310 add a
typing key and delete it only on a successful `off`. An authenticated user can
cycle through authorized threads/users over process lifetime; separate
replicas also have separate throttle state.

- Vector/auth scope: remote authenticated customer.
- Impact surface: runtime memory and upstream request throttling; no tenant or
  data confidentiality break.
- Controls: authorization, overwrite of repeated same keys, frontend debounce,
  process restart, short 5s/3s windows.
- Counterevidence: only successful authorized tuples allocate; a single user
  has bounded currently authorized threads. SaaS-wide tenant/user/thread churn
  remains unbounded over process lifetime.
- Existing remediation subsumption: `F-LOAD-006` requires TTL/size-bounded
  eviction, shared/routed cross-replica behavior and cardinality testing, which
  closes both the memory and replica-throttle tuple.

Policy: preserve the existing Medium operational/load finding; do not create a
second security finding.

<a id="deep-r1-f05"></a>

## DEEP-R1-F05 — Admin membership enumeration through challenge behavior

Disposition: `duplicate` of `F-AUTH-002`; Medium; high confidence.

### Validation Rubric

- [x] The challenge request is unauthenticated but exact-origin checked.
- [x] Live Chatwoot eligibility selects distinct public response behavior.
- [x] Ineligible identities receive explicit 403; eligible identities proceed
      to a success response and email delivery.
- [x] Rate limiting reduces query rate but does not remove the oracle.
- [x] `F-AUTH-002` remediation fully closes the response-oracle tuple.

### Proof And Attack-Path Facts

`adminAuthRoutes.ts:76-86` exposes the request route. The service performs live
eligibility at `adminAuthService.ts:89-106`; the public mapping at
`adminAuthPrimitives.ts:92-97,156-166` returns explicit
`TENANT_ADMIN_NOT_ELIGIBLE`. The integration test at
`app-admin-auth.integration.test.ts:266-287` asserts the 403 behavior.
`auth/rateLimit.ts:17-37,86-132` permits five tenant/host+IP attempts per minute
per process.

- Vector/auth scope: remote, public, same-origin request; an attacker can use
  their own browser/origin access and candidate email list.
- Cross-boundary impact: confirms tenant administrator membership/eligibility,
  enabling targeted phishing or credential attacks.
- Controls: five/minute IP limiter, origin check, no challenge/session for
  ineligible identities.
- Counterevidence: the oracle is rate-limited and does not disclose account
  secrets or itself grant authority.
- Existing remediation subsumption: `F-AUTH-002` requires indistinguishable
  public semantics while retaining internal delivery/audit outcomes, exactly
  closing source/control/sink/impact.

Policy: preserve the existing Medium privacy finding and avoid duplication.

<a id="deep-r1-f06"></a>

## DEEP-R1-F06 — Unthrottled repeated profile-avatar upstream writes

Disposition: `rejected`; None; high confidence.

### Validation Rubric

- [x] The route is authenticated and exact-origin protected.
- [x] Each request is limited to one file and approximately 15 MiB.
- [x] Each accepted request buffers once and performs one upstream avatar write.
- [x] No route-specific rate limiter was found.
- [x] The claimed security impact was challenged against proportionality,
      authority and existing controls.

### Proof Tuple And Counterevidence

The operation is reachable: `profile/routes.ts:108-165,208-223` accepts one
same-origin authenticated multipart upload, buffers it, and invokes
`profile/service.ts:174-215`, which writes only the current user's linked
Chatwoot contact avatar. `avatarValidation.ts:4-49` and multipart limits cap the
request at 15 MiB and restrict the claimed MIME family. There is no
route-specific rate limiter.

The missing limiter does not by itself establish a reportable security issue.
The authenticated actor supplies essentially the same bytes the portal
buffers/forwards, can change only their own linked contact, and gains no
cross-tenant, cross-user, identity or secret access. Resource cost is bounded
per request and roughly proportional to attacker bandwidth; upstream calls
have configured deadlines. No bounded reproduction or repository telemetry
shows service-wide exhaustion, durable corruption, provider-cost escalation or
meaningful amplification from this route.

### Attack Path Facts

- Vector/auth scope: remote authenticated customer, exact same-origin.
- Input/control: yes; one file, one part, request/body limit, size/MIME checks.
- Impact surface: self-profile and proportional backend/upstream resources.
- Target reach: one linked contact per request.
- Counterevidence: self-only mutation, per-request bounds and no demonstrated
  major availability effect are dispositive under the security policy.
- Blindspot: production rate/latency/cost telemetry is unavailable, but missing
  telemetry is not affirmative proof of the claimed impact.
- Confidence: high that the supplied security claim is not reportable; adding
  bounded admission remains reasonable load hardening.

### Severity And Policy

The demonstrated impact is self-only/proportional and does not establish a
realistic major availability compromise. Final policy decision is
ignore/rejected with severity None.

<a id="deep-r1-f07"></a>

## DEEP-R1-F07 — Database transaction/advisory-lock convoy across Chatwoot calls

Disposition: `duplicate` of `F-LOAD-002`; Medium; high confidence.

### Validation Rubric

- [x] The transaction acquires a transaction-scoped advisory lock.
- [x] The handler is awaited before transaction completion.
- [x] The handler performs external Chatwoot calls while the transaction/lock
      remains open.
- [x] authenticated cold/recovery operations can produce same-key waiters.
- [x] `F-LOAD-002` remediation fully closes the tuple.

### Proof And Attack-Path Facts

`chat-threads/repository.ts:92-107` opens a transaction, acquires
`pg_advisory_xact_lock`, then awaits the supplied handler. The handler at
`chat-threads/runtime.ts:240-369` performs external source-id and conversation
creation calls at lines 287-290 and 326-330 before it can release the
transaction. Same contact/thread bootstrap requests enter at lines 373-395.

- Vector/auth scope: remote authenticated customer with a cold or stale
  writable thread; repeated/concurrent requests are possible.
- Impact: database pool occupancy and same-key convoy can track external
  latency, reducing shared availability.
- Controls: key-scoped serialization prevents duplicate conversation creation;
  established threads bypass bootstrap; external calls have deadlines.
- Counterevidence: the path is cold/recovery-only rather than every request and
  requires the same target contact for the strongest convoy.
- Existing remediation subsumption: `F-LOAD-002` moves external work behind a
  durable short-transaction claim and tests pool contention, closing the exact
  transaction/lock/external-I/O path.

Policy: preserve the existing Medium load finding; no separate security record
is warranted.

<a id="deep-r1-f08"></a>

## DEEP-R1-F08 — Process-local authentication throttling

Disposition: `duplicate` of `F-AUTH-001`; Low; high confidence.

### Validation Rubric

- [x] Each Fastify process owns an independent limiter map.
- [x] The map is bounded and expiry-pruned.
- [x] Public auth groups are keyed by route group plus tenant/host and IP, not
      account/code identity.
- [x] The reference deployment represents one backend process, so
      cross-replica bypass is not currently instantiated there.
- [x] `F-AUTH-001` remediation closes the conditional multi-instance tuple.

### Proof And Attack-Path Facts

`auth/rateLimit.ts:86-132` constructs one map inside each
`registerAuthRateLimit` call. Public groups are enumerated at lines 17-37 and
keyed at lines 53-60. The map is capped at 10,000 and pruned/trimmed at lines
63-84,113-116. Default policy is five attempts per minute. The reference
`infra/production/compose.yaml:66-127` defines one `portal-backend` service and
no replica count.

- Vector/auth scope: remote public authentication requests.
- Cross-boundary behavior: alternating replicas would multiply the allowance,
  but the supplied reference topology has no second replica.
- Controls: tenant/route/IP key, five/minute default, retry-after, bounded map.
- Counterevidence: current represented production is single-process, so the
  cross-replica bypass is conditional rather than active.
- Existing remediation subsumption: `F-AUTH-001` requires a bounded shared
  production authority before horizontal scaling while preserving single-node
  development and response semantics. That exactly closes the family.

Policy: Low conditional risk already registered; no new finding.

<a id="deep-r1-f09"></a>

## DEEP-R1-F09 — Chat search history-call amplification

Disposition: `confirmed_medium_or_low`; Medium; high confidence.

### Validation Rubric

- [x] An authenticated participant controls repeated search requests, thread,
      cursor and a low-match query.
- [x] Search scans up to eight pages and has no route-specific request limiter.
- [x] Each page independently resolves every unique missing reply target with
      unbounded-per-page `Promise.all` fanout.
- [x] The real message client turns history pages and reply lookups into
      authenticated Chatwoot requests, with extra anchor/older probes.
- [x] Synthetic execution reproduced `8` page calls plus `160` reply lookups
      for one bounded request.

### Proof Tuple And Evidence

- Source: a logged-in customer repeatedly requests a valid accessible thread
  with a query unlikely to match while the scanned pages contain distinct
  off-page reply targets. Portal send APIs allow the customer to build reply
  history over time.
- Closest control: authentication and thread authorization, query length 2-80,
  maximum eight pages and 20 results. There is no search-specific rate limit,
  per-request reply-lookup budget, cache or total upstream-call cap.
- Sink: `searchService.ts:189-258` scans eight pages;
  `messageMapping.ts:285-325` launches one lookup per missing reply target;
  `messageClient.ts:64-129,181-198,221-278` performs Chatwoot HTTP history
  calls and additional cursor/older probes.
- Impact: a single portal request can create 168 high-level Chatwoot client
  operations in the reproduced shape, plus the lower-level list-page probes;
  concurrent repetition can consume backend outbound capacity and Chatwoot
  request capacity disproportionately.
- Preconditions: valid customer session, accessible conversation with up to
  eight populated pages and distinct missing reply targets, and repeated or
  concurrent queries.

### Attack Path

1. An authenticated customer selects an authorized conversation with deep
   history and off-page reply targets.
2. The customer sends a no-match search query, forcing the full eight-page scan.
3. Every page lists history and fans out up to 20 reply-target lookups.
4. The customer repeats requests concurrently; no search admission budget
   limits aggregate work.
5. The portal and Chatwoot spend substantially more requests than the attacker
   sends, degrading shared service capacity.

### Attack Path Facts

- Context/in scope: shared SaaS runtime availability is explicitly protected;
  the route is a real customer workflow.
- Exposure/vector/auth: public portal `/api/*`; remote authenticated customer.
- Cross-boundary/input: verified backend-to-Chatwoot amplification from one
  customer request; input control is yes for query/repetition and plausible for
  the reply-history shape.
- Category/impact surface/target reach: application-layer resource
  amplification; runtime, network and one tenant's Chatwoot account, with
  possible shared backend effects.
- Mitigations: exact thread authorization, eight-page/20-result bound, query
  validation, upstream deadlines and natural history requirements.
- Counterevidence: exploitation needs prepared or naturally suitable history;
  calls are bounded per request; impact is availability rather than data or
  identity compromise.
- Blindspots: no production connection-budget, Chatwoot rate-limit or latency
  telemetry was supplied.
- Controls: no route-level rate limit, cache, reply lookup concurrency budget
  or total call budget appears on the exact path.
- Confidence: high for the bounded amplification path; no claim of actual
  production outage is made.

### Severity And Policy

Impact is medium shared-resource pressure and likelihood is high/medium for an
authenticated malicious customer after modest history preparation. Mechanical
calibration yields Medium/P2. The bounded, authenticated availability effect
does not support High/Critical.
