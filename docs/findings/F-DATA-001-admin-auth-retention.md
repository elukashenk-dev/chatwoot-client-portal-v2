# F-DATA-001: Admin auth data retention

- status: open
- found_in: Full application risk audit 2026-07-13; candidate ARCH-006 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Admin auth data retention
- confidence: high
- evidence: `backend/src/modules/maintenance/cleanup.ts:1-57`; `backend/src/modules/tenant-admin/adminAuthRepository.ts:311-446`
- failure_path: Expired/abandoned admin sessions and terminal challenges have no eventual cleanup, growing tables/indexes and backup/restore work without bound
- counterevidence: Rows are small and admin volume is lower; audit events may require long retention
- load_impact: Expired/abandoned admin sessions and terminal challenges have no eventual cleanup, growing tables/indexes and backup/restore work without bound
- fix_short: Define separate policies; preserve active rows and purge only expired sessions/terminal challenges beyond retention
- acceptance: Define separate policies; preserve active rows and purge only expired sessions/terminal challenges beyond retention Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
