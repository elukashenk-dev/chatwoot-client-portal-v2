# F-SEC-003: Chatwoot administrator eligibility is not rechecked before session creation

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A04-002 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release that changes or expands this security boundary.
- area: security / authorization-staleness
- confidence: high
- canonical_security_finding: SEC-STD-A04-002; generated writeup findings/sec-std-a04-002/sec-std-a04-002.md
- evidence: backend/src/modules/tenant-admin/adminAuthRoutes.ts:89-105; backend/src/modules/tenant-admin/adminAuthService.ts:90-94; backend/src/modules/tenant-admin/adminVerification.ts:77-157; backend/src/modules/tenant-admin/adminAuthService.ts:422-442. The service treats eligibility cached in the challenge as sufficient at verification time. There is no second verifyTenantAdminEmail call between code validation and createSession, despite the repository design invariant that the role be rechecked before session creation.
- failure_path: A live Chatwoot lookup establishes eligibility only when the challenge is requested. The challenge stores agent id, email, and role for up to 15 minutes. Chatwoot can revoke the external role after that check without modifying the portal challenge row. The verify endpoint validates only the cached challenge and emailed code, then creates a hashed-token admin session. The separate admin-session guard accepts that same-tenant session until its 12-hour expiry.
- counterevidence: Challenge request performs a correct live Chatwoot lookup, the challenge expires after 15 minutes, and the resulting session is tenant-bound and expires after 12 hours. The initial lookup cannot detect revocation between challenge issuance and session creation.
- load_impact: No separate load effect beyond the security failure path was established.
- fix_short: The invariant to restore is straightforward: **a valid email code proves mailbox control, while a separate live Chatwoot decision must prove current administrator authority immediately before session creation**. Both proofs must refer to the same tenant, normalized email, and Chatwoot agent identity.
- acceptance: Reproduce SEC-STD-A04-002, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
