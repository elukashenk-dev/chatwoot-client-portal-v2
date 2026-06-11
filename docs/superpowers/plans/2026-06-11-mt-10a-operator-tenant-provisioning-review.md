# MT-10A Operator Tenant Provisioning Plan Review

Дата: 2026-06-11

Reviewed plan:
`docs/superpowers/plans/2026-06-11-mt-10a-operator-tenant-provisioning.md`

## Review Scope

Проверено:

- соответствие research note по Chatwoot account lifecycle;
- соответствие архитектурным решениям `D-002`, `D-003`, `D-005`, `D-007`,
  `D-014`, `D-018`;
- безопасность Platform API token и tenant secrets;
- idempotency после частичных Chatwoot failures;
- safe deletion model с учетом `onDelete: restrict` в `portal_tenants`;
- поддержка клиентов без собственного домена через provider-owned subdomain;
- отсутствие жесткой привязки к текущему provider/company domain;
- follow-up findings from independent sub reviewer after provider-subdomain
  update;
- пригодность плана для пошаговой реализации через subagent-driven или inline
  execution;
- наличие тестов на каждый рискованный backend boundary.

## Findings Fixed During Review

### F1. Empty Code Skeletons Looked Like Placeholders

Severity: Important

Initial plan had TypeScript snippets with empty function bodies. This could let
an implementer copy empty stubs into production code.

Resolution:

- replaced empty bodies with explicit type/interface signatures;
- added concrete return/result types for provisioning, reconciliation and
  deprovision flows.

Status: closed in plan.

### F7. Provider Subdomain Could Drift From Tenant Slug

Severity: Important

Independent review found that accepting both `slug` and `providerSubdomain`
without an equality rule could create `slug=a` on host `b.<suffix>`.

Resolution:

- provider-owned subdomain is now defined as exactly the normalized tenant
  `slug`;
- CLI must reject `--slug=a --provider-subdomain=b`;
- DB conditional check requires `provider_subdomain = slug` in
  `provider_subdomain` mode.

Status: closed in plan.

### F8. Provisioning Resume Needed Immutable Input Contract

Severity: Important

Independent review found that reruns could reuse a partially completed
provisioning run while changing domain mode, domain, suffix or Chatwoot base
URL.

Resolution:

- `createOrResumeRun` now has an immutable input contract;
- mismatches on domain mode, resolved domain, provider fields, Chatwoot base URL
  and client admin identity must fail before any Chatwoot call;
- service tests must cover custom-to-provider, suffix change, domain change and
  Chatwoot base URL change.

Status: closed in plan.

### F9. Provider Subdomain Validation Needed Exact DNS Label Rule

Severity: Important

Independent review found that reject-case validation was not enough for safe
DNS/SNI/certificate behavior.

Resolution:

- added exact lowercase ASCII DNS label pattern;
- added length, edge-character, wildcard, dot, unicode/IDNA and reserved-label
  negative tests;
- provider suffix normalization now requires lowercase/trailing-dot policy and
  rejects protocol/path/port/wildcard.

Status: closed in plan.

### F10. Provider DNS/TLS/Proxy Prerequisites Were Missing

Severity: Important

Independent review found that provider-subdomain mode could create a tenant
whose URL does not work if wildcard DNS, TLS or Host preservation are absent.

Resolution:

- added provider-domain prerequisites to the plan and runbook task;
- added `/api/tenant` generated-host smoke;
- production handoff now requires HTTPS `/api/tenant` on the generated host.

Status: closed in plan.

### F11. Stable Architecture Docs Needed Domain-Mode Update

Severity: Important

Independent review found that architecture docs still described only
`lk.<client-domain>`.

Resolution:

- Task 08 now updates `docs/architecture/overview.md`,
  `docs/architecture/decisions.md` and
  `docs/architecture/multi-tenant-reference.md`;
- the plan requires documenting both domain modes while keeping Host-based
  tenant resolution unchanged.

