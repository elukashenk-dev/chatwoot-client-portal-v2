# F-AUTH-002: Tenant-admin email privacy

- status: open
- found_in: Full application risk audit 2026-07-13; candidate ARCH-004 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Tenant-admin email privacy
- confidence: high
- evidence: `backend/src/modules/tenant-admin/adminAuthPrimitives.ts:92-97`; `backend/src/app-admin-auth.integration.test.ts:266-287`; `docs/superpowers/specs/2026-06-06-mt-9-tenant-admin-branding-prep.md:496-504`
- failure_path: Public caller distinguishes eligible administrator email from unknown/agent email by success versus explicit 403, enabling role enumeration and targeting
- counterevidence: Unknown and agent outcomes match; tenant+IP rate limit defaults to five per minute; no ineligible challenge/session
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Make public response semantics indistinguishable while keeping email send and audit outcome internal
- acceptance: Make public response semantics indistinguishable while keeping email send and audit outcome internal Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
