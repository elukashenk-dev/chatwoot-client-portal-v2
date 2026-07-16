# MT-10A Tenant Lifecycle Rehearsal Runbook

Status: required rehearsal before broad shared SaaS or provider-subdomain
production use.

Use this runbook to prove that MT-10A works on the intended production-like
Portal + Chatwoot + tenant-domain path, not only in unit tests.

## Goal

Create one disposable tenant, verify that its public domain resolves to the
correct portal tenant, verify Chatwoot connectivity and webhook configuration,
check reconciliation in dry-run mode, then safely archive the disposable tenant.

This rehearsal closes the operational part of
`docs/findings/F-OPS-002-mt10a-domain-ingress-readiness.md` only when the
observed production smoke result is recorded without secrets.

## Hard Boundaries

- Use a disposable rehearsal tenant, not a real customer tenant.
- Do not run `--delete-chatwoot-account` during the first rehearsal.
- Do not edit Chatwoot core, Chatwoot DB, Chatwoot uploads or Chatwoot Nginx
  sites.
- Do not print or copy secrets into docs, chat, commit messages, screenshots or
  issue text.
- Stop if DNS, TLS, reverse proxy or Host preservation does not work. Do not
  hide that by testing only with direct container/internal URLs.
- Stop if any CLI report prints plaintext Chatwoot tokens, webhook secrets,
  generated passwords or Platform API tokens.

## Choose The Domain Mode

Run exactly one mode for the first rehearsal.

Provider-owned subdomain mode proves the shared SaaS path:

```text
<tenant-slug>.<PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX>
```

Custom-domain mode proves a client-owned tenant host:

```text
lk.<client-domain>
```

Provider-owned subdomain mode is the default recommendation for broad shared
SaaS because one wildcard DNS/certificate/proxy setup can serve many tenants.

## Required Inputs

Prepare these non-secret values:

```text
TENANT_SLUG=mt10a-smoke-20260614
TENANT_DISPLAY_NAME=MT-10A Smoke 2026-06-14
TENANT_ADMIN_EMAIL=mt10a-smoke-20260614@example.com
TENANT_ADMIN_NAME=MT-10A Smoke Admin
CHATWOOT_BASE_URL=https://chat.example.com
```

For provider-owned subdomain mode, also confirm that `.env.production` inside
the deployed portal stack has:

```text
PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX=<provider-owned tenant suffix>
```

For custom-domain mode, prepare:

```text
TENANT_HOST=<client-owned tenant host>
TENANT_PUBLIC_BASE_URL=https://<client-owned tenant host>
```

Required production secrets must already be configured in `.env.production`;
do not print them:

```text
DATABASE_URL
PORTAL_TENANT_SECRET_KEY
CHATWOOT_PLATFORM_API_ACCESS_TOKEN
PORTAL_PROVISIONING_SERVICE_EMAIL_DOMAIN
```

## Production Command Wrapper

On the portal VM:

```bash
ssh -p 22 -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$HOME/.ssh/production_known_hosts" -o IdentitiesOnly=yes -i "$HOME/.ssh/production_deploy_key" ubuntu@93.77.166.238
cd /opt/chatwoot-client-portal-v2

run_backend() {
  docker compose --env-file .env.production -f infra/production/compose.yaml \
    exec -T portal-backend node "$@"
}
```

Confirm the deployed source and containers:

```bash
source_commit="$(sed -n 's/^source_commit=//p' DEPLOY_SOURCE.txt)"
staged_current="$(cat .release-state/current)"
test -n "$source_commit"
test "$source_commit" = "$staged_current"
docker compose --env-file .env.production -f infra/production/compose.yaml ps
curl -fsS https://lk.provgroup.ru/api/health
```

Expected:

- the active `key=value` marker has exactly one `source_commit=` value and it
  agrees with staged `.release-state/current`;
- portal containers are running or healthy;
- health returns `status: ok`.

## Step 1. Set Rehearsal Variables

Provider-owned subdomain mode:

```bash
export TENANT_SLUG=mt10a-smoke-20260614
export TENANT_DISPLAY_NAME="MT-10A Smoke 2026-06-14"
export TENANT_ADMIN_EMAIL="mt10a-smoke-20260614@example.com"
export TENANT_ADMIN_NAME="MT-10A Smoke Admin"
export CHATWOOT_BASE_URL="https://chat.example.com"

export PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX="$(
  docker compose --env-file .env.production -f infra/production/compose.yaml \
    exec -T portal-backend printenv PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX
)"
export TENANT_HOST="${TENANT_SLUG}.${PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX}"
export TENANT_PUBLIC_BASE_URL="https://${TENANT_HOST}"
```

Custom-domain mode:

