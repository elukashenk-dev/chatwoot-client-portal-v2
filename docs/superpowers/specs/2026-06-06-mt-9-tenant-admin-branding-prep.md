# MT-9 Tenant Admin And Branding Preparation

## Status

Status: preparation/spec draft for `MT-9 Tenant Admin And Branding Rebuild`.

This file records the first pass of research and architecture framing. It is not
an implementation plan yet. The immediate goal is to close the `F-MT-004`
security gate with a precise Chatwoot permissions spike and a tenant-scoped
admin-verification token boundary before any branding UI is implemented.

## Sources Checked

Project source of truth:

- `AGENTS.md`
- `docs/roadmap/work-log.md`
- `docs/architecture/overview.md`
- `docs/roadmap/implementation-plan.md`
- `docs/architecture/decisions.md`
- `docs/architecture/multi-tenant-reference.md`
- `docs/design/portal-ui-ux-baseline.md`
- `docs/findings/F-MT-004-admin-chatwoot-token-boundary.md`

Current code:

- `backend/src/db/schema.ts`
- `backend/src/modules/tenants/secrets.ts`
- `backend/src/modules/tenants/service.ts`
- `backend/src/modules/tenants/repository.ts`
- `backend/src/integrations/chatwoot/client.ts`
- `backend/src/integrations/chatwoot/request.ts`
- `backend/src/modules/tenants/routes.test.ts`
- `backend/src/scripts/bootstrap-default-tenant-core.ts`
- `backend/src/scripts/verify-tenant-chatwoot-connection-core.ts`
- `frontend/src/app/AppRoutes.tsx`
- `frontend/src/app/routePaths.ts`

External Chatwoot source of truth:

- Official docs:
  `https://developers.chatwoot.com/api-reference/introduction`
- Official Agents endpoint page:
  `https://developers.chatwoot.com/api-reference/agents/list-agents-in-account`
- Official OpenAPI source referenced by the docs:
  `https://raw.githubusercontent.com/chatwoot/chatwoot/develop/swagger/tag_groups/application_swagger.json`
- Local Chatwoot CE source:
  - `../chatwoot-ce-stable/app/controllers/api/v1/accounts/agents_controller.rb`
  - `../chatwoot-ce-stable/app/controllers/api/v1/accounts/base_controller.rb`
  - `../chatwoot-ce-stable/app/controllers/concerns/access_token_auth_helper.rb`
  - `../chatwoot-ce-stable/app/controllers/concerns/ensure_current_account_helper.rb`
  - `../chatwoot-ce-stable/app/policies/user_policy.rb`

Archived idea source:

- branch `feature/phase-10-portal-branding-admin`

## Roadmap Fit

`MT-9` is the next active roadmap scope.

The roadmap requires:

- close `F-MT-004` with a Chatwoot permissions spike;
- keep runtime Chatwoot token and admin-verification token as separate security
  boundaries;
- store the admin-verification token as an encrypted per-tenant secret;
- build tenant-scoped admin login, branding settings, object-storage backed
  branding assets, audit events and previews only after the first gate is clear.

Visual comparison is not required for the first slice because the first slice is
backend/security focused. Visual preview becomes required before branding admin
UI decisions.

## Current Architecture Baseline

Tenant resolution is already host-based and happens before auth/chat runtime.

Current `portal_tenants` contains:

- `slug`;
- `display_name`;
- `status`;
- `primary_domain`;
- `public_base_url`;
- `chatwoot_base_url`;
- `chatwoot_account_id`;
- `chatwoot_portal_inbox_id`;
- `chatwoot_portal_inbox_identifier`;
- `chatwoot_api_access_token_ciphertext`;
- `chatwoot_webhook_secret_ciphertext`.

Tenant secrets are encrypted with `AES-256-GCM` through
`backend/src/modules/tenants/secrets.ts` and `PORTAL_TENANT_SECRET_KEY`.

The current tenant request context decrypts the runtime Chatwoot API token and
webhook secret for normal portal runtime. This context is consumed by chat,
profile, notification, webhook and tenant public-context flows.

