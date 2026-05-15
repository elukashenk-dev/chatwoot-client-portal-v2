# F-CHAT-THREAD-001. Send Ledger Company User Scope

- `status`: `open`
- `found_in`: chat thread model technical design review
- `risk`: `high`
- `urgency`: before implementing company-thread sends
- `area`: backend chat messages, send ledger, company threads, idempotency
- `evidence`:
  - `docs/superpowers/plans/2026-05-14-chat-thread-model.md` currently says to change `SendLedgerScope` to `{ clientMessageKey; portalChatThreadId }`.
  - Current `portal_chat_message_sends_scope_unique` includes `tenant_id`, `user_id`, `primary_conversation_id` and `client_message_key`.
  - In a company thread, multiple portal users share the same `portal_chat_thread_id`; removing `user_id` from the idempotency scope can make two different company users collide if their clients generate the same `clientMessageKey`.
- `fix_short`: Keep user identity in the send-ledger idempotency scope: `tenant_id + portal_chat_thread_id + user_id + client_message_key`. Keep `user_id` as the message author/audit field.
- `acceptance`:
  - Schema unique index includes `tenant_id`, `portal_chat_thread_id`, `user_id` and `client_message_key`.
  - Backend repository scope includes `userId`.
  - Tests prove two different users can send with the same `clientMessageKey` in the same company thread without replaying each other.
  - Tests prove the same user gets idempotent replay for the same `clientMessageKey` in the same thread.
