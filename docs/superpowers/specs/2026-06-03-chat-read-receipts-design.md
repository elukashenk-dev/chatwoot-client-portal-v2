# Chat Read Receipts Design

## Goal

Implement honest read receipts for portal chat without changing Chatwoot core.

The business goal is simple:

- the portal user should know when support has read the user's outgoing message,
  only when we have a reliable source for that state;
- support should know when the portal user has opened and read support messages;
- the UI must not call a message `delivered` or `read` unless the backend has a
  specific source of truth for that claim.

## Current Baseline

- Portal backend is the authority for browser auth, session, send, realtime and
  Chatwoot access.
- Chatwoot remains the system of record for conversations and messages.
- Chatwoot core is not modified in this slice.
- Portal DB already owns chat thread mapping in `portal_chat_threads`.
- Portal DB already owns unread state in `portal_chat_unread_messages`.
- Opening a successful latest thread snapshot clears unread for that thread.
- Frontend outgoing messages currently show a single check with label
  `Отправлено`, not `Доставлено`.
- `ChatwootMessage.status` is parsed from Chatwoot messages, and Chatwoot CE
  has message statuses `sent`, `delivered`, `read`, `failed`; portal currently
  normalizes portal-origin messages to `sent` to avoid dishonest delivery claims.

## Scope

This design covers message read state, not delete/edit message behavior.

In scope:

- portal-owned read state for portal users per tenant/thread;
- read state updates when a user opens a successful latest snapshot;
- exposing receipt state in `/api/chat/messages` snapshots and realtime events;
- UI labels/icons that distinguish `Отправлено` from `Прочитано`;
- agent-facing bridge decision that does not require Chatwoot core changes.

Out of scope:

- editing or deleting messages;
- marking messages read based on scroll depth or "read by eyes";
- offline read receipts while the backend did not confirm the snapshot;
- modifying Chatwoot Rails code;
- claiming delivery to a device.

## Core Semantics

### Portal User Read

Portal user read is recorded only when:

1. the user is authenticated;
2. the user requests the latest snapshot for a specific `threadId`;
3. backend successfully resolves the thread as visible and returns a `ready`
   latest snapshot;
4. the snapshot contains at least one client-visible message.

This matches the unread rule already accepted for the product:

> Opened chat + backend successfully returned latest snapshot for this
> `threadId` = read state for this thread can move forward.

No scroll tracking is required.

### Support Read

Support read for portal user's outgoing messages is harder because support uses
Chatwoot UI, not the portal UI.

The implementation must not invent support read state. It can use only one of
these sources:

1. Chatwoot message status `read` for portal-origin outgoing messages, if this
   is confirmed to be reliable for API-channel/customer messages in our
   Chatwoot version and webhook/API surface.
2. A no-core Chatwoot bridge, such as conversation custom attributes, to show
   portal user read state to agents.
3. A future Chatwoot core integration, explicitly out of this slice.

If source 1 is not reliable and source 2 cannot be displayed clearly to agents,
the portal must keep showing only `Отправлено` for outgoing messages.

## Persistence

Add a portal-owned table:

`portal_chat_read_states`

Suggested columns:

- `id`
- `tenant_id`
- `portal_user_id`
- `portal_chat_thread_id`
- `thread_id`
- `last_read_chatwoot_message_id`
- `last_read_at`
- `created_at`
- `updated_at`

Unique key:

- `(tenant_id, portal_user_id, thread_id)`

Indexes:

- `(tenant_id, portal_user_id, thread_id)`
- `(tenant_id, portal_chat_thread_id, last_read_chatwoot_message_id)`

This table stores current state only. It is intentionally not an event log.

## Snapshot Shape

Extend portal `ChatMessage` with optional receipt metadata:

- `readByCurrentUserAt?: string | null`
- `readBySupportAt?: string | null`

Rules:

- For incoming agent/group messages, `readByCurrentUserAt` can be present after
  the current user has opened the latest snapshot containing that message.
- For current user's outgoing messages, `readBySupportAt` can be present only
  if the backend has a reliable support-read source.
- Messages without reliable receipt state omit the field or return `null`.

## Frontend UX

Outgoing current-user message states:

- `queued`: clock, `В очереди`
- `sending`: clock/pulse, `Отправляется`
- `failed`: retry icon, `Не отправлено`
- `sent` without support read: one check, `Отправлено`
- support read confirmed: read indicator, `Прочитано`

Incoming messages do not need per-message read indicators for the portal user.
Opening the chat already clears unread state. The agent-facing bridge is where
support learns that the portal user has read.

## Agent-Facing Bridge

Because Chatwoot core is not changed now, agent-facing receipt visibility must
use a supported Chatwoot surface.

Preferred no-core bridge:

- update conversation custom attributes with latest portal read state:
  - `portal_last_read_thread_id`
  - `portal_last_read_message_id`
  - `portal_last_read_at`
  - `portal_last_read_by`

Constraints:

- update only when read state moves forward;
- rate-limit or debounce updates per thread to avoid noisy Chatwoot writes;
- never post public messages;
- avoid private-note spam unless the owner explicitly chooses that approach.

If conversation custom attributes are not visible enough for agents in our
Chatwoot UI, stop before implementation and choose between a small Chatwoot core
change or a deliberately throttled private-note bridge.

## Reliability And Security

- Backend must validate tenant, user and visible thread before recording read.
- Read state must move forward only; older snapshots must not regress it.
- Group chats track read state per portal user.
- Private chats track read state per portal user.
- A denied, `not_ready`, unavailable, cached-only or older-page request must not
  advance read state.
- Push/app badge state must not drive read receipts.
- Offline cache must not create read receipts.

## Recommended Order

Close the smaller reliability follow-ups first:

1. frontend attachment validation;
2. realtime health + snapshot fallback;
3. current send scenarios matrix.

Then implement read receipts. This reduces the chance that receipt state is
built on top of unclear send/receive behavior.

## Acceptance

- Opening a visible latest thread snapshot records read state for that exact
  tenant/user/thread.
- Read state does not change for hidden/offline/cache-only/denied/older-page
  requests.
- Group chat read state is per user, not global.
- Snapshot/realtime payloads expose only receipt states the backend can prove.
- Portal UI says `Прочитано` only when read is confirmed.
- Support has an agreed no-core way to see portal user read state, or the slice
  explicitly stops before claiming agent-facing receipt support.
