# Multi-Tenant Portal Architecture Reference

Этот файл больше не является пошаговым планом миграции. `MT-0`-`MT-8` уже
реализованы, поэтому подробная история phases, superseded migration steps и
устаревшие next steps удалены.

Роль этого файла сейчас:

- хранить детали multi-tenant модели, которые слишком подробны для
  `docs/architecture/overview.md`;
- держать technical reference для `MT-9 Tenant Admin And Branding Rebuild`;
- держать notes для отложенных multi-tenant расширений.

Короткий текущий baseline см. в `docs/architecture/overview.md`.
Актуальный roadmap см. в `docs/roadmap/implementation-plan.md`.
Устойчивые решения см. в `docs/architecture/decisions.md`.

## 1. Current Model

Business model:

- shared SaaS: один portal deploy обслуживает много B2B tenants;
- dedicated install: один portal deploy обслуживает одного tenant;
- dedicated install не является отдельной архитектурой.

Tenant model:

```text
Tenant = company + domain + exact Chatwoot connection
```

Production domain modes:

```text
custom client domain:
  lk.<client-domain>

provider-owned subdomain:
  <tenant-slug>.<PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX>
```

Examples:

```text
lk.buhfirma.ru -> tenant buhfirma
lk.stroyfirma.ru -> tenant stroyfirma
lk.zubi.ru -> tenant zubi
buhfirma.portal.example.com -> tenant buhfirma
```

`PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX` is deployment configuration, not a
hard-coded provider brand.

Shared/dedicated is inferred from the actual Chatwoot connection:

- two tenants can point to the same `chatwoot_base_url` but different
  `chatwoot_account_id`;
- a dedicated tenant can point to its own Chatwoot installation;
- `hybrid` is only a deployment description, not a tenant mode.

## 2. Chatwoot Facts We Rely On

- Chatwoot Account is the closest natural tenant boundary.
- Chatwoot Application API tokens are user access tokens.
- Endpoint access depends on the token owner's permissions in the target
  Chatwoot account.
- Chatwoot Agents API can be used to verify account users and roles.
- Agents can have `role = agent` or `role = administrator`.
- Chatwoot Platform APIs are for installation-level provisioning and must not be
  confused with tenant admin login.

Portal tenant is wider than Chatwoot account because it also owns:

- domain;
- portal users and sessions;
- portal-specific auth and verification state;
- PWA identity;
- branding;
- tenant admin sessions and audit events.

## 3. Non-Negotiable Runtime Rules

### Tenant Before Auth

Tenant must be resolved before:

- registration;
- login;
- password reset;
- session lookup;
- chat context;
- message send;
- attachment send;
- webhooks;
- admin login;
- branding reads/writes.

Unknown host returns controlled failure. It must not fallback to default tenant.

### Tenant-Owned Data Requires Tenant Scope

Every repository method that reads or writes tenant-owned data must require
tenant scope.

Examples:

```ts
portalUsersRepository.findByEmail({ tenantId, email })
portalSessionsRepository.findByToken({ tenantId, tokenHash })
chatThreadContactRepository.findContactLink({ tenantId, userId })
chatMessagesRepository.createSendLedgerEntry({ tenantId, ... })
```

Avoid global lookup helpers for tenant-owned data.

### Browser Never Gets Chatwoot Authority

Browser receives only public tenant/branding context.

Browser must never receive:

- Chatwoot API token;
- Chatwoot webhook secret;
- admin-verification token;
- platform/provisioning token.

### Origin And Host Are Tenant-Aware

Host selects tenant.

Origin guard must compare browser origin against current tenant
`public_base_url`.

`X-Forwarded-Host` is trusted only in explicit trusted proxy mode.

## 4. Data Model Reference

### `portal_tenants`

Current minimum tenant identity:

```text
id
slug
display_name
status
primary_domain
public_base_url
chatwoot_base_url
chatwoot_account_id
chatwoot_portal_inbox_id
chatwoot_api_access_token_ciphertext
chatwoot_webhook_secret_ciphertext
created_at
updated_at
```

Rules:

- `slug` is stable and human-readable;
- `primary_domain` is canonical host for tenant resolution;
- `public_base_url` is canonical URL for emails, PWA identity and webhook setup;
- `public_base_url` host must match `primary_domain`;
- secrets are stored encrypted;
- no `portal_tenants.mode`.

### Tenant-Scoped Tables

Tenant-owned tables include:

```text
portal_users
portal_sessions
verification_records
portal_user_contact_links
portal_chat_threads
portal_chat_message_sends
portal_rate_limit_buckets
chatwoot_webhook_deliveries
portal_user_notification_preferences
portal_chat_notification_preferences
portal_push_subscriptions
portal_push_deliveries
```

