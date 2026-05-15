# F-CHAT-THREAD-002. Thread Resolver Authority Boundary

- `status`: `open`
- `found_in`: chat thread model technical design review
- `risk`: `high`
- `urgency`: before implementing `GET /api/chat/messages`, send, attachments or realtime by `threadId`
- `area`: backend chat threads, access control, Chatwoot conversation mapping
- `evidence`:
  - The plan correctly states that browser input must select only a portal `threadId`.
  - The implementation plan also includes repository methods such as `findThreadById(id)`, which can be confused with public `company:154` thread IDs if the resolver boundary is not explicit.
  - A weak resolver could accidentally treat browser-provided IDs as internal DB row IDs or Chatwoot conversation authority.
- `fix_short`: Define one explicit resolver path for every chat operation: parse public `threadId`, validate tenant/session, validate current person contact attributes, validate company membership when needed, resolve or upsert the portal thread record, then resolve the internal Chatwoot conversation ID.
- `acceptance`:
  - No route accepts an internal portal thread row ID or Chatwoot conversation ID from the browser.
  - `company:<id>` is always interpreted as a Chatwoot company contact ID in current tenant scope, not as a portal DB row ID.
  - Tests cover forged `company:<id>` values, wrong tenant contacts, missing membership and disabled contacts.
  - All history/send/attachment/realtime routes call the same resolver or equivalent shared authority function before touching Chatwoot.
