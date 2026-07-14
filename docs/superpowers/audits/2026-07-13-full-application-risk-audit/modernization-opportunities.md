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
- Make the node-postgres pool maximum, connection-acquisition timeout and
  statement/transaction budgets explicit per backend process. Size the total
  connection budget across expected replicas instead of relying on the driver
  default as an undocumented deployment contract.
- Measure the indexed tenant lookup and secret-decryption cost before adding a
  request cache. If a cache becomes justified, give suspension and secret
  rotation an explicit invalidation path or short maximum staleness.
- Preserve representative PostgreSQL query-plan/cardinality fixtures for the
  highest-volume tables. Disposable PGlite checks are useful hypotheses, but
  production-like `EXPLAIN (ANALYZE, BUFFERS)` and WAL behavior need a separate
  isolated environment.

## Observability

- Add bounded metrics for active SSE streams, authorization-driven closes,
  webhook dedupe hits, recipient-resolution cardinality/duration, external
  Chatwoot calls per event and push queue depth. These would make the candidate
  realtime/load paths measurable without high-cardinality user labels.
- Add low-cardinality pool wait/active-connection, support-cache hit,
  thread-projection call/write, maintenance batch/progress and browser quota
  failure metrics. Do not label by tenant/user/thread; use bounded route or
  operation families and sampled traces for diagnosis.

## Deferred Product Choices

- Define a legal/product retention or archive policy for tenant-admin audit
  events separately from the technical cleanup policy for expired sessions and
  terminal login challenges.
- Decide whether all production tenant provisioning must require HTTPS and how
  local/test exceptions are represented explicitly rather than inferred from a
  URL.
