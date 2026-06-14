# F-OPS-002. MT-10A Domain Ingress Readiness For Shared SaaS

- `status`: `open`
- `found_in`: MT-10A closure review, `2026-06-14`
- `risk`: `high`
- `urgency`: before using MT-10A for broad shared SaaS or provider-subdomain
  tenants in production
- `area`: production operations, shared SaaS tenant ingress, DNS, TLS, reverse
  proxy, Host-based tenant resolution
- `evidence`:
  - `docs/roadmap/work-log.md` lists the current recommended next step as an
    end-to-end MT-10A tenant lifecycle rehearsal against the intended
    Chatwoot/domain mode, including `/api/tenant`, Chatwoot verification,
    webhook configuration and archive/deprovision dry run.
  - `docs/operations/mt-10-deployment-runbooks.md` states that shared SaaS
    still needs rehearsal and automation around production DNS, certificate and
    proxy provisioning before broad rollout.
  - MT-10A `tenant:create` can create the portal tenant and Chatwoot resources,
    but it does not itself create public DNS records, issue TLS certificates or
    configure the reverse proxy for generated tenant hosts.
  - Provider-subdomain tenants depend on the reverse proxy preserving the
    original tenant `Host`; otherwise backend Host-based tenant resolution can
    route incorrectly or fail closed.
- `fix_short`: Define and rehearse the production ingress path for the chosen
  MT-10A tenant domain mode. For provider-subdomain rollout, configure wildcard
  DNS, TLS and reverse proxy Host preservation for
  `*.PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX`, then prove it with a real tenant
  lifecycle smoke.
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
