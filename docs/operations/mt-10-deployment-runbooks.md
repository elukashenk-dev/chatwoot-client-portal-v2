# MT-10 Deployment And Operations Runbook

Status: current operations source of truth for deployment, runbooks and
operational readiness.

## Purpose

MT-10 keeps portal production operations repeatable without mixing portal work
with Chatwoot core maintenance.

This document is an index and operator checklist. It links to executable
runbooks instead of duplicating every low-level command.

## Current Support Level

### Ready Now

- dedicated one-tenant production install on the current one-VM stack;
- routine deploy from a clean reviewed commit;
- clean reinstall/reconfigure of portal-owned runtime;
- operator CLI tenant creation through Chatwoot Platform API and portal DB;
- operator CLI tenant archive/deprovision flow with explicit confirmation;
- tenant Chatwoot account reconciliation for drift detection;
- tenant Chatwoot API Channel verification and webhook configuration;
- portal-owned object storage for branding assets;
- custom client-domain host ingress/cert preparation after DNS points to the
  production VM;
- production smoke checklist for portal auth, chat, admin branding and PWA.

### Ready As Operator CLI, Not Yet Self-Service

The runtime model is tenant-aware and shared SaaS tenant creation now has an
operator CLI path. It is not yet a self-service client signup flow and does not
automate provider DNS changes.

Current executable provisioning paths:

```bash
scripts/configure-tenant-domain-ingress.sh --domain=<host> ...
pnpm --dir backend tenant:bootstrap-default
pnpm --dir backend tenant:create -- --slug=<slug> ...
pnpm --dir backend tenant:chatwoot:reconcile -- --dry-run
pnpm --dir backend tenant:deprovision -- --tenant=<slug> --archive-only --confirm=<slug>
pnpm --dir backend tenant:chatwoot:verify -- --tenant=<slug>
pnpm --dir backend tenant:chatwoot:webhook:configure -- --tenant=<slug>
```

Before broad shared SaaS rollout, the remaining operations gap is rehearsal and
automation around:

- provider DNS setup and provider-subdomain wildcard ingress/certificate
  provisioning;
- provider-domain `/api/tenant` smoke before client handoff, using
  `docs/operations/mt-10a-tenant-lifecycle-rehearsal.md`;
- operator UX/audit wrapper if CLI is not enough for day-to-day operations,
  tracked in `docs/findings/F-OPS-003-mt10a-operator-ui-audit-wrapper.md`.

## Source Of Truth Map

- Routine deploy guardrails:
  `docs/operations/production-deployment.md`
- Clean reinstall/reconfigure runbook:
  `docs/operations/production-clean-reinstall.md`
- Stable production VM facts:
  `docs/operations/production-server-notes.md`
- Production browser QA cycle:
  `docs/operations/production-mcp-playwright-test-cycle.md`
- Installed PWA smoke:
  `docs/operations/installed-pwa-smoke.md`
- Local runtime testing:
  `docs/operations/local-testing.md`
- Local cross-tenant data:
  `docs/operations/local-cross-tenant-test-data.md`
- Chatwoot account lifecycle and portal provisioning research:
  `docs/operations/chatwoot-account-lifecycle-portal-provisioning-research.md`
- Chatwoot production upgrade lessons and maintenance-window decision:
  `docs/operations/chatwoot-4-13-upgrade-notes.md`
- MT-10A tenant lifecycle production rehearsal:
  `docs/operations/mt-10a-tenant-lifecycle-rehearsal.md`
- Custom client-domain ingress/cert helper:
  `scripts/configure-tenant-domain-ingress.sh`
- Architecture boundaries:
  `docs/architecture/overview.md`
- Tenant model and platform operations:
  `docs/architecture/multi-tenant-reference.md`

## Hard Boundaries

- Do not stop, reset, migrate or edit production Chatwoot as part of portal
  deploys.
- Do not touch Chatwoot PostgreSQL, uploads or services as part of portal
  deploys.
- Production Chatwoot admin/runtime must use only `https://app.lancora.ru`;
  do not keep a legacy Chatwoot Nginx site as fallback or redirect.
- Do not use global `CHATWOOT_*` env as portal runtime authority.
- Do not expose portal backend, portal Postgres or object storage publicly.
- Do not commit `.env`, secrets, deploy logs, `node_modules`, `dist`,
  `playwright-report`, `test-results` or runtime artifacts.
