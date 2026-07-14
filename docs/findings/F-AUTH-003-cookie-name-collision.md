# F-AUTH-003: Customer/admin cookie namespace

- status: open
- found_in: Full application risk audit 2026-07-13; candidate ARCH-007 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: low
- urgency: Schedule a bounded maintenance fix before this control is relied on as regression evidence.
- area: Customer/admin cookie namespace
- confidence: high
- evidence: `backend/src/config/env.ts:155-210`; local parser accepted equal names; cookie options in `backend/src/modules/auth/sessionCookie.ts:6-23` and `backend/src/modules/tenant-admin/adminSessionCookie.ts:8-27`
- failure_path: Equal configured names share host/path, so logins overwrite each other and either logout clears the other context, leaving broken sessions/orphan rows
- counterevidence: Defaults/examples are distinct and backend token tables prevent privilege escalation
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Reject equal cookie names at environment load; retain current default parsing
- acceptance: Reject equal cookie names at environment load; retain current default parsing Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
