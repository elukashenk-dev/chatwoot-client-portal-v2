# F-SUPPLY-001: Production dependency advisory gate

- status: open
- found_in: Full application risk audit 2026-07-13; candidate OPS-007 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Production dependency advisory gate
- confidence: high
- evidence: `pnpm-lock.yaml` locked `fast-uri@3.1.0`, `react-router@7.14.1`, `nodemailer@8.0.5`; `pnpm audit --prod --json` on 2026-07-14; `.github/workflows/ci.yml:28-38`; primary advisories in `stages/07-operations-supply-chain.md#dependency-evidence`
- failure_path: Nine known advisories remain in production dependencies and no checked-in CI/update policy gates newly published production advisories
- counterevidence: No current portal exploit path was established: BrowserRouter is excluded; Nodemailer dangerous modes absent; fast-uri receives code-owned schemas
- load_impact: Nine known advisories remain in production dependencies and no checked-in CI/update policy gates newly published production advisories
- fix_short: Upgrade and run full closure; gate zero production advisories or owner/date/applicability exceptions, with explicit registry-failure behavior
- acceptance: Upgrade and run full closure; gate zero production advisories or owner/date/applicability exceptions, with explicit registry-failure behavior Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
