# Multi-Tenant Portal Architecture Plan

## 1. Summary

Этот документ фиксирует план переделки `chatwoot-client-portal-v2` из single-tenant портала в tenant-aware портал.

Главная цель:

- один код портала должен уметь работать с несколькими B2B-компаниями;
- каждая B2B-компания получает свой tenant, свой бренд, свой Chatwoot account/inbox и свои данные;
- dedicated installation остается полностью поддерживаемой моделью: один portal deploy с одним tenant должен работать так же удобно, как текущий single-tenant вариант;
- shared SaaS installation становится возможной: один portal deploy обслуживает много tenants.

Текущий портал еще не вышел в production и реальных клиентов в нем нет. Поэтому мы можем переделывать фундамент достаточно смело, без тяжелой backward compatibility для live users. Но даже при этом работу нужно делать фазами, потому что главная опасность multi-tenant архитектуры - случайное смешивание данных разных компаний.

## 2. Decision Snapshot

Новая целевая модель:

```text
Portal installation
  -> one or many portal tenants
  -> each tenant maps to one Chatwoot account and one portal API inbox
  -> each tenant has its own users, sessions, contact links, conversations, send ledger, webhooks, branding and admin access
```

Dedicated mode:

```text
lk.client-a.com
  -> tenant client-a
  -> Chatwoot installation client-a
  -> Chatwoot account 1
  -> portal inbox 5
```

Shared SaaS mode:

```text
buhfirma example:
lk.buhfirma.ru
  -> tenant buhfirma
  -> shared Chatwoot installation
  -> Chatwoot account 3
  -> portal inbox 6

stroyfirma example:
lk.stroyfirma.ru
  -> tenant stroyfirma
  -> shared Chatwoot installation
  -> Chatwoot account 4
  -> portal inbox 9
```

Hybrid mode:

```text
lk.client-a.com
  -> tenant client-a
  -> shared Chatwoot installation
  -> Chatwoot account 3

lk.client-b.com
  -> tenant client-b
  -> dedicated Chatwoot installation
  -> Chatwoot account 1
```

In this plan, `hybrid` is only a deployment description:

```text
one portal deploy serves tenants,
some connected to shared Chatwoot,
some connected to dedicated Chatwoot
```

`hybrid` is not a tenant runtime mode and must not be stored in
`portal_tenants`.

This is the important compatibility rule:

```text
Multi-tenant portal with exactly one tenant = supported single-tenant dedicated portal.
```

## 3. Chatwoot Facts We Rely On

Official Chatwoot docs split APIs into three groups:

- Application APIs: account-level automation and agent/admin perspective.
- Client APIs: custom messaging experiences for end users.
- Platform APIs: installation-level management of users, accounts and roles.

For our portal runtime we should still prefer Application APIs through portal backend, not direct browser Chatwoot access.

Important official docs observations:

- Application API endpoints are account-scoped, for example `GET /api/v1/accounts/{account_id}/agents`.
- Agents API returns `account_id`, `confirmed`, `email` and `role`, where role can be `agent` or `administrator`.
- Platform APIs are for installation-level administration and are self-hosted/managed-hosting focused.
- Platform API tokens have permission boundaries: they cannot automatically access every UI-created account unless permitted.

Source inspection of `../chatwoot-ce-stable` confirms the same mental model:

- `Account` owns contacts, conversations, messages, inboxes, teams, webhooks, portals/help center and many other resources.
- `AccountUser` connects a Chatwoot user to an account and stores the role for that specific account.
- A user can exist in multiple accounts, and the role is account-specific.

Implication for us:

```text
Chatwoot Account ~= business workspace ~= natural tenant boundary.
```

But our portal tenant is slightly wider than Chatwoot Account, because it also owns:

- portal domain/subdomain;
- portal auth users;
- portal sessions;
- PWA branding;
- portal-specific Chatwoot config;
- webhook routing;
- future billing/provisioning metadata.

## 4. Current Baseline And What Must Change

Current `main` is still single-tenant. It assumes:

- one `CHATWOOT_BASE_URL`;
- one `CHATWOOT_ACCOUNT_ID`;
- one `CHATWOOT_PORTAL_INBOX_ID`;
- one `CHATWOOT_WEBHOOK_SECRET`;
- `portal_users.email` unique globally;
- customer session has only user identity, not tenant identity;
- contact links and conversation mappings are not tenant-scoped;
- webhook delivery dedupe is global;
- PWA manifest is global;
- future branding admin branch was correctly archived because it was based on single-tenant assumptions.

Target state:

- no runtime request may depend on global `CHATWOOT_ACCOUNT_ID` as authority;
- every customer/admin/runtime request must first resolve `currentTenant`;
- every portal-owned row that belongs to a company must be scoped by `tenant_id`;
- every Chatwoot call must use tenant-specific Chatwoot config;
- every unique constraint involving users, contacts, conversations, send keys or webhook deliveries must include tenant scope where relevant;
- frontend must treat tenant as origin/domain context, not as a user-selectable random parameter.

## 5. Terms

### Portal Installation

One deployed copy of `chatwoot-client-portal-v2`: frontend, backend, portal database and deployment infrastructure.

### Portal Tenant

One B2B company served by the portal.

Examples:

- clinic tenant;
- law firm tenant;
- accounting firm tenant;
- SaaS tenant.

### Dedicated Mode

One portal installation has one tenant. The tenant can point to a dedicated Chatwoot installation owned by that client.

This must remain supported.

### Shared SaaS Mode

One portal installation has many tenants. They can point to:

- different accounts inside one shared Chatwoot installation;
- or different Chatwoot installations;
- or a mix of both.

### Tenant Resolution

The process of deciding which tenant a request belongs to.

Preferred production signal:

```text
Host header / domain / subdomain
```

Examples:

```text
clinic.yourportal.com -> tenant clinic
support.client-law.com -> tenant client-law
```

Fallback/dev signal:

```text
local tenant domain mapping or explicit dev hostnames
```

Avoid using request body as the primary tenant selector for protected runtime flows. Body-based tenant selection is too easy to spoof and too easy to forget in one endpoint.

## 6. Non-Negotiable Security Rules

### Rule 1. Tenant Must Be Known Before Auth

The backend must resolve `currentTenant` before:

- login;
- registration;
- password reset;
- `/api/auth/me`;
- chat context;
- message send;
- attachment send;
- SSE;
- admin login;
- branding reads.

If tenant cannot be resolved, return controlled `404` or `400`, not fallback to some random default tenant.

Exception:

- local bootstrap scripts may use explicit default tenant config outside HTTP request flow.

### Rule 2. No Cross-Tenant Data Reads

Every repository method that reads tenant-owned data must require `tenantId`.

Bad:

```text
findUserByEmail(email)
```

Good:

```text
findUserByEmail({ tenantId, email })
```

Bad:

```text
findConversationMappingByUserId(userId)
```

Good:

```text
findConversationMapping({ tenantId, userId })
```

### Rule 3. Sessions Are Tenant-Bound

A session created for tenant A must not authenticate the same browser against tenant B.

Session table must store:

- `tenant_id`;
- `user_id`;
- `token_hash`;
- expiry metadata.

Session lookup must verify both:

- token hash;
- current tenant id.

### Rule 4. Email Is Not Globally Unique

The same email can exist in multiple tenants.

Correct uniqueness:

```text
unique(tenant_id, email)
```

Not:

```text
unique(email)
```

### Rule 5. Chatwoot Config Is Tenant-Owned

Runtime Chatwoot config must come from `currentTenant`.

Bad:

```text
env.CHATWOOT_ACCOUNT_ID
```

Good:

```text
currentTenant.chatwoot.accountId
currentTenant.chatwoot.portalInboxId
currentTenant.chatwoot.baseUrl
currentTenant.chatwoot.apiAccessToken
```

### Rule 6. Browser Never Gets Chatwoot Authority

This rule remains unchanged:

- no Chatwoot API tokens in browser;
- no direct browser Chatwoot API runtime;
- no Chatwoot cookie parsing;
- all Chatwoot access goes through portal backend.

### Rule 7. Webhooks Must Be Tenant-Resolved

Webhook processing must know tenant before dedupe and before realtime fanout.

Preferred webhook URL:

```text
POST /api/chatwoot/webhooks/{tenant_slug}
```

Then backend verifies:

- tenant exists;
- signature matches tenant webhook secret;
- payload account/inbox/conversation matches tenant expectations where possible.

Alternative for shared endpoint:

```text
POST /api/chatwoot/webhooks
```

Then backend must resolve tenant from signed payload fields and stored webhook config. This is more fragile and should not be first choice.

### Rule 8. Host And Origin Are Tenant-Aware

Tenant resolution and browser mutation protection must move together.

Production rules:

- resolve tenant from a normalized host only;
- lowercase host;
- strip port;
- reject empty, malformed or unknown hosts;
- do not trust arbitrary `X-Forwarded-Host` from the public internet;
- use forwarded host/proto headers only when the backend is behind a configured trusted proxy;
- keep backend inaccessible directly from the public internet where possible;
- for browser mutating routes, compare `Origin` with `currentTenant.publicBaseUrl`, not with one global `APP_ORIGIN`.

Webhook routes are different:

- Chatwoot webhooks usually do not rely on browser `Origin`;
- they must be protected by tenant-specific webhook secret verification instead.

## 7. Target Data Model

### 7.1 New Table: `portal_tenants`

Minimum fields:

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

Recommended notes:

- `slug` is stable and human-readable: `clinic-zdorovie`, `acme-legal`.
- `status` values: `active`, `suspended`, `provisioning`, `archived`.
- `primary_domain` is the canonical host for tenant resolution.
- `public_base_url` is the canonical URL used in emails, magic links, manifest URLs and webhook setup.
- `chatwoot_base_url` can differ per tenant.
- `chatwoot_account_id` is tenant-specific.
- `chatwoot_portal_inbox_id` is tenant-specific.
- secrets must not be stored plaintext.

Do not add `portal_tenants.mode` in `MT-1`.

Runtime identity is factual:

```text
Tenant = company + domain + exact Chatwoot connection
```

Shared/dedicated is inferred operationally:

- if multiple tenants point to the same `chatwoot_base_url` with different
  accounts, they use a shared Chatwoot instance;
- if a tenant points to a separate Chatwoot installation, that tenant uses a
  dedicated Chatwoot instance.

If operational reporting later needs labels, add a separate optional field such
as `chatwoot_connection_label` in a later phase. Do not add it in `MT-1`.

### 7.2 Optional Table: `portal_tenant_domains`

Use if one tenant can have more than one domain.

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

Examples:

```text
tenant clinic:
  clinic.yourportal.com
  support.clinic.ru
```

First implementation can keep one `primary_domain` in `portal_tenants` and add this table later. But the plan should not block future custom domains.

### 7.3 Optional Table: `portal_tenant_chatwoot_connections`

Use if we later support more than one Chatwoot connection per tenant.

For the first multi-tenant implementation, one tenant should map to exactly one Chatwoot account and one portal inbox.

Do not add multi-connection complexity until there is a real need.

### 7.4 Tenant-Scoped Existing Tables

Add `tenant_id` to:

```text
portal_users
portal_sessions
portal_user_contact_links
portal_user_chatwoot_conversations
portal_chat_message_sends
chatwoot_webhook_deliveries
verification_records
```

`verification_records` is the shared persistence table for email-code flows:

```text
purpose = registration
purpose = password_reset
```

Do not create a separate `password_reset_records` table in `MT-1`.
Tenant scope for password reset is added through `verification_records.tenant_id`.

Future or archived-branch tables must also be tenant-scoped:

```text
portal_branding_settings
portal_admin_login_challenges
portal_admin_sessions
portal_admin_audit_events
```

