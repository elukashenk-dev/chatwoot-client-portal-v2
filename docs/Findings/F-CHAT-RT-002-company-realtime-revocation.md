# F-CHAT-RT-002. Company Realtime Revocation

- `status`: `open`
- `found_in`: chat thread model technical design review
- `risk`: `medium`
- `urgency`: before implementing company-thread realtime fanout
- `area`: backend chat realtime, Chatwoot webhooks, company thread access revocation
- `evidence`:
  - The spec requires company fanout to check current Chatwoot attributes before publishing to subscribers.
  - The plan includes a positive company fanout test but does not require a negative test where a subscribed user loses company access before a webhook arrives.
  - Without this check, a user removed from `portal_client_company_contact_ids` could keep receiving realtime messages until reconnect.
- `fix_short`: Revalidate current thread access per subscribed user during webhook fanout, or use a short-lived validated cache with explicit invalidation rules. Add revocation tests.
- `acceptance`:
  - A user subscribed to a company thread stops receiving webhook fanout after their person contact no longer includes the company contact ID.
  - History/send/realtime routes all reject the removed membership.
  - Tests cover revocation without requiring browser reconnect.
  - Realtime publication skips revoked subscribers instead of sending stale data.
