# F-SEC-007: Group-info requests amplify into a tenant-wide sequence of Chatwoot API calls

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A09-003 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: low
- urgency: Schedule a bounded fix before scale or exposure increases in this boundary.
- area: security / resource-amplification
- confidence: high
- canonical_security_finding: SEC-STD-A09-003; generated writeup findings/sec-std-a09-003/sec-std-a09-003.md
- evidence: backend/src/modules/chat-threads/routes.ts:36-48; backend/src/modules/chat-threads/service.ts:190-229; backend/src/modules/chat-threads/contactRepository.ts:81-101. Participant discovery filters membership only after an unpaginated tenant-wide database result and one sequential Chatwoot request per active linked user. No cache, batch endpoint, size threshold, request coalescing, or route-specific rate limit bounds work by tenant size.
- failure_path: A valid group member passes session and current-thread authorization. getCurrentUserThreadInfo calls listSafeGroupParticipants. The repository returns all active linked users in the tenant. The service makes one sequential Chatwoot contact request per returned user and filters membership only afterward. Repeated requests multiply external calls and occupy request workers in proportion to tenant size.
- counterevidence: The caller must be a current group member, group ids per person are capped at 20, and the database query is tenant-scoped/active-only. None limits total active users scanned or external calls per request.
- load_impact: No separate load effect beyond the security failure path was established.
- fix_short: The invariant to restore is straightforward: serving group info must not scan all tenant users or perform one external request per tenant user. Work should scale with a bounded page of actual group members, and repeated identical requests should have an explicit request budget.
- acceptance: Reproduce SEC-STD-A09-003, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
