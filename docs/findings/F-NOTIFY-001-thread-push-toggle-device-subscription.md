# F-NOTIFY-001 Thread Push Toggle Device Subscription

- `status`: `open`
- `found_in`: deep review of `docs/superpowers/specs/2026-05-23-chat-notifications-design.md`
- `risk`: `high`
- `urgency`: fix before implementation plan
- `area`: chat notifications, push preferences, frontend/backend contract

## Evidence

The spec presents `Push-уведомления` as a per-thread setting:

- `docs/superpowers/specs/2026-05-23-chat-notifications-design.md:205`
- `docs/superpowers/specs/2026-05-23-chat-notifications-design.md:227`

But the same backend contract also defines:

- `POST /api/notifications/push/subscriptions`
- `DELETE /api/notifications/push/subscriptions`

and says delete removes the subscription for the current tenant/user endpoint:

- `docs/superpowers/specs/2026-05-23-chat-notifications-design.md:246`

A browser PushSubscription is effectively a device/browser subscription for the
origin, while `pushEnabled` is a per-thread delivery preference. If the UI switch
both toggles a thread preference and deletes the browser subscription, disabling
push for one group can accidentally disable push for all chats on that browser.
If it only toggles the thread preference but the UI copy implies unsubscribe,
users may believe push was disabled at device level when it was not.

## Fix Short

Split the model explicitly:

- per-thread `pushEnabled` controls whether that thread may send push;
- browser/device subscription lifecycle controls whether this browser can
  receive any push for the tenant/user;
- turning off a thread push toggle must not delete the browser subscription;
- provide a separate "Отключить push на этом устройстве" action only if we want
  device-level unsubscribe in the first slice.

## Acceptance

- Spec has separate terms for `thread push preference` and `device push subscription`.
- Thread `pushEnabled=false` cannot delete subscriptions used by other threads.
- Backend route responsibilities are unambiguous.
- Frontend copy does not imply device-level unsubscribe when changing only one
  thread.
