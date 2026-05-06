# Production Deployment

## Status

Production deployment for the current multi-tenant portal is **blocked until
`MT-10 Deployment And Runbook Update`**.

This file intentionally does not contain executable production deploy
instructions right now.

## Why This Is Blocked

The previous production runbook was written before the multi-tenant
architecture update.

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

## Do Not Use The Old Runbook

Until `MT-10` is completed:

- do not deploy the new `v2` portal to the real production server;
- do not run old production installer steps;
- do not rely on global `CHATWOOT_*` as production runtime authority;
- do not point the new portal at production Chatwoot using the old single-tenant
  flow;
- do not modify production Chatwoot core, database, uploads, services or Nginx
  config as part of portal work;
- do not migrate or reuse old portal test data.

The real production Chatwoot serves real users and must remain untouched unless
there is a separate explicit Chatwoot maintenance plan.

## What Must Be Rebuilt In MT-10

`MT-10 Deployment And Runbook Update` must produce the new production runbook
for both supported business modes:

- shared SaaS: one portal deploy with multiple tenants;
- dedicated install: one portal deploy with exactly one tenant.

Required MT-10 updates:

1. Update `.env.production.example` for multi-tenant runtime.
2. Update `infra/production/compose.yaml` so backend receives:
   - `PORTAL_TENANT_SECRET_KEY`;
   - required `DEFAULT_TENANT_*` bootstrap values for dedicated/one-tenant
     install;
   - infrastructure env only where global env is still valid.
3. Update `scripts/install-production.sh` so it provisions tenant records instead
   of treating global `CHATWOOT_*` as runtime authority.
4. Replace old global Chatwoot setup commands with tenant-aware commands:
   - `tenant:bootstrap-default`;
   - `tenant:chatwoot:verify`;
   - `tenant:chatwoot:ensure-portal-inbox`;
   - `tenant:chatwoot:webhook:configure`.
5. Document clean removal of old portal runtime before installing the new portal.
6. Document backup/snapshot before any server changes.
7. Document reverse-proxy setup for `lk.<client-domain>`.
8. Document tenant provisioning, webhook setup, secret rotation and rollback.
9. Add production validation checklist for:
   - tenant resolution;
   - registration/login/password reset;
   - chat send/realtime;
   - webhook isolation;
   - PWA manifest/icon identity;
   - dedicated one-tenant install;
   - shared SaaS multi-tenant install.

## Real Server Notes

Known production server facts and future rollout notes are kept in:

```text
docs/PRODUCTION_DEPLOYMENT_SESSION_LOG.md
```

That file is not a deploy runbook. It is only a memory aid for the real server
state, domains and cleanup requirements.

## Next Action

Do not perform production deployment work until `MT-10`.

Before `MT-10`, continue feature work on:

```text
MT-9 Tenant Admin And Branding Rebuild
```
