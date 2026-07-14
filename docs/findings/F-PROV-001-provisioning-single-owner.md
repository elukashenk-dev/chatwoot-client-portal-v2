# F-PROV-001: Provisioning single-owner execution

- status: open
- found_in: Full application risk audit 2026-07-13; candidate INT-004 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Provisioning single-owner execution
- confidence: high
- evidence: `backend/src/modules/tenant-provisioning/repository.ts:84-101,151-219`; `backend/src/modules/tenant-provisioning/service.ts:113-357`; `backend/src/modules/tenant-provisioning/serviceHelpers.ts:124-189`
- failure_path: Concurrent same-slug runs execute external creates before immutable-ID conflict detection; the loser leaves orphan resources and can overwrite the shared run status
- counterevidence: Operator-only low-frequency path; immutable IDs prevent silent authority switching; account custom attributes can aid later recovery
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Add a DB-backed run lease/generation and two-caller test requiring one account, one user set, one inbox and one completed run
- acceptance: Add a DB-backed run lease/generation and two-caller test requiring one account, one user set, one inbox and one completed run Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