### 7.5 Unique Constraints To Change

`portal_users`

Current:

```text
unique(email)
```

Target:

```text
unique(tenant_id, email)
```

`portal_sessions`

Current:

```text
unique(token_hash)
```

Target:

```text
unique(token_hash)
index(tenant_id, user_id)
```

Token hash can remain globally unique, but session lookup must filter by tenant too.

`portal_user_contact_links`

Current:

```text
unique(user_id)
unique(chatwoot_contact_id)
```

Target:

```text
unique(tenant_id, user_id)
unique(tenant_id, chatwoot_contact_id)
```

Reason:

- contact IDs may collide across different Chatwoot installations;
- even inside one shared Chatwoot installation, account boundary matters.

`portal_user_chatwoot_conversations`

Current:

```text
unique(user_id)
unique(chatwoot_conversation_id)
```

Target:

```text
unique(tenant_id, user_id)
unique(tenant_id, chatwoot_conversation_id)
index(tenant_id, chatwoot_contact_id)
```

`portal_chat_message_sends`

Current:

```text
unique(user_id, primary_conversation_id, client_message_key)
```

Target:

```text
unique(tenant_id, user_id, primary_conversation_id, client_message_key)
index(tenant_id, user_id)
index(tenant_id, primary_conversation_id)
```

`chatwoot_webhook_deliveries`

Current:

```text
unique(delivery_key)
```

Target:

```text
unique(tenant_id, delivery_key)
index(tenant_id, chatwoot_conversation_id)
index(tenant_id, event_name, status)
```

`verification_records`

Target:

```text
index(tenant_id, email)
index(tenant_id, email, purpose, status)
index(tenant_id, portal_user_id)
```

### 7.6 Secret Storage

Tenant Chatwoot tokens and webhook secrets are not normal display settings.

Options:

1. Store encrypted ciphertext in DB using a portal master key from env.
2. Store secret references in DB and actual secrets in external secret manager.
3. For early local development only, create default tenant from env and do not persist secrets.

Recommended first production-capable path:

```text
PORTAL_TENANT_SECRET_KEY
  -> used by backend to encrypt/decrypt tenant Chatwoot API token and webhook secret
```

Requirements:

- use authenticated encryption, for example AES-256-GCM;
- never return decrypted secrets from public/admin APIs by default;
- do not log decrypted values;
- rotate plan documented before production.

### 7.7 Chatwoot Token Policy

Tenant Chatwoot API tokens are high-risk secrets.

Preferred policy:

- store one Chatwoot Application API token per tenant;
- do not reuse one broad multi-account user token across unrelated tenants unless there is no alternative;
- token owner should have the smallest practical access needed for that tenant account;
- runtime Chatwoot token and admin-verification authority are separate security concerns;
- do not add an admin-verification token to `portal_tenants` in `MT-1`;
- do not let one overly broad Chatwoot token become the implicit master key for chat runtime, tenant admin verification and provisioning;
- provisioning must verify that the token can access the configured `chatwoot_account_id`;
- provisioning must verify that the configured `chatwoot_portal_inbox_id` belongs to that tenant account;
- admin-auth checks must use the tenant's configured account and must still require `role === "administrator"` and `confirmed === true`.

Reason:

- Chatwoot Application API tokens are user access tokens and follow that user's permissions;
- if the same powerful token is reused everywhere, one tenant configuration mistake can become cross-tenant access.

Before `MT-9 Tenant Admin And Branding Rebuild`, run a short Chatwoot
permissions spike and choose the tenant admin verification token strategy.

Allowed options for `MT-9`:

1. use the same tenant runtime token only if its permissions are sufficient and
   not broader than acceptable for normal chat runtime;
2. add a separate tenant admin-verification token;
3. use a provisioning/platform-admin approach.

Preferred direction:

- if checking Chatwoot administrators requires broader permissions than normal
  chat runtime, use a separate tenant admin-verification token.

## 8. Tenant Resolution Strategy

### 8.1 Production Resolution

Recommended production domain convention:

```text
lk.<client-domain>
```

Examples:

```text
Host: lk.buhfirma.ru
  -> portal_tenants.primary_domain = lk.buhfirma.ru
  -> tenant = buhfirma

Host: lk.stroyfirma.ru
  -> portal_tenants.primary_domain = lk.stroyfirma.ru
  -> tenant = stroyfirma

Host: lk.zubi.ru
  -> portal_tenants.primary_domain = lk.zubi.ru
  -> tenant = zubi
```

Reason:

- `lk` is familiar in the Russian-speaking market as "личный кабинет";
- it does not conflict with the client's main marketing site on the root domain;
- it works for both shared SaaS and dedicated deployments;
- it lets backend resolve tenant by `Host` before auth;
- it keeps PWA install identity naturally tied to the client's domain.

Host normalization:

```text
LK.BUHFIRMA.RU:443. -> lk.buhfirma.ru
```

Implementation requirements:

- normalize host before DB lookup;
- store normalized domains only;
- apply a unique index on normalized domain values;
- reject unknown hosts without falling back to default tenant;
- document reverse proxy behavior explicitly.

Reverse proxy rule:

```text
public internet -> Caddy/Nginx -> portal backend
```

The backend should trust forwarded host/proto only from that known proxy boundary. If the backend can be called directly, raw `Host` spoofing must not let an attacker select another tenant.

Resolve by request host:

```text
Host: clinic.yourportal.com
  -> portal_tenants.primary_domain = clinic.yourportal.com
```

or:

```text
Host: support.clinic.ru
  -> portal_tenant_domains.domain = support.clinic.ru
```

### 8.2 Local Development Resolution

Preferred local hosts:

```text
clinic.127.0.0.1.nip.io:5173
legal.127.0.0.1.nip.io:5173
```

or:

```text
clinic.localhost
legal.localhost
```

Alternative dev-only fallback:

```text
X-Portal-Tenant: clinic
```

Use only in tests/dev tools. Do not make this the production browser mechanism.

### 8.3 Request Context

Backend should attach:

```text
request.tenant
```

Shape:

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

Only backend has the secret fields.

Frontend/public API may receive:

```ts
type PublicTenantContext = {
  slug: string
  displayName: string
  publicBaseUrl: string
}
```

## 9. Backend Architecture Changes

### 9.1 New Module: `tenant`

Add:

```text
backend/src/modules/tenants/
  repository.ts
  service.ts
  routes.ts
  schemas.ts
```

Responsibilities:

- resolve tenant by host;
- load tenant runtime config;
- decrypt tenant secrets;
- cache tenant configs safely;
- expose public tenant info;
- provide bootstrap/default tenant creation helpers.

### 9.2 Request Hook

Add Fastify hook before route handlers:

```text
resolveTenant(request)
```

Routes that do not need tenant:

- `/api/health`
- maybe static/backend operational routes

Most routes do need tenant:

- `/api/auth/*`
- `/api/chat/*`
- `/api/branding`
- `/api/admin/*`
- `/api/chatwoot/webhooks/:tenantSlug`

Tenant resolution should happen before browser origin checks, because expected origin is tenant-specific.

### 9.3 Repository Rule

Repository methods in tenant-owned modules must require tenant scope.

Examples:

```ts
portalUsersRepository.findByEmail({ tenantId, email })
portalSessionsRepository.findByToken({ tenantId, tokenHash })
chatContextRepository.findContactLink({ tenantId, userId })
chatMessagesRepository.createSendLedgerEntry({ tenantId, ... })
```

Avoid repository methods that can accidentally search globally.

### 9.4 Service Rule

Services receive `tenant` explicitly or through a typed request context.

Do not let service code import global `env.CHATWOOT_ACCOUNT_ID` for runtime decisions.

### 9.5 Chatwoot Client Factory

Current pattern:

```ts
createChatwootClient({ env })
```

Target pattern:

```ts
createChatwootClientFactory({ fetchFn })
chatwootClientFactory.forTenant(tenant.chatwoot)
```

or:

```ts
createChatwootClient({ config: tenant.chatwoot })
```

Where config is:

```ts
type ChatwootTenantConfig = {
  baseUrl: string
  accountId: number
  apiAccessToken: string
  portalInboxId: number
}
```

This is one of the highest-impact changes.

### 9.6 Env Role After Multi-Tenant

Global env remains for infrastructure:

```text
DATABASE_URL
PORT
APP_ORIGIN or allowed origins base config
SESSION_SECRET
SMTP_*
PORTAL_TENANT_SECRET_KEY
```

Tenant-specific Chatwoot env should become bootstrap defaults only:

```text
DEFAULT_TENANT_SLUG
DEFAULT_TENANT_DOMAIN
DEFAULT_TENANT_PUBLIC_BASE_URL
DEFAULT_TENANT_CHATWOOT_BASE_URL
DEFAULT_TENANT_CHATWOOT_ACCOUNT_ID
DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID
DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN
DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET
```

The old names:

```text
CHATWOOT_BASE_URL
CHATWOOT_ACCOUNT_ID
CHATWOOT_PORTAL_INBOX_ID
CHATWOOT_API_ACCESS_TOKEN
CHATWOOT_WEBHOOK_SECRET
```

can temporarily be accepted by a migration/bootstrap script, but must not remain runtime authority.

### 9.7 Tenant-Aware Origin Guard

Current code uses one `APP_ORIGIN` for browser mutation protection.

Multi-tenant target:

```ts
assertAllowedOrigin(request, tenant.publicBaseUrl)
```

or:

```ts
assertAllowedTenantOrigin(request, tenant)
```

Requirements:

- protect login, registration, password reset, logout, message send, attachment send and admin mutation routes;
- allow missing `Origin` only for explicitly documented non-browser/server-to-server routes;
- compare normalized origin values;
- never disable origin guard just because there are many tenant domains;
- tests must cover tenant A origin attempting to mutate tenant B host.

Infrastructure env may still define allowed proxy/runtime defaults, but tenant browser origin authority must come from tenant config.

## 10. Frontend And PWA Strategy

### 10.1 Tenant Comes From Origin

Frontend should not ask the user:

```text
Which company are you?
```

The company should be known from domain:

```text
clinic.yourportal.com
```

The frontend can call:

```text
GET /api/tenant
GET /api/branding
```

Both are resolved by backend using host.

### 10.2 PWA Manifest

Manifest must become tenant-aware:

```text
GET /api/tenant/manifest.webmanifest
```

This endpoint must resolve tenant by host and return tenant-specific:

- `id`;
- `name`;
- `short_name`;
- `theme_color`;
- `background_color`;
- icons;
- start URL;
- scope.

Dedicated mode works naturally because there is only one tenant/domain.

Shared mode works naturally if tenants use different origins/subdomains.

Required PWA identity rules:

- `id` must be stable and tenant-specific. Recommended value:
  `https://lk.<client-domain>/`;
- `start_url` must be tenant-local, for example `/` or `/?source=pwa`;
- `scope` must be tenant-local, normally `/`;
- `name` and `short_name` must come from tenant branding snapshot;
- icons must be tenant-specific or fallback-safe;
- icon URLs should include a tenant asset version or content hash to avoid stale installed icons after branding changes;
- manifest response must include no-store or short-cache headers until cache behavior is proven;
- manifest endpoint must never return another tenant's name, colors or icons.
- `MT-8` may use fallback icon assets, but icon URLs must already be
  tenant-aware so `MT-9` can swap in tenant-owned branding assets without
  changing the browser contract.

Examples:

```text
https://lk.buhfirma.ru/api/tenant/manifest.webmanifest
  id: https://lk.buhfirma.ru/
  name: Бухфирма
  short_name: Бухфирма
  start_url: /
  scope: /

https://lk.stroyfirma.ru/api/tenant/manifest.webmanifest
  id: https://lk.stroyfirma.ru/
  name: Стройфирма
  short_name: Стройка
  start_url: /
  scope: /
```