MT-9 must not simply add the admin-verification token to the general
`tenant.chatwoot` runtime context. That would make the broader token available
to modules that should never need admin authority. The admin token should be
decrypted only inside the tenant admin verification path.

## Chatwoot Agents API Baseline

Official Chatwoot docs classify Application APIs as account-level/agent-facing
APIs authenticated with a user `access_token`.

The official Agents endpoint is:

```text
GET /api/v1/accounts/{account_id}/agents
```

The official OpenAPI metadata says:

- security: `userApiKey`;
- `200`: array of active agents;
- `403`: access denied;
- agent fields include `id`, `account_id`, `email`, `role`, `confirmed`,
  `availability_status`, `name`, `available_name`, `thumbnail`,
  `custom_role_id`;
- role enum includes `agent` and `administrator`.

Local Chatwoot CE `v4.13` source adds important details:

- `Api::V1::Accounts::AgentsController#index` returns
  `Current.account.users.order_by_full_name.includes(...)`;
- `UserPolicy#index?` returns `true`;
- `EnsureCurrentAccountHelper` sets `Current.account_user` from
  `account.account_users.find_by(user_id: current_user.id)` and rejects the
  request if the access-token owner is not a user in the requested account;
- `AccessTokenAuthHelper` accepts user access tokens for normal Application API
  requests, while bot tokens are restricted to a small allowlist.

Implication:

The spike must verify actual self-hosted production behavior for several token
owners. The local source suggests that listing agents may not be
administrator-only, but the portal still must require the target login email to
match an agent row with `role === "administrator"`, `confirmed === true`, and
`account_id === current tenant.chatwoot_account_id`.

## F-MT-004 Boundary Decision

The runtime Chatwoot token is for customer portal runtime:

- contact lookup;
- thread/contact access;
- conversation/message send;
- profile avatar update;
- webhook/provisioning verification helpers.

Tenant admin verification is separate:

- it checks whether an email belongs to a confirmed Chatwoot administrator
  inside the current tenant's Chatwoot account;
- it should work even if runtime token is intentionally narrow;
- if its token is broader, it must not participate in customer chat/profile
  runtime;
- it must not be exposed to browser, logs, audit payloads or public tenant
  context.

Required persistence addition:

```text
portal_tenants.chatwoot_admin_verification_token_ciphertext
```

The field should be nullable at migration time so existing tenants can stay
bootable. Admin login must fail closed with a controlled error when the value is
missing or invalid.

Recommended access pattern:

- add repository/service method dedicated to admin verification token retrieval;
- decrypt only in `admin-auth` service/factory;
- keep the generic `TenantRequestContext.chatwoot` shape limited to runtime
  token and webhook secret;
- avoid passing the admin token through shared Chatwoot runtime objects used by
  chat/profile modules.

## Archived Branch Audit

The archived branch `feature/phase-10-portal-branding-admin` is useful only as
an idea archive.

Reusable ideas:

- separate admin auth module;
- separate admin session cookie;
- email-code verification instead of Chatwoot cookie sharing;
- generic response for non-eligible emails;
- re-check role before creating an admin session;
- form model with defaults, overrides and final snapshot;
- preview using portal components.

Do not reuse as-is:

- schema is keyed by `chatwoot_account_id` / `chatwoot_inbox_id`, not
  `tenant_id`;
- admin sessions and challenges are not tenant-scoped;
- service code uses global `CHATWOOT_ACCOUNT_ID` and `CHATWOOT_PORTAL_INBOX_ID`;
- branding storage is DB/string based and does not implement object-storage
  backed tenant assets;
- route structure predates the current protected app shell, profile route,
  tenant identity cache and PWA baseline;
- docs paths and work-log naming predate the current docs layout.

Conclusion:

The branch can inform UX and service shape, but every MT-9 implementation task
must be rewritten tenant-first.

## Recommended MT-9 Decomposition

### MT-9A. Chatwoot Admin Verification Gate

Goal:

- prove exact Chatwoot Agents API behavior for token owners and target users;
- add a precise design for separate encrypted admin-verification token;
- close or update `F-MT-004` only after implementation verifies the boundary.

Minimum output:

- spike document:
  `docs/spikes/2026-06-06-chatwoot-admin-agents-permissions.md`;
- implementation plan for admin token storage and verification boundary;
- backend tests proving missing/invalid/insufficient token fails safely;
- backend tests proving tenant A admin verification cannot authenticate tenant
  B unless that email is also administrator in tenant B;
- no branding UI yet.

### MT-9B. Tenant Admin Auth Foundation

Goal:

- add tenant-scoped admin challenges, admin sessions and audit events;
- use same-origin `/admin/...` routes on the current tenant host;
- verify admin email through the separate Chatwoot admin-verification token;
- send tenant-scoped email code;
- create httpOnly admin session cookie separate from customer session cookie.

Required invariants:

- admin auth never reads Chatwoot browser cookies;
- admin auth never uses customer `portal_users` or `portal_sessions`;
- challenge/session rows include `tenant_id`;
- email enumeration remains controlled;
- role is re-checked before session creation;
- logout clears only the admin session.

### MT-9C. Branding Settings Foundation

Goal:

- add tenant-scoped branding settings and controlled brand tokens;
- expose public read model through tenant-owned backend route;
- keep system/security copy locked;
- apply safe tokens to existing auth/chat/PWA components.

This slice can reuse field ideas from the archived branch, but the persistence
scope must be `tenant_id`, not Chatwoot IDs.

### MT-9D. Branding Assets And PWA Identity

Goal:

- add S3-compatible object storage for branding assets;
- store object metadata in portal DB;
- serve assets only after tenant-scoped DB lookup;
- keep PWA manifest/icons tenant-aware and cache-safe;
- use MinIO or compatible local object storage for development.

### MT-9E. Admin Branding UI And Preview

Goal:

- add admin screens only after the backend boundary is verified;
- use real portal components in preview;
- include visual comparison before final UI decisions;
- keep admin UI separate from customer app shell.

## First Slice Target

Recommended first implementation branch:

```text
feature/phase-9-admin-token-spike
```

Recommended first plan file:

```text
docs/superpowers/plans/2026-06-06-mt-9-admin-token-spike.md
```

Recommended first spike file:

```text
docs/spikes/2026-06-06-chatwoot-admin-agents-permissions.md
```

First slice should not add branding fields, asset uploads or admin UI. It should
only establish the token boundary and verify Chatwoot permissions.

## Proposed Spike Matrix

Run against local Chatwoot `v4.13` and, if safe, production-like Chatwoot with
non-destructive read-only requests:

| Token owner                          | Expected result to verify                                      |
| ------------------------------------ | -------------------------------------------------------------- |
| confirmed administrator in account A | can call account A agents endpoint; returns admin and agents   |
| confirmed agent in account A         | verify whether endpoint is allowed; target login still denied  |
| user from another account            | account A endpoint returns unauthorized/access denied          |
| agent bot token                      | agents endpoint denied by bot endpoint allowlist               |
| invalid token                        | controlled unauthorized/access denied                          |
| runtime token candidate              | record whether it can list agents; do not rely on it for admin |
| separate admin-verification token    | preferred token after spike                                    |

The spike result must record:

- exact HTTP status and response shape;
- whether `confirmed`, `role`, `email`, `account_id` are always present;
- whether response contains inactive/deleted users;
- whether a narrow runtime token can list agents;
- whether a non-admin user token can list agents;
- selected operational token policy.

## Backend Design Notes For The Plan

Admin token persistence:

```text
portal_tenants.chatwoot_admin_verification_token_ciphertext text null
```

Admin auth tables:

```text
portal_admin_login_challenges
portal_admin_sessions
portal_admin_audit_events
```

Every admin table must include `tenant_id`.

Suggested challenge fields:

- `tenant_id`;
- `email`;
- `chatwoot_account_id`;
- `chatwoot_agent_id`;
- `code_hash`;
- `status`;
- `attempts_count`;
- `max_attempts`;
- `expires_at`;
- `resend_not_before`;
- `last_sent_at`;
- `verified_at`;
- timestamps.

