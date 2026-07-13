# Stage 01: Architecture Invariants And Trust Boundaries

Status: complete
Frozen commit: `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`

This stage is a static architecture and authority review of the frozen source.
It does not replace the independent threat models required by the Deep Security
Scan, and its report will not be supplied to those discovery workers.

## Tenant Resolution And Admission Trace

| Step                          | Control                                                                                                                                                                                                                                                                                                                                                                                                                 | Fail-closed behavior                                                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public ingress                | The reference deployment exposes only `portal-web`; Caddy routes `/api/*` to the internal backend and `/telegram-bridge/*` to the separate bridge (`infra/production/compose.yaml:164-179`; `infra/production/Caddyfile:14-22`).                                                                                                                                                                                        | Backend, Postgres, object storage and the Telegram bridge have no direct host port in the reference compose topology.                                                                                                     |
| Host selection                | Fastify uses `trustProxy: PORTAL_TRUST_PROXY`, which defaults to false (`backend/src/app.ts:99-107`; `backend/src/config/env.ts:155-168`).                                                                                                                                                                                                                                                                              | `X-Forwarded-Host` affects `request.hostname` only in explicit trusted-proxy mode; tests cover both modes (`backend/src/modules/tenants/routes.test.ts:793-834`).                                                         |
| Pre-route tenant hook         | `registerTenantContext` is registered before auth, admin, chat, notification, realtime and webhook routes (`backend/src/app.ts:383-482`). Its `onRequest` hook resolves every `/api/*` request except `/api/health` (`backend/src/modules/tenants/routes.ts:46-74,242-260`).                                                                                                                                            | Protected runtime cannot construct request-scoped services without `requireTenantContext`; a missing context is a controlled 500 rather than a default-tenant fallback (`backend/src/modules/tenants/routes.ts:228-240`). |
| Host normalization and lookup | The service strips a numeric port, lowercases and validates a hostname, then performs an exact `primary_domain` lookup (`backend/src/modules/tenants/service.ts:50-72,206-231`; `backend/src/modules/tenants/repository.ts:235-244`).                                                                                                                                                                                   | Invalid host is 400, unknown host is 404 and non-active tenant is 503. `resolveDefaultTenant` exists but has no runtime caller.                                                                                           |
| Secret materialization        | Only after an active tenant row is selected, the backend decodes `PORTAL_TENANT_SECRET_KEY` and decrypts the tenant Chatwoot API token and webhook secret into request context (`backend/src/modules/tenants/service.ts:75-108,138-183`).                                                                                                                                                                               | Missing/invalid key or ciphertext returns a controlled 500. `getPublicTenantContext` exposes only display name, domain, public URL and slug (`backend/src/modules/tenants/service.ts:197-203`).                           |
| Request-scoped authority      | `backend/src/app.ts:154-380` derives Chatwoot clients and repositories from the resolved tenant ID/config. Customer auth receives tenant ID on login/session lookup; tenant-admin services are also built from the request tenant.                                                                                                                                                                                      | Unknown/inactive tenant fails before session lookup, external calls or webhook processing. Exact tenant origin is required on mutating routes (`backend/src/lib/origin.ts:17-58`).                                        |
| Browser admission             | `TenantProvider` scopes startup cache by `window.location.host`, fetches `/api/tenant`, and removes tenant/auth/chat startup state after authoritative tenant rejection (`frontend/src/features/tenant/lib/TenantProvider.tsx:119-180,265-314`). Customer and admin routes use separate providers (`frontend/src/app/layouts/CustomerAuthBoundary.tsx:5-10`; `frontend/src/app/layouts/AdminSessionBoundary.tsx:5-10`). | Cached tenant identity is an offline presentation aid, not backend authority. Online tenant rejection wins over cache; protected API calls still require a live backend session.                                          |
| Telegram exception            | The standalone Telegram bridge intentionally does not infer tenant from Host. It resolves an active tenant through a bridge public key plus encrypted path secret and a constant-time Telegram secret-header check (`backend/src/telegram-bridge/server.ts:281-325`; `backend/src/telegram-bridge/configRepository.ts:137-234`; `backend/src/telegram-bridge/service.ts:220-253`).                                      | Missing/wrong secrets, inactive config/tenant, invalid content type and oversized bodies are rejected or ignored through generic responses. Secret URL segments are redacted from request logs.                           |

The ordinary portal runtime is therefore host-first and has no active
default-tenant fallback. The main caveat is operational: `trustProxy` is a
boolean rather than a proxy CIDR/function allowlist. The reference topology
keeps the backend internal, which materially bounds forwarded-host spoofing.

