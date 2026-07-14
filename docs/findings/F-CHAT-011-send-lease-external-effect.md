# F-CHAT-011: Send lease external-side-effect fence

- status: open
- found_in: Full application risk audit 2026-07-13; candidate BACK-007 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Send lease external-side-effect fence
- confidence: high
- evidence: `backend/src/modules/chat-messages/repository.ts:130-188,224-283`; `backend/src/modules/chat-messages/sendLedger.ts:210-379`; official Chatwoot v4.15.1 non-unique `messages.source_id`
- failure_path: A timed-out/old owner and reacquiring owner can both execute Chatwoot creates; processing tokens fence only portal writes and Chatwoot permits duplicate source IDs
- counterevidence: Client timeout is shorter than stale lease and source lookup commonly recovers; exact timeout/visibility overlap has not been executed
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Run a controlled two-owner timeout/visibility overlap and require one external effect and one canonical ledger owner
- acceptance: Run a controlled two-owner timeout/visibility overlap and require one external effect and one canonical ledger owner Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
