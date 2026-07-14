# F-CHAT-010: Message source-ID recovery window

- status: open
- found_in: Full application risk audit 2026-07-13; candidate BACK-006 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Message source-ID recovery window
- confidence: high
- evidence: `backend/src/integrations/chatwoot/messageClient.ts:201-218`; official Chatwoot v4.15.1 `MessageFinder`; `stages/04-chatwoot-integrations.md#back-006-source-id-recovery-searches-only-the-latest-20-messages`
- failure_path: An accepted ambiguous send outside Chatwoot's latest-20 default response is treated as absent and can be created again
- counterevidence: Common immediate retries find recent messages; exact outside-window schedule remains dynamic-validation work
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Reproduce an accepted message outside the latest window and require bounded exact recovery with one canonical result
- acceptance: Reproduce an accepted message outside the latest window and require bounded exact recovery with one canonical result Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
