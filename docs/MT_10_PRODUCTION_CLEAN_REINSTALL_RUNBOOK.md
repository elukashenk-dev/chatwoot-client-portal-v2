# MT-10 Production Clean Reinstall Runbook

Status: ready for review before executing on the production VM.

Target VM: `ubuntu@93.77.166.238`

Chatwoot domain: `https://chat.provgroup.ru`

Portal domain: `https://lk.provgroup.ru`

Portal app path: `/opt/chatwoot-client-portal-v2`

## Goal

Cleanly remove the old portal runtime and install the current
`chatwoot-client-portal-v2` production stack as a tenant-aware one-tenant
deployment.

This runbook does not modify production Chatwoot core, database, services,
uploads or Nginx site. Chatwoot CE was already upgraded separately to `v4.13.0`,
and it is the external system of record for chat data.

The portal installer intentionally performs a narrow Chatwoot API Channel
configuration step for the tenant:

- verifies that the configured inbox belongs to the production account and is a
  `Channel::Api` inbox;
- enables `lock_to_single_conversation=true` for that API Channel if needed;
- writes the portal webhook URL to that API Channel;
- reads the returned `Channel::Api.secret` and stores it encrypted in the portal
  tenant record.

## Hard Boundaries

- Do not stop, remove, migrate or reset production Chatwoot.
- Do not touch the Chatwoot PostgreSQL database.
- Do not touch Chatwoot uploads/storage.
- Do not edit the existing `chat.provgroup.ru` Nginx site.
- Do not edit production Chatwoot outside the tenant API Channel configuration
  explicitly listed above.
- Do not reuse old portal database data.
- Do not use global `CHATWOOT_*` env as portal runtime authority.
- Do not expose portal backend or portal Postgres ports publicly.

Only these portal-owned resources may be removed/recreated:

- old portal containers;
- old portal Docker volumes;
- old portal app directory;
- old portal `.env.production`, `.install`, logs and generated artifacts;
- old portal Nginx site for `lk.provgroup.ru`, if present.

## Current Production Assumptions

Before executing, verify all of these:

```bash
ssh ubuntu@93.77.166.238

hostname
curl -fsS https://chat.provgroup.ru/api
systemctl is-active chatwoot-web.1.service chatwoot-worker.1.service redis-server postgresql nginx
docker version
docker compose version
df -h /
free -h
```

Expected Chatwoot health:

```json
{ "version": "4.13.0", "queue_services": "ok", "data_services": "ok" }
```

## Required Inputs

Prepare these values before starting:

```text
PORTAL_DOMAIN=lk.provgroup.ru
APP_ORIGIN=https://lk.provgroup.ru
DEFAULT_TENANT_SLUG=provgroup
DEFAULT_TENANT_DISPLAY_NAME=PROVGROUP
DEFAULT_TENANT_PRIMARY_DOMAIN=lk.provgroup.ru
DEFAULT_TENANT_PUBLIC_BASE_URL=https://lk.provgroup.ru
DEFAULT_TENANT_CHATWOOT_BASE_URL=https://chat.provgroup.ru
DEFAULT_TENANT_CHATWOOT_ACCOUNT_ID=<production Chatwoot account id>
DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID=<production Chatwoot Channel::Api inbox id>
DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN=<dedicated production Chatwoot API token>
SMTP_HOST=<smtp host>
SMTP_PORT=<smtp port>
SMTP_SECURE=<true|false>
SMTP_USER=<smtp user if required>
SMTP_PASS=<smtp password if required>
SMTP_FROM=<from address>
```

Generate secrets on the VM:

```bash
openssl rand -base64 32 # PORTAL_TENANT_SECRET_KEY
openssl rand -base64 48 # SESSION_SECRET
openssl rand -hex 24    # PORTAL_V2_POSTGRES_PASSWORD
openssl rand -base64 32 # DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET temporary bootstrap value
```

The temporary `DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET` is only used to create the
initial tenant row. The installer later configures the Chatwoot `Channel::Api`
webhook and stores Chatwoot's actual API Channel secret in the tenant record.

