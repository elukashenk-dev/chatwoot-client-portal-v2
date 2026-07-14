# F-INT-001: Chatwoot webhook recovery

- status: open
- found_in: Full application risk audit 2026-07-13; candidate INT-001 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Chatwoot webhook recovery
- confidence: high
- evidence: `backend/src/modules/chatwoot-webhooks/service.ts:352-425`; official Chatwoot v4.15.1 `lib/webhooks/trigger.rb`; `stages/04-chatwoot-integrations.md#int-001-api-channel-webhook-failures-are-terminal-without-reconciliation`
- failure_path: A transient portal timeout/5xx is terminal upstream, so unread, inactive-thread notification, push and realtime state have no durable catch-up event
- counterevidence: Chatwoot retains message history and the visible active thread has a 30-second snapshot fallback
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Add bounded durable reconciliation and test downtime/timeout recovery for active and inactive threads exactly once
- acceptance: Add bounded durable reconciliation and test downtime/timeout recovery for active and inactive threads exactly once Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