- Browser never receives Chatwoot tokens, object-storage credentials, bucket
  names or object keys.
- Do not use `provgroup.ru` mailboxes as the production service sender for
  Lancora or customer tenants.

Allowed Chatwoot-side changes are limited to the tenant API Channel inbox:

- verify that the inbox belongs to the tenant Chatwoot account and is
  `Channel::Api`;
- enable `lock_to_single_conversation=true` when needed;
- set the portal webhook URL;
- read the returned Chatwoot `Channel::Api.secret`;
- store that secret encrypted in the portal tenant record.

## Production Mail Sender

Production service mail is sent from `Lancora <no-reply@lancora.ru>` through
Yandex 360 SMTP.

This sender is shared by:

- portal backend verification emails for `lk.*` tenants;
- Chatwoot service emails such as password reset and invitations from
  `app.lancora.ru`.

Current target settings:

```text
SMTP host: smtp.yandex.ru
SMTP port: 465
SMTP mode: SSL
SMTP username: no-reply@lancora.ru
SMTP from: Lancora <no-reply@lancora.ru>
```

Runtime locations:

```text
/opt/chatwoot-client-portal-v2/.env.production
/home/chatwoot/chatwoot/.env
```

Never paste the Yandex app password into chat or commit it. Read it from an
interactive terminal prompt and write it only to the runtime `.env` files.

After changing mail settings:

```bash
cd /opt/chatwoot-client-portal-v2
docker compose --env-file .env.production -f infra/production/compose.yaml config --quiet
docker compose --env-file .env.production -f infra/production/compose.yaml up -d --no-deps --force-recreate portal-backend

sudo systemctl restart chatwoot-web.1.service chatwoot-worker.1.service
```

Verify:

```bash
curl -fsS https://lk.pronalogi.pro/api/health
curl -fsS https://app.lancora.ru/api
```

Manual acceptance:

- portal registration code arrives from `no-reply@lancora.ru`;
- Chatwoot password reset for a tenant admin arrives from
  `no-reply@lancora.ru`;
- Chatwoot worker logs do not show `SMTPAuthenticationError` after the change.

## Routine Dedicated Deploy

Use this path for ordinary feature/fix deploys when production is already
bootstrapped.

Prerequisites:

- user explicitly approved production push/deploy;
- current branch is `main`;
- `git status --short` is empty;
- `origin/main` contains the reviewed commit;
- targeted checks for the current slice passed;
- `pnpm build`, `pnpm lint` and `git diff --check` pass, or a blocker is
  explicitly recorded.

Deploy command:

```bash
scripts/deploy-production-archive.sh \
  --host=ubuntu@93.77.166.238 \
  --app-path=/opt/chatwoot-client-portal-v2 \
  --activate
```

After deploy, verify:

```bash
ssh ubuntu@93.77.166.238
cd /opt/chatwoot-client-portal-v2
cat DEPLOY_SOURCE.txt
docker compose --env-file .env.production -f infra/production/compose.yaml ps
curl -fsS https://lk.provgroup.ru/api/health
curl -fsS https://lk.provgroup.ru/api/tenant
```

Then run the tenant Chatwoot verification:

```bash
docker compose --env-file .env.production -f infra/production/compose.yaml exec -T portal-backend \
  node backend/dist/scripts/verify-tenant-chatwoot-connection.js --tenant=provgroup
```

## Clean Reinstall Or Reconfigure

Use the clean reinstall runbook only when portal-owned production runtime must
be recreated or deeply reconfigured.

Runbook:

```text
docs/operations/production-clean-reinstall.md
```

Default clean reinstall must preserve these production volumes:

- `chatwoot-client-portal-v2_portal-db-data`;
- `chatwoot-client-portal-v2_portal-object-storage-data`.

Destructive volume reset is allowed only after explicit operator approval and a
verified backup/restore plan.

## Dedicated One-Tenant Provisioning

The current production business mode can still be a dedicated one-tenant
portal. It uses the same tenant-aware runtime model as shared SaaS, but only
one tenant is bootstrapped.

Required inputs:

```text
DEFAULT_TENANT_SLUG
DEFAULT_TENANT_DISPLAY_NAME
DEFAULT_TENANT_PRIMARY_DOMAIN
DEFAULT_TENANT_PUBLIC_BASE_URL
DEFAULT_TENANT_CHATWOOT_BASE_URL
DEFAULT_TENANT_CHATWOOT_ACCOUNT_ID
DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID
DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN
DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN
DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET
PORTAL_TENANT_SECRET_KEY
```

