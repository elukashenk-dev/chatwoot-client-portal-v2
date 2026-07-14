# F-SEC-011: Unauthorised thread labels create unbounded high-cardinality database rate-limit buckets

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A11-002 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: low
- urgency: Schedule a bounded fix before scale or exposure increases in this boundary.
- area: security / resource-exhaustion
- confidence: high
- canonical_security_finding: SEC-STD-A11-002; generated writeup findings/sec-std-a11-002/sec-std-a11-002.md
- evidence: backend/src/modules/chat-messages/routes.ts:24-63; backend/src/modules/chat-messages/routes.ts:377-392; backend/src/modules/chat-messages/rateLimit.ts:64-72. Each distinct raw label starts at count one in a new persistent bucket, so the per-thread threshold never triggers; thread parsing and access rejection happen only after the insert/upsert.
- failure_path: The request first authenticates a real customer but accepts an arbitrary bounded label. The label is persisted as part of a tenant/user/thread subject key. Changing the label avoids incrementing any prior bucket. Only afterward does canonical parsing or membership reject the send, leaving the write behind.
- counterevidence: The runtime later accepts only canonical private:me or group:<safe-positive-id> and rechecks group membership. The bucket table has a uniqueness key and expiry index, but uniqueness is per attacker-chosen subjectKey and does not cap cardinality before cleanup.
- load_impact: The request first authenticates a real customer but accepts an arbitrary bounded label. The label is persisted as part of a tenant/user/thread subject key. Changing the label avoids incrementing any prior bucket. Only afterward does canonical parsing or membership reject the send, leaving the write behind.
- fix_short: The invariant to restore is simple: an attacker-controlled thread label must not define a persistent rate-limit namespace before it is canonical and authorized. At the same time, the portal should retain a bounded limiter in front of potentially expensive thread resolution.
- acceptance: Reproduce SEC-STD-A11-002, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
