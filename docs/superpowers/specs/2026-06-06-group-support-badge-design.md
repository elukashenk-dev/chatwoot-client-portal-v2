# Group Support Badge Design

## Goal

Make support messages visually distinguishable from regular portal user
messages in group chats without making the transcript noisy.

Approved visual direction: **A. Badge only on the first support message in a
consecutive support block**.

Approved badge text: `Поддержка`.

## Context

Group chat messages currently use three author roles in the frontend message
contract:

- `current_user` - current portal user, outgoing bubble;
- `group_member` - another portal user in the group;
- `agent` - Chatwoot support/operator message.

After group member avatars were added, `agent` and `group_member` messages can
look too similar in group chats because both are incoming, left-aligned messages
with an avatar/name header.

The existing transcript already groups adjacent messages into visual blocks by
direction, author name and day. The author header and avatar are rendered only
for `single` or `first` block positions. This design should reuse that behavior.

## Product Scope

In group chats only:

- show a compact `Поддержка` badge next to the support author name;
- show the badge only when the support author header is visible;
- do not repeat the badge on subsequent messages from the same support author in
  the same visual block;
- if a portal user replies and the same support author writes again later, show
  the badge again on the first support message of the new block;
- keep regular `group_member` messages unchanged;
- keep private chat support messages unchanged.

## Non-Goals

- No backend contract change.
- No Chatwoot data lookup.
- No new author role.
- No support message recoloring.
- No full support block container or left rail.
- No change to message grouping rules in this slice.

## UI Behavior

For an incoming message where:

- active thread type is `group`;
- `message.authorRole === 'agent'`;
- the author header is currently visible for this message block;

render:

```text
Анна Support  [Поддержка]
```

The badge is a small inline pill in the existing author header. The bubble
surface, message spacing, avatar position and metadata remain unchanged.

For consecutive support messages:

```text
Анна Support  [Поддержка]
Проверила документы.

По акту все хорошо, но нужна счет-фактура.

После загрузки отмечу комплект как принятый.
```

Only the first message has the author header and badge. Later messages in the
same block stay compact, matching current transcript grouping.

## Architecture

This is a frontend-only slice.

`ChatPage` or the nearest chat state owner should pass the active thread type to
`ChatTranscript`, for example:

```ts
activeThreadType={messagesSnapshot.activeThread?.type ?? null}
```

`ChatTranscript` should derive a boolean for each message:

```ts
showSupportBadge =
  activeThreadType === 'group' &&
  message.authorRole === 'agent' &&
  shouldRenderAuthorName(blockPosition)
```

`MessageBubble` should receive a dedicated boolean prop such as
`showSupportBadge` and pass it into the author header component. The header
component should stay presentation-only; it should not know active thread state.

This keeps thread-level logic outside the bubble and avoids changing backend
message mapping.

## Data Flow

1. Backend continues returning `PortalChatMessage.authorRole`.
2. Frontend snapshot already contains `activeThread.type`.
3. Chat page passes the active thread type into `ChatTranscript`.
4. `ChatTranscript` combines active thread type, author role and block position.
5. `MessageBubble` renders the author header with or without the `Поддержка`
   badge.

## Accessibility

- The badge text is visible text, not icon-only.
- The badge does not need a separate interactive role.
- The existing author/avatar labels remain unchanged.

## Error Handling And Fallbacks

- If active thread is absent or type is unknown, do not show the badge.
- If message role is not `agent`, do not show the badge.
- If author header is hidden because the message is inside an existing visual
  block, do not show the badge.
- Offline/cached snapshots should behave the same way because they contain the
  same `activeThread.type` and message roles.

## Required Tests

Frontend component tests:

- group chat agent message renders `Поддержка` on the first visible support
  author header;
- consecutive group chat agent messages render the badge only once;
- group member messages do not render the badge;
- private chat agent messages do not render the badge;
- cached/offline group snapshots preserve the badge behavior if covered through
  existing `ChatPage.offline-cache` patterns.

Browser smoke:

- Add or extend a Playwright smoke with a stubbed group transcript that contains
  consecutive support messages and a group member reply.
- Assert the badge is visible for the first support message and not repeated for
  the compact follow-up messages.

## Branching

The implementation should happen on a separate feature branch from current
`main`, for example:

```text
feature/phase-group-support-badge
```
