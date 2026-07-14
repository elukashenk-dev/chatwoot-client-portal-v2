# F-OPS-005: Deploy authority and completion

- status: open
- found_in: Full application risk audit 2026-07-13; candidate OPS-005 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Deploy authority and completion
- confidence: high
- evidence: `.github/workflows/deploy-production.yml:3-9,81-97`; `.dockerignore`; `scripts/deploy-production-archive.sh:141-189,353-377`; `docs/operations/production-deployment.md:5-18,88-120`
- failure_path: Alternate workflow resolves mutable refs in a reused unchecked VM tree, omits source/env/CI provenance controls and can report success after `up -d`/`ps` without final health or rollback
- counterevidence: Production environment/concurrency and input validation exist; canonical archive path rejects dirty source; compose dependencies and manual runbook check health
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Use one immutable reviewed artifact/commit path with clean source, provenance, env/config gate, bounded health/public smoke and explicit rollback decision
- acceptance: Use one immutable reviewed artifact/commit path with clean source, provenance, env/config gate, bounded health/public smoke and explicit rollback decision Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
