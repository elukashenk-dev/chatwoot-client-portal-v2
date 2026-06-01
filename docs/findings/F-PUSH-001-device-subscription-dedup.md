# F-PUSH-001 Device Push Subscription Dedup

- `status`: `open`
- `found_in`: production push notification sound investigation, 2026-06-01
- `risk`: `medium`
- `urgency`: fix before relying on production push for real users
- `area`: PWA push subscriptions, chat notifications
- `evidence`:
  - `backend/src/modules/chat-notifications/repository.ts` stores push
    subscriptions by `(tenant_id, portal_user_id, endpoint)` only.
  - Production delivery logs showed multiple active subscriptions for the same
    portal user. Recent private chat messages produced two `sent` deliveries for
    one recipient, and one test group recipient had four active iPhone-class
    subscriptions.
  - `frontend/src/features/chat/api/chatClient.ts` sends only the browser push
    endpoint and keys, without a stable portal device/install identifier.
- `fix_short`: add a stable frontend-generated device/install id to push
  subscription registration, store it on `portal_push_subscriptions`, and keep
  only one active subscription per `(tenant_id, portal_user_id, device_id)`.
- `acceptance`:
  - Re-subscribing push on the same installed PWA/browser disables the previous
    active subscription for that device.
  - Different real devices for the same portal user can remain active.
  - One chat message creates at most one active push delivery per device.
