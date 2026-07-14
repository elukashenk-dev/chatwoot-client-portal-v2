# F-OPS-004: Production env propagation

- status: open
- found_in: Full application risk audit 2026-07-13; candidate OPS-004 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Production env propagation
- confidence: high
- evidence: `.env.production.example:29,33,47-49`; `infra/production/compose.yaml:66-113`; `docs/operations/mt-10a-tenant-lifecycle-rehearsal.md:63-85,126-130`; `backend/src/scripts/create-tenant-core.ts:276-292`
- failure_path: Compose omits five declared backend values; documented container provisioning/reconcile commands lack required settings, while custom cookie/timeout values are silently ignored
- counterevidence: Core service env, storage, SMTP, push and Telegram mappings mostly exist; compose and current ops tests pass
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Add deliberate mappings and a key-name-only per-service env contract test; prove MT-10A preflight without printing values
- acceptance: Add deliberate mappings and a key-name-only per-service env contract test; prove MT-10A preflight without printing values Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