Do not use one global static `/manifest.webmanifest` generated at build time.
The URL can stay the same across tenants, but the backend response must be
resolved by host.

### 10.3 Service Worker

Recommended:

- use one service worker per origin;
- do not make path-based tenant model the default for production;
- never cache tenant-sensitive API responses as static shell assets;
- keep dynamic manifest network-first or no-store.

Why subdomain/domain is better than path:

```text
clinic.yourportal.com
legal.yourportal.com
```

Each tenant gets separate browser origin boundaries:

- cookies;
- local storage;
- service worker scope;
- PWA install identity;
- cache storage.

Path-based tenancy:

```text
yourportal.com/clinic
yourportal.com/legal
```

is more dangerous for PWA because service worker, cookies and caches share one origin.

### 10.4 Cookies

For subdomain/domain tenant model:

- use host-only cookies;
- do not set broad parent domain cookies unless there is a strong reason;
- same cookie name can be used because each tenant origin is separate.

For path-based dev/test model:

- backend session lookup still validates `tenant_id`;
- cookie alone is never enough.

### 10.5 Browser Install Metadata

Some browsers and mobile platforms also use HTML metadata around the manifest.

Requirements:

- `document.title` must update from tenant branding as soon as branding loads;
- `<meta name="theme-color">` must update from tenant branding;
- `apple-mobile-web-app-title` must update from tenant branding;
- `apple-touch-icon` must be tenant-aware through a dynamic endpoint, because
  Safari/iOS Home Screen installs use this HTML metadata for the main app icon;
- static `index.html` values may be generic fallback only;
- after tenant branding loads, the visible app shell must not keep old global
  brand text such as `ProvGroup`.

Manual testing is required on real mobile browsers because installed PWA icon
and title caching behavior differs between Chrome/Android and Safari/iOS.
If a tenant changes its installed-app icon after users have already installed
the PWA, some platforms may require reinstalling the Home Screen app before the
new icon is visible. Tenant branding should therefore be configured before
production rollout whenever possible.

## 11. Customer Auth Changes

### 11.1 Registration

Current conceptual flow:

```text
email -> find Chatwoot contact in global configured account -> code -> password
```

Target flow:

```text
resolve tenant
email -> find Chatwoot contact in tenant Chatwoot account -> code -> password
create portal user scoped to tenant
```

`portal_users` target:

```text
tenant_id
email
password_hash
...
unique(tenant_id, email)
```

### 11.2 Login

Current:

```text
email + password -> global user
```

Target:

```text
tenant + email + password -> tenant user
```

### 11.3 Password Reset

Current:

```text
email -> global verification_records row with purpose = password_reset
```

Target:

```text
tenant + email -> tenant verification_records row with purpose = password_reset
```

Response remains generic to avoid account disclosure.

Password reset continuation tokens stay in `verification_records`:

```text
continuation_token_hash
continuation_token_expires_at
```

### 11.4 Auth Tests

Required tests:

- same email can register/login in tenant A and tenant B independently;
- tenant A password does not authenticate tenant B user;
- tenant A session cookie cannot access tenant B `/api/auth/me`;
- password reset in tenant A does not create or verify token in tenant B.

### 11.5 Verification Locks And Continuation Tokens

Registration and password-reset flows currently use email-scoped advisory locks.

Multi-tenant target:

```text
lock key = purpose + tenant_id + normalized email
```

Every verification lookup must include tenant:

```text
tenant_id + purpose + normalized email + status
```

Continuation token verification must also be tenant-scoped. A verified registration/reset continuation token issued on tenant A must not complete setup on tenant B, even when the same email exists in both tenants.

## 12. Chat Runtime Changes

### 12.1 Chat Context

Every chat context resolution must include tenant:

```text
tenant
authenticated portal user
tenant Chatwoot contact link
tenant Chatwoot primary conversation mapping
```

### 12.2 Contact Links

Target:

```text
tenant_id
user_id
chatwoot_contact_id
```

Why tenant is needed:

- different Chatwoot installations can have the same numeric contact ID;
- same user email can exist in multiple tenants;
- account boundary must be explicit.

### 12.3 Primary Conversation Mapping

Target:

```text
tenant_id
user_id
chatwoot_contact_id
chatwoot_conversation_id
chatwoot_inbox_id
```

Existing single-primary conversation model remains valid inside one tenant.

Important:

```text
single primary conversation is per tenant user, not global user email.
```

### 12.4 Message Send Ledger

Target unique scope:

```text
tenant_id
user_id
primary_conversation_id
client_message_key
```

This prevents cross-tenant accidental idempotency collisions.

### 12.5 Attachments

Attachment validation remains the same, but send flow must use tenant Chatwoot client.

If we later store attachments locally before forwarding, storage path must include tenant:

```text
uploads/{tenant_slug}/...
```

### 12.6 Realtime SSE

SSE stream must be tenant-authenticated:

```text
tenant + session -> user stream
```

Realtime fanout keys should include tenant:

```text
tenantId:userId
tenantId:conversationId
```

### 12.7 Webhook Delivery

Webhook route preferred:

```text
POST /api/chatwoot/webhooks/{tenantSlug}
```

Processing:

1. Resolve tenant by `tenantSlug`.
2. Verify signature using tenant webhook secret.
3. Parse event.
4. Dedupe using `tenant_id + delivery_key`.
5. Resolve conversation mapping using `tenant_id + chatwoot_conversation_id`.
6. Fan out only to sessions inside same tenant.

Required tests:

- webhook signed with tenant A secret cannot affect tenant B;
- same delivery key can exist in tenant A and tenant B without conflict;
- conversation ID collision across different Chatwoot installations does not leak messages.

## 13. Admin And Branding Strategy

