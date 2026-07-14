# F-AUTH-004: Password-reset delivery rollback

- status: open
- found_in: Full application risk audit 2026-07-13; candidate BACK-002 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Password-reset delivery rollback
- confidence: high
- evidence: `backend/src/modules/password-reset/service.ts:216-296`
- failure_path: Detached R2 SMTP failure can restore captured R1 over a newer delivered R3 because cleanup does not prove ownership of the current pending generation
- counterevidence: Cooldown narrows the overlap and common SMTP failures return quickly; simple single-failure restore is tested
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Add current-record ownership fencing and reproduce delayed R2 failure after R3 succeeds
- acceptance: Add current-record ownership fencing and reproduce delayed R2 failure after R3 succeeds Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
