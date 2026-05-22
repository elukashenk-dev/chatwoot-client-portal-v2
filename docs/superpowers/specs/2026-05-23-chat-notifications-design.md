# Chat Notifications

## Decision

Implement `Уведомления` as a chat-adjacent full-screen page using the approved
visual option `C. Menu + Page`.

The chat action menu opens a dedicated `Уведомления` page and shows a compact
status line under the menu item, for example:

```text
Уведомления
Push включены · звук включен
```

The first user-facing page includes three controls for the selected chat:

- `Новые сообщения`;
- `Звук`;
- `Push-уведомления`.

Email notifications, digests, campaigns and other mailings are explicitly out
of scope.

## Scope

This slice covers notification preferences for the currently selected chat
thread:

- `private:me`;
- `group:<contactId>` when the current portal user still has access to that
  group thread.

Preferences are scoped by:

```text
tenant + portal user + threadId
```

The same portal user may have different settings for the private chat and each
group chat. The same email in another tenant must have independent preferences.

This spec intentionally reopens the previously deferred minimum Push
Notifications scope by explicit product decision on `2026-05-23`. The first push
implementation stays intentionally conservative: safe generic payload,
tenant/user/thread-scoped preferences, and no email/offline notification
delivery.

## User Model

`Новые сообщения` is the master switch for this chat.

- When enabled, the portal may show in-app notification state for this chat and
  may use enabled delivery channels such as sound and push.
- When disabled, sound and push are effectively muted for this chat. The
  transcript still updates normally and the user can still send messages.

`Звук` controls a short in-portal sound when a new client-visible message arrives
and the portal is open in the browser. Sound is not played for messages sent by
the current user. If browser autoplay rules block playback, the portal fails
quietly and keeps the preference unchanged.

`Push-уведомления` controls system notifications through browser/PWA Web Push.
Push must use a safe payload in the first slice: no message text, no author name,
no file name and no Chatwoot IDs in the push payload.

## UI

The menu item label is `Уведомления`.

The menu item status line is derived from the current settings and browser push
state:

- `Push включены · звук включен`;
- `Push выключены · звук включен`;
- `Без звука`;
- `Уведомления отключены`;
- `Проверяем настройки` while loading;
- `Недоступно` when settings cannot be loaded.

The full-screen page uses the existing `ChatFullScreenPanel` portal layout and
the same width constraints as `Информация о чате`, `Медиа и файлы` and
`Поиск по чату`.

Page layout:

- top bar with back button and title `Уведомления`;
- current thread header: title and `Личный чат` / `Групповой чат`;
- settings card with three switches;
- browser permission block for push;
- compact unavailable/retry state when backend settings cannot be loaded.

Push permission states:

- `unsupported`: show that this browser does not support push notifications;
- `default`: enabling push starts the browser permission request;
- `granted`: enabling push creates or refreshes the subscription;
- `denied`: show a short instruction to allow notifications in browser settings.

The page must not ask for push permission on page load. Permission request is
triggered only by the user enabling `Push-уведомления`.

## Backend Contract

Add portal-owned notification preference endpoints. All endpoints are
same-origin `/api`, authenticated and tenant-scoped by request host/session.

```text
GET /api/chat/threads/:threadId/notification-settings
PATCH /api/chat/threads/:threadId/notification-settings
GET /api/notifications/push/public-key
POST /api/notifications/push/subscriptions
DELETE /api/notifications/push/subscriptions
```

The thread settings response:

```ts
type ChatNotificationSettingsResponse = {
  result: 'ready' | 'not_ready' | 'unavailable'
  reason:
    | 'none'
    | 'thread_not_found'
    | 'access_denied'
    | 'push_not_configured'
    | 'settings_unavailable'
  settings: ChatNotificationSettings | null
}

type ChatNotificationSettings = {
  newMessagesEnabled: boolean
  soundEnabled: boolean
  pushEnabled: boolean
}
```

`PATCH` accepts a partial settings object and returns the full normalized
settings. If `newMessagesEnabled` is set to `false`, the backend must preserve
the stored `soundEnabled` and `pushEnabled` values but delivery logic treats
both as muted while the master switch is off. This lets the user restore the
previous sub-settings by re-enabling `Новые сообщения`.

The push public key endpoint returns the tenant-safe public VAPID key when Web
Push is configured. Private VAPID key never leaves the backend.

The push subscription endpoint stores or refreshes the current browser
subscription. The delete endpoint removes the subscription by endpoint for the
current tenant and portal user.