```bash
export TENANT_SLUG=mt10a-smoke-20260614
export TENANT_DISPLAY_NAME="MT-10A Smoke 2026-06-14"
export TENANT_ADMIN_EMAIL="mt10a-smoke-20260614@example.com"
export TENANT_ADMIN_NAME="MT-10A Smoke Admin"
export CHATWOOT_BASE_URL="https://chat.example.com"
export TENANT_HOST="lk.mt10a-smoke.example.com"
export TENANT_PUBLIC_BASE_URL="https://${TENANT_HOST}"
```

Check the variables before continuing:

```bash
printf 'tenant=%s\nhost=%s\nurl=%s\nchatwoot=%s\n' \
  "$TENANT_SLUG" "$TENANT_HOST" "$TENANT_PUBLIC_BASE_URL" "$CHATWOOT_BASE_URL"
```

Expected:

- values describe a disposable tenant;
- no value is a secret;
- `TENANT_HOST` is the public host that the browser will use.

## Step 2. Check DNS, TLS And Proxy Before Tenant Creation

This proves the public host reaches the portal before any tenant row exists.

```bash
getent ahosts "$TENANT_HOST" | head
curl -sS -o /tmp/mt10a-precreate-tenant.json -w '%{http_code}\n' \
  "${TENANT_PUBLIC_BASE_URL}/api/tenant"
cat /tmp/mt10a-precreate-tenant.json
```

Expected before tenant creation:

- DNS resolves the tenant host to the portal ingress path;
- TLS certificate is accepted by `curl` without `-k`;
- HTTP status is usually `404`;
- JSON error code is usually `TENANT_NOT_FOUND`.

Stop if:

- DNS does not resolve;
- TLS fails;
- the request reaches Chatwoot, a default website or any non-portal service;
- the response comes from the portal but uses the wrong tenant.

## Step 3. Create The Test Tenant

Provider-owned subdomain mode:

```bash
run_backend backend/dist/scripts/create-tenant.js \
  --slug="$TENANT_SLUG" \
  --display-name="$TENANT_DISPLAY_NAME" \
  --provider-subdomain="$TENANT_SLUG" \
  --chatwoot-base-url="$CHATWOOT_BASE_URL" \
  --client-admin-email="$TENANT_ADMIN_EMAIL" \
  --client-admin-name="$TENANT_ADMIN_NAME" \
  | tee /tmp/mt10a-create-tenant.json
```

Custom-domain mode:

```bash
run_backend backend/dist/scripts/create-tenant.js \
  --slug="$TENANT_SLUG" \
  --display-name="$TENANT_DISPLAY_NAME" \
  --primary-domain="$TENANT_HOST" \
  --public-base-url="$TENANT_PUBLIC_BASE_URL" \
  --chatwoot-base-url="$CHATWOOT_BASE_URL" \
  --client-admin-email="$TENANT_ADMIN_EMAIL" \
  --client-admin-name="$TENANT_ADMIN_NAME" \
  | tee /tmp/mt10a-create-tenant.json
```

Expected:

- command exits `0`;
- JSON report has `action` equal to `created` or `already_exists`;
- report includes the tenant slug and Chatwoot resource IDs;
- report does not include plaintext tokens, webhook secrets or generated
  passwords.

Stop if the command created partial Chatwoot resources but failed before portal
tenant activation. Rerun only with exactly the same input values; changed input
must fail by design.

## Step 4. Verify Public Tenant Resolution

```bash
curl -fsS "${TENANT_PUBLIC_BASE_URL}/api/tenant" \
  | tee /tmp/mt10a-public-tenant.json
```

Expected:

```json
{
  "tenant": {
    "slug": "mt10a-smoke-20260614",
    "publicBaseUrl": "https://mt10a-smoke-20260614.example.com"
  }
}
```

The exact `publicBaseUrl` must match `TENANT_PUBLIC_BASE_URL`.

Stop if:

- HTTP status is not `200`;
- returned slug is not `TENANT_SLUG`;
- returned `publicBaseUrl` uses an internal host, wrong scheme or wrong domain;
- unknown hosts fall back to this tenant or to another tenant.

Optional unknown-host check:

```bash
curl -sS -o /tmp/mt10a-unknown-host.json -w '%{http_code}\n' \
  "https://unknown-${TENANT_HOST}/api/tenant"
cat /tmp/mt10a-unknown-host.json
```

Expected: not a `200` tenant response.

## Step 5. Verify Chatwoot Connection

```bash
run_backend backend/dist/scripts/verify-tenant-chatwoot-connection.js \
  --tenant="$TENANT_SLUG" \
  | tee /tmp/mt10a-verify-chatwoot.json
```

Expected:

- command exits `0`;
- `result` is `verified`;
- tenant `slug` is `TENANT_SLUG`;
- `verifiedInbox.channelType` is `Channel::Api`;
- `verifiedInbox.lockToSingleConversation` is `true`;
- if `verifiedInbox.updated` is `true`, the script repaired inbox routing.

