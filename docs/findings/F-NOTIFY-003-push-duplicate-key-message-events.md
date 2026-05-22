# F-NOTIFY-003 Push Duplicate Key Message Events

- `status`: `open`
- `found_in`: deep review of `docs/superpowers/specs/2026-05-23-chat-notifications-design.md`
- `risk`: `medium`
- `urgency`: fix before implementation plan
- `area`: chat notifications, webhook idempotency, persistence

## Evidence

The spec proposes `portal_push_deliveries` with:

```text
tenant_id + portal_user_id + thread_id + chatwoot_message_id
```

as the duplicate suppression key:

- `docs/superpowers/specs/2026-05-23-chat-notifications-design.md:298`
- `docs/superpowers/specs/2026-05-23-chat-notifications-design.md:312`

The current webhook service supports both `message_created` and
`message_updated`:

- `backend/src/modules/chatwoot-webhooks/service.ts:21`
- `backend/src/modules/chatwoot-webhooks/service.ts:354`

The existing webhook delivery table allows nullable Chatwoot message ids:

- `backend/src/db/schema.ts:301`
- `backend/src/db/schema.ts:302`

If push delivery accepts null message ids, PostgreSQL unique indexes will not
deduplicate nulls the way a message-level idempotency key needs. If push sends
for both `message_created` and `message_updated`, an edited message can trigger
either unwanted duplicate pushes or an ambiguous "already delivered" state.

## Fix Short

Define push-trigger events explicitly:

- first slice should send push only for `message_created`;
- require non-null `chatwoot_message_id` before any push delivery;
- ignore `message_updated` for push unless a later feature explicitly needs edit
  notifications;
- keep existing webhook delivery dedupe separate from push recipient delivery
  dedupe.

## Acceptance

- Spec says which webhook events can produce push.
- Push delivery never records rows with null `chatwoot_message_id`.
- Tests prove duplicate `message_created` delivery sends one push per recipient.
- Tests prove `message_updated` does not send push in the first slice.
