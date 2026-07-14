# F-CI-001: CI/browser regression gate

- status: open
- found_in: Full application risk audit 2026-07-13; candidate BASE-003 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: CI/browser regression gate
- confidence: high
- evidence: `package.json:21-25`; `.github/workflows/ci.yml:28-38`
- failure_path: Pull requests run Vitest/ops but no Playwright, allowing browser-only failures to merge; the 14-file auth mismatch is not exercised
- counterevidence: 1,574 unit/integration tests pass and 19 Playwright specs exist for manual execution
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Add a bounded critical Playwright subset to pull-request CI with safe local fixtures and explicit blockers for unavailable external services.
- acceptance: Add a bounded critical Playwright subset to pull-request CI with safe local fixtures and explicit blockers for unavailable external services. Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
