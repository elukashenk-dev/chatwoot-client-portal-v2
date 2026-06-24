# F-PWA-004. VPN-like offline cold launch can stall on PWA splash

- `status`: `open`
- `found_in`: production manual chat recovery testing with VPN enabled on device
- `risk`: `high`
- `urgency`: investigate before closing production installed PWA recovery smoke
- `area`: installed PWA cold launch, offline startup cache, VPN-like hanging network

## User Complaint

During `docs/operations/production-chat-recovery-manual-test-cases.md`
testing, the user observed a regression:

1. VPN is enabled on the phone.
2. The chat was previously opened online.
3. The test disables internet connectivity.
4. The installed PWA is closed and then opened again.
5. Instead of opening the warmed cached chat, the app hangs on the PWA splash
   screen.

This was observed in tests where the expected behavior is to survive an
offline close/reopen cycle and show cached chat state.

## Evidence

- `PCR-001` and `PCR-005` expect offline reload/reopen to avoid native/web
  splash stalls after cached chat warmup.
- `docs/operations/production-mcp-playwright-test-cycle.md` already defines
  `S-06. Cached Chat Boot With Hanging API/VPN-Like Network`, where startup APIs
  hang to simulate VPN connected with no real network path. Expected behavior:
  cached chat remains visible and no infinite startup/splash blocks the app.
- `frontend/src/features/tenant/lib/TenantProvider.tsx` and
  `frontend/src/features/auth/lib/AuthSessionProvider.tsx` both have boot
  deadlines/timeouts intended to open cached tenant/auth data when online
  startup requests hang.
- `frontend/public/sw.js` serves cached navigation shell immediately when it is
  present, so a persistent native-like splash suggests either the shell/assets
  are not being served to the launched PWA context, React startup is blocked
  before cached state opens, or the observed state is a platform cold-launch
  case not covered by current automation.

## Suspected Failure Mode

VPN can produce a "pseudo-online" state: the device/browser still appears
connected, but requests to same-origin backend do not resolve. The current code
has timeout guards for this, but the real installed PWA cold-launch path may be
missing coverage for one of these layers:

- service worker control/cache availability during Home Screen launch;
- cached app shell/static asset delivery while VPN is enabled;
- tenant/auth startup timeout fallback;
- startup localStorage/IndexedDB read fallback;
- native splash dismissal when the web root does not paint quickly enough.

## Fix Short

Do not change behavior until the failing layer is isolated. First reproduce with
diagnostics: service worker status, app shell/static asset source, pending
startup API requests, console errors and cached tenant/auth/chat availability.
Then add a focused regression test or documented manual diagnostic if the native
Home Screen launch path cannot be fully automated.

## Acceptance

- With VPN enabled and internet path disabled, a warmed installed PWA does not
  remain on native/web splash indefinitely.
- Cached tenant/auth/chat opens to the saved chat or a controlled
  online-required state within the existing boot deadline.
- If startup APIs hang instead of failing, the app still leaves splash and
  reads cached state.
- Manual production test notes include whether the issue reproduces only with
  VPN, only on installed PWA Home Screen launch, or also in normal Android
  Chrome tab reload.
- Automated coverage is added for the closest reproducible layer:
  - hanging startup APIs with cache available;
  - cached app shell/static assets served while network hangs;
  - or service-worker controlled cold launch from `/`.