## Step 1. Create A Portal Runtime Backup Snapshot

The user may decide that old portal data is disposable, but still capture a
small operational snapshot before removal. This is not a Chatwoot backup.

```bash
sudo mkdir -p /home/ubuntu/portal-v2-clean-reinstall-notes
date -u | sudo tee /home/ubuntu/portal-v2-clean-reinstall-notes/started-at.txt

docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' \
  | sudo tee /home/ubuntu/portal-v2-clean-reinstall-notes/docker-ps-before.txt

docker volume ls \
  | sudo tee /home/ubuntu/portal-v2-clean-reinstall-notes/docker-volumes-before.txt

sudo nginx -T 2>/dev/null \
  | sudo tee /home/ubuntu/portal-v2-clean-reinstall-notes/nginx-before.conf >/dev/null
```

## Step 2. Confirm Chatwoot Is Healthy Before Portal Work

```bash
curl -fsS https://chat.provgroup.ru/api
systemctl is-active chatwoot-web.1.service chatwoot-worker.1.service postgresql redis-server nginx
```

Stop here if Chatwoot is not healthy.

## Step 3. Remove Old Portal Runtime Only

Go to the old portal app path if it exists:

```bash
cd /opt/chatwoot-client-portal-v2 2>/dev/null || true
```

If old compose files are present, stop only the portal stack:

```bash
if [ -f infra/production/compose.yaml ] && [ -f .env.production ]; then
  docker compose --env-file .env.production -f infra/production/compose.yaml down --remove-orphans
fi
```

Remove old portal containers if any survived:

```bash
docker ps -a --format '{{.Names}}' \
  | grep -E '^chatwoot-client-portal-v2-' \
  | xargs -r docker rm -f
```

Remove old portal volumes:

```bash
docker volume ls --format '{{.Name}}' \
  | grep -E '^chatwoot-client-portal-v2_' \
  | xargs -r docker volume rm
```

Remove old portal app directory:

```bash
sudo rm -rf /opt/chatwoot-client-portal-v2
```

Remove only the portal Nginx site if it exists:

```bash
sudo rm -f /etc/nginx/sites-enabled/chatwoot-client-portal-v2.conf
sudo rm -f /etc/nginx/sites-available/chatwoot-client-portal-v2.conf
sudo nginx -t
sudo systemctl reload nginx
```

Check that Chatwoot is still healthy:

```bash
curl -fsS https://chat.provgroup.ru/api
```

## Step 4. Upload The New Portal Code

From local development machine:

First choose the release source mode.

Clean production source:

```bash
git status --short
git branch --show-current
git rev-parse --short HEAD
```

Expected: `git status --short` is empty, and the current commit is the reviewed
source you want to deploy.

Device-review preview source:

```bash
git status --short
git branch --show-current
git rev-parse --short HEAD
```

Expected: the dirty files are intentionally part of the current UI preview
iteration. Use an explicit preview label in the archive command below.

```bash
pnpm exec prettier --check .env.production.example infra/production/compose.yaml scripts/install-production.sh docs/MT_10_PRODUCTION_CLEAN_REINSTALL_RUNBOOK.md
git diff --check

scripts/deploy-production-archive.sh \
  --host=ubuntu@93.77.166.238 \
  --app-path=/opt/chatwoot-client-portal-v2
```

For an intentional WIP device-review deploy, use:

```bash
scripts/deploy-production-archive.sh \
  --host=ubuntu@93.77.166.238 \
  --app-path=/opt/chatwoot-client-portal-v2 \
  --allow-dirty-preview \
  --preview-label=mt-8-5-auth-ui-mobile
```

The deploy helper refuses dirty working tree deploys unless
`--allow-dirty-preview` and `--preview-label` are provided. Every archive writes
`DEPLOY_SOURCE.txt` into the deployed app directory with branch, commit, dirty
status, preview label and `git status --short`.

If `/opt/chatwoot-client-portal-v2` no longer exists after cleanup, the deploy
helper creates it on the VM and assigns it to the SSH user. This requires `sudo`
on the VM.