## External Trust-Boundary Map

| Boundary                       | Trusted basis                                                                           | Untrusted input                                                                                                | Credential owner                                                                                                    | Authoritative data                                                                                               | Entrypoints / outbound calls                                                                      | Failure and tenant scope                                                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reverse proxy -> backend       | Controlled DNS/TLS and reference internal network                                       | `Host`, forwarded headers, path, request metadata                                                              | TLS keys belong to ingress; no backend credential enters the browser                                                | Canonical request hostname selects tenant                                                                        | Caddy/Nginx -> Fastify `/api/*`                                                                   | Invalid/unknown/inactive hosts fail before runtime. Forwarded host is trusted only when configured; tenant scope is the normalized host.                                           |
| Browser -> portal backend      | Signed HttpOnly host-only session cookie after backend admission                        | All route params, bodies, cached IndexedDB/local state, push endpoint and admin-supplied Telegram setup values | Browser owns only its signed customer/admin cookies and public VAPID key; Chatwoot/VAPID/S3/SMTP secrets are absent | Browser cache is non-authoritative; backend session and DB state decide access                                   | Same-origin `/api`; SSE is also same-origin                                                       | Origin checks protect mutations. Authoritative tenant rejection clears startup state. Candidate `ARCH-001` identifies an open-SSE lifetime gap.                                    |
| Portal backend                 | Validated env plus active decrypted tenant context                                      | Browser requests, Chatwoot/Telegram webhooks and all external responses                                        | Backend owns session signing, tenant decryption, Chatwoot, SMTP, VAPID and object-storage credentials               | Auth/session, portal thread mapping, send ledger, unread state, legal/branding/admin state                       | Postgres, Chatwoot, SMTP, Web Push, object storage and Telegram APIs                              | Request services are tenant-scoped. External errors are mapped to controlled API states; several boundedness gaps remain candidates below.                                         |
| Portal Postgres                | Repository schema/migrations and reference isolated `DATABASE_URL`                      | Application values after validation; operator connection configuration                                         | Portal backend/maintenance process                                                                                  | Portal users/sessions, mappings, ledgers, preferences and tenant configuration                                   | Drizzle/`pg`; migrations before server start (`backend/src/server.ts:6-24`)                       | Reference local/production compose uses a separate DB/user/volume. Tenant-owned tables use direct `tenant_id` or a tenant-owned parent; exhaustive query proof remains Task 5.     |
| Object storage                 | Tenant-scoped DB metadata and server-created object keys                                | Uploaded bytes, filename and MIME claim                                                                        | Backend application S3 credentials; root credentials stay in init container                                         | DB metadata decides whether an object is addressable; storage owns bytes                                         | Backend Get/Put/Delete only (`backend/src/integrations/object-storage/brandingStorage.ts:58-134`) | Upload is size/magic-byte checked; keys include tenant ID; missing storage fails 503. No direct S3 URL or credential reaches the browser.                                          |
| Chatwoot                       | Tenant-specific account/inbox config, backend token and signed webhook secret           | API responses, webhook JSON, attachment URLs and administrator eligibility data                                | Backend decrypts tenant runtime/admin-verification tokens; browser has none                                         | Chatwoot remains source of record for contacts, conversations, messages and current administrator role           | Backend REST calls with configured timeout; signed `/api/chatwoot/webhooks`                       | Tenant account/inbox/mapping checks and tenant-scoped repositories bound data. Candidates cover send-key scope, current admin-role admission, webhook field strictness and fanout. |
| SMTP                           | Server-side destination chosen by auth/admin workflow                                   | Provider behavior and delivery errors                                                                          | Backend SMTP credential                                                                                             | Provider delivery result; portal verification/challenge row controls later proof                                 | Nodemailer send from request path                                                                 | Configuration/delivery errors are generic. SMTP is global rather than tenant-specific; explicit timeout/TLS hardening remains a later review item.                                 |
| Web Push                       | Authenticated tenant user, allowlisted HTTPS endpoint origin and tenant preference rows | Browser endpoint/key material and provider response                                                            | Backend VAPID private key; browser receives public key only                                                         | Portal DB owns subscription/preferences/delivery attempt state                                                   | `web-push` transport with five-second timeout                                                     | Payload excludes message body; expired endpoints are disabled. Delivery is best effort and tenant/user scoped, but group recipient discovery is unbounded (`ARCH-008`).            |
| Telegram -> bridge -> Chatwoot | Active bridge config joined to active tenant plus three-part webhook proof              | Path values, secret header, JSON update and upstream responses                                                 | Encrypted bot/runtime tokens are decrypted server-side; tenant admin enters the bot token once over same-origin API | Telegram update ID and tenant bridge config determine dedupe/routing; Chatwoot owns resulting conversation state | Separate bridge service calls Telegram and Chatwoot with timeouts                                 | Body limit, content type, secret comparisons, config+update dedupe and redacted logs fail closed within the resolved config tenant.                                                |

