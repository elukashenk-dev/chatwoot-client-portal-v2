# F-NOTIFY-002 Group Push Recipient Resolution

- `status`: `open`
- `found_in`: deep review of `docs/superpowers/specs/2026-05-23-chat-notifications-design.md`
- `risk`: `high`
- `urgency`: fix before implementation plan
- `area`: chat notifications, group access, Chatwoot webhook delivery

## Evidence

The spec says push delivery should:

- resolve the portal thread;
- find portal users in the tenant who still have access to the thread;
- send only to users with enabled preferences.

See:

- `docs/superpowers/specs/2026-05-23-chat-notifications-design.md:340`
- `docs/superpowers/specs/2026-05-23-chat-notifications-design.md:343`

Current group access is not stored as a direct portal DB membership table. The
safe group participant logic lists active portal user contact links and then
checks each Chatwoot person contact's portal attributes:

- `backend/src/modules/chat-threads/service.ts:137`
- `backend/src/modules/chat-threads/service.ts:141`
- `backend/src/modules/chat-threads/service.ts:149`

The current webhook path is synchronous and currently only publishes realtime
snapshots by thread:

- `backend/src/modules/chatwoot-webhooks/service.ts:270`
- `backend/src/modules/chatwoot-webhooks/service.ts:277`

Without a bounded, fail-closed recipient resolver, group push can become either
unsafe or too expensive:

- unsafe if it relies on stale portal rows and not current Chatwoot membership;
- expensive if every webhook makes N Chatwoot API calls for every active portal
  user in the tenant;
- fragile if Chatwoot is slow/unavailable during webhook processing.

## Fix Short

Specify the recipient resolver before implementation:

- for private threads, recipient is the mapped private portal user;
- for group threads, resolve candidates from tenant-scoped contact links and
  re-check current Chatwoot contact attributes with explicit concurrency limits;
- fail closed on missing/invalid group membership;
- define behavior when Chatwoot membership cannot be checked;
- consider a follow-up membership snapshot/cache only if webhook latency becomes
  unacceptable.

## Acceptance

- Spec defines a bounded group recipient resolver.
- Implementation plan includes tests for removed group membership.
- Webhook processing cannot send push to a user who no longer has group access.
- Webhook processing has a clear timeout/concurrency strategy.
