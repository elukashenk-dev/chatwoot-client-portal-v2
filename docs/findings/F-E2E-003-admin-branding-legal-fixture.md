# F-E2E-003: Admin branding browser fixture

- status: open
- found_in: Full application risk audit 2026-07-13; candidate DYN-001 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: low
- urgency: Schedule a bounded maintenance fix before this control is relied on as regression evidence.
- area: Admin branding browser fixture
- confidence: high
- evidence: `frontend/src/features/admin-shell/pages/AdminBrandingPage.tsx:98-116`; `frontend/src/features/admin-branding/api/adminBrandingClient.ts:204-207`; `tests/e2e/admin-branding-settings.spec.ts:125-188`; `stages/09-dynamic-validation.md#browser-validation`
- failure_path: All seven branding scenarios mock admin auth and branding but omit the now-required legal-documents endpoint; its real 401 rejects the combined load and hides the form before branding assertions
- counterevidence: Real authenticated product behavior was not shown broken; frontend page/client unit tests and the full Vitest suite pass; this is a browser-fixture regression
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Extend the shared admin-branding Playwright fixture with the current legal-documents contract and rerun every branding scenario.
- acceptance: Extend the shared admin-branding Playwright fixture with the current legal-documents contract and rerun every branding scenario. Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
