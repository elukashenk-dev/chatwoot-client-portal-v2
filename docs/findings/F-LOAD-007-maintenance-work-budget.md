# F-LOAD-007: Maintenance work budget

- status: open
- found_in: Full application risk audit 2026-07-13; candidate LOAD-005 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Maintenance work budget
- confidence: high
- evidence: `backend/src/modules/maintenance/cleanup.ts:84-228,230-390`; `backend/src/db/notificationSchema.ts:149-204`; synthetic 100k-row PGlite plan in `stages/06-load-reliability.md#load-005-maintenance-cleanup-has-no-work-budget`
- failure_path: Cleanup counts then deletes complete overdue sets without batch/time/run-lock bounds; measured global push retention scans all 100k rows to select 1k stale rows
- counterevidence: Retention/dry-run/tenant options exist, several families are indexed, and no cross-family transaction is held
- load_impact: Cleanup counts then deletes complete overdue sets without batch/time/run-lock bounds; measured global push retention scans all 100k rows to select 1k stale rows
- fix_short: Use production-shaped indexes plus keyset row/time batches, avoid full COUNT, add nonblocking single-run lease and test restart/concurrency/WAL bounds
- acceptance: Use production-shaped indexes plus keyset row/time batches, avoid full COUNT, add nonblocking single-run lease and test restart/concurrency/WAL bounds Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
