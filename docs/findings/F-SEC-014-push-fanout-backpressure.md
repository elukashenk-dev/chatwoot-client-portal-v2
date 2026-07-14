# F-SEC-014: Accepted message events spawn unqueued push fanout with unbounded total recipient and subscription work

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A13-004 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: low
- urgency: Schedule a bounded fix before scale or exposure increases in this boundary.
- area: security / resource-amplification
- confidence: high
- canonical_security_finding: SEC-STD-A13-004; generated writeup findings/sec-std-a13-004/sec-std-a13-004.md
- evidence: backend/src/modules/chatwoot-webhooks/service.ts:411-411; backend/src/modules/chat-notifications/recipientResolver.ts:154-154; backend/src/modules/chat-notifications/pushDeliveryService.ts:143-143. Fire-and-forget removes push latency from the webhook response but does not bound in-process jobs. Each job has unbounded total tenant-recipient and subscription cardinality, and new message events can start overlapping jobs faster than prior fanouts finish.
- failure_path: burst of unique mapped group messages -> one unqueued push Promise per message -> repeated tenant-wide recipient scan -> per-recipient visibility/settings/subscription work -> overlapping external push sends -> backend/database/Chatwoot/push-provider resource exhaustion
- counterevidence: Delivery-key dedupe starts push once per unique event; recipient lookup concurrency is five; current user/thread visibility is rechecked; push attempts are unique per message/subscription and the transport has a five-second socket timeout. These controls preserve correctness and bound individual calls, not total concurrent work.
- load_impact: burst of unique mapped group messages -> one unqueued push Promise per message -> repeated tenant-wide recipient scan -> per-recipient visibility/settings/subscription work -> overlapping external push sends -> backend/database/Chatwoot/push-provider resource exhaustion
- fix_short: ### Restore a bounded admission invariant
- acceptance: Reproduce SEC-STD-A13-004, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