On the VM:

```bash
cd /opt/chatwoot-client-portal-v2
cat DEPLOY_SOURCE.txt
```

## Step 5. Run Tenant-Aware Installer

Run:

```bash
scripts/install-production.sh --install --reconfigure
```

Use these production choices:

```text
Portal domain: lk.provgroup.ru
Public portal origin: https://lk.provgroup.ru
Deployment mode: reverse-proxy
Local HTTP port: 8088
Unused local HTTPS port: 8448
Trust proxy headers: true
Default tenant slug: provgroup
Default tenant display name: PROVGROUP
Default tenant primary domain: lk.provgroup.ru
Default tenant public base URL: https://lk.provgroup.ru
Default tenant Chatwoot base URL: https://chat.provgroup.ru
```

The installer now performs the tenant-aware flow:

1. writes `.env.production`;
2. validates compose config;
3. builds images;
4. starts portal DB/backend/web;
5. bootstraps the default tenant row;
6. checks `/api/health`;
7. checks `/api/tenant`;
8. asks for approval before changing tenant Chatwoot API Channel settings;
9. verifies and, if needed, enables single-conversation routing on the tenant
   Chatwoot API Channel;
10. configures the tenant API Channel webhook URL;
11. stores Chatwoot's actual `Channel::Api.secret` in the tenant record.

## Step 6. Expected Env Shape

Production backend env must include tenant bootstrap settings:

```text
PORTAL_TENANT_SECRET_KEY=...
DEFAULT_TENANT_SLUG=provgroup
DEFAULT_TENANT_DISPLAY_NAME=PROVGROUP
DEFAULT_TENANT_PRIMARY_DOMAIN=lk.provgroup.ru
DEFAULT_TENANT_PUBLIC_BASE_URL=https://lk.provgroup.ru
DEFAULT_TENANT_CHATWOOT_BASE_URL=https://chat.provgroup.ru
DEFAULT_TENANT_CHATWOOT_ACCOUNT_ID=...
DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID=...
DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN=...
DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET=...
```

Production backend env must not require old global runtime authority:

```text
CHATWOOT_BASE_URL
CHATWOOT_ACCOUNT_ID
CHATWOOT_API_ACCESS_TOKEN
CHATWOOT_PORTAL_INBOX_ID
CHATWOOT_WEBHOOK_SECRET
```

If these old global keys exist in a leftover `.env.production`, remove them
during `--reconfigure`.

## Step 7. Verify Containers

```bash
cd /opt/chatwoot-client-portal-v2

docker compose --env-file .env.production -f infra/production/compose.yaml ps
docker compose --env-file .env.production -f infra/production/compose.yaml logs --tail=120 portal-backend
docker compose --env-file .env.production -f infra/production/compose.yaml logs --tail=80 portal-web
```

Expected:

- `portal-db` healthy;
- `portal-backend` healthy;
- `portal-web` running;
- no backend errors about tenant secret key, missing tenant, or missing
  Chatwoot config.

## Step 8. Verify Public Portal Endpoints

```bash
curl -fsS https://lk.provgroup.ru/api/health
curl -fsS https://lk.provgroup.ru/api/tenant
curl -fsS https://lk.provgroup.ru/api/tenant/manifest.webmanifest
```

Expected:

- health returns `status: ok`;
- tenant returns `slug: provgroup`;
- manifest has tenant-specific `id`, `scope`, `start_url`, app name and icons.

## Step 9. Verify Chatwoot Connection

```bash
cd /opt/chatwoot-client-portal-v2

docker compose --env-file .env.production -f infra/production/compose.yaml exec -T portal-backend \
  node backend/dist/scripts/verify-tenant-chatwoot-connection.js --tenant=provgroup

docker compose --env-file .env.production -f infra/production/compose.yaml exec -T portal-backend \
  node backend/dist/scripts/configure-tenant-chatwoot-webhook.js --tenant=provgroup
```

Expected:

- tenant is found;
- Chatwoot account ID matches production;
- portal inbox is `Channel::Api`;
- `lock_to_single_conversation` is true or was updated;
- API Channel webhook URL points to:
  `https://lk.provgroup.ru/api/integrations/chatwoot/webhooks/account`;