## Required Architecture Invariants

| Invariant                                                    | State             | Direct evidence                                                                                                                                                                                                                                           | Counterevidence / limitation                                                                                                                                                                            |
| ------------------------------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant before auth/runtime                                   | `confirmed`       | Tenant hook registration precedes every protected route; all request factories call `requireTenantContext` (`backend/src/app.ts:383-482`).                                                                                                                | `/api/health` is intentionally tenant-optional; standalone Telegram uses secret-to-config lookup instead of Host.                                                                                       |
| No browser Chatwoot authority                                | `confirmed`       | Production clients use same-origin `/api`; CSP has `connect-src 'self'`; attachment/avatar URLs are backend proxy URLs. Static production-frontend search found no Chatwoot token/base URL secret.                                                        | Browser contracts contain Chatwoot-derived numeric identifiers and tenant admin enters a bot token, but neither grants direct Chatwoot authority.                                                       |
| Isolated portal DB                                           | `confirmed`       | Local and production compose define separate portal Postgres; only portal schema is imported by `backend/src/db/client.ts:5-33`.                                                                                                                          | Isolation depends on operator-supplied `DATABASE_URL`; a runtime DB identity sentinel is not present. This is recorded as hardening, not evidence that the reference deployment is mixed.               |
| Tenant-scoped portal data                                    | `needs_follow_up` | Tenant-owned schema rows have direct `tenant_id`; `portal_tenants` is the root, provisioning runs are operator-owned and Telegram deliveries inherit config scope. Request repositories are normally constructed with tenant ID.                          | Task 5 must prove every repository query, composite constraint, migration and index. Architectural inventory alone cannot rule out an unscoped query.                                                   |
| Separate customer/admin sessions                             | `violated`        | Separate tables, tokens, services, frontend providers and default cookie names are present.                                                                                                                                                               | Env validation accepts identical customer/admin cookie names, allowing browser-level overwrite/clear interference (`ARCH-007`). Admin eligibility and lifecycle gaps are `ARCH-003` through `ARCH-006`. |
| Portal-owned thread authority                                | `confirmed`       | Public IDs are parsed as `private:me` or `group:<contact-id>`; backend resolves current linked person and current Chatwoot group attributes before mapping to tenant-scoped `portal_chat_threads` (`backend/src/modules/chat-threads/runtime.ts:65-193`). | Open realtime subscriptions do not continuously apply session/user authority; this is classified under backend-owned realtime rather than initial thread mapping.                                       |
| Backend-owned send/realtime                                  | `violated`        | Send, canonical reads, webhook routing and SSE all pass through backend tenant/session/thread services.                                                                                                                                                   | Send idempotency scopes disagree across portal and Chatwoot (`ARCH-002`); an admitted SSE outlives session/user authority and typing skips membership revalidation (`ARCH-001`).                        |
| Chatwoot system of record                                    | `confirmed`       | Transcript pages and individual messages are read from Chatwoot; sends create/recover a Chatwoot message; webhooks reread canonical snapshots. Portal stores mappings, dedupe/unread and send metadata, not transcript bodies.                            | Availability and correctness depend on external Chatwoot contracts; Task 6 owns the full contract review.                                                                                               |
| Current Chatwoot admin authority before portal-admin session | `violated`        | Initial request checks exact tenant account, email, confirmed status and administrator role.                                                                                                                                                              | Verify consumes the stored challenge and creates a 12-hour session without repeating Chatwoot eligibility (`ARCH-003`).                                                                                 |

## Candidates

### ARCH-001: Open SSE streams outlive customer session and access authority

- Status: `candidate`
- Severity hypothesis: Medium
- Confidence: high
- Evidence: `backend/src/modules/chat-realtime/routes.ts:44-111` validates the
  customer and thread only at connection time, then stores only tenant, thread
  and user identifiers. Message fanout rebuilds thread state but not session
  state (`backend/src/modules/chat-realtime/hub.ts:92-125`). An existing contact
  link is accepted without checking `portal_users.is_active`
  (`backend/src/modules/chat-threads/service.ts:93-105` and
  `contactRepository.ts:19-34`). Typing fanout performs no per-user check
  (`hub.ts:128-159`).
