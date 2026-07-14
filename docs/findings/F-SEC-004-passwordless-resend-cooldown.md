# F-SEC-004: Invalidating a code drops the database resend cooldown and permits repeated email/guess cycles

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A05-001 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release that changes or expands this security boundary.
- area: security / authentication-abuse
- confidence: high
- canonical_security_finding: SEC-STD-A05-001; generated writeup findings/sec-std-a05-001/sec-std-a05-001.md
- evidence: backend/src/modules/passwordless-login/routes.ts:55-55; backend/src/modules/passwordless-login/routes.ts:65-65; backend/src/modules/passwordless-login/verifyLoginCode.ts:75-75; backend/src/modules/passwordless-login/repository.ts:245-245; backend/src/modules/passwordless-login/requestLoginCode.ts:113-113. The affected path lacks the bounded authority or resource control described in SEC-STD-A05-001.
- failure_path: An unauthenticated remote client controls the email on POST /api/auth/code-login/request and the email plus six-digit guess on POST /api/auth/code-login/verify. Origin checking prevents browser CSRF but is not client authentication for a direct HTTP caller. A caller can force repeated passwordless emails to a known eligible address and repeatedly consume the tenant's scrypt, database, Chatwoot lookup, and SMTP budget. Each fresh record also grants another five guesses against a new six-digit code, increasing aggregate brute-force opportunities. The direct impact remains bounded to the selected tenant/email and service resources; the code does not expose the code or directly issue a session.
- counterevidence: Canonical validation recorded no additional counterevidence beyond the bounded controls already described in the generated finding.
- load_impact: No separate load effect beyond the security failure path was established.
- fix_short: The invariant to restore is: **a delivery deadline belongs to the tuple `(tenant_id, normalized_email, purpose)`, not to the current status of an authentication proof**. Invalidating, consuming, verifying, or expiring a proof must not authorize another email before the stored deadline.
- acceptance: Reproduce SEC-STD-A05-001, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
