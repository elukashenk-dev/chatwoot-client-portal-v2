# F-CHAT-THREAD-006: Company Conversation Bootstrap Race

- `status`: open
- `found_in`: Codex Security review of chat thread model plan, 2026-05-15
- `risk`: medium
- `urgency`: before enabling company thread send bootstrap
- `area`: backend chat threads, lazy Chatwoot conversation bootstrap, company threads
- `evidence`:
  - The implementation plan says `ensureCurrentUserWritableThreadContext` creates/reuses a contact inbox source ID and Chatwoot conversation when missing, then persists the conversation ID with `chatThreadsRepository.updateThreadConversation`.
  - Planned flow: `docs/superpowers/plans/2026-05-14-chat-thread-model.md:1699` and `docs/superpowers/plans/2026-05-14-chat-thread-model.md:1700`.
  - Planned create call: `docs/superpowers/plans/2026-05-14-chat-thread-model.md:1715`.
  - Current Chatwoot create sink is a plain `POST /conversations` wrapper in `backend/src/integrations/chatwoot/client.ts:1313`.
  - Without a per-thread DB lock, transactional re-read or compare-and-set guard, two authorized company users can send the first message concurrently and create duplicate remote Chatwoot conversations before the portal thread row is updated.
- `fix_short`: Bootstrap company conversations under a per-thread transaction/lock: lock the `portal_chat_threads` row, re-read `chatwoot_conversation_id`, create a Chatwoot conversation only if still missing, persist it, then release the lock.
- `acceptance`:
  - Concurrent company first-send test proves only one Chatwoot conversation create call happens for one `tenant_id + company contact` thread.
  - Losing concurrent requests reuse the persisted conversation mapping after the lock/re-read.
  - Company send remains disabled until this guard is implemented and tested.
