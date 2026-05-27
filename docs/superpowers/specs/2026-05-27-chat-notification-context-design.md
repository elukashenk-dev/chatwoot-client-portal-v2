# Chat Notification Context

## Decision

Extend the current `Уведомления` slice with two small user-facing improvements:

1. Safe push context: browser/PWA push notifications show the chat title, but do
   not show message text.
2. Local unread indicator: when a new message arrives in another chat while the
   portal is open, the chat switcher menu shows a small red dot next to that
   chat title.
3. Minimal PWA app icon badge signal: when the service worker shows a system
   chat push notification, it sets a device-local app icon badge without a
   count where the platform supports the Badging API; opening the chat page
   clears it.

The approved visual placement is option `B`: the dot appears immediately after
the chat title and is raised slightly above the text baseline.

Backend unread-state is explicitly out of scope for this slice. It remains a
follow-up for persistent unread counters, cross-device sync, counted PWA
app-icon badges, and unread state after a full browser/PWA restart.

## Scope

This slice includes:

- tenant-scoped push payload metadata for `threadTitle` and `threadType`;
- safe system notification copy with no message body, author name, attachment
  name, Chatwoot IDs, or internal portal IDs in user-visible notification text;
- service worker forwarding of other-thread push payloads to open portal
  clients so the UI can mark the thread locally;
- local frontend unread state keyed by `threadId`;
- unread dot rendering in `ChatHeader` chat switcher menu;
- clearing the dot when the user opens that thread;
- empty/countless PWA app icon badge signal on system push notifications, with
  safe no-op behavior on unsupported platforms;
- clearing the app icon badge when the chat page opens;
- targeted backend, service worker, and frontend tests.

This slice does not add:

- persistent unread counters in the portal database;
- server-side read receipts;
- unread sync across devices;
- durable or counted PWA app-icon badge counts;
- notification center;
- email notifications;
- message text in push notifications;
- Chatwoot core changes;
- browser-direct Chatwoot API calls.

## Product Behavior

Push notification user-visible copy:

```text
ООО Уточки
Новое сообщение в групповом чате
```

For the private thread:

```text
Личный чат
Новое сообщение в личном чате
```

If the backend cannot resolve a safe title, the notification falls back to:

```text
Новое сообщение
Откройте портал, чтобы посмотреть чат.
```

The fallback must not reveal raw `threadId`, Chatwoot contact ID, conversation
ID, message ID, author, text, file name, or attachment URL.

Unread dot behavior:

- if the user is currently in `private:me` and a group message arrives, the
  group gets a red dot in the chat switcher menu;
- if the user is currently in group `A` and a private message arrives, the
  private chat gets a red dot;
- if the user opens the marked chat, its dot disappears;
- if the user is already viewing the target chat, no dot appears and current
  push suppression behavior stays in force;
- dots are local UI state for the currently open browser/PWA runtime.

The dot is an indicator, not a count. Multiple messages in the same other chat
still show one dot.

## Backend Contract

Push delivery continues to be initiated only by the portal backend from
tenant-validated Chatwoot `message_created` webhooks.

The browser-visible push payload may include:

```ts
type PortalChatPushPayload = {
  chatwootMessageId: number
  notificationTag: string
  tenantSlug: string
  threadId: string
  threadTitle: string | null
  threadType: 'private' | 'group' | null
  type: 'chat_message'
  url: string
}
```

`threadTitle` must be safe, short user-facing chat metadata:

- private thread: `Личный чат`;
- group thread: the safe Chatwoot contact display name used by
  `GET /api/chat/threads`;
- group thread with an empty/missing display name: `null`, not the
  `Группа <contactId>` UI fallback;
- unknown or unsafe value: `null`.

`threadType` must be derived from the portal thread model:

- `private` for `private:me`;
- `group` for `group:<contactId>`;
- `null` if the backend cannot classify safely.

The backend must not add message text, sender display name, attachment metadata,
or Chatwoot URLs to the push payload.

## Service Worker Behavior

The service worker keeps the current same-thread suppression rule:

- if a visible portal client is on the target thread and acknowledges the push,
  do not show a system notification;
- if no visible client acknowledges the same target thread, show the system
  notification.

For this slice the service worker also forwards valid `chat_message` payloads to
open same-origin portal clients even when the active thread is different. The
page handler uses that payload to mark the other thread locally and returns
`false`, so the service worker can still show the OS/browser notification.

Notification rendering:

- `title = payload.threadTitle || 'Новое сообщение'`;
- group body: `Новое сообщение в групповом чате`;
- private body: `Новое сообщение в личном чате`;
- unknown body: `Откройте портал, чтобы посмотреть чат.`;
- notification data keeps only the safe routing metadata already used by the
  runtime.

Malformed payloads fall back to the existing generic notification behavior.

## Frontend State And UI

`ChatPage` owns a local `unreadThreadIds` set.

The push message handler behaves as follows:

1. Ignore payloads without `threadId`.
2. If `payload.threadId === selectedThreadId`, refresh the current snapshot and
   return `true` so the service worker suppresses the visible-client push.
3. If `payload.threadId !== selectedThreadId`, add that thread id to
   `unreadThreadIds` and return `false` so the system notification can still be
   shown.

When the selected thread changes, the newly selected thread id is removed from
`unreadThreadIds`.

`ChatHeader` receives unread thread ids and renders the dot in the chat switcher
menu:

```text
ООО Уточки •
```

The actual UI uses a small red circular marker, not a text bullet. It is placed
directly after the truncated chat title and raised slightly above the baseline.
The marker must not push the menu item width beyond the existing portal
`max-w-[500px]` shell.

Accessibility:

- the visual dot is `aria-hidden`;
- the menu item accessible label includes a short hidden suffix such as
  `есть новое сообщение` for unread chats.

## Multi-Tenant And Security Requirements

- Push payload metadata is derived after tenant/session/thread authority checks.
- `threadTitle` for group chats must come from the same backend-safe source used
  by the current chat thread list.
- The frontend must never infer Chatwoot authority from push payload metadata.
- The local unread state is keyed only by portal `threadId` inside the current
  loaded tenant/user session.
- No direct Chatwoot authority is exposed to the browser.

## Testing

Backend targeted tests:

- push payload includes `threadTitle` and `threadType` for private and group
  thread recipients;
- push payload does not include message content, author, attachment metadata, or
  Chatwoot URLs;
- unsafe or unresolved thread metadata falls back to safe `null` values.

Service worker tests:

- same-thread visible client acknowledgment still suppresses the system push;
- other-thread payload is forwarded to the page and still shows the system push;
- notification title/body use safe thread title/type copy;
- malformed payload uses generic fallback copy.

Frontend targeted tests:

- other-thread push payload marks the corresponding chat menu item with a dot;
- opening that chat clears the dot;
- same-thread push still refreshes the snapshot and does not create a dot;
- the dot is rendered next to the title, not at the far right.

Manual/browser smoke:

- open private chat, send a group message from Chatwoot/agent, verify push title
  and the group dot;
- open the group, verify the dot clears;
- repeat group-to-private;
- verify no message text appears in push notifications.

## Follow-Up

Backend unread-state remains a separate product slice. It should be designed
when we want durable unread counters, cross-device sync, notification center
integration, and counted PWA app-icon badges.
