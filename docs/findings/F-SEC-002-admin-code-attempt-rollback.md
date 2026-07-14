# F-SEC-002: Invalid admin-code failures roll back the attempt counter and audit event

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A04-001 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release that changes or expands this security boundary.
- area: security / authentication-rate-limit
- confidence: high
- canonical_security_finding: SEC-STD-A04-001; generated writeup findings/sec-std-a04-001/sec-std-a04-001.md
- evidence: backend/src/modules/tenant-admin/adminAuthRoutes.ts:89-99; backend/src/modules/tenant-admin/adminAuthRepository.ts:151-157; backend/src/modules/tenant-admin/adminAuthService.ts:395-419; backend/src/modules/tenant-admin/adminAuthRepository.ts:259-271; backend/src/modules/tenant-admin/adminAuthRepository.ts:453-466. The intended maxAttempts transition and invalid-attempt audit write occur in the same Drizzle transaction that propagates createInvalidCodeError/createTooManyAttemptsError. Drizzle rolls back on any callback exception, so the returned error also undoes both security writes.
- failure_path: The verify route parses the public email/code body and calls verifyAdminLoginCode. The scoped tenant/email advisory lock prevents races but does not change exception rollback semantics. A wrong code reaches incrementChallengeAttempts and the invalid_code audit insert. The subsequent API error exits the transaction callback exceptionally, so Drizzle rolls back both writes. The client can submit another guess without consuming the persisted five-attempt budget; a correct guess follows the same endpoint to session creation.
- counterevidence: The service checks 15-minute expiry and maxAttempts and serializes each tenant/email transition with an advisory lock. These controls do not preserve the counter because the invalid-code exception rolls the transaction back. A separate process-local/ingress limiter may reduce request rate but does not restore the durable per-challenge cap or audit trail.
- load_impact: No separate load effect beyond the security failure path was established.
- fix_short: The invariant to restore is simple: an expected verification failure that changes security state must commit that state before it becomes an exception at the API boundary. Unexpected database or programming failures should still throw inside the transaction so that partial writes roll back.
- acceptance: Reproduce SEC-STD-A04-001, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
