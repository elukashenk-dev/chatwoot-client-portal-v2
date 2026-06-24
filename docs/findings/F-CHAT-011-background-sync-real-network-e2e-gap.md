---
status: open
found_in: PWA recovery best-practice audit
risk: low
urgency: add before claiming background-sync recovery is production-hardened
area: frontend PWA tests, service worker background text outbox sync
---

# F-CHAT-011 Background Sync Lacks Real Network E2E Coverage

## Evidence

- `tests/e2e/offline-first-pwa.spec.ts` keeps the real service worker active,
  but portal API failures are driven from the page by overriding `window.fetch`
  and by `context.setOffline(true)`.
- `tests/e2e/offline-first-pwa.spec.ts` covers saved-chat launch, offline text
  queueing, foreground reconnect drain, multi-tab duplicate prevention and
  stale sending lease recovery.
- `frontend/src/pwa/serviceWorkerBackgroundSync.test.ts` unit-tests service
  worker background text outbox sync by loading the worker into a mocked
  environment and injecting a mocked `fetch`.
- There is no browser e2e scenario where a queued text record is handled by the
  real service worker while the backend/server is actually unavailable and then
  becomes available again.
- Chrome's Background Sync guidance specifically warns that DevTools/page-level
  offline simulation does not necessarily affect service worker requests; the
  recommended test shape is to turn off the network or the server.

## Risk

Foreground outbox drain remains the primary recovery path, and current e2e
coverage protects that path. The risk is narrower: the progressive Background
Sync path can still diverge from browser reality because its current tests run
inside a mocked service worker harness rather than a real controlled page with a
real service worker fetch path.

If a future change breaks service-worker-only retry behavior, the regression
could pass the current e2e suite and only appear when the app is closed or has
no visible client.

## fix_short

Add a focused browser e2e smoke for service-worker background outbox sync using
a real controlled page and a backend/server-down condition, not only page fetch
mocking. Keep it narrow because foreground drain remains the authoritative
mobile-friendly path.

## acceptance

- E2E seeds a text outbox record, closes or hides visible portal clients, makes
  the portal API genuinely unavailable for service worker fetch, and triggers or
  simulates the `portal-text-outbox-drain` sync path.
- The record remains retryable while the backend is unavailable.
- After backend availability returns, the same record is sent once and removed
  from IndexedDB.
- Existing `offline-first-pwa.spec.ts` foreground recovery scenarios still pass.
