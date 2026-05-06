# F-MT-008. Production Installer Still Uses Global Chatwoot Env

- `status`: `deferred`
- `found_in`: `MT-8R-2 Technical Debt Analysis`
- `risk`: `medium`
- `urgency`: before `MT-10 Deployment And Runbook Update`; not a blocker for
  `MT-8.5` or `MT-9`
- `area`: production installer, production compose, tenant provisioning,
  Chatwoot webhook setup
- `evidence`:
  - `infra/production/compose.yaml` still requires global
    `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_PORTAL_INBOX_ID`,
    `CHATWOOT_API_ACCESS_TOKEN` and `CHATWOOT_WEBHOOK_SECRET` for the backend
    container.
  - `scripts/install-production.sh` still prompts/writes global `CHATWOOT_*`
    values and runs `backend/dist/scripts/configure-chatwoot-account-webhook.js`
    during webhook secret sync.
  - `backend/src/scripts/configure-chatwoot-account-webhook.ts` still creates a
    Chatwoot client from global env.
  - `docs/PRODUCTION_DEPLOYMENT.md` already blocks production deployment until
    `MT-10` and explicitly says the old global Chatwoot runbook is superseded.
- `fix_short`: In `MT-10`, update production compose and installer to use
  multi-tenant bootstrap/provisioning: `PORTAL_TENANT_SECRET_KEY`,
  `DEFAULT_TENANT_*`, `tenant:bootstrap-default`,
  `tenant:chatwoot:verify`, `tenant:chatwoot:ensure-portal-inbox` and
  `tenant:chatwoot:webhook:configure`. Remove or archive old global webhook
  setup entrypoints after the new runbook is verified.
- `acceptance`:
  - Production backend container no longer requires global
    `CHATWOOT_ACCOUNT_ID` or `CHATWOOT_PORTAL_INBOX_ID` as runtime authority.
  - Installer provisions at least one tenant record before customer runtime.
  - Webhook setup uses tenant-aware commands and stores the resulting webhook
    secret in the tenant record.
  - Dedicated install is documented as one tenant in the same multi-tenant
    architecture.
  - Old global webhook setup command is removed from production runbook flow or
    clearly marked as unsupported legacy tooling.
