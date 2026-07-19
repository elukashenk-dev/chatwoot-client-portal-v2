# SEC-DEEP-001 Bounded Reassessment Threat Model

## Scope And Method

This neutral threat model supports targeted disposition of the nine recovered
families only. It applies to the historical commit
`a61b4975ae7b59e244c0b5bbc4efd02466aa075c` and the current reassessment
commit `0c25c7575221ed19b21390abb8a5f1e364f2e06f`.

It does not state expected dispositions, replace either auditor's evidence or
authorize repository-wide discovery. Every family must be checked separately
against both immutable source roots recorded in `manifest.md`.

## In-Scope Actors

- Unauthenticated internet user who can reach the tenant portal origin and its
  public/auth/webhook routes.
- Authenticated portal customer acting within one tenant, including a customer
  who intentionally creates repeated or concurrent requests.
- Tenant administrator with a valid portal admin session, including a
  previously authorized principal whose upstream Chatwoot state changes.
- Compromised or misconfigured trusted upstream, including reverse proxy,
  Chatwoot webhook/API behavior or another trusted integration represented by
  repository evidence.
- Malicious tenant-controlled input submitted through public, customer or
  tenant-admin routes.
- Operator error within the documented deployment and configuration boundary.

## Trust Boundaries

### Browser To Portal Backend

The browser communicates through same-origin `/api`. Customer and tenant-admin
authority use separate signed HttpOnly cookies and backend session records.
Route parameters, multipart bodies, query values, headers and browser cache are
untrusted. The browser has no Chatwoot token or direct Chatwoot authority.

### Tenant Resolution

Fastify uses `PORTAL_TRUST_PROXY` for proxy trust. The tenant context hook is
registered before auth, admin, chat, presence, realtime and webhook routes in
`backend/src/app.ts:383-482` on both baselines. Host normalization and active
tenant lookup occur before request-scoped Chatwoot services are built.

### Customer And Tenant-Admin Sessions

Customer and admin session rows, cookies and guards are distinct. A valid
session establishes only portal-side authority for the current tenant. Current
Chatwoot administrator state is an upstream authority input where the relevant
workflow depends on it.

### Portal Backend To Postgres, Object Storage And Chatwoot

The portal uses an isolated Postgres database for portal-owned data. The
backend owns database, object-storage and tenant Chatwoot credentials; these do
not enter the browser. Chatwoot remains the system of record for contacts,
conversations, messages and attachments. External responses and latency are
untrusted even when the destination is allowlisted.

### Webhook And Realtime Ingress

Chatwoot webhooks enter through `/api/chatwoot/webhooks`, after host-based
tenant selection, and are checked with the tenant webhook secret. Realtime SSE
is same-origin and admitted by backend session/thread checks. Delivery IDs,
payload fields, connection lifetimes and fanout work must be treated according
to their actual authenticated and bounded properties, not their names.

### Deployment Secrets And Ingress

The reference production topology exposes `portal-web`; it reverse-proxies
`/api/*` to the internal backend and `/telegram-bridge/*` to the separate bridge
(`infra/production/compose.yaml:164-179` and
`infra/production/Caddyfile:14-22` on both baselines). Postgres, object storage
and backend services have no direct host port in that topology. Deployment
scripts and environment files may hold operator-owned secrets, but this review
must neither read live secret values nor infer undocumented production
controls.

## Protected Assets

- Cross-tenant isolation and exact host-to-tenant admission.
- Customer and tenant-admin session authority, including revocation and user
  intent for state-changing actions.
- Tenant Chatwoot credentials, webhook secrets and other backend-held secrets.
- Customer chat state, message metadata, read state and notification behavior.
- Portal database integrity, tenant-scoped persistence and concurrency safety.
- Bounded availability of the shared Node.js process, Postgres pool, Chatwoot
  connection budget and external-provider capacity.

## Exposure Evidence Across Baselines

- Both commits register the same relevant public/auth/admin/chat/presence/SSE/
  webhook route groups in `backend/src/app.ts:383-482`.
- Both commits use the same exact-origin helper in
  `backend/src/lib/origin.ts:17-58`; whether a particular route invokes that
  helper is a family-level evidence question.
- Both commits use the same reference Caddy `/api/*` reverse proxy, CSP and
  private backend network boundary in `infra/production/Caddyfile:1-22` and
  `infra/production/compose.yaml:164-179`.
- The reviewed Git delta changes selected Chatwoot contact/group behavior and
  production operations tooling, but this fact alone neither proves nor
  disproves current applicability. Each auditor must trace the exact relevant
  current source or reviewed delta for every family.

## Explicit Exclusions

- Infrastructure or edge controls not represented by repository code,
  configuration or supplied immutable evidence.
- Unrelated frontend-only candidates.
- New repository-wide or backend-wide candidate discovery.
- Production access, customer data, production logs, secrets, deployment or
  external mutation.
- Product-code changes, dependency changes, migrations, environment changes or
  Chatwoot core changes.

## Proof Standard

For every recovered family, each auditor must record:

1. a concrete attacker-controlled or failure source;
2. the closest relevant control and why it holds or fails;
3. a reachable sensitive sink or external effect;
4. exact authority, state, timing and cardinality preconditions;
5. a concrete evidence-supported impact;
6. the strongest counterevidence;
7. historical reachability on the frozen historical commit; and
8. current applicability established by current source or a precise Git delta.

Static reasoning is sufficient only when it closes the full path. A targeted
local synthetic test may fill one defined proof gap. Unavailable external or
runtime evidence must produce an exact `needs_follow_up` blocker rather than a
speculative conclusion.
