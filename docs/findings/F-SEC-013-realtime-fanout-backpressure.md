# F-SEC-013: Webhook acknowledgement synchronously waits on unbounded per-connection message snapshots

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A13-003 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: low
- urgency: Schedule a bounded fix before scale or exposure increases in this boundary.
- area: security / resource-amplification
- confidence: high
- canonical_security_finding: SEC-STD-A13-003; generated writeup findings/sec-std-a13-003/sec-std-a13-003.md
- evidence: backend/src/modules/chatwoot-webhooks/service.ts:400-400; backend/src/modules/chat-realtime/hub.ts:111-111; backend/src/modules/chat-messages/service.ts:741-741. The five-stream limit is per tenant/thread/user rather than per thread. The webhook response awaits one full current snapshot per connection, with no distinct-user coalescing, total-work cap, worker pool, queue, or acknowledgement deadline.
- failure_path: mapped message -> accepted delivery row -> synchronous publishCurrentSnapshot -> sequential per-connection access/history requests -> delayed webhook acknowledgement and backend/Chatwoot resource pressure
- counterevidence: At most five connections are allowed per tenant/thread/user, non-ready snapshots are skipped, external Chatwoot requests have configured timeouts, and the accepted delivery is recorded before fanout. Total per-thread connections and cumulative sequential latency remain unbounded.
- load_impact: mapped message -> accepted delivery row -> synchronous publishCurrentSnapshot -> sequential per-connection access/history requests -> delayed webhook acknowledgement and backend/Chatwoot resource pressure
- fix_short: The invariant to restore is: after signature, tenant invariants, mapping, deduplication, and durable event acceptance succeed, the HTTP acknowledgement must not wait for work whose size is controlled by the number of active connections. Realtime delivery should have its own explicit queue and work budget, and snapshots should be computed once per distinct user rather than once per browser connection.
- acceptance: Reproduce SEC-STD-A13-003, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
