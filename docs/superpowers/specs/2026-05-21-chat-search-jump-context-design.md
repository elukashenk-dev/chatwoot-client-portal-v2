# Chat Search Jump Context Design

## Goal

When a search result points to a message that is not loaded in the current
transcript, `Открыть место в чате` must open that place without loading the
entire history between the old message and the latest messages.

## UX

- Search page remains the entry point and keeps the current layout.
- Clicking `Открыть место в чате` closes search and returns the user to the same
  chat.
- The transcript switches into a temporary history fragment mode.
- The fragment shows the found message highlighted, plus nearby messages.
- The fragment has:
  - `Показать более ранние`;
  - `Показать более поздние`;
  - `К последним сообщениям`.
- `К последним сообщениям` restores the normal latest transcript.

## Backend Boundary

- Browser sends only `threadId`, `messageId`, optional direction, and optional
  cursor.
- Backend resolves tenant/session/thread exactly like existing chat endpoints.
- Backend verifies the target message belongs to the current Chatwoot
  conversation and is client-visible.
- Browser never receives Chatwoot authority.

## Data Model

No database migration is required. The feature is runtime-only and uses
Chatwoot as system of record for messages.

## API Shape

Add a read-only endpoint:

```text
GET /api/chat/threads/:threadId/messages/context
```

Query:

- `messageId`: required positive integer target message.
- `direction`: optional `initial`, `earlier`, or `later`; default `initial`.
- `cursor`: optional positive integer boundary message for `earlier` and
  `later`.

Response:

- `activeThread`
- `result`
- `reason`
- `targetMessageId`
- `messages`
- `hasMoreEarlier`
- `earlierCursor`
- `hasMoreLater`
- `laterCursor`

## Chatwoot Capabilities

Chatwoot `MessageFinder` supports:

- `before`: older messages before an id;
- `after`: later messages after an id;
- both `after` and `before`: range.

The portal client currently only wraps `before`; this feature adds a safe
`after` wrapper without changing Chatwoot core.

## Error Handling

- Unauthorized/session errors remain existing auth errors.
- Thread access errors return the normal not-ready thread response.
- Missing, deleted, internal, private, or non-client-visible target messages
  return `404 message_context_unavailable`.
- Chatwoot request/config failures return `unavailable` with
  `chatwoot_unavailable`.

## Tests

- Backend service tests cover initial context, earlier context, later context,
  target visibility, group author mapping, and Chatwoot unavailable handling.
- Route tests cover auth, validation, and service parameter passing.
- Frontend unit tests cover loaded-result jump, unloaded-result fragment jump,
  context expansion, and return to latest transcript.
- Playwright should cover the runtime flow when local services are available.
