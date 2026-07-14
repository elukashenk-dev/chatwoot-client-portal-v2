# F-CHAT-009: Chat send idempotency/integrity

- status: open
- found_in: Full application risk audit 2026-07-13; candidate ARCH-002 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Chat send idempotency/integrity
- confidence: high
- evidence: `backend/src/db/schema.ts:262-267`; `backend/src/modules/chat-messages/repository.ts:50-59`; `backend/src/integrations/chatwoot/messageClient.ts:201-218`; `backend/src/modules/chat-messages/messageMapping.ts:249-274`; `backend/src/modules/chat-messages/sendLedger.ts:281-299`
- failure_path: Group user reuses another visible message key; per-user ledger row is new but conversation-global Chatwoot lookup aliases the old message, suppresses the new payload and can poison author attribution
- counterevidence: Normal UI creates UUIDs; tenant/thread access and same-user payload mismatch remain enforced
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Two group users reuse one key with different payloads; require no alias, no attribution change and unambiguous ledger ownership
- acceptance: Two group users reuse one key with different payloads; require no alias, no attribution change and unambiguous ledger ownership Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
