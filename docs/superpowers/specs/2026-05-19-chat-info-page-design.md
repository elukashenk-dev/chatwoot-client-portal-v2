# Chat Info Page

## Decision

Implement a dedicated full-screen `Информация о чате` page for the currently
selected chat thread.

This slice covers only chat information. The other chat menu items
`Поиск по чату`, `Медиа и файлы`, and notifications remain future slices and
must not be duplicated inside the chat info page.

## Scope

The page opens from the existing chat action menu item `Информация о чате` and
returns to the current chat without changing the selected thread.

The page is read-only. It does not create Chatwoot conversations, send messages,
change notification settings, or expose Chatwoot IDs as browser authority.

Fields:

- `Тип чата`: `Личный` or `Групповой`;
- `Поддержка`: tenant/support label, initially `Команда {tenant.displayName}`;
- `Ваш куратор`: value of Chatwoot custom attribute `curator_name` for the
  target Chatwoot contact, hidden when blank;
- `Начат`: Chatwoot conversation `created_at`; if no conversation exists yet,
  show `Еще нет сообщений`;
- `Последняя активность`: Chatwoot conversation `last_activity_at`, hidden when
  absent;
- `Доступ`: for private chats `Только вы и поддержка`, for group chats
  `Участники группы и поддержка`;
- `Участники портала`: group chats only, using the safe participant resolution
  rule below.

## Non-Goals

- no chat search implementation;
- no media/files gallery;
- no notification preferences;
- no end-dialog behavior changes;
- no Chatwoot direct access from the browser;
- no tenant-admin branding changes.

## Data Contract

Add a portal-owned endpoint:

```text
GET /api/chat/threads/:threadId/info
```

Alternative route shape such as `GET /api/chat/thread-info?threadId=...` is
acceptable if it matches local route conventions better. The contract remains
thread-id based; browser never sends or receives Chatwoot conversation authority.

Response shape:

```ts
type ChatThreadInfoResponse = {
  accessLabel: string
  activeThread: ChatThreadSummary
  curatorName: string | null
  lastActivityAt: string | null
  participants: ChatThreadInfoParticipant[]
  result: 'ready' | 'not_ready' | 'unavailable'
  startedAt: string | null
  supportLabel: string
  threadTypeLabel: 'Личный' | 'Групповой'
}

type ChatThreadInfoParticipant = {
  displayName: string
  id: string
  isCurrentUser: boolean
}
```

`id` is a portal-local stable identifier, not a Chatwoot contact ID.

## Backend Rules

The endpoint must reuse the existing tenant/session/thread authority boundary:

- resolve current tenant from host;
- resolve authenticated portal user from session;
- validate `threadId` through the existing chat thread runtime;
- for group chats, verify current access via the linked person contact and
  `portal_client_group_contact_ids`;
- return controlled `not_ready` or `unavailable` states instead of leaking
  Chatwoot errors.

`curator_name` comes from the target Chatwoot contact custom attributes:

- private chat: current user's linked person contact;
- group chat: target group contact.

If `curator_name` is missing, empty, or not a string, return `null`.

`startedAt` and `lastActivityAt` come from the mapped Chatwoot conversation
metadata. If the portal thread exists but no Chatwoot conversation has been
created yet, return both as `null`; the UI renders `Еще нет сообщений` for
`Начат`.

## Participant Safety

Backend can safely return group participants if it returns only registered
portal users who currently have access to the group thread.

Safe algorithm:

1. Validate the current user's access to `group:<id>`.
2. List portal users and contact links in the current tenant only.
3. For each linked Chatwoot person contact, fetch the contact from Chatwoot.
4. Include the user only when all checks pass:
   - portal user is active;
   - contact has `portal_enabled = true`;
   - contact has `portal_contact_type = person`;
   - parsed `portal_client_group_contact_ids` contains the exact group contact
     ID.
5. Never return unregistered Chatwoot contacts as portal participants.

This means `Участники портала` is a portal-user list, not a complete Chatwoot
contact directory. If participant resolution is unavailable, omit the list and
keep the `Доступ` field.

## UI

Use a full-screen in-app page/panel inside the existing protected chat shell.

Layout:

- safe-area aware top bar;
- back button;
- title `Информация о чате`;
- centered chat identity block with tenant monogram/logo fallback and current
  thread title/subtitle;
- `Details` section with compact key-value rows;
- optional `Участники портала` section for group chats;
- quiet helper text explaining that access is limited to chat participants and
  the support team.

The page must fit mobile widths down to 320px:

- long tenant names, curator names, and group names truncate predictably;
- rows can wrap only when necessary;
- touch targets remain at least 44px;
- no horizontal overflow.

## Error And Empty States

- Loading: compact app loading state inside the page.
- Unauthorized: use existing session refresh behavior; if still unauthorized,
  route through existing auth/session handling.
- Invalid or inaccessible thread: show controlled not-ready state and a back
  action.
- Chatwoot unavailable: show retry and back actions.
- No conversation yet: show `Начат: Еще нет сообщений`; do not create a
  conversation just to populate this page.
- Empty `curator_name`: hide the row.
- No safe participant list: hide the participants section.

## Tests

Backend:

- endpoint rejects malformed or forged thread IDs;
- private info returns current thread details without creating a conversation;
- group info rejects revoked group access;
- `curator_name` maps from person contact for private chat and group contact for
  group chat;
- empty or non-string `curator_name` is hidden;
- group participants include only active tenant portal users whose current
  Chatwoot person contact still lists the group;
- cross-tenant contact links are not returned.

Frontend:

- menu item opens the full-screen info page;
- back returns to the same selected thread and transcript;
- private fields render correctly;
- group participants render only for group chats;
- curator row is hidden when absent;
- unavailable state has retry/back behavior.

Browser/runtime:

- Playwright coverage for opening info from private and group chat, returning
  back, and verifying no direct Chatwoot request appears in browser network.

Required checks:

- backend targeted tests;
- frontend targeted tests;
- frontend typecheck/build;
- root lint/code-health;
- `git diff --check`.
