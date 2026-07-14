# F-E2E-002: Browser regression safety net

- status: open
- found_in: Full application risk audit 2026-07-13; candidate BASE-001 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Browser regression safety net
- confidence: high
- evidence: `frontend/src/app/routePaths.ts:17-24`; `frontend/src/app/AppRoutes.tsx:130-180`; `tests/e2e/auth-email-flows.spec.ts:58-190`; `tests/e2e/auth-guard-negative.spec.ts:33-174`; 14 affected Playwright files listed in `stages/00-baseline.md`; `stages/09-dynamic-validation.md#browser-validation`
- failure_path: Removed registration routes redirect and primary `/auth/login` renders code request, so stale password/registration helpers fail before intended browser assertions
- counterevidence: Fresh lint/build and 1,574 unit/integration tests pass; legacy API absence is explicitly tested; 11 Chatwoot-dependent browser tests could not pass the safe local fixture gate
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Rewrite the affected customer Playwright helpers and scenarios to the current email-code login contract, keep Chatwoot mutation local-only, and make every intended browser assertion reachable.
- acceptance: Rewrite the affected customer Playwright helpers and scenarios to the current email-code login contract, keep Chatwoot mutation local-only, and make every intended browser assertion reachable. Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
