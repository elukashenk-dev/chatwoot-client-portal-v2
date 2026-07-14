# F-SEC-010: Attachment send rate limiting occurs after buffering the full 40 MiB multipart file

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A11-001 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release that changes or expands this security boundary.
- area: security / resource-exhaustion
- confidence: high
- canonical_security_finding: SEC-STD-A11-001; generated writeup findings/sec-std-a11-001/sec-std-a11-001.md
- evidence: backend/src/modules/chat-messages/routes.ts:160-176; backend/src/modules/chat-messages/routes.ts:395-418. The control that should reject excess attachment attempts runs only after request.parts() and toBuffer() have consumed the dominant network and memory cost.
- failure_path: A valid customer session reaches the attachment POST route. Fastify accepts a bounded but large multipart body and toBuffer allocates it. Only after buffering does the database-backed limiter return 429. Concurrent rejected uploads can therefore accumulate memory and bandwidth cost without producing Chatwoot sends.
- counterevidence: Body/file/part bounds and a shared DB limit of five attachment sends per minute exist, but the limiter is ordered after full buffering and no repository-level global request/concurrency limit covers this route.
- load_impact: A valid customer session reaches the attachment POST route. Fastify accepts a bounded but large multipart body and toBuffer allocates it. Only after buffering does the database-backed limiter return 429. Concurrent rejected uploads can therefore accumulate memory and bandwidth cost without producing Chatwoot sends.
- fix_short: The invariant to restore is simple to state: **no attacker-controlled file body may be materialized before the request holds a bounded upload admission permit, and a request that is already send-rate-limited must be rejected before its file stream is read.** Per-file byte limits remain necessary, but they are not a substitute for aggregate admission.
- acceptance: Reproduce SEC-STD-A11-001, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
