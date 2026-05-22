# F-NOTIFY-005 VAPID Scope Rotation

- `status`: `open`
- `found_in`: deep review of `docs/superpowers/specs/2026-05-23-chat-notifications-design.md`
- `risk`: `medium`
- `urgency`: fix before implementation plan
- `area`: push notifications, production configuration, subscription lifecycle

## Evidence

The spec defines:

- `GET /api/notifications/push/public-key`;
- production VAPID public/private configuration;
- browser subscriptions through `applicationServerKey`.

See:

- `docs/superpowers/specs/2026-05-23-chat-notifications-design.md:208`
- `docs/superpowers/specs/2026-05-23-chat-notifications-design.md:239`
- `docs/superpowers/specs/2026-05-23-chat-notifications-design.md:433`

The spec does not decide whether VAPID keys are global per deployment,
tenant-specific, or rotatable per tenant. Browser push subscriptions are tied to
the public application server key used at subscription time. If this is left
implicit, key rotation or switching between global/tenant keys can strand
existing subscriptions or make frontend subscription refresh logic ambiguous.

## Fix Short

Decide and document VAPID scope:

- recommended first slice: one VAPID key pair per portal deployment/environment,
  not per tenant;
- expose the same public key through tenant-scoped authenticated endpoint;
- store a `vapid_key_id` or public key fingerprint on each subscription if
  rotation is expected;
- when the public key changes, frontend must resubscribe and backend must retire
  old-key subscriptions after a grace period.

## Acceptance

- Spec states VAPID key scope.
- Subscription schema includes enough metadata for future rotation or explicitly
  defers rotation with a documented operational rule.
- Frontend refresh logic knows when an existing subscription is stale.
