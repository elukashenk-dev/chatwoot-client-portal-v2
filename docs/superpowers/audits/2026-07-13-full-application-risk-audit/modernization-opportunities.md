# Full Application Risk Audit Modernization Opportunities

Entries in this document are not defects or verdict blockers unless separate
validation promotes the underlying behavior to a finding.

## Supported-version Changes

No opportunities recorded yet.

## Maintainability

- Remove unused `resolveDefaultTenant` and `assertDefaultTenantRuntime` after
  confirming no external operator script depends on them. Normal request
  runtime is already strictly host-first.
- Consider a portal-schema identity/sentinel check before applying migrations.
  The reference compose/installer already isolates Postgres; this would reduce
  damage from an operator-supplied wrong `DATABASE_URL` rather than fix an
  observed mixed-database deployment.
- If backend network topology expands beyond the current internal compose
  network, replace boolean `trustProxy` with an explicit trusted proxy
  CIDR/function policy.
- Review explicit application timeouts for S3-compatible object storage and
  SMTP plus explicit SMTP TLS policy after provider/library defaults are
  confirmed. Current production guidance uses TLS, so this is not yet a
  validated defect.

## Observability

- Add bounded metrics for active SSE streams, authorization-driven closes,
  webhook dedupe hits, recipient-resolution cardinality/duration, external
  Chatwoot calls per event and push queue depth. These would make the candidate
  realtime/load paths measurable without high-cardinality user labels.

## Deferred Product Choices

- Define a legal/product retention or archive policy for tenant-admin audit
  events separately from the technical cleanup policy for expired sessions and
  terminal login challenges.
- Decide whether all production tenant provisioning must require HTTPS and how
  local/test exceptions are represented explicitly rather than inferred from a
  URL.