- webhook secret is stored in the portal tenant record.

These are the only approved Chatwoot-side changes in this runbook.

## Step 10. Browser Smoke Test

Open:

```text
https://lk.provgroup.ru/auth/login
```

Check:

- login page renders;
- tenant branding/name context loads;
- registration route opens;
- password reset route opens;
- no console errors for `/api/tenant`;
- PWA manifest loads.

Then test with a known Chatwoot contact:

- login or register;
- open chat;
- fetch transcript;
- send a text message;
- confirm message appears in Chatwoot;
- send reply from Chatwoot;
- confirm portal receives realtime update.

## Step 10A. MT-8.5 Device Preview Iteration Loop

After the first clean reinstall is complete, MT-8.5 UI/device review can use
small repeated preview deploys without reinstalling the whole portal.

Local workflow:

```bash
git status --short

scripts/deploy-production-archive.sh \
  --host=ubuntu@93.77.166.238 \
  --app-path=/opt/chatwoot-client-portal-v2 \
  --activate \
  --allow-dirty-preview \
  --preview-label=mt-8-5-auth-ui-mobile
```

Then open `https://lk.provgroup.ru` on real devices and record what changed.

Rules for preview deploys:

- use a short, meaningful `--preview-label`;
- deploy only changes that are intentionally part of the current preview;
- check `DEPLOY_SOURCE.txt` on the VM when the visible UI does not match what
  you expected;
- make a normal checkpoint commit when a preview slice becomes accepted.

## Step 11. Webhook Delivery Check

After sending a Chatwoot reply, inspect backend logs:

```bash
docker compose --env-file .env.production -f infra/production/compose.yaml logs -f portal-backend
```

Expected:

- no signature verification errors;
- no account/inbox mismatch errors;
- no tenant resolution errors;
- delivery is tenant-scoped.

Chatwoot `v4.13.0` webhook headers expected by portal:

```text
X-Chatwoot-Signature
X-Chatwoot-Timestamp
X-Chatwoot-Delivery
```

Signature scheme:

```text
HMAC SHA256 over "{timestamp}.{raw_body}"
```

Secret source:

```text
Channel::Api.secret
```

## Step 12. Rollback Outline

Rollback only the portal stack:

```bash
cd /opt/chatwoot-client-portal-v2
docker compose --env-file .env.production -f infra/production/compose.yaml down --remove-orphans
```

If needed, remove portal Nginx site:

```bash
sudo rm -f /etc/nginx/sites-enabled/chatwoot-client-portal-v2.conf
sudo rm -f /etc/nginx/sites-available/chatwoot-client-portal-v2.conf
sudo nginx -t
sudo systemctl reload nginx
```

Then verify Chatwoot remains healthy:

```bash
curl -fsS https://chat.provgroup.ru/api
```

Do not rollback or reset Chatwoot as part of portal rollback.

## Acceptance Criteria

The clean reinstall is complete when:

- old portal containers are gone;
- old portal volumes are gone;
- new portal app exists at `/opt/chatwoot-client-portal-v2`;
- `DEPLOY_SOURCE.txt` exists and matches the intended clean release or explicit
  preview deploy;
- `.env.production` contains `PORTAL_TENANT_SECRET_KEY` and
  `DEFAULT_TENANT_*`;
- backend compose does not require global `CHATWOOT_*` as runtime authority;
- default tenant row exists and is active;
- public `/api/tenant` resolves `lk.provgroup.ru`;
- approved Chatwoot API Channel configuration changes were reviewed before the
  installer applied them;
- Chatwoot API Channel inbox routing is verified or updated to
  `lock_to_single_conversation=true`;
- tenant API Channel webhook URL is configured;
- tenant webhook secret is stored in portal DB;
- login/registration/password reset pages load;
- chat transcript and send flow work;
- Chatwoot reply reaches portal through signed webhook/realtime;
- production Chatwoot remains healthy on `chat.provgroup.ru`.
