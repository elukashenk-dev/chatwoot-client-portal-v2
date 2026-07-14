# F-DB-001: Drizzle snapshot lineage

- status: open
- found_in: Full application risk audit 2026-07-13; candidate BACK-004 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Drizzle snapshot lineage
- confidence: high
- evidence: `backend/drizzle/meta/0023_snapshot.json:2-3`; `backend/drizzle/meta/0024_snapshot.json:2-3`; `backend/drizzle/meta/_journal.json:170-177`
- failure_path: Two sequential migrations share the same snapshot ID and parent; future generation/checking starts from an ambiguous migration graph
- counterevidence: Existing SQL migrations and baseline integration tests pass; no current row corruption established
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Repair 0024 identity/parent and require clean check plus empty/0023 migration rehearsals
- acceptance: Repair 0024 identity/parent and require clean check plus empty/0023 migration rehearsals Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