- Reachability and impact: after logout, session expiry/revocation or user
  deactivation, a client that keeps the already-admitted transport open can
  continue receiving later full message snapshots. After group-membership
  revocation, snapshot delivery stops but transient agent-typing state can
  still arrive. The stream has no backend max lifetime or periodic session
  revalidation.
- Counterevidence: initial connection validates tenant, live session and thread;
  fanout keys include tenant/thread; group message snapshots revalidate current
  membership; the normal React client closes EventSource on unmount
  (`frontend/src/features/chat/pages/useChatRealtimeConnection.ts:159-161`).
- Missing test / validation contract: open SSE, revoke/logout/expire the
  session or deactivate the user, deliver a signed webhook and assert the
  server closes or withholds the event. Separately revoke group membership and
  assert both messages and typing are withheld.

### ARCH-002: Portal and Chatwoot use different idempotency-key scopes

- Status: `candidate`
- Severity hypothesis: Medium
- Confidence: high
- Evidence: API accepts an arbitrary 1-200 character `clientMessageKey`
  (`backend/src/modules/chat-messages/routes.ts:48-64`). Portal ledger uniqueness
  includes user (`backend/src/db/schema.ts:262-267`), while Chatwoot recovery
  searches `conversationId + sourceId`
  (`backend/src/integrations/chatwoot/messageClient.ts:201-218`). A portal
  source ID is returned to every group reader as `clientMessageKey`
  (`backend/src/modules/chat-messages/messageMapping.ts:198-200,249-274`).
  After a second user acquires a separate ledger row, the pre-send lookup
  accepts the first user's message without comparing its payload
  (`backend/src/modules/chat-messages/sendLedger.ts:281-299`).
- Reachability and impact: group user B reads user A's key and submits different
  text or an attachment with it. B's payload is not sent; B's ledger row is
  confirmed against A's Chatwoot message. Multiple ledger rows then compete for
  the same message author in an unordered `Map`
  (`backend/src/modules/chat-threads/repository.ts:110-149`), so group
  attribution/avatar can be corrupted.
- Counterevidence: normal UI keys are random UUIDs; tenant/thread access is
  enforced; same-user reuse with a different payload returns a conflict.
  Existing repository tests deliberately allow the same key for different
  users but do not exercise the end-to-end Chatwoot replay path
  (`backend/src/modules/chat-messages/repository.test.ts:194-277`).
- Missing test / validation contract: two authorized group users submit the
  same source key with different payloads through the service/API; the second
  request must neither alias the first Chatwoot message nor change its
  attribution, and no ambiguous ledger rows may exist.

### ARCH-003: Chatwoot administrator role is not rechecked at code verification

- Status: `candidate`
- Severity hypothesis: Medium
- Confidence: high
- Evidence: `verifyTenantAdminEmail` is called only while requesting a challenge
  (`backend/src/modules/tenant-admin/adminAuthService.ts:82-106`). Verify reads
  the stored challenge, validates its code and directly creates a 12-hour
  session (`adminAuthService.ts:327-442`). The approved MT-9 spec explicitly
  requires a role recheck and a downgrade-between-request-and-verify test
  (`docs/superpowers/specs/2026-06-06-mt-9-tenant-admin-branding-prep.md:293-301,496-504`).
- Reachability and impact: an administrator requests a code, is downgraded or
  removed in Chatwoot, then redeems the still-valid 15-minute challenge and
  receives portal-admin authority over branding/legal/Telegram configuration
  for 12 hours.
- Counterevidence: request-time validation checks tenant account, normalized
  email, confirmed status and exact administrator role; the attacker still
  needs the email code; tenant isolation remains intact.
- Missing test / validation contract: change the mocked/current Chatwoot role to
  agent after request but before verify and assert that no session row/cookie is
  created and the denial is audited.

### ARCH-004: Admin login request reveals administrator eligibility

- Status: `candidate`
- Severity hypothesis: Medium
- Confidence: high
- Evidence: eligible email receives success and a code, while unknown or
  non-admin email receives `403 TENANT_ADMIN_NOT_ELIGIBLE`
  (`backend/src/modules/tenant-admin/adminAuthPrimitives.ts:92-97`;
  `backend/src/app-admin-auth.integration.test.ts:266-287`). The approved spec
  requires a generic public request response
  (`docs/superpowers/specs/2026-06-06-mt-9-tenant-admin-branding-prep.md:496-504`).