Future admin/branding tables must also be tenant-scoped:

```text
portal_branding_settings
portal_admin_login_challenges
portal_admin_sessions
portal_admin_audit_events
```

### Email-Code Flows

`verification_records` is the shared persistence table for:

```text
purpose = registration
purpose = password_reset
```

Do not create `password_reset_records`.

Advisory lock key must include:

```text
purpose + tenant_id + normalized email
```

Continuation tokens are tenant-scoped.

### Secret Storage

Tenant Chatwoot secrets are encrypted using:

```text
PORTAL_TENANT_SECRET_KEY
```

Requirements:

- authenticated encryption;
- never return decrypted secrets from public APIs;
- never log decrypted values;
- document rotation before production.

## 5. Chatwoot Token Policy

Runtime token:

- one Chatwoot runtime Application API token per tenant;
- used for normal portal runtime: registration eligibility, chat context, send,
  webhook/provisioning checks where appropriate;
- token owner should have the smallest practical access for that tenant account.

Tenant admin verification token:

- separate encrypted per-tenant token added in `MT-9A`;
- example field:
  `chatwoot_admin_verification_token_ciphertext`;
- used only backend-side to verify tenant admin eligibility through Chatwoot
  account users/agents;
- not used for normal chat runtime.

Forbidden:

- one broad token as implicit master key for chat runtime, tenant admin login and
  provisioning;
- browser-visible Chatwoot tokens;
- platform/provisioning token as tenant admin login authority.

`MT-9A` completed the focused permissions spike:

- confirm the exact Chatwoot endpoint for listing account agents/users;
- confirm required token owner permissions;
- confirm response fields for email, account, role and confirmation state;
- document behavior for insufficient permissions and invalid token.

## 6. Tenant Resolution Reference

Production:

```text
Host: lk.buhfirma.ru
  -> portal_tenants.primary_domain = lk.buhfirma.ru
  -> tenant = buhfirma

Host: buhfirma.portal.example.com
  -> portal_tenants.primary_domain = buhfirma.portal.example.com
  -> tenant = buhfirma
```

Local development:

```text
buhfirma.127.0.0.1.nip.io:5173
stroyfirma.127.0.0.1.nip.io:5173
zubi.127.0.0.1.nip.io:5173
```

Normalization example:

```text
LK.BUHFIRMA.RU:443. -> lk.buhfirma.ru
```

Requirements:

- normalize host before lookup;
- store normalized domains;
- reject unknown hosts;
- trust forwarded host only behind controlled reverse proxy.

Backend request context:

```ts
type TenantContext = {
  id: number
  slug: string
  displayName: string
  primaryDomain: string
  publicBaseUrl: string
  chatwoot: {
    baseUrl: string
    accountId: number
    portalInboxId: number
    apiAccessToken: string
    webhookSecret: string
  }
}
```

Public tenant context:

```ts
type PublicTenantContext = {
  slug: string
  displayName: string
  publicBaseUrl: string
}
```

## 7. Frontend And PWA Reference

Frontend must not ask the user to choose company manually in production.
Company identity comes from origin.

Public tenant endpoints:

```text
GET /api/tenant
GET /api/tenant/manifest.webmanifest
GET /api/tenant/apple-touch-icon.png
GET /api/tenant/icons/:iconName
```

PWA identity rules:

- manifest `id` is stable and tenant-specific;
- `start_url` and `scope` are tenant-local;
- app name and short name come from tenant identity/branding;
- icon URLs are tenant-aware;
- manifest and icon metadata must not cache another tenant's identity;
- service worker must not cache tenant-sensitive API responses as static shell;
- app shell/assets may be cached for offline launch, but `/api/*` remains
  network/backend authority;
- browser offline data lives in scoped IndexedDB `portal-offline` under
  tenant/user/thread identity;
- durable text outbox is a frontend-domain module; `ChatPage` can request drain
  but must not own outbox persistence or backend send authority.

iOS/iPadOS:

- `apple-mobile-web-app-title` must be tenant-aware;
- `apple-touch-icon` must resolve through tenant endpoint;
- installed Home Screen icon/title may be cached by the platform, so final
  branding should be configured before production rollout when possible.

## 8. Chat Runtime Reference

Portal chat uses portal-owned threads. The browser sees `threadId`, not
Chatwoot conversation authority.

Thread IDs:

- `private:me` - личный чат текущего portal user с tenant support team;
- `group:<chatwoot_group_contact_id>` - групповой чат, если linked person
  contact пользователя содержит этот ID группового Chatwoot contact в
  разрешенном portal attribute list.

Rules:

- contact links are tenant-scoped;
- `portal_chat_threads` mappings are tenant-scoped;
- Chatwoot conversation IDs stay backend-only thread mappings;
- send ledger is tenant-scoped and thread-scoped;
- realtime fanout key includes tenant identity and `threadId`;
- webhook delivery dedupe includes tenant identity;
- webhook routing maps Chatwoot conversation back to `portal_chat_threads`;
- group realtime delivery revalidates current user access before fanout;
- Chatwoot contact/conversation IDs are not globally unique without tenant
  scope.

Portal inbox requirements:

- belongs to current tenant Chatwoot account;
- `Channel::Api`;
- `lock_to_single_conversation = true`.

If multiple Chatwoot conversations exist for one portal thread target inside
the tenant portal inbox, treat that as data/config anomaly rather than target
UX. First send may lazily create or replace a missing mapped conversation only
under tenant-aware advisory lock with a fresh resolve inside the lock.

## 9. MT-8R Codebase Readiness, MT-8.5 UI/UX Baseline And MT-9 Admin/Branding Reference

### MT-8R Codebase Audit And Refactoring Readiness

Before UI/UX baseline and MT-9 admin/branding work, run a controlled codebase
audit and refactoring readiness pass.

Purpose:

- understand the current backend/frontend/shared/tests structure after
  `MT-1`-`MT-8`;
- identify technical debt and code smells without starting broad refactoring;
- protect tenant isolation, auth/session, persistence, Chatwoot runtime,
  webhook/realtime and PWA identity boundaries before adding admin/branding.

Control rules:

- audit first, refactor later;
- no "improve everything" branch;
- every candidate is classified as `must-fix-before-MT-9`,
  `safe-pre-MT-9-cleanup`, `defer` or `do-not-touch`;
- every approved refactoring is a bounded slice with targeted tests;
- dead code is removed only after evidence from code search, typecheck/build,
  tests or explicit stale docs/runtime references;
- behavior changes, schema changes and runtime changes require explicit scope
  approval and must not be hidden inside cleanup.

Exit:

- audit summary and refactoring plan are documented;
- actionable risks are in `docs/findings/`;
- selected cleanup/refactoring slices are complete or explicitly deferred;
- no open `must-fix-before-MT-9` finding remains.

### MT-8.5 UI/UX Baseline

After `MT-8R` and before `MT-9`, the current portal UI/UX must be reviewed and
accepted as the branding baseline.

Review scope:

- auth/login;
- registration and verification forms;
- password reset;
- access denied and error states;
- app shell;
- chat empty state;
- chat with messages;
- attachments and voice messages;
- mobile PWA behavior;
- desktop behavior;
- tenant identity differences across multiple tenants.

Decisions before `MT-9`:

- which UI parts are fixed product shell;
- which UI parts are tenant-brandable;
- which screens appear in branding admin preview;
- preview must render real portal components with draft branding, not a
  separate static mock.

Exit:

- UI shell accepted as branding baseline;
- brandable/non-brandable list agreed;
- open UI findings fixed or explicitly deferred before `MT-9`.

## 10. MT-9 Admin And Branding Reference

The archived branch `feature/phase-10-portal-branding-admin` must not be merged
as-is.

Why:

- it assumes one portal deploy has one brand;
- it assumes global Chatwoot account authority;
- admin session model is not tenant-aware.

### Tenant Admin

Route:

```text
https://tenant-domain/admin/login
```

Flow:

1. Resolve tenant by host.
2. Admin enters email.
3. Backend uses tenant's separate admin-verification token.
4. Backend verifies the email inside current tenant Chatwoot account.
5. Require administrator role and confirmed/active account state.
6. Send tenant-scoped email code/link.
7. Create tenant-scoped admin session.

Required negative checks:

- admin from tenant A cannot log into tenant B unless also admin in tenant B;
- agent/non-admin email is rejected;
- missing/invalid admin-verification token fails safely;
- insufficient Chatwoot permission fails safely;
- browser never receives the token.

### Branding

Branding must be tenant-owned:

```text
portal_branding_settings.tenant_id
```

Public branding read:

```text
GET /api/branding
```

Admin branding writes:

- require tenant admin session;
- write only current tenant;
- emit tenant-scoped audit event.

Branding assets:

- PWA manifest can reuse existing tenant-aware endpoint contract;
- store asset metadata in portal DB and binary content in S3-compatible object
  storage;
- local development should use the same object-storage model through MinIO or a
  compatible local service, not local filesystem storage inside the portal
  container;
- every asset row must belong to exactly one `tenant_id`;
- object keys must be tenant-prefixed and asset-id based, for example
  `tenants/{tenant_id}/branding/{asset_id}/{content_hash}`;