Suggested session fields:

- `tenant_id`;
- `email`;
- `chatwoot_account_id`;
- `chatwoot_agent_id`;
- `token_hash`;
- `expires_at`;
- `last_seen_at`;
- timestamps.

Suggested audit event fields:

- `tenant_id`;
- `admin_email`;
- `chatwoot_account_id`;
- `chatwoot_agent_id`;
- `event_name`;
- `target_type`;
- `target_id`;
- `metadata_json`;
- timestamp.

Admin session cookie:

- separate name, for example `portal_admin_session`;
- httpOnly;
- SameSite Lax;
- Secure in production;
- same tenant host boundary as customer cookie;
- no offline/PWA cache for admin auth.

## Frontend Design Notes For Later

Admin routes should be separate from customer routes:

```text
/admin/login
/admin/verify
/admin/branding
```

Admin UI should not live inside current customer `AppShellLayout`.

Branding preview must use real components and current design baseline:

- auth frame;
- app brand mark;
- chat header;
- outgoing message bubble color;
- PWA name/icon preview.

The first UI planning pass must include visual comparison because branding UI is
a user-facing feature.

## Required Tests

For MT-9A:

- tenant repository stores optional admin-verification ciphertext without
  exposing plaintext;
- tenant admin token decryption rejects missing/invalid ciphertext safely;
- Chatwoot Agents response parser accepts official fields and rejects unsafe
  shapes;
- admin verification filters by email, `account_id`, `role === "administrator"`
  and `confirmed === true`;
- runtime token and admin-verification token are not the same dependency in the
  service factory;
- cross-tenant verification attempts are rejected;
- insufficient Chatwoot permission returns controlled error and does not create
  a challenge/session.

For MT-9B:

- request login returns generic response for unknown/non-admin email;
- eligible admin receives one challenge email;
- resend cooldown is tenant/email scoped;
- wrong/expired/reused code is rejected;
- role downgrade between request and verify blocks session;
- logout clears admin cookie;
- tenant A admin session cannot access tenant B admin route.

For MT-9C and later:

- branding settings are `tenant_id` scoped;
- public branding response contains no secrets or object keys;
- tenant A cannot read/write tenant B branding;
- asset reads require tenant DB lookup before object storage fetch;
- PWA manifest and icon URLs are versioned/cache-safe.

## Open Questions To Resolve Before Full MT-9 Plan

1. Should admin login use email code only, or email code plus magic link?

   Recommendation for first slice: email code only, matching existing
   registration/password-reset operational model and avoiding link URL
   complexity.

2. Should the first branding settings slice include asset uploads?

   Recommendation: no. Start with text/color settings and fallback/logo URL only
   if needed for preview; add object-storage asset upload in a later slice.

3. Which object storage target should local development use?

   Recommendation: MinIO in `infra/` if object-storage slice is opened.

4. Should admin routes be available while tenant status is not `active`?

   Recommendation: no for first slice. Reuse active tenant runtime gate unless a
   later operations requirement needs a separate admin recovery path.

5. Should Chatwoot agent role changes invalidate existing portal admin sessions
   immediately?

   Recommendation: re-check role before sensitive writes and on session refresh
   intervals; do not call Chatwoot on every admin page render until the first
   auth foundation is measured.

## Non-Goals For The First Slice

- No Chatwoot core changes.
- No browser-direct Chatwoot API.
- No platform/provisioning token for tenant admin login.
- No object storage implementation in the permission spike.
- No branding admin UI in the permission spike.
- No customer profile/admin merge.
- No reuse of archived branch code without rewriting tenant boundaries.

## Acceptance For This Preparation Document

- It maps MT-9 to current stable docs and `F-MT-004`.
- It identifies the first required gate before UI work.
- It records official Chatwoot docs, OpenAPI and local Chatwoot source findings.
- It documents why the archived branch is idea-only.
- It provides enough detail to write a focused implementation plan for MT-9A.
