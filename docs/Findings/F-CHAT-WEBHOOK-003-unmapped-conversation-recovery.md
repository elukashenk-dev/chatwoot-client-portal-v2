# F-CHAT-WEBHOOK-003: Unmapped Webhook Conversation Recovery Is Too Broad

- `status`: open
- `found_in`: Codex Security review of chat thread model plan, 2026-05-15
- `risk`: high
- `urgency`: before changing webhook routing for company threads
- `area`: backend Chatwoot webhooks, thread mapping recovery, realtime fanout
- `evidence`:
  - Security review found that webhook recovery must not create thread mappings from contact validity alone; otherwise a manually created or unrelated Chatwoot conversation for a valid portal company contact could be published to company thread subscribers.
  - The spec now records the fail-closed rule for unmapped webhook conversations in `docs/superpowers/specs/2026-05-14-chat-thread-model-design.md:428`.
  - Planned fanout maps Chatwoot conversation ID to a portal thread and publishes snapshots by `threadId`.
  - Plan evidence: `docs/superpowers/plans/2026-05-14-chat-thread-model.md:2208` through `docs/superpowers/plans/2026-05-14-chat-thread-model.md:2240`.
  - Contact validity plus account/inbox checks prove the contact belongs to the tenant, but do not prove that this specific conversation was created by the portal thread bootstrap path.
  - Current webhook code is safer because unmapped conversations are recorded as `unroutable` and ignored in `backend/src/modules/chatwoot-webhooks/service.ts:409`.
- `fix_short`: Keep unmapped webhook conversations fail-closed by default. Allow mapping recovery only from a portal-owned marker created by backend thread bootstrap, and still validate tenant/account/inbox/contact invariants before fanout.
- `acceptance`:
  - Tests prove manually created or otherwise unmapped Chatwoot conversations for valid portal contacts are ignored, not auto-mapped.
  - Tests prove webhook fanout only works for conversations already mapped in `portal_chat_threads` or for conversations with a verified portal-owned bootstrap marker.
  - Spec and implementation plan no longer allow recovery from contact validity alone.