- reads and writes must resolve tenant by Host, load the asset by
  `tenant_id + asset_id`, then read the matching object key;
- icon URLs should include tenant asset version/content hash;
- browser-facing branding/icon endpoints must not accept arbitrary object keys
  from the client;
- fallback assets remain allowed until tenant-specific assets are uploaded.

Asset isolation requirements:

- tenant A cannot read tenant B asset metadata;
- tenant A cannot fetch tenant B object through a guessed URL/key;
- tenant A cannot overwrite tenant B object key;
- deleting/replacing an asset updates only the current tenant's branding record;
- object storage is treated as blob storage, while portal DB remains the source
  of truth for ownership, kind, content type, checksum and active branding
  references.

## 11. Platform/Admin Operations

Platform admin is for us as service operator.

Purpose:

- create tenants;
- configure domains;
- configure Chatwoot connection;
- rotate secrets;
- suspend tenant;
- inspect tenant health.

Do not mix platform admin with tenant admin.

Early platform operations can stay as CLI/scripts. UI is optional later.

Current useful script family:

```text
pnpm --dir backend tenant:bootstrap-default
pnpm --dir backend tenant:create -- --slug=<slug> ...
pnpm --dir backend tenant:chatwoot:reconcile -- --dry-run
pnpm --dir backend tenant:deprovision -- --tenant=<slug> --archive-only --confirm=<slug>
pnpm --dir backend tenant:chatwoot:verify -- --tenant=<slug>
pnpm --dir backend tenant:chatwoot:ensure-portal-inbox -- --tenant=<slug>
pnpm --dir backend tenant:chatwoot:webhook:configure -- --tenant=<slug>
```

`tenant:chatwoot:webhook:configure` configures the tenant portal
`Channel::Api` inbox `webhook_url` and stores the API Channel webhook signing
secret returned by Chatwoot. For Chatwoot v4.13+ this is the dedicated
`channel_api.secret`, not an account webhook secret.

Tenant provisioning inputs:

```text
slug
display_name
chatwoot_base_url
client_admin_email
client_admin_name

custom-domain mode:
  primary_domain
  public_base_url

provider-subdomain mode:
  provider_subdomain
  PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX
```

`chatwoot_admin_verification_token` is stored as an encrypted nullable
per-tenant secret. Tenant admin login fails closed when this token is missing,
invalid or cannot read the tenant account agents from Chatwoot.

`tenant:create` obtains Chatwoot account, inbox and service-user token details
through Chatwoot Platform/account APIs, then stores runtime token,
admin-verification token and API Channel webhook secret encrypted in
`portal_tenants`.

`tenant:chatwoot:reconcile -- --apply` can suspend a provisioned tenant when
its Chatwoot account is gone. Platform API authentication failures are surfaced
as operator errors and must not silently suspend tenants.

`tenant:deprovision` is explicit-confirmation only. `--archive-only` archives
portal runtime without deleting Chatwoot; `--delete-chatwoot-account` first
closes portal runtime and then requests Chatwoot Platform API account deletion.

## 11. Future Extensions

### Multi-Domain Tenants

Do not add until needed.

Possible future table:

```text
portal_tenant_domains
```

Minimum fields:

```text
id
tenant_id
domain
kind
is_primary
verified_at
created_at
updated_at
```

### Multiple Chatwoot Connections Per Tenant

Do not add until one tenant genuinely needs multiple Chatwoot accounts/inboxes.

Possible future table:

```text
portal_tenant_chatwoot_connections
```

First model remains:

```text
one tenant -> one Chatwoot account -> one portal API inbox
```

### Notification Follow-Ups

Basic chat notifications are implemented: tenant-scoped global preferences,
thread overrides, in-portal sound, Web Push subscriptions, safe push payloads
without message text and push delivery bookkeeping.

Deferred notification work:

- notification center/inbox with a list of events;
- cross-device durable unread counters beyond the current local indicators;
- email/digest notifications if that channel is explicitly opened;
- tenant-admin notification policy screen.

## 12. Risk Checklist

Before production, keep checking:

- unknown host does not fallback to default tenant;
- tenant A origin cannot mutate tenant B;
- same email can exist in multiple tenants;
- same Chatwoot contact/conversation IDs can exist in different tenants;
- webhook signed for tenant A cannot affect tenant B;
- PWA manifest/icon/title cannot leak another tenant's identity;
- browser never receives Chatwoot secrets;
- logs do not print tenant secrets;
- tenant admin cannot change another tenant.

## 13. References

- Chatwoot API docs:
  <https://developers.chatwoot.com/api-reference/introduction>
- Chatwoot Agents API:
  <https://developers.chatwoot.com/api-reference/agents/list-agents-in-account>
