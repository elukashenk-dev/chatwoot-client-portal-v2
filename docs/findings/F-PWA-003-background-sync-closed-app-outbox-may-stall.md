# F-PWA-003. Background Sync closed-app outbox may stall

- `status`: `deferred`
- `found_in`: user-reported Android installed PWA regression during chat recovery audit
- `risk`: `high`
- `urgency`: investigate before the next PWA/offline recovery release or production PWA smoke closure
- `area`: installed PWA, service worker Background Sync, durable text outbox

## User Complaint

Пользователь сообщил, что раньше был реализован и вручную подтвержден сценарий:

1. В installed PWA на Android пропадает сеть.
2. Пользователь пишет сообщение в чат.
3. Сообщение сохраняется в локальную очередь.
4. Пользователь закрывает приложение или гасит телефон.
5. Когда сеть появляется, сообщение отправляется в фоне без повторного открытия
   приложения.

Текущее наблюдение: этот сценарий больше не работает. Есть подозрение, что
часть прошлой работы могла не попасть в `main` или была сломана последующими
изменениями.

## Evidence

- Background Sync feature itself is present in `main`: service worker listens
  to sync tag `portal-text-outbox-drain` in `frontend/public/sw.js`.
- `saveOfflineTextOutboxRecord()` still registers background sync through
  `registerOfflineTextOutboxBackgroundSync()` after writing a queued text
  outbox record.
- Current service-worker drain path only processes records that are due at the
  moment of the sync event:
  - queued records require empty/past `nextAttemptAt`;
  - sending records require expired `sendingLeaseExpiresAt`.
- Foreground outbox drain has scheduled retry logic while the app is open, but
  the service-worker background path does not appear to schedule another
  background attempt when no record is due yet.
- Current real-network e2e coverage triggers
  `drainTextOutboxInBackgroundSync()` manually from the service-worker context.
  It proves the worker drain path, but it does not prove the full platform
  behavior where Android/Chromium fires Background Sync after the app was
  closed.

## Suspected Failure Mode

If the app writes a message to the outbox and then the foreground drain marks it
as `sending` or assigns a future retry time before the app is closed, the
platform Background Sync event can fire while the record is not yet due. In
that case the service worker may do no send and exit. Because the foreground
timer is gone and the service worker does not register/schedule a later
attempt, the message can remain queued until the user opens the app again.

## Fix Short

Do a focused investigation with a failing regression test for the closed-app
timing case. If confirmed, make the service-worker background outbox path
durably recover future-due `queued`/`sending` records, for example by
re-registering Background Sync or normalizing retryable records so the next
platform opportunity does not get lost.

## Acceptance

- Add or update automated coverage for the scenario where a text outbox record
  is not due when the first background drain runs, then becomes due while the
  app remains closed.
- Verify Android/Chromium installed PWA behavior manually:
  - queue a text message while offline or during broken connectivity;
  - close the installed PWA / lock the phone;
  - restore network;
  - confirm the message reaches Chatwoot without reopening the PWA when the
    platform Background Sync fires.
- Verify fallback behavior remains correct on platforms without reliable
  Background Sync: the queued message is still sent exactly once on next
  app open/online/visibility recovery.
- No duplicate sends for the same `clientMessageKey`.
- No change to attachment/voice offline behavior; text outbox remains the only
  background-send scope.