- Reachability and impact: an unauthenticated caller can test candidate email
  addresses and identify tenant administrators, improving phishing and account
  targeting.
- Counterevidence: unknown and ordinary-agent addresses are indistinguishable;
  tenant+IP auth rate limiting defaults to five requests per minute; no session
  or code is created for an ineligible address.
- Missing test / validation contract: eligible and ineligible public requests
  must have indistinguishable status/body semantics while only the eligible
  path sends mail and internal audit preserves the real outcome.

### ARCH-005: Every admin session check writes the same session row

- Status: `candidate`
- Severity hypothesis: Medium
- Confidence: high
- Evidence: every successful `getCurrentAdminSession` performs an unconditional
  `touchSession` (`backend/src/modules/tenant-admin/adminAuthService.ts:59-79`),
  which updates `last_seen_at` and `updated_at`
  (`adminAuthRepository.ts:423-435`). The guard is used by `/me` and protected
  branding, legal and Telegram routes.
- Failure/load path: each admin API request/tab produces one session SELECT plus
  one UPDATE/WAL write against the same row. There is no threshold/debounce,
  creating write amplification and a hot row as activity grows 10x/100x.
- Counterevidence: administrator traffic is expected to be much lower than
  customer traffic; the update is indexed by session primary key and tenant.
- Missing test / validation contract: choose a bounded touch interval (or remove
  the unused write), prove multiple checks inside the interval do not update,
  and prove the first check after the interval does.

### ARCH-006: Expired admin sessions and completed challenges have no retention path

- Status: `candidate`
- Severity hypothesis: Medium
- Confidence: high
- Evidence: maintenance cleanup imports customer sessions and other runtime
  ledgers but not `portal_admin_sessions` or
  `portal_admin_login_challenges`
  (`backend/src/modules/maintenance/cleanup.ts:1-57`). Admin sessions are deleted
  only on explicit logout (`adminAuthRepository.ts:438-446`); verified/expired
  challenges are updated, not eventually purged.
- Failure/load path: abandoned expired sessions and challenge history grow
  without a bound across tenants and years, increasing table/index size and
  backup/restore cost. Admin audit events also lack a documented archive or
  retention policy, but their desired lifetime is a separate product/legal
  choice.
- Counterevidence: rows are small and administrator login volume is lower than
  customer volume; audit history may intentionally require long retention.
- Missing test / validation contract: define retention separately for expired
  sessions, terminal challenges and audit events; dry-run and delete only rows
  beyond their policy while preserving active records and tenant scoping.

### ARCH-007: Configuration permits customer and admin cookie-name collision

- Status: `candidate`
- Severity hypothesis: Low
- Confidence: high
- Evidence: env schema independently accepts `SESSION_COOKIE_NAME` and
  `ADMIN_SESSION_COOKIE_NAME` but does not require them to differ
  (`backend/src/config/env.ts:155-210`). A safe local parser check with both set
  to `same` returned `{"accepted":true}`.
- Failure path and impact: both host-only cookies use path `/`; one login can
  overwrite the other and either logout clears the shared browser cookie. Token
  lookups still use separate tables, so this causes broken dual-session UX and
  orphan rows rather than privilege escalation.
- Counterevidence: defaults and checked env examples use distinct names;
  integration tests cover the normal separation.
- Missing test / validation contract: environment loading must reject equal
  cookie names and retain successful parsing of the current defaults.

### ARCH-008: Group webhooks perform unbounded duplicate recipient fanout

- Status: `candidate`
- Severity hypothesis: High
- Confidence: high
- Independent revalidation: completed. A second trace confirmed that unread
  recipient resolution precedes delivery claim/dedupe, exact duplicates still
  pay that cost, and configured push repeats recipient resolution before
  additional per-recipient work. Confidence in current production
  manifestation remains medium until cardinality and latency are measured.
- Evidence: `message_created` records unread recipients before delivery dedupe
  (`backend/src/modules/chatwoot-webhooks/service.ts:374-395`). Group recipient
  resolution loads every active tenant contact link and performs one Chatwoot
  contact lookup per link; concurrency is batched by five but total work is
  unbounded (`backend/src/modules/chat-notifications/recipientResolver.ts:14,141-193`).
  After acceptance, push invokes the same resolver again, then sequentially
  loads settings, rebuilds visible threads and loops subscriptions for every
  recipient (`backend/src/modules/chat-notifications/pushDeliveryService.ts:136-263`).