From a source checkout with dependencies installed, the script family is:

```bash
pnpm --dir backend tenant:bootstrap-default
pnpm --dir backend tenant:chatwoot:verify -- --tenant=<slug>
pnpm --dir backend tenant:chatwoot:webhook:configure -- --tenant=<slug>
```

In production compose, use the built scripts:

```bash
docker compose --env-file .env.production -f infra/production/compose.yaml exec -T portal-backend \
  node backend/dist/scripts/bootstrap-default-tenant.js

docker compose --env-file .env.production -f infra/production/compose.yaml exec -T portal-backend \
  node backend/dist/scripts/verify-tenant-chatwoot-connection.js --tenant=<slug>

docker compose --env-file .env.production -f infra/production/compose.yaml exec -T portal-backend \
  node backend/dist/scripts/configure-tenant-chatwoot-webhook.js --tenant=<slug>
```

Expected result:

- tenant exists in portal DB;
- tenant primary domain resolves through `/api/tenant`;
- Chatwoot account ID matches the configured tenant account;
- Chatwoot inbox is an API Channel inbox;
- API Channel webhook URL points to
  `https://<tenant-domain>/api/chatwoot/webhooks`;
- Chatwoot returned `Channel::Api.secret` is stored encrypted in portal DB.

## Shared SaaS Operator Provisioning

Shared SaaS should reuse the same runtime boundaries:

- tenant is resolved by Host/domain;
- one tenant maps to one Chatwoot account and one portal API Channel inbox;
- browser never chooses tenant manually in production;
- portal DB stores tenant runtime configuration and encrypted secrets;
- Chatwoot remains an external service and system of record for chat data;
- provider/operator runs provisioning; public Chatwoot signup is not a
  production tenant creation authority.

Required runtime env:

```text
DATABASE_URL
PORTAL_TENANT_SECRET_KEY
CHATWOOT_PLATFORM_API_ACCESS_TOKEN
PORTAL_PROVISIONING_SERVICE_EMAIL_DOMAIN
```

Provider-subdomain tenants additionally require:

```text
PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX
```

`PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX` is deployment configuration, not a
hard-coded provider brand. Examples below use `portal.example.com`; production
must use the provider-owned suffix chosen for that deployment.

Custom-domain host ingress/cert preparation on the production VM, before
`tenant:create`:

```bash
cd /opt/chatwoot-client-portal-v2
sudo scripts/configure-tenant-domain-ingress.sh \
  --domain=lk.<client-domain> \
  --letsencrypt-email=no-reply@lancora.ru \
  --expected-ip=93.77.166.238
```

Expected pre-tenant result:

- DNS for `lk.<client-domain>` includes the expected production VM IPv4;
- host Nginx has a dedicated portal site for that host;
- changed Nginx files are backed up before rewrite;
- Certbot has issued a certificate for that host;
- `https://lk.<client-domain>/api/tenant` reaches the portal and returns
  `TENANT_NOT_FOUND` until `tenant:create` creates the tenant.

Custom-domain tenant creation:

```bash
pnpm --dir backend tenant:create -- \
  --slug=buhfirma \
  --display-name="Бухфирма" \
  --primary-domain=lk.buhfirma.ru \
  --public-base-url=https://lk.buhfirma.ru \
  --chatwoot-base-url=https://example.ru \
  --client-admin-email=admin@buhfirma.ru \
  --client-admin-name="Иван Админ"
```

After `tenant:create`, re-run the ingress helper as a public route check:

```bash
cd /opt/chatwoot-client-portal-v2
sudo scripts/configure-tenant-domain-ingress.sh \
  --domain=lk.<client-domain> \
  --letsencrypt-email=no-reply@lancora.ru \
  --expected-ip=93.77.166.238 \
  --tenant-state=present \
  --expected-tenant-slug=<slug> \
  --skip-certbot
```

Provider-subdomain tenant creation:

```bash
pnpm --dir backend tenant:create -- \
  --slug=buhfirma \
  --display-name="Бухфирма" \
  --provider-subdomain=buhfirma \
  --chatwoot-base-url=https://example.ru \
  --client-admin-email=admin@buhfirma.example \
  --client-admin-name="Иван Админ"
```

Lifecycle checks:

```bash
pnpm --dir backend tenant:chatwoot:reconcile -- --dry-run
pnpm --dir backend tenant:chatwoot:ensure-portal-attributes -- --tenant=<slug>
pnpm --dir backend tenant:deprovision -- --tenant=buhfirma --archive-only --confirm=buhfirma
```

Use `tenant:chatwoot:reconcile -- --apply` only after reviewing dry-run output.
Use `tenant:chatwoot:ensure-portal-attributes -- --tenant=<slug>` to repair or
verify Chatwoot contact custom attribute definitions for an existing tenant.
Use
`tenant:deprovision -- --tenant=<slug> --delete-chatwoot-account --confirm=<slug>`
only when the operator explicitly intends to suspend the portal tenant and
request Chatwoot Platform API account deletion.

Expected result from `tenant:create`:

- Chatwoot account exists and belongs to the platform app;
- client admin user exists and is an administrator in that account;
- portal runtime and admin-verification service users exist;
- tenant API Channel inbox exists and is configured for the tenant webhook URL;
- Chatwoot contact custom attribute definitions exist for
  `portal_enabled`, `portal_contact_type`, `portal_client_group_contact_ids`
  and `curator_name`;
- portal tenant row exists with encrypted runtime/admin/webhook secrets;
- rerunning the same command is idempotent for the same tenant/domain inputs.

Minimum acceptance before production shared SaaS:

- operator creates a tenant without editing DB rows manually;
- provider DNS points the tenant host to the portal reverse proxy;
- custom-domain tenants use the ingress helper above, or provider-subdomain
  tenants have equivalent wildcard DNS/cert/proxy routing;
- `/api/tenant` returns the intended tenant on the new host;
- tenant Chatwoot connection verification passes;
- tenant API Channel webhook configuration passes;
- unknown Host does not fall back to another tenant;
- tenant A cannot read or mutate tenant B settings, assets, sessions or
  Chatwoot runtime config;
- per-tenant smoke covers auth, chat, admin branding, webhook delivery and PWA
  manifest.

## Domain And DNS Runbook

Production supports two tenant domain modes.

### Custom Client Domain

Client-facing convention:

```text
lk.<client-domain>
```

Examples:

```text
lk.provgroup.ru
lk.buhfirma.ru
lk.stroyfirma.ru
```

For each custom-domain tenant:

- B2B client or provider creates DNS for `lk.<client-domain>` pointing to the
  portal reverse proxy VM;
- provider runs `scripts/configure-tenant-domain-ingress.sh` on the production
  VM before `tenant:create`;
- `DEFAULT_TENANT_PRIMARY_DOMAIN` or tenant `primary_domain` equals that host;
- `DEFAULT_TENANT_PUBLIC_BASE_URL` or tenant `public_base_url` equals
  `https://lk.<client-domain>`;
- portal reverse proxy routes that host to the portal web container and
  preserves the original `Host`;
- backend tenant resolution uses the request Host through the trusted proxy
  boundary;
- unknown hosts fail closed and must not resolve to the default tenant.

### Provider-Owned Subdomain

Provider-facing convention:

```text
<tenant-slug>.<PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX>
```

Example:

```text
buhfirma.portal.example.com
```

For each provider-subdomain tenant:

- `PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX` is set to the provider-owned suffix,
  for example `portal.example.com`;
- wildcard DNS for `*.PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX` points to the
  portal reverse proxy VM;
- TLS covers the generated host, usually through a wildcard certificate or
  equivalent certificate automation;
- reverse proxy routes the generated host to the portal web container and
  preserves the original `Host`;
- trusted proxy configuration preserves only controlled `X-Forwarded-Host`
  values when `PORTAL_TRUST_PROXY=true`;
- `tenant:create -- --provider-subdomain=<tenant-slug>` resolves
  `primary_domain` to
  `<tenant-slug>.<PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX>` and `public_base_url`
  to `https://<tenant-slug>.<PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX>`;
- `/api/tenant` returns the intended tenant on the generated host before
  handoff.

In both modes, provisioning is provider/operator-owned. The browser never
chooses tenant manually, and public Chatwoot signup does not create a production
portal tenant.

## Tenant Chatwoot Connection Verification

Use verification after:

- clean reinstall;
- routine deploy that touched Chatwoot integration;
- Chatwoot upgrade;
- tenant token rotation;
- API Channel inbox change;
- webhook reconfiguration.

