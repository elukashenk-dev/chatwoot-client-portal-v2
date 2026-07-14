# Full Application Risk Audit Modernization Opportunities

Status: complete for frozen commit
`a61b4975ae7b59e244c0b5bbc4efd02466aa075c`

Entries in this document are not defects or verdict blockers unless separate
validation promotes the underlying behavior to a finding.

## Finding-Backed Hardening Boundaries

The generated
[security hardening portfolio](/tmp/codex-security-scans/chatwoot-client-portal-v2-audit-source-2026-07-13/a61b4975ae7b59e244c0b5bbc4efd02466aa075c_20260713T191131Z/hardening/hardening.md)
qualifies two structural opportunities:

- generation-aware authority lifecycle across proof, session, SSE and push
  state;
- bounded work admission/backpressure across uploads, parsers, webhook work,
  realtime, push fanout and tenant scheduling.

These are decision options, not implemented controls. Apply the direct finding
fixes and their regression gates first. Consider the shared boundaries only in
a later approved design scope, with measured latency/cardinality, explicit
tenant/global limits, rollback and migration costs. Focused local fixes remain
preferable for Chatwoot redirect validation and secret-file creation mode.

Several originally listed improvements became validated findings during the
audit and must no longer be treated as optional modernization:

- production advisory enforcement —
  `docs/findings/F-SUPPLY-001-production-advisory-gate.md`;
- immutable Actions/images —
  `docs/findings/F-SUPPLY-002-immutable-build-inputs.md`;
- production environment propagation —
  `docs/findings/F-OPS-004-production-env-propagation.md`;
- deploy authority/completion —
  `docs/findings/F-OPS-005-deploy-authority-completion.md`.

## Supported-version Changes

- Schedule a dependency-refresh scope for the 29 direct packages reported by
  `pnpm outdated`. Keep routine patch/minor updates separate from reviewed major
  migrations such as Nodemailer 9, ESLint 10 and TypeScript 7.
- After closing `F-SUPPLY-001`, automate dependency-update pull requests so the
  enforced production-advisory policy receives small reviewed refreshes.
- Keep Node on a supported LTS line and update the exact Node 24 patch used by
  CI/container builds through a reviewed, tested digest refresh.

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
- After closing `F-SUPPLY-002`, add minimal workflow `permissions` and automated
  digest-refresh pull requests so immutability does not turn into permanent
  staleness.
- After closing `F-OPS-005`, extend immutable artifact promotion with retained
  provenance and release-to-runtime traceability.
- Generate and retain an SBOM and build provenance/attestation for release
  artifacts. This improves incident response and dependency traceability; it
  is not a substitute for vulnerability reachability review.
- After closing `F-OPS-004`, formalize the production environment contract by
  classifying operator-only, runtime, secret and installer-only values and
  generating bounded validation from that classification.

## Observability

- Add bounded metrics for active SSE streams, authorization-driven closes,
  webhook dedupe hits, recipient-resolution cardinality/duration, external
  Chatwoot calls per event and push queue depth. These would make the candidate
  realtime/load paths measurable without high-cardinality user labels.
- Add low-cardinality pool wait/active-connection, support-cache hit,
  thread-projection call/write, maintenance batch/progress and browser quota
  failure metrics. Do not label by tenant/user/thread; use bounded route or
  operation families and sampled traces for diagnosis.
- Add low-cardinality deploy outcome/provenance, health-gate duration and
  rollback outcome signals. Monitor backup age, copy success, restore-drill age
  and recovery duration without putting tenant names, object keys or secrets in
  labels/logs.

## Deferred Product Choices

- Define a legal/product retention or archive policy for tenant-admin audit
  events separately from the technical cleanup policy for expired sessions and
  terminal login challenges.
- Decide whether all production tenant provisioning must require HTTPS and how
  local/test exceptions are represented explicitly rather than inferred from a
  URL.
- Define portal DB/object-storage RPO, RTO, retention, geographic/provider
  failure scope and evidence ownership before new-client onboarding. Keep the
  Chatwoot backup lifecycle separate but coordinate recovery ordering.
