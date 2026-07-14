# F-SEC-005: Older verified password-reset continuations can become usable again after a newer reset completes

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A07-001 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release that changes or expands this security boundary.
- area: security / authentication-recovery
- confidence: high
- canonical_security_finding: SEC-STD-A07-001; generated writeup findings/sec-std-a07-001/sec-std-a07-001.md
- evidence: backend/src/modules/password-reset/service.ts:321-321; backend/src/modules/password-reset/repository.ts:220-220; backend/src/modules/password-reset/service.ts:680-680; backend/src/db/schema.ts:397-397. The affected path lacks the bounded authority or resource control described in SEC-STD-A07-001.
- failure_path: A holder of an older, still-unexpired continuation can reset the password after a victim completes a newer recovery, revoking the victim's new sessions and regaining account control.
- counterevidence: Canonical validation recorded no additional counterevidence beyond the bounded controls already described in the generated finding.
- load_impact: No separate load effect beyond the security failure path was established.
- fix_short: Restore the invariant that only the current recovery generation can authorize a password change. The smallest robust design is to invalidate every older `pending` or `verified` sibling for the same tenant, normalized email, purpose, and user while holding the existing scoped advisory lock.
- acceptance: Reproduce SEC-STD-A07-001, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
