# Production Deployment

## Status

Routine feature deploys use the archive helper from a clean reviewed commit:

```bash
scripts/deploy-production-archive.sh \
  --host=ubuntu@93.77.166.238 \
  --app-path=/opt/chatwoot-client-portal-v2 \
  --activate
```

During activation, the archive helper preserves `.env.production` but upgrades
older env files with missing portal-owned object-storage keys before running
`docker compose up -d --build`. Existing values are preserved, missing secrets
are generated on the VM, and a timestamped `.env.production.backup.*` file is
written before the first change.

Use the tenant-aware clean reinstall runbook only when the portal-owned
production stack must be recreated or reconfigured:

```text
docs/operations/production-clean-reinstall.md
```

Use the MT-10 operations index when choosing between routine deploy, clean
reinstall, tenant provisioning, secret rotation, backup/restore and acceptance
checks:

```text
docs/operations/mt-10-deployment-runbooks.md
```

This file keeps only guardrails. The runbook is the executable checklist.

## Hard Boundaries

- Do not rely on global `CHATWOOT_*` env as production runtime authority.
- Do not reuse disposable portal test data.
- Do not modify production Chatwoot core, database, uploads, services or
  Chatwoot Nginx sites as part of routine portal deploy work.
- Do not expose portal backend or portal Postgres publicly.

Allowed Chatwoot-side changes are limited to the tenant API Channel inbox:

- verify the inbox belongs to the tenant Chatwoot account and is `Channel::Api`;
- enable `lock_to_single_conversation=true` if needed;
- set the portal webhook URL;
- read the returned `Channel::Api.secret` and store it encrypted in the portal
  tenant record.

## Runtime Rules

Production runtime uses:

- `PORTAL_TENANT_SECRET_KEY`;
- `DEFAULT_TENANT_*` bootstrap values;
- isolated portal Postgres;
- portal-owned internal object storage for branding assets; object-storage
  credentials are production secrets and browser-facing routes never expose
  bucket names, object keys or storage endpoints;
- tenant-owned encrypted Chatwoot runtime config;
- tenant API Channel webhook configuration;
- Chatwoot `v4.13+` `Channel::Api.secret` as webhook signature secret source;
- explicit deploy source gate: clean production deploys come from a reviewed
  commit, while WIP device-preview deploys must use `--allow-dirty-preview` and
  `--preview-label`.
- `DEPLOY_SOURCE.txt` in `/opt/chatwoot-client-portal-v2` must record the
  deployed branch, commit and dirty status.

For the current production rollout, the supported business mode is dedicated
one-tenant install. Shared SaaS rollout can reuse the same runtime model, but
needs a separate multi-tenant provisioning runbook.

## Routine Deploy Checklist

Before archive deploy:

- current branch is `main`;
- `git status --short` is empty;
- `origin/main` contains the reviewed commit;
- targeted checks for the current slice passed;
- `pnpm build`, `pnpm lint` and `git diff --check` pass or a blocker is
  explicitly recorded;
- `pnpm test:ops` passes when deploy scripts or production env upgrade behavior
  changed.

After archive deploy:

- `docker compose --env-file .env.production -f infra/production/compose.yaml ps`
  shows `portal-db`, `portal-object-storage` and `portal-backend` healthy,
  `portal-object-storage-init` completed successfully and `portal-web` running;
- `cat DEPLOY_SOURCE.txt` matches the intended clean commit;
- `curl -fsS https://lk.provgroup.ru/api/health` returns `status: ok`;
- `curl -fsS https://lk.provgroup.ru/api/tenant` returns `provgroup`;
- the default tenant admin verification token came from a confirmed Chatwoot
  administrator's Profile Settings / Personal Access Token. It is separate from
  the customer chat runtime token and is required for `/admin/login`;
- default tenant has a configured admin verification token before testing
  `/admin/login`:

```bash
docker compose --env-file .env.production -f infra/production/compose.yaml exec -T portal-db \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select chatwoot_admin_verification_token_ciphertext is not null from portal_tenants where slug = '"'"'provgroup'"'"';"'
```

- tenant Chatwoot connection verification passes:

```bash
docker compose --env-file .env.production -f infra/production/compose.yaml exec -T portal-backend \
  node backend/dist/scripts/verify-tenant-chatwoot-connection.js --tenant=provgroup
```

- admin branding can upload a small PNG logo and `/api/branding/assets/:id`
  returns `200` with `content-type: image/png`; remove the test logo after
  evidence is captured.

## Maintenance Cleanup

Portal maintenance cleanup is intentionally portal-only. It removes expired
service traces from the isolated portal Postgres and never touches Chatwoot
core, Chatwoot DB, uploads, contacts, conversations or messages.

Production installs should use a host systemd timer. It runs once per day by
default, waits through missed boots (`Persistent=true`) and adds a randomized
delay so cleanup does not fight deploy/startup work.

```bash
scripts/install-production.sh --install-maintenance-cleanup
```

Check the timer:

```bash
scripts/install-production.sh --maintenance-cleanup-status
```

Run a safe dry-run manually:

```bash
scripts/install-production.sh --maintenance-cleanup-dry-run
```

Default retention:

- send ledger `confirmed`/`failed`: `90` days;
- send ledger stuck in `processing`: `24` hours;
- Chatwoot webhook delivery bookkeeping: `30` days;
- expired rate-limit buckets: `24` hours after reset;
- expired sessions: `7` days after expiry;
- expired verification records: `30` days after expiry.

## OS Upgrade Follow-Up

Uncontrolled OS upgrades can restart Redis/PostgreSQL/network services while
Chatwoot web/worker keep running with stale realtime connections. The policy is
not applied yet; track it through
`docs/findings/F-OPS-001-apt-daily-chatwoot-realtime.md` before relying on
Chatwoot realtime for support SLAs or real production users.

## Real Server Notes

Known production server facts are kept in:

```text
docs/operations/production-server-notes.md
```

That file is not a deploy runbook.