Stop if verification fails. Do not continue to customer handoff until this is
green.

## Step 6. Configure Or Verify The Tenant Webhook

```bash
run_backend backend/dist/scripts/configure-tenant-chatwoot-webhook.js \
  --tenant="$TENANT_SLUG" \
  | tee /tmp/mt10a-configure-webhook.json
```

Expected:

- command exits `0`;
- `action` is `updated`;
- `secretSource` is `api-channel-inbox`;
- `secretStored` is `true`;
- `callbackUrl` is `${TENANT_PUBLIC_BASE_URL}/api/chatwoot/webhooks`;
- report does not print the webhook secret.

If a temporary callback URL is needed for a controlled test, pass
`--callback-url=<https-url>`. Do not use a temporary callback URL for final
production handoff.

## Step 7. Run Reconciliation Dry Run

```bash
run_backend backend/dist/scripts/reconcile-tenants.js --dry-run \
  | tee /tmp/mt10a-reconcile-dry-run.json
```

Expected:

- command exits `0`;
- the rehearsal tenant is listed as healthy/no-op, or otherwise with an
  expected safe dry-run action;
- no tenant status changes are applied;
- no secrets are printed.

Stop if dry-run suggests suspending the new tenant. Investigate Chatwoot
account reachability, Platform API token permissions and tenant status before
running any `--apply`.

## Step 8. Archive The Disposable Tenant Safely

This is the rehearsal cleanup. It proves that the archive path works without
physically deleting portal tenant rows and without deleting the Chatwoot
account.

```bash
run_backend backend/dist/scripts/deprovision-tenant.js \
  --tenant="$TENANT_SLUG" \
  --archive-only \
  --confirm="$TENANT_SLUG" \
  | tee /tmp/mt10a-deprovision-archive.json
```

Expected:

- command exits `0`;
- `tenantSlug` is `TENANT_SLUG`;
- `previousStatus` is `active`;
- `finalStatus` is `archived`;
- `chatwootDeleteRequested` is `false`.

Do not use `--delete-chatwoot-account` unless a separate cleanup decision
explicitly accepts deleting the rehearsal Chatwoot account.

## Step 9. Verify Runtime Is Closed After Archive

```bash
curl -sS -o /tmp/mt10a-after-archive-tenant.json -w '%{http_code}\n' \
  "${TENANT_PUBLIC_BASE_URL}/api/tenant"
cat /tmp/mt10a-after-archive-tenant.json
```

Expected:

- HTTP status is `503`;
- JSON error code is `TENANT_RUNTIME_DISABLED`;
- the portal tenant row still exists for audit/retention.

## Step 10. Record Evidence

Create an operator note outside the repository or in an approved operations
record. Do not include secrets.

Record:

```text
date
portal `source_commit=` from DEPLOY_SOURCE.txt and matching staged current
domain mode
TENANT_SLUG
TENANT_HOST
tenant:create result: created or already_exists
/api/tenant before create: status and error code
/api/tenant after create: status and slug
tenant:chatwoot:verify result
tenant:chatwoot:webhook:configure result and callbackUrl
tenant:chatwoot:reconcile --dry-run result for the tenant
tenant:deprovision --archive-only result
/api/tenant after archive: status and error code
any blocker or manual action needed
```

After a successful rehearsal:

- update `docs/operations/mt-10-deployment-runbooks.md` if the real production
  ingress commands differ from this runbook;
- close `docs/findings/F-OPS-002-mt10a-domain-ingress-readiness.md` through the
  Findings Workflow only when its acceptance criteria are satisfied;
- update `docs/roadmap/work-log.md` only if the rehearsal changes the stable
  production readiness baseline.

## Local Source Checkout Equivalent

Use this only for local rehearsal. It does not prove public production
DNS/TLS/proxy readiness.

```bash
pnpm --dir backend tenant:create -- \
  --slug="$TENANT_SLUG" \
  --display-name="$TENANT_DISPLAY_NAME" \
  --provider-subdomain="$TENANT_SLUG" \
  --chatwoot-base-url="$CHATWOOT_BASE_URL" \
  --client-admin-email="$TENANT_ADMIN_EMAIL" \
  --client-admin-name="$TENANT_ADMIN_NAME"

pnpm --dir backend tenant:chatwoot:verify -- --tenant="$TENANT_SLUG"
pnpm --dir backend tenant:chatwoot:webhook:configure -- --tenant="$TENANT_SLUG"
pnpm --dir backend tenant:chatwoot:reconcile -- --dry-run
pnpm --dir backend tenant:deprovision -- \
  --tenant="$TENANT_SLUG" \
  --archive-only \
  --confirm="$TENANT_SLUG"
```