- Failure/load path: one group event performs `O(active tenant users)` external
  lookups synchronously before webhook acknowledgement, then repeats recipient
  discovery for push. Duplicate deliveries repeat the pre-dedupe scan. At
  10x/100x users and group activity, upstream latency can exceed webhook timeout,
  induce retries and amplify Chatwoot/DB/push load; per-recipient thread rebuild
  adds work proportional to that user's groups.
- Counterevidence: contact lookups have a configured per-request timeout and
  concurrency five; unread insert is one conflict-safe bulk statement; push is
  detached from the HTTP result and conditional on configured delivery;
  per-user group membership is capped, and private-thread resolution is
  bounded. These controls do not bound tenant recipient count or concurrent
  webhook work.
- Missing test / validation contract: dedupe must precede recipient work;
  recipient membership must come from a bounded/indexed portal projection or
  queued batch, be computed once per event, and enforce explicit batch,
  backpressure, retry and idempotency limits under a representative large
  tenant fixture.

### ARCH-009: Production provisioning accepts insecure tenant URLs

- Status: `needs_follow_up`
- Severity hypothesis: Medium
- Confidence: medium
- Evidence: shared URL normalization accepts both HTTP and HTTPS
  (`backend/src/modules/tenants/repository.ts:92-109`), and tenant provisioning
  applies it to both `chatwootBaseUrl` and custom `publicBaseUrl` without a
  production-mode guard
  (`backend/src/modules/tenant-provisioning/input.ts:138-173`).
- Failure path and impact: an operator can provision a production tenant whose
  browser/session traffic or backend Chatwoot token calls traverse plaintext
  HTTP.
- Counterevidence: HTTP is required for local development; reference production
  examples/runbooks use HTTPS; provisioning is operator-owned rather than a
  public API.
- Validation contract: trace every production provisioning entrypoint and add a
  production-context test that rejects HTTP while preserving explicitly local
  bootstrap/test inputs.

### ARCH-010: Webhook account/inbox identity is optional when absent

- Status: `needs_follow_up`
- Severity hypothesis: Low
- Confidence: medium
- Evidence: payload invariant code rejects only collected account/inbox IDs
  that differ; empty ID sets pass
  (`backend/src/modules/chatwoot-webhooks/payloadTenantInvariants.ts:33-83`).
- Failure path and impact: a correctly signed but contract-incomplete payload
  can route through a tenant-scoped conversation mapping without proving the
  documented account/inbox fields. Whether legitimate supported Chatwoot events
  may omit those fields is not yet established.
- Counterevidence: tenant-specific webhook signature and Host context are
  required; conversation lookup is tenant-scoped; any present mismatching ID is
  rejected.
- Validation contract: compare every accepted message/typing payload shape with
  the current official Chatwoot contract and local CE implementation, then test
  fail-closed behavior for fields guaranteed by that contract.

## Non-Defect Hardening And Later-Stage Inputs

- `resolveDefaultTenant` and `assertDefaultTenantRuntime` are unused runtime
  surface and can be considered for removal after the audit.
- Reference DB isolation is strong, but a portal-schema identity/sentinel before
  migrations could reduce operator misconfiguration risk.
- A proxy CIDR/function allowlist would be stronger than boolean `trustProxy` if
  the backend is ever exposed outside the current internal network.
- Object storage has no explicit application request/socket timeout, while SMTP
  has no explicit application timeout/`requireTLS`. Provider/library defaults
  and production configuration must be reviewed before treating either as a
  defect.
- Admin audit-event retention is a product/legal policy choice; it must not be
  silently coupled to cleanup of expired sessions/challenges.

## Checks And Limitations

- The frozen source worktree remained detached at the exact audit commit and had
  no tracked changes during this review.
- The initial full backend/frontend/ops test gate from Stage 00 already covered
  the inspected modules. The focused architecture regression rerun passed 11
  test files and 98 tests across tenant admission, customer/admin auth, send,
  realtime, webhook, recipient-resolution and push paths.
- No production service, external Chatwoot instance or production data was
  mutated.
- Full schema/query/index proof, official Chatwoot contract validation, load
  measurement and browser scenarios remain assigned to later stages.

No likely Critical issue was identified. `ARCH-008` received independent
revalidation and remains a High hypothesis for canonical validation; measured
current-production impact is still unproven.
