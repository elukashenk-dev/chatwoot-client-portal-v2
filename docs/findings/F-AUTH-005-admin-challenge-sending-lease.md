# F-AUTH-005: Admin challenge delivery lifecycle

- status: open
- found_in: Full application risk audit 2026-07-13; candidate BACK-003 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Admin challenge delivery lifecycle
- confidence: high
- evidence: `backend/src/modules/tenant-admin/adminAuthService.ts:121-132,166-196,271-307`; `backend/src/modules/maintenance/cleanup.ts:1-57`
- failure_path: Crash or unclassified mail error after committed `sending` state makes every later request return delivery-in-progress without expiry recovery
- counterevidence: Known SMTP failures are cleaned up; another eligible administrator may remain
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Make `sending` a recoverable fenced lease and test crash/unclassified-error recovery
- acceptance: Make `sending` a recoverable fenced lease and test crash/unclassified-error recovery Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