## Persistence

Add portal-owned tables:

```text
portal_chat_notification_preferences
portal_push_subscriptions
```

`portal_chat_notification_preferences`:

- `tenant_id`;
- `portal_user_id`;
- `thread_id`;
- `new_messages_enabled`;
- `sound_enabled`;
- `push_enabled`;
- timestamps.

Unique key:

```text
tenant_id + portal_user_id + thread_id
```

`portal_push_subscriptions`:

- `tenant_id`;
- `portal_user_id`;
- `endpoint`;
- `p256dh`;
- `auth`;
- `user_agent`;
- `status`;
- timestamps and optional last error metadata.

The endpoint must be unique enough to prevent duplicate sends for one browser
subscription. Expired or rejected subscriptions are disabled or removed during
send attempts.

## Delivery Rules

In-app transcript updates are not blocked by notification settings.

Sound delivery happens in the frontend when a new message enters the active
runtime stream and all of these are true:

1. the message is client-visible;
2. the message belongs to the selected thread;
3. the message was not sent by the current portal user;
4. `newMessagesEnabled` is true;
5. `soundEnabled` is true.

Push delivery happens from the backend after Chatwoot webhook processing, using
only portal authority:

1. resolve tenant from webhook host/signature;
2. validate Chatwoot account/inbox invariants;
3. map the message through the same client-visible message rules as transcript;
4. resolve the portal thread;
5. find portal users in the current tenant who still have access to the thread;
6. skip the portal user who authored the message when that can be determined;
7. send push only to users with `newMessagesEnabled` and `pushEnabled`;
8. send only to active push subscriptions for that tenant/user.

The first push payload is intentionally minimal:

```json
{
  "type": "chat_message",
  "tenantSlug": "provgroup",
  "url": "/"
}
```

The service worker displays generic copy such as:

```text
Новое сообщение
Откройте портал, чтобы посмотреть чат
```

No message text, author name, file name, Chatwoot conversation ID or Chatwoot
message ID is included in the push payload. The first slice also avoids putting
`threadId` into the push payload because group thread ids currently include a
Chatwoot group contact id.

## Service Worker

The existing service worker remains the PWA runtime entry point. Extend it with:

- `push` event handler;
- `notificationclick` handler;
- safe navigation back to the portal origin.

The service worker must not cache tenant dynamic metadata or API responses for
notifications. Existing `no-store` and tenant metadata cache rules remain.

If the app is open and focused, the backend may still send push in the first
slice; duplicate suppression between foreground sound and system push can be a
follow-up if it becomes noisy. Backend duplicate suppression by tenant/message
scope should still prevent repeated pushes from repeated webhook delivery.

## Multi-Tenant And Security Requirements

- Browser never receives Chatwoot tokens.
- Browser never calls Chatwoot for notification settings or push.
- Preferences and subscriptions are tenant-scoped.
- Push sends are tenant-scoped and user-scoped.
- Group thread access is rechecked before sending push.
- Unknown or deleted thread mappings fail closed.
- Push payload contains no sensitive content in the first slice.
- VAPID private key stays backend-only.
- A subscription registered on tenant A cannot receive tenant B notifications.

## Non-Goals

- no email notifications;
- no mailing lists, campaigns, digests or scheduled summaries;
- no tenant-admin notification policy screen;
- no global user notification center across all chats;
- no message text or author name in push payload;
- no browser-direct Chatwoot integration;
- no Chatwoot core changes;
- no marketing or CRM notifications.

## Testing

Backend:

- preference repository/service tests for tenant/user/thread uniqueness;
- route tests for auth, tenant scope, thread access and partial updates;
- push subscription route tests;
- push delivery service tests for safe payload, access filtering, duplicate
  suppression and expired subscription cleanup;
- webhook integration tests around push delivery trigger without weakening
  existing webhook tenant checks.

Frontend:

- notification settings API client tests;
- page tests for loading, unavailable state, switches and push permission
  states;
- sound runtime tests for "not current user's message" and muted state;
- service worker unit-style tests where practical, or isolated browser tests if
  unit harness cannot execute service worker push events.

E2E/runtime:

- Playwright coverage for opening `Уведомления` from the chat menu and toggling
  settings;
- documented browser limitation for real system push prompt if the local runner
  cannot reliably automate it.

## Follow-Ups

- richer push payload after explicit privacy decision;
- foreground/background duplicate suppression;
- global notification center;
- per-tenant admin defaults;
- email/offline notifications, if explicitly reopened later.
