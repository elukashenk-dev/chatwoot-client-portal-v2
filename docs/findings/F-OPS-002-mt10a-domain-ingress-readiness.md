# F-OPS-002. MT-10A Domain Ingress Readiness For Shared SaaS

- `status`: `deferred`
- `found_in`: MT-10A closure review, `2026-06-14`
- `risk`: `high`
- `urgency`: deferred while broad shared SaaS and provider-owned subdomain
  rollout are not scheduled; review before that rollout begins
- `area`: production operations, shared SaaS tenant ingress, DNS, TLS, reverse
  proxy, Host-based tenant resolution
- `current_disposition`:
  - The tenant lifecycle itself is already implemented. Operator tooling can
    create portal and Chatwoot tenant resources, derive either a custom client
    domain or provider-owned subdomain, verify Chatwoot, configure the webhook,
    reconcile state and archive the tenant.
  - Custom client-domain ingress is also implemented through
    `scripts/configure-tenant-domain-ingress.sh`, including DNS checks, Nginx
    configuration, certificate provisioning and `/api/tenant` verification.
    The current runbook records `lk.provgroup.ru` as a confirmed working
    tenant-domain example.
  - The remaining gap is conditional operations evidence, not a confirmed
    tenant-provisioning defect: provider-owned subdomains still require
    external wildcard DNS/TLS/proxy setup, and the latest complete disposable
    create → verify → webhook → reconcile → archive rehearsal has not been
    recorded.
  - Do not redesign or reimplement tenant provisioning when this finding is
    resumed. First compare the selected production domain mode with the
    already-implemented paths and close only the remaining runtime evidence.
- `resume_trigger`: before broad shared SaaS rollout, before production use of
  provider-owned tenant subdomains, or when a new client onboarding path
  depends on unverified wildcard ingress
- `evidence`:
  - `backend/src/scripts/create-tenant-core.ts` supports both
    `--provider-subdomain` and custom `--primary-domain` /
    `--public-base-url` modes.
  - `docs/operations/mt-10-deployment-runbooks.md` lists custom client-domain
    ingress and tenant lifecycle CLI operations as ready now, while provider
    wildcard DNS/certificate automation and the broad shared-SaaS rehearsal
    remain pending.
  - `docs/operations/mt-10a-tenant-lifecycle-rehearsal.md` defines the
    remaining end-to-end proof through `/api/tenant`, Chatwoot verification,
    webhook configuration, reconcile and archive/deprovision.
  - MT-10A `tenant:create` can create the portal tenant and Chatwoot resources,
    but it does not itself create public DNS records, issue TLS certificates or
    configure external provider infrastructure for generated tenant hosts.
  - Provider-subdomain tenants depend on the reverse proxy preserving the
    original tenant `Host`; otherwise backend Host-based tenant resolution can
    route incorrectly or fail closed.
- `fix_short`: When the resume trigger is reached, select the production domain
  mode and reuse the implemented tenant lifecycle and custom-domain ingress
  paths. For provider-subdomain rollout, configure wildcard DNS, TLS and
  reverse proxy Host preservation for
  `*.PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX`, then record one disposable tenant
  lifecycle rehearsal using
  `docs/operations/mt-10a-tenant-lifecycle-rehearsal.md`.
- `acceptance`:
  - The chosen production tenant domain mode is documented for the deployment:
    custom client domain, provider-owned subdomain, or both.
  - For provider-subdomain mode, wildcard DNS for
    `*.PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX` resolves to the portal reverse
    proxy.
  - TLS covers the generated tenant host and browsers can open the tenant URL
    without certificate errors.
  - The reverse proxy routes generated tenant hosts to the portal frontend and
    backend while preserving the original `Host` header through the trusted
    proxy boundary.
  - A test tenant created with `tenant:create -- --provider-subdomain=<slug>` or
    the selected custom-domain mode returns the intended tenant from
    `https://<tenant-host>/api/tenant`.
  - `tenant:chatwoot:verify -- --tenant=<slug>` passes for the test tenant.
  - `tenant:chatwoot:webhook:configure -- --tenant=<slug>` passes and stores
    the API Channel webhook secret encrypted.
  - `tenant:chatwoot:reconcile -- --dry-run` returns an expected safe report
    for the test tenant.
  - The archive/deprovision dry run or explicit archive rehearsal is completed
    without physically deleting portal tenant rows.
  - The final runbook records the exact commands and observed production smoke
    result without secrets.