The archived branch `feature/phase-10-portal-branding-admin` must not be merged as-is.

Reason:

- it assumes global `CHATWOOT_ACCOUNT_ID`;
- it assumes one portal deploy has one brand;
- admin session is not tenant-aware.

Target admin model has two layers.

### 13.1 Tenant Admin

For B2B company administrators.

Route:

```text
https://tenant-domain/admin/login
```

Flow:

1. Resolve tenant by host.
2. Admin enters email.
3. Backend calls tenant Chatwoot Agents API using the `MT-9` decision-gated
   admin verification token strategy.
4. Require:
   - `account_id === tenant.chatwoot_account_id`;
   - `role === administrator`;
   - `confirmed === true`.
5. Send magic code/link.
6. Create tenant-scoped admin session.

### 13.2 Platform Admin

For us, the service operator.

Purpose:

- create tenants;
- configure domains;
- configure Chatwoot connection;
- rotate secrets;
- suspend tenant;
- inspect tenant health.

This can start as scripts/CLI, not UI.

Do not mix platform admin with tenant admin.

### 13.3 Branding

Branding must be tenant-owned:

```text
portal_branding_settings.tenant_id
```

Public endpoint:

```text
GET /api/branding
```

Backend resolves tenant by host and returns only that tenant's snapshot.

## 14. Provisioning Strategy

### 14.1 Minimal Manual Provisioning

First implementation can use scripts:

```text
pnpm --dir backend tenant:create
pnpm --dir backend tenant:update-chatwoot
pnpm --dir backend tenant:list
pnpm --dir backend tenant:verify-chatwoot
pnpm --dir backend tenant:configure-webhook
```

This is better than building a platform admin UI too early.

### 14.2 Tenant Creation Inputs

Required:

```text
slug
display name
primary domain
public base URL
Chatwoot base URL
Chatwoot account ID
Chatwoot portal inbox ID
Chatwoot API token
Chatwoot webhook secret
```

Validation required by `tenant:verify-chatwoot`:

- `chatwoot_base_url` is reachable;
- API token can access `chatwoot_account_id`;
- API token can read account agents/inboxes needed by our runtime;
- `chatwoot_portal_inbox_id` exists inside `chatwoot_account_id`;
- inbox is the expected API/portal channel type for this PWA integration;
- portal inbox routing settings match our single-primary conversation assumptions;
- account webhook can be created or updated with tenant-specific callback URL;
- webhook secret is present after configuration.

### 14.3 Default Tenant Bootstrap

For dedicated deploy compatibility, support:

```text
tenant:bootstrap-default
```

This reads env and creates one default tenant.

In a dedicated client install, this gives:

```text
one deploy
one tenant
one Chatwoot connection
```

## 15. Migration Strategy

Because there are no production clients yet, we can prioritize clean architecture over complex live migration.

Still, use forward migrations in this repo unless we explicitly decide to reset local development DB.

Recommended path:

### Step A. Add `portal_tenants`

- create tenant table;
- create one default tenant migration or bootstrap script;
- keep existing runtime working through default tenant for a short transition.

### Step B. Add Nullable `tenant_id`

Add nullable `tenant_id` to tenant-owned tables:

```text
portal_users
portal_sessions
portal_user_contact_links
portal_user_chatwoot_conversations
portal_chat_message_sends
chatwoot_webhook_deliveries
verification_records
```

Do not add `tenant_id` to `password_reset_records`; that table does not exist
and is not part of the target model.

### Step C. Backfill

Backfill all rows to default tenant.

### Step D. Make `tenant_id` Not Null

Add `NOT NULL` and foreign keys.

### Step E. Replace Unique Constraints

Drop global unique constraints that are no longer correct and add tenant-scoped constraints.

### Step F. Rewrite Services

After schema supports tenant, rewrite service/repository code to require tenant.

### Step G. Remove Runtime Dependence On Old Global Chatwoot Env

Global env can remain only for bootstrap and dev convenience.

### Transitional Runtime Gate

During the migration, some layers can become tenant-aware earlier than others.
This intermediate state is unsafe for shared SaaS customer runtime.

Unsafe example:

```text
Host resolves tenant A or tenant B
Chatwoot config is tenant-specific
portal users/sessions/chat mappings are still global
```

Rule:

- until tenant-scoped persistence, customer auth, chat runtime and webhooks are
  complete, customer runtime must stay in default-tenant / one-tenant mode;
- non-default tenants may exist for schema, repository, provisioning or isolated
  tests, but normal HTTP customer flows must hard-fail or stay disabled for
  them;
- `MT-2` tenant resolution and `MT-3` tenant-aware Chatwoot client do not mean
  shared SaaS runtime is enabled;
- tests that create multiple tenants before `MT-4`/`MT-5`/`MT-6`/`MT-7` must
  verify the guard instead of exercising real customer auth/chat flows across
  multiple runtime tenants.

## 16. Implementation Phases

Use `MT-*` phase names to avoid confusion with the existing product phases.

### MT-0. Plan And Governance

Deliverables:

- this document;
- decision entry in `docs/DECISIONS.md`;
- update `docs/ARCHITECTURE.md` to mark current single-tenant assumptions as superseded by tenant-aware target;
- update `docs/IMPLEMENTATION_PLAN.md` with Multi-Tenant Program section;
- confirm archived branding-admin branch remains archived and unmerged.

Checks:

- `git diff --check`;
- docs review.

Exit criterion:

- plan is accepted before any schema/code changes.

### MT-1. Tenant Schema Foundation

Deliverables:

- `portal_tenants` schema;
- optional `portal_tenant_domains` if we decide to support multiple domains immediately;
- tenant status enum or text validation strategy;
- no tenant `mode` field; shared/dedicated/hybrid stay deployment descriptions inferred from the exact Chatwoot connection;
- no admin-verification token field in `MT-1`; store only runtime Chatwoot connection secrets needed for portal operation;
- encrypted secret helper design;
- migrations;
- default tenant bootstrap script;
- repository tests.