Command in production compose:

```bash
docker compose --env-file .env.production -f infra/production/compose.yaml exec -T portal-backend \
  node backend/dist/scripts/verify-tenant-chatwoot-connection.js --tenant=<slug>
```

Then configure the API Channel webhook:

```bash
docker compose --env-file .env.production -f infra/production/compose.yaml exec -T portal-backend \
  node backend/dist/scripts/configure-tenant-chatwoot-webhook.js --tenant=<slug>
```

Expected:

- verification exits `0`;
- configured inbox belongs to the tenant Chatwoot account;
- `lock_to_single_conversation=true`;
- webhook URL matches the tenant public base URL;
- stored webhook secret is the Chatwoot `Channel::Api.secret`, not an account
  webhook secret.

## Secret Rotation Notes

Never write secret values into docs, commits or chat.

`PORTAL_TENANT_SECRET_KEY`:

- high-risk root key for tenant secret encryption;
- no automated rotation flow exists yet;
- rotation requires maintenance window, DB backup, decrypt/re-encrypt plan and
  rollback path;
- do not rotate casually.

Tenant Chatwoot runtime API token:

- update the encrypted tenant secret through a future operator CLI/UI or the
  dedicated reinstall/reconfigure path;
- run tenant Chatwoot verification after rotation;
- run webhook configure if the API Channel permissions or inbox changed.

Tenant admin verification token:

- affects admin login verification, not customer chat runtime;
- rotate separately from the runtime API token when possible;
- tenant admin login must fail closed if the token is missing, invalid or cannot
  read Chatwoot agents.

Tenant API Channel webhook secret:

- source of truth is Chatwoot `Channel::Api.secret`;
- run webhook configure to refresh and store the current value;
- do not invent or manually reuse account-level webhook secrets.

`SESSION_SECRET`:

- rotation invalidates existing portal sessions;
- plan user logout impact.

Object-storage credentials:

- rotate the object-storage app user and backend env together;
- preserve bucket and object-storage volume;
- verify admin branding upload/readback/delete after rotation.

SMTP credentials:

- update env and restart backend;
- verify registration, login code and password reset email delivery.

VAPID keys:

- rotation can invalidate existing Web Push subscriptions;
- plan a re-subscribe path for installed PWAs.

## Backup And Restore Notes

Portal backup scope:

- portal DB volume: `chatwoot-client-portal-v2_portal-db-data`;
- portal object-storage volume:
  `chatwoot-client-portal-v2_portal-object-storage-data`;
- production env: `.env.production`;
- deploy source marker: `DEPLOY_SOURCE.txt`;
- portal Nginx site for `lk.<client-domain>`, if managed on the host.

Chatwoot backup is separate and not covered by portal runbooks.

Restore order:

1. Restore `.env.production`.
2. Restore portal DB volume.
3. Restore portal object-storage volume.
4. Deploy the intended reviewed portal commit.
5. Run migrations/startup.
6. Check `/api/health`.
7. Check `/api/tenant`.
8. Run tenant Chatwoot verification.
9. Verify branding asset readback.
10. Run auth/chat/admin/PWA smoke.

Do not restore a portal DB without the matching `PORTAL_TENANT_SECRET_KEY`,
because encrypted tenant secrets become unreadable.

Do not restore object-storage assets without the matching portal DB records,
because the DB is the source of truth for asset ownership, kind, content type,
checksum and active branding references.

## Production Acceptance Checklist

Before deploy:

- user approved production push/deploy;
- branch is `main`;
- `git status --short` is empty;
- reviewed commit is present in `origin/main`;
- required checks for the slice passed;
- secrets are not staged;
- no generated output is staged.

After deploy:

- `DEPLOY_SOURCE.txt` matches the intended commit;
- compose services are healthy/running;
- `/api/health` returns ok;
- `/api/tenant` returns the intended tenant;
- tenant Chatwoot verification passes;
- API Channel webhook configure/check passes when required;
- login, registration and password reset flows work;
- personal chat can send a customer message and receive support reply;
- group chat still renders participants and support badges;
- admin login works for the tenant;
- admin branding settings save and reset work;
- admin branding upload/readback/delete works for a small PNG;
- public branding asset route returns `200` and image content type;
- tenant PWA manifest title/colors/icons are correct;
- installed PWA smoke is run on real device when available;
- production Chatwoot remains healthy on `app.lancora.ru`.
