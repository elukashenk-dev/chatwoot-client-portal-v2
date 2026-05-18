# Production Deployment

## Status

Production deploys use the tenant-aware clean reinstall runbook:

```text
docs/operations/production-clean-reinstall.md
```

This file keeps only guardrails. The runbook is the executable checklist.

## Hard Boundaries

- Do not rely on global `CHATWOOT_*` env as production runtime authority.
- Do not reuse disposable portal test data.
- Do not modify production Chatwoot core, database, uploads, services or
  `chat.provgroup.ru` Nginx config as part of portal work.
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
- tenant-owned encrypted Chatwoot runtime config;
- tenant API Channel webhook configuration;
- Chatwoot `v4.13+` `Channel::Api.secret` as webhook signature secret source.
- explicit deploy source gate: clean production deploys come from a reviewed
  commit, while WIP device-preview deploys must use `--allow-dirty-preview` and
  `--preview-label`.

For the current production rollout, the supported business mode is dedicated
one-tenant install. Shared SaaS rollout can reuse the same runtime model, but
needs a separate multi-tenant provisioning runbook.

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

## Real Server Notes

Known production server facts are kept in:

```text
docs/operations/production-server-notes.md
```

That file is not a deploy runbook.