Checks:

- backend build;
- backend tests for tenant repository/bootstrap.

Exit criterion:

- one default tenant can be created and loaded.

### MT-2. Tenant Resolution Middleware

Deliverables:

- host-based tenant resolver;
- host normalization and unknown-host hard fail;
- trusted proxy/forwarded-host rule documented and covered by tests;
- transitional runtime guard for non-default tenants;
- `request.tenant` typing;
- public `GET /api/tenant`;
- tenant-aware browser origin guard;
- controlled unknown-tenant response;
- dev/test host strategy;
- tests for host -> tenant mapping.

Checks:

- backend integration tests with multiple host headers;
- backend integration test where tenant A `Origin` attempts to mutate tenant B host;
- backend integration test proving non-default tenant customer runtime hard-fails
  until tenant isolation phases are complete;
- no tenant fallback in normal HTTP flow.

Exit criterion:

- backend can reliably identify tenant before auth routes.

### MT-3. Tenant-Aware Chatwoot Client

Deliverables:

- replace env-bound Chatwoot client runtime config with tenant config;
- Chatwoot client factory or per-tenant config input;
- least-privilege per-tenant Chatwoot token policy;
- tenant Chatwoot verification script;
- update registration/chat/webhook services to receive tenant Chatwoot config;
- keep bootstrap scripts able to create default tenant from env.

Checks:

- client tests for tenant A and tenant B base URLs/account IDs;
- verification test catches inbox/account mismatch;
- backend build;
- targeted service tests.

Exit criterion:

- no runtime service uses global `CHATWOOT_ACCOUNT_ID` as authority.

### MT-4. Tenant-Scoped Persistence

Deliverables:

- add `tenant_id` to tenant-owned tables;
- add `tenant_id` to `verification_records` for both registration and password reset email-code flows;
- update unique constraints;
- backfill default tenant;
- update repositories to require tenant ID;
- add tests that fail if tenant filter is missing.

Checks:

- backend tests for same email in two tenants;
- backend tests for same Chatwoot contact/conversation ID in two tenants;
- migration tests through PGlite.

Exit criterion:

- persistence layer cannot read customer/chat records without tenant scope.

### MT-5. Tenant-Aware Customer Auth

Deliverables:

- registration uses resolved tenant;
- login uses `tenant_id + email`;
- sessions store tenant ID;
- `/api/auth/me` validates current tenant;
- password reset is tenant-scoped;
- registration/password-reset advisory locks include tenant ID;
- verification continuation tokens are tenant-scoped;
- frontend remains same-origin without manual tenant selector.

Checks:

- same email can register in tenant A and tenant B;
- tenant A session rejected on tenant B host;
- password reset code from tenant A rejected on tenant B.
- registration continuation token from tenant A rejected on tenant B.

Exit criterion:

- customer auth is isolated by tenant.

### MT-6. Tenant-Aware Chat Runtime

Deliverables:

- chat context uses tenant-scoped contact links;
- primary conversation mapping is tenant-scoped;
- text send ledger is tenant-scoped;
- attachment send uses tenant Chatwoot config;
- SSE stream and fanout include tenant identity.

Checks:

- tenant A user cannot see tenant B chat context;
- same conversation ID in two tenants does not collide;
- retry/idempotency remains tenant-scoped.

Exit criterion:

- chat read/send/realtime runtime is tenant-isolated.

### MT-7. Tenant-Aware Webhooks And Provisioning

Deliverables:

- tenant-specific webhook endpoint or resolver;
- tenant-specific webhook secret verification;
- webhook delivery dedupe includes tenant ID;
- tenant webhook configure script;
- tenant health check script.

Checks:

- webhook signed with wrong tenant secret rejected;
- delivery key collision across tenants allowed safely;
- realtime delivery fanout only inside tenant.

Exit criterion:

- Chatwoot events from tenant A cannot affect tenant B.

### MT-8. Tenant-Aware Frontend/PWA

Deliverables:

- `GET /api/tenant`;
- tenant-aware branding fallback model;
- dynamic manifest resolved by tenant;
- dynamic `apple-touch-icon` resolved by tenant for iOS/iPadOS;
- service worker no-store/network-first handling for tenant dynamic metadata;
- local multi-host testing guide.

Checks:

- two local tenant hosts show different public tenant info;
- manifest differs by host;
- iOS touch icon endpoint is tenant-resolved and fallback-safe;
- no stale cached manifest across tenant hosts.

Exit criterion:

- PWA identity can differ per tenant.

### MT-9. Tenant Admin And Branding Rebuild

Deliverables:

- revisit archived branding-admin branch;
- port useful ideas only after tenant foundation is complete;
- run Chatwoot permissions spike;
- choose and document admin verification token strategy: runtime token if safe, separate admin-verification token, or provisioning/platform-admin approach;
- tenant-scoped admin login via Chatwoot administrator role;
- tenant-scoped branding settings;
- tenant-scoped audit events.

Checks:

- admin of tenant A cannot log into tenant B unless also admin in tenant B Chatwoot account;
- branding save affects only tenant A;
- public `/api/branding` for tenant B is unchanged.

Exit criterion:

- branding/admin feature is safe for multi-company use.

### MT-10. Deployment And Runbook Update

Deliverables:

- production deployment docs updated for dedicated and shared modes;
- tenant provisioning runbook;
- custom domain runbook;
- secret rotation note;
- backup/restore note for tenant config and portal DB;
- acceptance checklist.

Checks:

- docs review;
- dry-run commands for tenant scripts where possible.

Exit criterion:

- we can explain and repeat both deployment modes.

## 17. Required Tests

### Backend Unit/Integration

Minimum required:

- tenant repository create/load/update;
- host resolution;
- host normalization and unknown-host hard fail;
- tenant-aware origin guard;
- same email in two tenants;
- same Chatwoot contact ID in two tenants;
- same Chatwoot conversation ID in two tenants;
- session token from tenant A rejected on tenant B;
- registration tenant isolation;
- registration continuation token tenant isolation;
- password reset tenant isolation;
- tenant-scoped verification advisory lock keys;
- chat context tenant isolation;
- send ledger tenant isolation;
- webhook secret isolation;
- webhook dedupe per tenant;
- tenant-specific Chatwoot client config;
- Chatwoot tenant verification catches account/inbox mismatch.

### Frontend Unit

Minimum required:

- frontend renders tenant public info from `/api/tenant` or `/api/branding`;
- auth pages still work without manual tenant selection;
- branding/manifest fallback behavior remains safe;
- dynamic document title and theme color update from tenant branding.

### Playwright E2E

Required before production:

- two tenant hosts in one test run;
- register/login user with same email in tenant A and tenant B;
- tenant A chat does not show tenant B data;
- tenant-specific PWA manifest;
- manifest `id`, `start_url`, `scope`, name, colors and icon URLs differ safely by host;
- iOS `apple-touch-icon` URL resolves through current tenant and does not use
  one static global install icon as the browser contract;
- admin login isolation after MT-9.

## 18. Manual Acceptance Checklist

Dedicated mode:

- one portal deploy with one default tenant works like current portal;
- user can register/login/chat;
- Chatwoot account/inbox config comes from tenant row;
- production-style domain resolves correct tenant.

Shared mode:

- tenant A and tenant B run on different hostnames;
- same email can exist in both;
- sessions do not cross;
- Chatwoot calls use correct account/inbox per tenant;
- webhooks are isolated;
- PWA manifest differs per tenant;
- installed PWA name/icon/title are tenant-specific on at least Chrome Android
  and Safari iOS manual checks before production.

Security:

- unknown host does not fall back to default tenant;
- tenant A origin cannot mutate tenant B host;
- browser never receives Chatwoot token;
- logs do not print tenant secrets;
- tenant admin cannot change another tenant.

## 19. Major Risks And Mitigations

### Risk 1. Cross-Tenant Data Leak

Severity: critical.

Mitigation:

- tenant ID in schema;
- repository methods require tenant ID;
- tests with same email/contact/conversation IDs across tenants;
- code review rule: no tenant-owned query without tenant filter.

### Risk 2. Wrong Tenant Resolution

Severity: critical.

Mitigation:

- host allowlist;
- host normalization;
- trusted reverse proxy rule;
- no body-based production tenant selection;
- unknown host hard-fails;
- canonical domain config.

### Risk 3. Webhook Ambiguity

Severity: high.

Mitigation:

- tenant-specific webhook URL;
- tenant-specific secret;
- verify payload account/inbox where available.

### Risk 4. Secret Leakage

Severity: high.

Mitigation:

- encrypted secrets;
- no decrypted secret in API response;
- no logging secrets;
- separate platform admin access.

### Risk 5. PWA Cache Confusion

Severity: medium/high.

Mitigation:

- prefer subdomains/domains;
- no-store dynamic manifest;
- API no-cache boundary;
- avoid path-based production tenancy.

### Risk 6. Overbuilding Platform Admin Too Early

Severity: medium.

Mitigation:

- start with CLI/scripts for tenant provisioning;
- build UI only after tenant runtime is stable.

## 20. What We Should Not Do

Do not:

- merge `feature/phase-10-portal-branding-admin` as-is;
- store all tenants in global env only;
- let browser choose tenant by arbitrary request body;
- keep `portal_users.email` globally unique;
- keep webhook dedupe global;
- use one broad parent-domain cookie for all tenants without strong reason;
- patch Chatwoot core for this;
- move portal data into Chatwoot runtime database;
- use old `../chatwoot-client-portal` as reference.

## 21. Initial Decisions Before MT-1

These decisions are sufficient to start `MT-1 Tenant Schema Foundation`.

```text
tenant resolution: accepted production convention is lk.<client-domain>; path only dev
tenant mode: no portal_tenants.mode; shared/dedicated/hybrid inferred from exact Chatwoot connection/deployment description
transitional runtime: shared SaaS customer runtime disabled until tenant-scoped persistence/auth/chat/webhooks are complete
password reset persistence: verification_records with purpose = password_reset; no password_reset_records table
secret storage: encrypted DB fields with PORTAL_TENANT_SECRET_KEY
tenant provisioning: CLI/scripts first
local dev: nip.io or documented hosts file
migration style: forward migrations unless explicitly resetting local DB
platform APIs: optional later, not required for first tenant-aware runtime
admin verification token: deferred to MT-9 through F-MT-004; no admin-verification token in MT-1 schema
```

Deferred before `MT-9`:

- `F-MT-004`: run Chatwoot permissions spike and choose tenant admin
  verification token strategy before tenant admin/branding implementation.

## 22. Immediate Next Step

```text
docs-only checkpoint commit for MT-0 governance/review updates
```

Then:

```text
MT-1 tenant schema foundation
```

Only after MT-1, MT-2 and MT-3 should we return to branding/admin work.

## 23. References

- Chatwoot API introduction: https://developers.chatwoot.com/api-reference/introduction
- Chatwoot Agents API, account-scoped roles: https://developers.chatwoot.com/api-reference/agents/list-agents-in-account
- Chatwoot Platform APIs: https://developers.chatwoot.com/contributing-guide/chatwoot-platform-apis
- Chatwoot Platform Account Users API: https://developers.chatwoot.com/api-reference/account-users/list-all-account-users
- MDN Web App Manifest `id`: https://developer.mozilla.org/docs/Web/Progressive_web_apps/Manifest/Reference/id
- MDN Web App Manifest reference: https://developer.mozilla.org/docs/Web/Progressive_web_apps/Manifest
- Local source inspection: `../chatwoot-ce-stable/app/models/account.rb`
- Local source inspection: `../chatwoot-ce-stable/app/models/account_user.rb`
