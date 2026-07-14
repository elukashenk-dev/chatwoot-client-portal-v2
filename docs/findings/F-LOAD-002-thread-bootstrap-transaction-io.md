# F-LOAD-002: Thread bootstrap transaction scope

- status: open
- found_in: Full application risk audit 2026-07-13; candidate BACK-005 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Thread bootstrap transaction scope
- confidence: high
- evidence: `backend/src/modules/chat-threads/repository.ts:91-107`; `backend/src/modules/chat-threads/runtime.ts:240-369`
- failure_path: Cold/recovery requests hold a DB transaction and advisory lock across Chatwoot I/O; same-key waiters also consume pool connections and can convoy at 10x/100x
- counterevidence: Established threads bypass bootstrap; HTTP calls have timeouts and the lock prevents duplicate creation
- load_impact: Cold/recovery requests hold a DB transaction and advisory lock across Chatwoot I/O; same-key waiters also consume pool connections and can convoy at 10x/100x
- fix_short: Move external work behind a durable short-transaction claim and load-test pool occupancy/contention
- acceptance: Move external work behind a durable short-transaction claim and load-test pool occupancy/contention Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