Status: closed in plan.

### F12. Provisioning Run Schema Needed DB Constraints

Severity: Minor

Independent review found that repository validation alone would not protect
manual SQL or future bugs from invalid provisioning run rows.

Resolution:

- schema snippet now includes status/domain-mode checks;
- conditional provider-field check requires custom mode to have null provider
  fields and provider mode to have non-null provider fields with
  `provider_subdomain = slug`.

Status: closed in plan.

### F2. Reconciliation Could Not Distinguish Managed Tenants

Severity: Important

Initial reconciliation scope used only `listTenants`. That would not reliably
distinguish tenants created by the new operator provisioning flow from legacy
or default-bootstrap tenants.

Resolution:

- added `listCompletedRuns()` to provisioning repository;
- reconciliation now acts only on tenants with completed provisioning runs;
- older/default-bootstrap tenants are reported as `not_operator_provisioned`
  and skipped.

Status: closed in plan.

### F3. CLI Argument Parser Mixed CLI Args With Env-Only Values

Severity: Minor

Initial CLI parser returned full `TenantProvisioningInput`, but
`serviceEmailDomain` is intentionally env-owned.

Resolution:

- added a separate `CreateTenantCliArgs` type that contains only CLI-owned
  fields;
- `create-tenant.ts` must combine parsed args with
  `PORTAL_PROVISIONING_SERVICE_EMAIL_DOMAIN`;
- provider-subdomain mode also injects
  `PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX` from env.

Status: closed in plan.

### F4. Platform API 401 Was Too Dangerous As A Suspension Trigger

Severity: Critical

Initial reconciliation said Chatwoot `401` could suspend a tenant. That is too
dangerous because a rotated or broken Platform API token could suspend many
healthy tenants.

Resolution:

- reconciliation now suspends only on confident account missing response
  (`404`);
- `401` is reported as `platform_auth_failed`;
- tenant status is not changed for Platform API auth failure.

Status: closed in plan.

### F5. Provider-Owned Subdomains Needed To Be First-Class Scope

Severity: Important

After the initial review, the product scope added clients without their own
domains. If this stayed only as a runbook note, implementation could still
require `--primary-domain` and force every client to own DNS.

Resolution:

- added a Domain Model section with `custom_domain` and `provider_subdomain`
  modes;
- added `PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX` as deploy config;
- added provider-subdomain input validation, CLI parsing and local smoke steps;
- added acceptance criteria for clients without their own domain.

Status: closed in plan.

### F6. Current Provider Brand Must Not Leak Into Code Logic

Severity: Important

Provider-owned subdomains could accidentally hard-code the current company name
or current production domain. That would make a future neutral SaaS domain
change require code changes.

Resolution:

- plan now requires neutral examples such as `portal.example.com`;
- code must use `PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX`;
- real SaaS domain is treated as deployment configuration only.

Status: closed in plan.

## Remaining Intentional Tradeoffs

- The first implementation is CLI/operator-only, not an admin UI.
  Reason: backend lifecycle must be reliable before exposing a UI.
- Physical tenant purge is excluded.
  Reason: current tenant references use `onDelete: restrict`; archive/suspend is
  safer and matches retention needs.
- DNS and certificate automation are excluded.
  Reason: custom-domain clients only need DNS, and provider-subdomain DNS/cert
  automation should be a separate operations slice.
- Migration from provider-owned subdomain to client-owned custom domain is
  excluded.
  Reason: this needs a focused domain-change and certificate cutover flow.
- Public Chatwoot signup remains excluded.
  Reason: it does not provide domain, API Channel inbox, webhook secret or
  trusted provisioning authority.

## Final Review Result

Plan status: approved for implementation after follow-up fixes.

Open blockers: none.

Recommended execution mode:

1. Subagent-driven development by task.
2. Review after each task.
3. Checkpoint commit after each closed task.

Do not start implementation until the user explicitly approves this plan.
