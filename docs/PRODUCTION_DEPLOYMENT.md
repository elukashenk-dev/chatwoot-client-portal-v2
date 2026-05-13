# Production Deployment

## Status

Production deployment for the current multi-tenant portal must use the `MT-10`
tenant-aware clean reinstall runbook:

```text
docs/MT_10_PRODUCTION_CLEAN_REINSTALL_RUNBOOK.md
```

This file is the high-level guardrail. The MT-10 runbook is the executable
operator checklist.

## Why The Previous Runbook Is Superseded

The previous production runbook was written before the multi-tenant architecture
update.

It described an older single-tenant/dedicated deployment model based on global
Chatwoot env values such as:

```text
CHATWOOT_BASE_URL
CHATWOOT_ACCOUNT_ID
CHATWOOT_PORTAL_INBOX_ID
CHATWOOT_API_ACCESS_TOKEN
CHATWOOT_WEBHOOK_SECRET
```

That model is now superseded.

Current runtime must use tenant-owned Chatwoot config from `portal_tenants`, not
global Chatwoot env as authority.

## Do Not Use The Superseded Single-Tenant Flow

The previous single-tenant flow remains unsupported:

- do not run superseded production installer steps;
- do not rely on global `CHATWOOT_*` as production runtime authority;
- do not point the new portal at production Chatwoot using the superseded
  single-tenant flow;
- do not modify production Chatwoot core, database, uploads, services or
  `chat.provgroup.ru` Nginx config as part of portal work;
- do not migrate or reuse disposable portal test data.

The real production Chatwoot serves real users and must remain untouched by
portal deploy work unless the change is the explicitly approved tenant API
Channel configuration below or there is a separate explicit Chatwoot maintenance
plan.

Allowed MT-10 Chatwoot-side changes are limited to the tenant API Channel inbox:

- verify the inbox belongs to the tenant Chatwoot account and is `Channel::Api`;
- enable `lock_to_single_conversation=true` if needed;
- set the portal webhook URL;
- read the returned `Channel::Api.secret` and store it encrypted in the portal
  tenant record.

## Current MT-10 Flow

The tenant-aware production flow now uses:

- `PORTAL_TENANT_SECRET_KEY`;
- `DEFAULT_TENANT_*` bootstrap values;
- isolated portal Postgres;
- tenant-owned encrypted Chatwoot runtime config;
- tenant API Channel webhook configuration;
- Chatwoot `v4.13+` `Channel::Api.secret` as webhook signature secret source.
- an explicit deploy source gate: clean production deploys come from a reviewed
  commit, while WIP device-preview deploys must use `--allow-dirty-preview` and
  `--preview-label`.

Installer steps:

1. collect production infrastructure and tenant bootstrap env;
2. build and start the isolated portal stack;
3. bootstrap the default tenant;
4. verify public health and tenant resolution;
5. ask for operator approval before tenant API Channel changes;
6. verify and, if needed, enable Chatwoot API Channel single-conversation
   routing;
7. configure tenant API Channel webhook and store the returned secret in the
   tenant record;
8. validate auth, chat, webhook/realtime and PWA endpoints.

For MT-8.5 mobile/PWA design review, repeated WIP deploys to
`lk.provgroup.ru` are allowed only as explicit preview deploys. The deploy
archive records `DEPLOY_SOURCE.txt` so we can always tell which branch, commit
and dirty files produced the currently visible UI.

For the current production rollout, the supported business mode is dedicated
one-tenant install. Shared SaaS production rollout can reuse the same runtime
model, but needs a separate multi-tenant provisioning runbook.

## Real Server Notes

Known production server facts and future rollout notes are kept in:

```text
docs/PRODUCTION_DEPLOYMENT_SESSION_LOG.md
```

That file is not a deploy runbook. It is only a memory aid for the real server
state, domains and cleanup requirements.

## Next Action

Review and execute:

```text
docs/MT_10_PRODUCTION_CLEAN_REINSTALL_RUNBOOK.md
```
