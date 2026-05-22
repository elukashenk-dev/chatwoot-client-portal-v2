# F-NOTIFY-004 Focused Window PostMessage Ack

- `status`: `open`
- `found_in`: deep review of `docs/superpowers/specs/2026-05-23-chat-notifications-design.md`
- `risk`: `medium`
- `urgency`: fix before implementation plan
- `area`: frontend PWA runtime, service worker push handling

## Evidence

The spec says the service worker may suppress system notification when a focused
portal window exists and instead send `postMessage` to the page:

- `docs/superpowers/specs/2026-05-23-chat-notifications-design.md:397`
- `docs/superpowers/specs/2026-05-23-chat-notifications-design.md:399`

Current service worker runtime registers `/sw.js` and monitors update lifecycle,
but does not define a push-message listener in the page runtime:

- `frontend/src/pwa/serviceWorkerRuntime.ts:93`
- `frontend/src/pwa/serviceWorkerRuntime.ts:105`

The current service worker only handles install/activate/message/fetch and has
no push/page-message contract yet:

- `frontend/public/sw.js:25`
- `frontend/public/sw.js:31`

If the service worker suppresses system notification but the page does not
listen for or handle the message, the push event becomes invisible to the user.
This is especially risky on focused non-chat pages, login/session-expired states,
or a focused portal page that is not currently subscribed to the relevant chat
runtime.

## Fix Short

Specify an acknowledgement-safe contract:

- add a page-side `navigator.serviceWorker.addEventListener('message', ...)`
  runtime listener before suppressing notifications;
- only suppress system notifications when a focused controlled client is present
  and the message is delivered to a known listener path;
- otherwise show the generic system notification;
- tests should cover "focused client with listener" and "focused client without
  listener / no controlled client" behavior.

## Acceptance

- Spec describes page listener requirements.
- Service worker push handler has deterministic fallback to
  `showNotification()`.
- Tests prove push is not silently dropped when no page listener handles it.
