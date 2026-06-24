# MCP Playwright Scenarios

## Production / Staging Scenarios

Целевой ручной production smoke для chat reconnect/offline recovery находится в
[`production-chat-recovery-manual-test-cases.md`](production-chat-recovery-manual-test-cases.md).

### S-01. Public Tenant Identity And App Shell

Type: Read-only
Risk: Low
Can be automated: Yes

Preconditions:

- `TENANT_URL` доступен.
- Browser context может быть anonymous.

MCP steps:

1. Resize to `VIEWPORT_MOBILE`.
2. Navigate to `${TENANT_URL}`.
3. Snapshot page after load.
4. Navigate to `${TENANT_URL}/api/tenant` if direct API navigation is allowed,
   or inspect app network response.
5. Navigate to `${TENANT_URL}/api/tenant/manifest.webmanifest`.

Expected:

- Unknown/blank tenant не показывается.
- Tenant display name соответствует `TENANT_DISPLAY_NAME`.
- Manifest `name`, `short_name`, `id`, `scope`, `start_url` соответствуют
  tenant origin.
- Browser не получает Chatwoot tokens or Chatwoot direct URLs as authority.

Evidence:

- Snapshot of public screen or login screen.
- Manifest JSON excerpt without secrets.
- Console warnings/errors.

FAIL:

- Wrong tenant identity.
- Controlled tenant failure на known host.
- Manifest points to wrong origin.
- UI blank after load.

Cleanup:

- None.

### S-02. Login And Protected Route Entry

Type: Mutating session
Risk: Medium
Can be automated: Yes

Preconditions:

- Test portal user exists.
- User password is available prompt-only.
- Browser context can store cookies/localStorage/IndexedDB.

MCP steps:

1. Navigate to `${TENANT_URL}/login`.
2. Fill `PORTAL_USER_EMAIL`.
3. Fill password manually/prompt-only.
4. Submit.
5. Wait for protected route.
6. Snapshot app shell.

Expected:

- Login succeeds without full page crash.
- URL reaches `/app/chat` or expected protected app route.
- Header shows current chat/app shell.
- No old web startup screens after auth completes.

Evidence:

- Snapshot after protected route.
- Console messages.

FAIL:

- Login loop.
- Wrong tenant/user.
- Blank page or unhandled error.
- Old startup surfaces appear after auth.

Cleanup:

- Keep session for later scenarios unless S-03 is next.

### S-03. Auth Guard, Logout And Re-Entry

Type: Mutating session
Risk: Medium
Can be automated: Yes

Preconditions:

- User is authenticated from S-02.

MCP steps:

1. Open chat menu/profile menu if logout is available in current UI.
2. Sign out.
3. Navigate to `${TENANT_URL}/app/chat`.
4. Snapshot resulting page.
5. Login again if subsequent scenarios need authenticated state.

Expected:

- Session is cleared.
- Protected route redirects to login/auth screen.
- Local-device data removal controls behave as designed when used.
- Re-login returns to chat normally.

Evidence:

- URL after logout.
- Snapshot of login/auth guard.
- Console messages.

FAIL:

- Protected chat remains visible after logout.
- Cross-user cached chat appears.
- Re-login fails due stale startup cache.

Cleanup:

- Login again for next scenarios.

### S-04. Fast Startup First Meaningful Chat Paint

Type: Read-only visual/runtime
Risk: High
Can be automated: Later

Preconditions:

- User is authenticated.
- Chat was opened online at least once, so startup mirror and IndexedDB cache
  exist.

MCP steps:

1. Close/reopen page or create new tab to `${TENANT_URL}/app/chat`.
2. Take snapshot immediately after first meaningful paint.
3. Take screenshot.
4. Check console.

Expected:

- After native/browser blank phase, first app-level meaningful screen is chat.
- Old web screens do not appear:
  - `Открываем кабинет`
  - `Добро пожаловать`
  - `Готовим чат`
  - `Загружаем экран`
  - `Чат временно недоступен` as startup replacement
- Header/composer/transcript layout does not jump between several different
  startup surfaces.

Evidence:

- Snapshot with chat header and composer.
- Screenshot of first rendered app state.
- Console messages.

FAIL:

- Any old startup screen appears after app JS starts.
- Chat flashes, then cabinet/loading screen, then chat again.
- Empty white app shell persists after native load.

Cleanup:

- None.

### S-05. Cached Chat Boot With API Failures

Type: Read-only synthetic
Risk: High
Can be automated: Yes

Preconditions:

- Disposable browser context or test profile.
- Startup tenant/auth/chat mirrors can be seeded via `browser_run_code_unsafe`
  or created by previous login.

MCP steps:

1. Seed startup tenant/auth/chat for current `TENANT_URL` and test user, or use
   a previously warmed authenticated browser context.
2. Intercept same-origin `/api/tenant`, `/api/auth/me`, `/api/chat/threads` and
   fail them.
3. Navigate to `${TENANT_URL}/app/chat`.
4. Snapshot.
5. Inspect network requests and console.

Expected:

- Cached chat opens immediately.
- Failed API requests do not replace cached chat with startup/loading/error UI.
- Connection/offline notice may appear, but transcript remains visible.

Evidence:

- Snapshot showing cached message/thread.
- Network evidence that APIs failed.
- Forbidden startup text scan result.

FAIL:

- App blocks on failed API.
- Cached chat is replaced by `Чат временно недоступен`.
- User is redirected to login before authoritative unauth response exists.

Cleanup:

- Clear synthetic storage if this was not a disposable context.

### S-06. Cached Chat Boot With Hanging API/VPN-Like Network

Type: Read-only synthetic
Risk: High
Can be automated: Yes

Preconditions:

- Same as S-05.

MCP steps:

1. Seed/warm startup cache.
2. Intercept same-origin startup APIs and keep them pending until browser/test
   timeout, simulating VPN connected with no real network path.
3. Navigate to `${TENANT_URL}/app/chat`.
4. Wait 5-10 seconds.
5. Snapshot and screenshot.

Expected:

- Cached chat remains visible while requests hang.
- No infinite `Открываем кабинет` or native-like web splash.
- UI remains usable for reading cached transcript.

Evidence:

- Snapshot after wait.
- Network pending request list.
- Console messages.

FAIL:

- Visible app blocks waiting for network.
- App rotates through several startup states.
- Composer/transcript disappears due pending startup APIs.

Cleanup:

- Remove route interception/new context.

### S-07. Slow API Does Not Rotate Startup Surfaces

Type: Read-only synthetic
Risk: High
Can be automated: Yes

Preconditions:

- Warm startup cache.

MCP steps:

1. Delay startup APIs by 2-8 seconds.
2. Navigate to `${TENANT_URL}/app/chat`.
3. Capture screenshot at early, mid and after-network points if practical.
4. Snapshot after network resolves.

Expected:

- Early state is cached chat.
- Later authoritative update refreshes data in place.
- No intermediate cabinet/welcome/loading screens.

Evidence:

- Early and final snapshots/screenshots.
- Network timing notes.

FAIL:

- Fast flicker to another startup surface.
- Layout resets to a non-chat page before final chat.

Cleanup:

- Remove interception/new context.

### S-08. Chat Read Model And Transcript Layout

Type: Read-only
Risk: Medium
Can be automated: Yes

Preconditions:

- Authenticated user with at least one thread and history.

MCP steps:

1. Navigate to `${TENANT_URL}/app/chat`.
2. Snapshot transcript.
3. Scroll up and press/load `Загрузить более ранние сообщения` if present.
4. Snapshot after older messages load.
5. Return to latest messages.

Expected:

- Messages are readable, ordered, and scoped to the selected thread.
- Older history loads without duplicate visible blocks.
- Header and composer stay stable.
- No horizontal overflow on mobile.

Evidence:

- Snapshot before/after older messages.
- Screenshot mobile.

FAIL:

- Duplicate messages after load older.
- Wrong thread content.
- Composer overlaps transcript.
- Header/action menu covers content.

Cleanup:

- None.

### S-09. Online Text Send

Type: Mutating
Risk: High
Can be automated: Yes

Preconditions:

- Authenticated user.
- Test thread selected.
- Online network.

MCP steps:

1. Type `${TEST_MESSAGE_PREFIX} online text send`.
2. Send.
3. Wait for optimistic state to settle.
4. Snapshot transcript.
5. If Chatwoot/admin access is available, confirm delivery there.

Expected:

- Message appears once.
- Status transitions away from queued/sending to sent/confirmed UI.
- No red failed state for a successful send.
- Message survives page reload.

Evidence:

- Snapshot after send.
- Optional Chatwoot/admin confirmation.
- Network request for send endpoint.

FAIL:

- Message remains failed online.
- Duplicate message appears after reload.
- Send bypasses portal backend or hits Chatwoot directly from browser.

Cleanup:

- None; test message remains as audit trail.

### S-10. Offline Queued Text And Reconnect Drain

Type: Mutating synthetic
Risk: High
Can be automated: Yes

Preconditions:

- Authenticated and warmed offline cache.
- Browser context can simulate offline or abort send API.

MCP steps:

1. Open chat online and confirm cached state.
2. Switch network to offline or abort send endpoint.
3. Type `${TEST_MESSAGE_PREFIX} offline queued text`.
4. Send.
5. Snapshot queued state.
6. Reload while still offline if possible.
7. Restore network.
8. Wait for foreground drain.
9. Snapshot final state.

Expected:

- Offline text is visible and queued.
- Queued text survives reload/offline reopen.
- After reconnect it sends once.
- Final transcript has no duplicate.

Evidence:

- Snapshot queued.
- Snapshot after reconnect.
- Network/send request count if available.

FAIL:

- Queued text disappears.
- Message sends twice.
- Failed state remains after reconnect without retry.
- Offline read model is replaced by blocking startup UI.

Cleanup:

- None; test message remains.

### S-11. Incoming Realtime Message

Type: External actor
Risk: High
Can be automated: Later

Preconditions:

- Authenticated portal session.
- Access to Chatwoot/admin or another actor that can send a message to the
  selected portal thread.

MCP steps:

1. Open portal chat and keep it visible.
2. From Chatwoot/admin, send `${TEST_MESSAGE_PREFIX} incoming realtime`.
3. Wait for portal update without manual reload.
4. Snapshot transcript.
5. If no realtime arrives, reload and compare canonical state.

Expected:

- Incoming message appears in current thread without exposing Chatwoot authority
  to browser.
- If realtime is temporarily unavailable, reload shows canonical message.
- Notification dot/sound behavior follows current settings.

Evidence:

- Snapshot before/after.
- Console/network messages.
- Admin-side note that message was sent.

FAIL:

- Realtime appears in wrong tenant/thread.
- Message never appears after reload.
- Browser direct-connects to Chatwoot with privileged authority.

Cleanup:

- None.

### S-12. Thread Switching Private/Group

Type: Read-only
Risk: Medium
Can be automated: Yes

Preconditions:

- User has `private:me`.
- Optional: user has at least one group thread.

MCP steps:

1. Open chat.
2. Open thread switcher/list if available.
3. Switch to private thread.
4. Switch to `GROUP_THREAD_ID` if available.
5. Snapshot each state.
6. Reload selected group thread if URL/state supports it.

Expected:

- Only accessible threads are visible.
- Thread switch keeps tenant/user boundary.
- Header, transcript, search/media/info pages follow selected thread.

Evidence:

- Snapshots per thread.
- URL/state notes.

FAIL:

- Inaccessible group is visible.
- Switching shows stale private messages under group header.
- Reload loses selected thread unexpectedly.

Cleanup:

- Return to private thread if that is the default for next scenarios.

### S-13. Search Page And Context Preview

Type: Read-only
Risk: Medium
Can be automated: Yes

Preconditions:

- Thread has searchable text history.

MCP steps:

1. Open chat menu.
2. Open `Поиск по чату`.
3. Search for a known word from a test message or safe fixture.
4. Toggle author filters if present.
5. Open context preview/jump result.
6. Return to chat.

Expected:

- Search page opens full-screen within portal shell.
- Results are scoped to current thread.
- Context preview and jump do not corrupt current transcript.
- Empty/no-result state is controlled.

Evidence:

- Snapshot of results.
- Snapshot of context/jump state.

FAIL:

- Search returns wrong thread/tenant data.
- Input loses text unexpectedly.
- Jump breaks chat scroll or leaves stale highlight permanently.

Cleanup:

- Clear search input or navigate back to chat.

### S-14. Media And Files Page

Type: Read-only
Risk: Medium
Can be automated: Yes

Preconditions:

- Thread has at least one safe test attachment, or scenario is marked
  `BLOCKED`.

MCP steps:

1. Open chat menu.
2. Open `Медиа и файлы`.
3. Snapshot page.
4. Open an attachment preview/link if safe.
5. Navigate back.

Expected:

- Page opens as chat-adjacent full-screen panel.
- Items are current-thread scoped.
- Attachment URLs go through portal authority/proxy, not browser Chatwoot
  authority.
- Empty state is controlled if no media exists.

Evidence:

- Snapshot of media page.
- Network URL pattern notes.

FAIL:

- Direct privileged Chatwoot URL is exposed as authority.
- Wrong thread files visible.
- Page breaks on missing thumbnails.

Cleanup:

- Return to chat.

### S-15. Chat Info Page

Type: Read-only
Risk: Medium
Can be automated: Yes

Preconditions:

- Authenticated user with selected thread.

MCP steps:

1. Open chat menu.
2. Open `Информация о чате`.
3. Snapshot details.
4. For group thread, verify participants block if applicable.
5. Navigate back.

Expected:

- Type, support label, access, curator, dates, participants and working hours
  render without leaking Chatwoot internal authority.
- Group participants are scoped to current user access.
- Empty/null fields have controlled copy.

Evidence:

- Snapshot.
- Console messages.

FAIL:

- Wrong participants visible.
- Internal Chatwoot IDs shown as user-facing primary data.
- Layout overflows mobile width.

Cleanup:

- Return to chat.

### S-16. Notification Settings UI

Type: Mutating settings
Risk: Medium
Can be automated: Yes

Preconditions:

- Authenticated user.
- Test user settings can be changed.

MCP steps:

1. Open notification settings from chat/global settings.
2. Snapshot current settings.
3. Toggle sound/new-message setting.
4. Save or wait for auto-save, depending on UI.
5. Reload page and confirm persisted state.
6. Restore original value.

Expected:

- Settings load after authenticated app state, not as startup blocker.
- Toggle state persists.
- Thread override and global setting are visually distinct.

Evidence:

- Snapshot before/after.
- Network settings request notes.

FAIL:

- Settings request blocks chat boot.
- Toggle appears saved but reverts after reload.
- Permission UI is shown in unsupported/unsafe context without controlled copy.

Cleanup:

- Restore original settings.

### S-17. Web Push Permission And Subscription

Type: Browser/device permission
Risk: High
Can be automated: Later

Preconditions:

- HTTPS origin.
- Browser supports Notifications and Push API.
- Test user can modify push subscription.

MCP steps:

1. Open notification settings.
2. Trigger push permission request only in a test browser profile.
3. Accept/deny according to test case.
4. Snapshot resulting UI.
5. Inspect subscription state if exposed in UI.

Expected:

- Permission request is user-initiated.
- Denied/default/granted states have controlled UI.
- Subscription lifecycle stays tenant/user scoped.

Evidence:

- Screenshot after permission state.
- Console messages.

FAIL:

- Permission prompt appears on page load without user action.
- UI says push enabled when browser denied permission.
- Subscription leaks across tenant/user.

Cleanup:

- Reset browser permission/profile if needed.

### S-18. PWA Manifest And Service Worker Runtime

Type: Read-only
Risk: High
Can be automated: Yes

Preconditions:

- HTTPS for production/staging PWA installability checks.

MCP steps:

1. Navigate to `${TENANT_URL}/api/tenant/manifest.webmanifest`.
2. Navigate to `${TENANT_URL}/sw.js`.
3. Navigate to app route and inspect service worker registration console.
4. If supported, evaluate `navigator.serviceWorker.controller` after reload.

Expected:

- Manifest is tenant-aware.
- `sw.js` has stamped `SERVICE_WORKER_REVISION`.
- Service worker does not intercept `/api/*` as app shell.
- App shell assets are available for offline navigation after install/warmup.

Evidence:

- Manifest excerpt.
- Service worker revision excerpt.
- Console messages.

FAIL:

- Static/shared manifest identity across tenants.
- Missing service worker revision.
- API requests served as app shell.

Cleanup:

- None.

### S-19. Mobile Viewport Visual Pass

Type: Visual
Risk: High
Can be automated: Later

Preconditions:

- Authenticated chat.
- `VIEWPORT_MOBILE` set.

MCP steps:

1. Resize to `VIEWPORT_MOBILE`.
2. Check login/auth screen if unauthenticated.
3. Check chat header, transcript, composer.
4. Open chat menu.
5. Open search/media/info pages.
6. Take screenshots for key states.

Expected:

- No overlapping text/buttons.
- Composer stays usable with transcript.
- Buttons have stable sizes.
- Full-screen chat-adjacent pages stay within portal shell width.
- No visible old startup surfaces.

Evidence:

- Screenshot gallery.
- Snapshot for controls.

FAIL:

- Text clipped or overlapping.
- Header/composer jumps during state changes.
- Horizontal scroll appears.
- Menu or full-screen panel exceeds viewport.

Cleanup:

- Return viewport to default if needed.

### S-20. Desktop Viewport Visual Pass

Type: Visual
Risk: Medium
Can be automated: Later

Preconditions:

- Authenticated chat.
- `VIEWPORT_DESKTOP` set.

MCP steps:

1. Resize to `VIEWPORT_DESKTOP`.
2. Navigate through chat, search, media, info, settings.
3. Snapshot/screenshot key states.

Expected:

- Portal remains centered/constrained as designed.
- Desktop does not reveal mobile-only layout defects.
- Scrollbars are intentional and accessible.

Evidence:

- Screenshot gallery.

FAIL:

- App shell stretches into unreadable layout.
- Repeated cards/panels nest incorrectly.
- Key actions are hidden outside viewport.

Cleanup:

- None.

### S-21. Native Installed PWA Splash And Home Screen Behavior

Type: Device-only
Risk: High
Can be automated: No, manual device smoke

Preconditions:

- Android Chrome installed PWA or iOS/iPadOS Home Screen PWA.
- Use `docs/operations/installed-pwa-smoke.md`.

MCP steps:

- MCP Playwright cannot fully prove native PWA splash behavior because it runs
  browser automation, not OS Home Screen launch.
- Use MCP only to verify same-origin web runtime after launch if remote
  debugging is available.

Expected:

- Native splash may appear briefly.
- After native splash, authenticated warmed user sees chat immediately.
- Offline/hanging VPN-like network does not trap app on native splash or old web
  startup surfaces.

Evidence:

- Real-device notes/screenshots/video if available.
- MCP snapshot only as supporting evidence.

FAIL:

- Installed PWA hangs on native splash.
- After native splash, web app shows old startup screens or blocks on network.

Cleanup:

- Keep or remove installed PWA according to device smoke plan.

### S-22. Registration Email-Code Flow

Type: Mutating auth
Risk: Medium
Can be automated: Later

Preconditions:

- Test email is eligible for registration in the current tenant Chatwoot
  account.
- `MAILBOX_ACCESS` is available. For local runs this is usually Mailpit.
- Do not use a real customer email.

MCP steps:

1. Open registration page from public/auth UI.
2. Enter test email.
3. Submit request.
4. Read verification code from allowed test mailbox outside the portal UI.
5. Enter code.
6. Set password.
7. Confirm protected app opens.

Expected:

- Eligibility is tenant-scoped.
- Verification code flow has controlled copy and errors.
- New portal user opens only current tenant chat.
- No Chatwoot authority is exposed to browser.

Evidence:

- Snapshot of each auth step.
- Mailbox note without recording code value.
- Final protected chat snapshot.

FAIL:

- Ineligible email can register.
- Eligible test email is rejected unexpectedly.
- Code accepted for wrong tenant/email.
- Registration opens wrong tenant/user data.

Cleanup:

- For local/staging, remove disposable test user if runbook owner requires it.
- For production, prefer a pre-created smoke account instead of repeated
  registration unless explicitly approved.

### S-23. Password Reset Email-Code Flow

Type: Mutating auth
Risk: Medium
Can be automated: Later

Preconditions:

- Test portal user exists.
- `MAILBOX_ACCESS` is available.
- Password change is safe for this test account.

MCP steps:

1. Sign out.
2. Open password reset page.
3. Enter `PORTAL_USER_EMAIL`.
4. Submit reset request.
5. Read verification code from allowed test mailbox.
6. Enter code.
7. Set a temporary test password.
8. Login with the new password.
9. Optionally restore original password through the same flow.

Expected:

- Reset is tenant/email scoped.
- Code and continuation token cannot be reused after completion.
- Login works with new password.
- Old session/cache does not reveal another user's data.

Evidence:

- Snapshots of reset request, verify and set-password states.
- Final login snapshot.

FAIL:

- Reset code works across tenant/email.
- Old password still works when it should not.
- User lands in wrong tenant or stale cached chat.

Cleanup:

- Restore known test password if the environment depends on it.

### S-24. Attachment Send And Portal Proxy Read

Type: Mutating file
Risk: High
Can be automated: Later

Preconditions:

- Authenticated user.
- `TEST_ATTACHMENT_PATH` exists and contains harmless test data.
- Online network.

MCP steps:

1. Open selected thread.
2. Click attachment control.
3. Upload `TEST_ATTACHMENT_PATH`.
4. Send if UI requires explicit send.
5. Wait for attachment message to appear.
6. Open/download attachment through portal UI if safe.
7. Inspect network URL patterns.

Expected:

- Attachment send goes through portal backend.
- Attachment renders once in transcript.
- Read/download URL is portal-controlled proxy/endpoint, not privileged browser
  Chatwoot authority.
- File size/type errors use controlled UI.

Evidence:

- Snapshot after attachment appears.
- Network URL pattern notes.

FAIL:

- Browser sends directly to Chatwoot with authority.
- Attachment appears duplicated or permanently failed online.
- Wrong tenant/thread can read file.

Cleanup:

- Test attachment remains as audit trail unless environment cleanup policy says
  otherwise.

### S-25. Voice/Audio Send

Type: Mutating media
Risk: Medium
Can be automated: Later

Preconditions:

- Browser/MCP environment can grant microphone permission, or scenario is
  `BLOCKED`.
- Online network.

MCP steps:

1. Open selected thread.
2. Trigger voice message control.
3. Grant/deny microphone permission according to test case.
4. Record a short smoke audio if allowed.
5. Send.
6. Snapshot transcript.

Expected:

- Permission denied state is controlled.
- Voice send is online-only if offline.
- Sent audio appears once and remains playable/downloadable through safe portal
  path.

Evidence:

- Snapshot of permission/error or sent audio state.
- Console messages.

FAIL:

- Permission denial crashes composer.
- Offline voice is queued as if supported when product says text-only outbox.
- Audio URL exposes privileged Chatwoot authority.

Cleanup:

- Reset browser permission/profile if needed.

### S-26. Cached Older History Offline

Type: Read-only synthetic
Risk: High
Can be automated: Yes

Preconditions:

- Online warmup has loaded older message pages into offline cache.
- Browser context can switch offline or abort APIs.

MCP steps:

1. Online: open chat and load older messages.
2. Confirm older messages are visible.
3. Switch network to offline or abort chat APIs.
4. Reload app.
5. Open cached chat.
6. Try to inspect/scroll previously cached older history.

Expected:

- Cached latest chat opens immediately.
- Previously cached older pages are available offline.
- App does not promise uncached infinite history while offline.
- No duplicate messages when network returns.

Evidence:

- Snapshot online after older load.
- Snapshot offline after reload.
- Network failure notes.

FAIL:

- Cached older history disappears after offline reload despite warmup.
- App blocks on network when cached latest/older pages exist.
- Returning online duplicates loaded older messages.

Cleanup:

- None.

### S-27. Cross-Tenant Browser Isolation

Type: Read-only/session
Risk: High
Can be automated: Yes

For full local production-like coverage, run `Local Cross-Tenant Scenarios`
below.

Preconditions:

- `SECOND_TENANT_URL` exists in staging/local production-like environment.
- Same browser context can visit both tenant origins.
- Test users are distinct per tenant.

MCP steps:

1. Login to `TENANT_URL`.
2. Open chat and snapshot tenant/user identity.
3. Navigate to `SECOND_TENANT_URL`.
4. Check whether auth/session is separate as expected by origin/cookie model.
5. Login to second tenant if needed.
6. Navigate back to `TENANT_URL`.

Expected:

- Tenant identity follows host/domain.
- Startup cache, IndexedDB data and session do not cross origins/tenants.
- Unknown or unauthenticated second tenant does not show first tenant chat.

Evidence:

- Snapshots per tenant.
- URLs and tenant API response notes.

FAIL:

- First tenant cached chat appears on second tenant.
- Session cookie authenticates wrong tenant.
- Manifest/service worker identity leaks across tenant origins.

Cleanup:

- Sign out from both tenants if the test profile is reused.

### S-28. Controlled Unavailable/Error States

Type: Read-only synthetic
Risk: Medium
Can be automated: Yes

Preconditions:

- Browser context can intercept selected APIs or use a staging tenant configured
  for controlled failures.

MCP steps:

1. Trigger controlled tenant failure, auth failure, chat unavailable, or
   notification settings failure one at a time.
2. Snapshot UI.
3. Check console/network.
4. Restore normal route/network and reload.

Expected:

- User sees a controlled state with actionable copy.
- Failure in secondary features does not replace authenticated cached chat
  startup.
- No framework overlay or blank page.
- After recovery, app returns to normal without clearing valid unrelated cache.

Evidence:

- Snapshot per error state.
- Network status notes.

FAIL:

- Blank page.
- Infinite spinner/splash.
- Secondary endpoint failure blocks chat boot.
- Valid cached chat is deleted by a non-authoritative transient failure.

Cleanup:

- Remove route interception/new context.

### S-29. Logout Clears Local Device Data

Type: Mutating session/offline
Risk: High
Can be automated: Yes

Preconditions:

- User has previously logged in and opened chat online.
- Cached tenant/auth/chat data exists on the device.

MCP steps:

1. Login to `${TENANT_URL}` and open chat until transcript is cached.
2. Sign out through the UI.
3. Confirm the app returns to login.
4. Switch browser context offline or hang all startup APIs.
5. Reload `${TENANT_URL}/app/chat`.
6. Snapshot the first meaningful surface.

Expected:

- Logged-out user does not see cached chat offline.
- Local device data tied to that session is removed or made inaccessible.
- Login screen or controlled signed-out state appears without old transcript.

Evidence:

- Snapshot after logout.
- Snapshot after offline reload.
- Console/network notes.

FAIL:

- Old cached chat appears after logout.
- Outbox or unread state from the logged-out user remains visible.
- App hangs on native/web splash instead of showing controlled signed-out UI.

Cleanup:

- Return browser context online and login again only if the next scenario needs
  an authenticated session.

### S-30. Cached Session Expired Offline

Type: Read-only synthetic
Risk: High
Can be automated: Yes

Preconditions:

- Browser has cached tenant/auth/chat state from a previous online login.
- Test harness can age or override cached offline auth metadata.

MCP steps:

1. Open chat online and confirm transcript is cached.
2. Age cached auth metadata past backend `sessionExpiresAt`, or use a staging
   fixture with expired backend session metadata.
3. Switch browser context offline or hang `/api/auth/me`.
4. Reload `${TENANT_URL}/app/chat`.
5. Snapshot first meaningful surface.

Expected:

- Expired cached session does not open authenticated chat indefinitely.
- App shows controlled re-auth/sign-in-needed UI.
- Cached transcript is not exposed after backend session expiry.

Evidence:

- Snapshot of expired offline state.
- Storage metadata note if inspected by MCP.

FAIL:

- Expired cached session opens chat as authenticated.
- App loops between login/chat/startup surfaces.
- Cached chat remains readable after backend session expiry.

Cleanup:

- Restore fresh login/cache for later scenarios if needed.

### S-31. Same-Tenant User Isolation

Type: Mutating session/cache
Risk: High
Can be automated: Yes

Preconditions:

- Same tenant has two different portal test users.
- Both users have distinguishable chat content.

MCP steps:

1. Login as user A and open chat until transcript is cached.
2. Queue or send a uniquely prefixed user A test message if allowed.
3. Logout.
4. Login as user B in the same browser profile.
5. Open chat and snapshot transcript, unread markers, notification settings and
   any queued outbox state.
6. Switch offline and reload if cached startup is part of the check.

Expected:

- User B does not see user A transcript, outbox, unread markers, selected
  thread, notification overrides or cached startup state.
- Same tenant/origin cache is keyed by user/session, not only by tenant.

Evidence:

- Snapshot after user B login.
- Optional offline reload snapshot.

FAIL:

- User A cached transcript or outbox appears for user B.
- User A selected group/thread opens for user B without access.
- User A notification settings appear as user B settings.

Cleanup:

- Logout user B.

### S-32. Two Tabs Outbox Drain Once

Type: Mutating synthetic
Risk: High
Can be automated: Yes

Preconditions:

- Authenticated user.
- Browser context can open two tabs for the same tenant/session.

MCP steps:

1. Open `${TENANT_URL}/app/chat` in two tabs.
2. Wait for both tabs to show an enabled composer.
3. Switch browser context offline.
4. Queue one text message in tab A.
5. Confirm tab B does not create a second independent send for the same
   outbox record.
6. Restore online.
7. Wait for drain to complete in both tabs.
8. Verify transcript/Chatwoot/admin has exactly one delivered message with the
   test prefix.

Expected:

- Shared durable outbox drains the queued text once.
- Both tabs converge to the same sent/confirmed state.
- No duplicate Chatwoot messages are created.

Evidence:

- Snapshots from both tabs.
- Network/message id notes.

FAIL:

- Two tabs send the same queued text twice.
- One tab shows failed while the other shows sent for the same record.
- Outbox remains stuck after online recovery.

Cleanup:

- Close the extra tab.

### S-33. Online Send Failure, Retry And Idempotency

Type: Mutating synthetic
Risk: High
Can be automated: Yes

Preconditions:

- Authenticated user.
- MCP can intercept `/api/chat/messages` responses.

MCP steps:

1. Open chat online.
2. Intercept the first text send with `500`, timeout, or `429 Retry-After`.
3. Send `${TEST_MESSAGE_PREFIX} retry`.
4. Snapshot queued/backoff UI for transient failures.
5. Wait until automatic retry runs after recovery or until allowed by
   `Retry-After`.
6. Verify final transcript contains exactly one canonical sent message.

Expected:

- UI does not mark the message as sent before backend authority confirms it.
- Transient failures remain pending/queued and are retried automatically.
- `Retry-After` is respected when present.
- Client message key/idempotency prevents duplicate final sends.
- Terminal failures remain visible as failed state with manual retry when the
  product can safely retry them.

Evidence:

- Snapshot of queued/backoff or terminal failed state.
- Network notes for failed and successful attempts with the same
  `clientMessageKey`.
- Backend transcript/search evidence showing exactly one canonical message.

FAIL:

- Message duplicates after retry.
- UI says sent while backend returned failure.
- Outbox remains stuck after the retry time is due.
- Retry button/spinner remains stuck after successful recovery.

Cleanup:

- Remove route interception.

### S-34. Attachment And Voice Offline Online-Only Guard

Type: Mutating synthetic
Risk: High
Can be automated: Later

Preconditions:

- Authenticated user.
- Browser can switch offline.
- Attachment and voice controls are visible or scenario can mark voice part
  `BLOCKED` because microphone is unavailable.

MCP steps:

1. Open chat online and wait for enabled composer.
2. Switch browser context offline.
3. Try sending an attachment.
4. Try recording/sending voice if microphone is available.
5. Snapshot composer/runtime alerts.

Expected:

- Text may be queued, but attachment and voice are not silently queued as
  durable offline sends.
- UI explains that media sends require connection.
- No partial/stale media message remains in transcript after reload.

Evidence:

- Snapshot of media offline guard.
- Console/network notes.

FAIL:

- Attachment or voice is queued as if offline media outbox exists.
- Composer crashes after file/microphone action offline.
- Partial upload state remains permanently stuck after reload.

Cleanup:

- Return online and clear any selected file/recording.

### S-35. Reply-To Message Send

Type: Mutating chat
Risk: Medium
Can be automated: Yes

Preconditions:

- Authenticated user.
- Transcript contains at least one message that can be selected as reply target.

MCP steps:

1. Open chat and select a visible message as reply target.
2. Confirm composer shows reply context.
3. Send `${TEST_MESSAGE_PREFIX} reply`.
4. Snapshot the sent message.
5. Reload the transcript or wait for realtime echo.

Expected:

- Send request includes reply metadata through the backend contract.
- Sent message renders reply context once.
- Reply context survives refresh/realtime canonicalization.
- Canceling reply target before send removes metadata.

Evidence:

- Snapshot of composer reply target.
- Snapshot of sent reply.
- Network payload note if inspected.

FAIL:

- Reply text sends without reply metadata after target selection.
- Reply target remains stuck for the next unrelated message.
- Refresh/realtime loses or duplicates reply context.

Cleanup:

- Cancel reply target if it remains selected.

### S-36. Support Availability Vs Connection State

Type: Read-only synthetic
Risk: Medium
Can be automated: Yes

Preconditions:

- Authenticated user.
- MCP can vary `/api/chat/support-availability` and network state.

MCP steps:

1. Open chat online and snapshot support availability in header/info page.
2. Simulate support states: available, later, outside working hours.
3. Separately switch browser offline or hang chat startup/realtime APIs.
4. Snapshot header and unified connection notice.

Expected:

- Support status copy means support availability only.
- Connection copy such as `Нет связи` or `Соединение...` is visually separate.
- Offline state does not overwrite working-hours/support semantics.
- Support availability failure does not block cached chat boot.

Evidence:

- Header snapshots per state.
- Network interception notes.

FAIL:

- Header shows support availability as connection readiness.
- Offline state hides readable cached transcript.
- Failed support endpoint blocks chat startup.

Cleanup:

- Remove route interception.

### S-37. Push Delivery Privacy And Click Routing

Type: Device/browser permission
Risk: High
Can be automated: Later

Preconditions:

- HTTPS origin with granted push permission.
- Test user has active push subscription.
- External actor can create an incoming Chatwoot message.

MCP/manual steps:

1. Enable Web Push in notification settings.
2. Background the PWA/browser tab if supported.
3. Send incoming message from Chatwoot/admin.
4. Observe received notification.
5. Click notification.
6. Snapshot opened app/thread.

Expected:

- Push payload does not include sensitive message body.
- Notification is scoped to the correct tenant/user/thread.
- Click opens the correct tenant app and chat thread.
- Other tenants/users/devices do not receive the notification.

Evidence:

- Device/browser notification note.
- Snapshot after notification click.
- Push subscription/user/thread notes.

FAIL:

- Push leaks message text or privileged Chatwoot identifiers.
- Click opens wrong tenant/thread.
- Logged-out or wrong user receives the notification.

Cleanup:

- Disable push subscription if the profile is reused.

### S-38. Chatwoot Deleted Conversation Recovery

Type: Mutating external
Risk: High
Can be automated: Later

Preconditions:

- Authenticated user with an existing mapped portal thread.
- Test environment allows deleting or archiving the mapped Chatwoot
  conversation.

MCP/manual steps:

1. Open selected thread and send a baseline message.
2. Identify the mapped Chatwoot conversation through admin/local helper.
3. Delete or remove that conversation in Chatwoot.
4. Return to portal and send `${TEST_MESSAGE_PREFIX} recovery`.
5. Verify portal transcript and Chatwoot/admin state.

Expected:

- Backend detects stale mapping and creates/reuses a valid replacement
  conversation under tenant/thread authority.
- The recovery send becomes canonical `sent`.
- UI does not leave the message permanently red/failed because old Chatwoot
  conversation disappeared.

Evidence:

- Portal snapshot after recovery send.
- Chatwoot/admin note with replacement conversation id.

FAIL:

- Send remains permanently failed after deleted Chatwoot conversation.
- Backend creates duplicate conversations without control.
- Replacement conversation is created in wrong account/inbox/thread.

Cleanup:

- Keep recovery artifacts as audit trail unless local cleanup policy says to
  remove them.

### S-39. Stale Response After Thread Switch

Type: Read-only synthetic
Risk: High
Can be automated: Yes

Preconditions:

- Authenticated user has private and group threads.
- MCP can delay selected `/api/chat/messages` responses.

MCP steps:

1. Delay private-thread history response.
2. Open private chat.
3. Switch to group thread before delayed private response resolves.
4. Release delayed private response.
5. Snapshot current transcript.

Expected:

- Group transcript remains selected and visible.
- Delayed private response is ignored or stored without replacing group UI.
- Selected thread header, composer target and unread state remain coherent.

Evidence:

- Snapshot after delayed response resolves.
- Network timing notes.

FAIL:

- Private history overwrites group transcript.
- Header shows group while messages are private or vice versa.
- Composer sends to a different thread than the visible transcript.

Cleanup:

- Remove route interception.

### S-40. Search Context Deep History

Type: Read-only
Risk: Medium
Can be automated: Yes

Preconditions:

- Selected thread has searchable messages outside the currently loaded latest
  transcript page.

MCP steps:

1. Open chat search.
2. Search for a message outside the loaded transcript.
3. Open the result context preview.
4. Load earlier and later context pages.
5. Return to latest transcript.

Expected:

- Search result opens bounded context without replacing the selected thread.
- Earlier/later context controls load stable history fragments.
- Returning to latest transcript restores normal live chat mode.

Evidence:

- Snapshot of search results.
- Snapshot of context fragment.
- Network request notes for search/context endpoints.

FAIL:

- Context preview opens wrong thread/message.
- Earlier/later controls duplicate or skip visible messages.
- User cannot return to latest transcript.

Cleanup:

- Close search/context panel.

### S-41. Auth Negative And Rate Limit States

Type: Mutating auth
Risk: Medium
Can be automated: Yes

Preconditions:

- Test user/email data is safe to mutate.
- Mailbox access is available when email-code flows are included.

MCP steps:

1. Submit invalid login credentials.
2. Trigger invalid/expired OTP for registration or password reset.
3. Trigger resend cooldown.
4. Submit password reset request for an unknown email.
5. If safe, repeat auth request enough to hit local/staging rate limit.

Expected:

- Invalid credentials and invalid OTP stay on the correct step with controlled
  copy.
- Password reset for unknown email uses enumeration-safe copy and does not send
  reset mail.
- Rate limit state is visible, bounded and recoverable.
- No negative auth state opens protected app shell.

Evidence:

- Snapshots per negative state.
- Mailbox note for unknown-email reset.
- Network status notes for rate limit.

FAIL:

- Negative auth state leaks account existence.
- Invalid OTP advances to set-password.
- Rate limit creates a blank page or permanent lockout UI.

Cleanup:

- Wait for rate-limit window if needed before continuing.

### S-42. Mobile Keyboard And Composer Stability

Type: Visual/interaction
Risk: Medium
Can be automated: Later

Preconditions:

- Mobile viewport or real mobile device.
- Authenticated user with chat access.

MCP/manual steps:

1. Resize to `VIEWPORT_MOBILE`.
2. Open chat and focus composer.
3. Type a long multiline message.
4. Scroll transcript while keyboard/composer is active.
5. Send the message.
6. Rotate or resize if the device/test harness supports it.

Expected:

- Header, transcript and composer do not overlap.
- Composer grows within intended bounds.
- Send button and attachment/voice controls remain reachable.
- Scroll anchoring keeps latest relevant content visible.

Evidence:

- Mobile screenshots before and after keyboard/composer interaction.

FAIL:

- Keyboard/composer hides send controls or transcript permanently.
- Text overflows the composer container.
- Header/footer overlap chat content.

Cleanup:

- Clear draft text if it was not sent.

### S-43. Service Worker Update And Old Cache Migration

Type: PWA synthetic
Risk: High
Can be automated: Later

Preconditions:

- Existing installed/opened PWA has an older service worker and cached app
  shell, or test harness can simulate previous cache version.
- New deploy/build is available on the same origin.

MCP/manual steps:

1. Open the app with old cached shell and warm chat cache.
2. Deploy or switch to the new build.
3. Reopen/reload the PWA.
4. Observe service worker update and first meaningful chat surface.
5. Test offline reload after the update.

Expected:

- New app shell takes over without blank page or endless old cache.
- Cached chat remains readable after compatible offline schema migration.
- Old service worker does not serve stale startup surfaces.
- `/api/*` remains network-only and is not cached by service worker.

Evidence:

- Service worker revision/status note.
- Snapshot before/after update.
- Offline reload snapshot after update.

FAIL:

- Old SW keeps serving removed startup/loading screens.
- Update deletes valid compatible chat cache.
- App shell becomes blank until manual cache clear.

Cleanup:

- Clear test profile storage only after evidence is captured.

## Local Cross-Tenant Scenarios

### LCT-01. Public Tenant Identity Matrix

Type: Read-only
Risk: High
Can be automated: Yes

MCP steps:

1. Navigate to `${LCT_TENANT_A_URL}/api/tenant`.
2. Repeat for `${LCT_TENANT_B_URL}/api/tenant`.
3. Repeat for `${LCT_TENANT_C_URL}/api/tenant`.
4. Navigate to each tenant root URL and snapshot anonymous login screen.

Expected:

- `buhfirma` returns display name `Бухфирма`.
- `stroyfirma` returns display name `Стройфирма`.
- `zubi` returns display name `Зуби`.
- Login page branding follows the current host.
- `default` tenant is not used for any production-like host.

FAIL:

- Any tenant host returns `TENANT_NOT_FOUND`.
- Any host shows another tenant's display name, logo, initials or manifest
  identity.

### LCT-02. Manifest And Service Worker Origin Isolation

Type: Read-only
Risk: High
Can be automated: Yes

Local HTTP `*.127.0.0.1.nip.io` may not expose `navigator.serviceWorker`
because service workers require a secure context. In that case, mark the browser
registration part `BLOCKED` and still verify tenant-specific manifest and
`/sw.js` responses. Full service worker registration isolation requires HTTPS
staging/local HTTPS or a browser configured to treat the local tenant origins as
secure.

MCP steps:

1. Open each tenant's `/api/tenant/manifest.webmanifest`.
2. Open each tenant's `/sw.js`.
3. In each origin, inspect service worker registrations and caches.

Expected:

- Manifest name/short name/icons follow the tenant.
- Service worker scope is origin-scoped per tenant host.
- Cache names may share product naming, but cached data cannot be reused across
  origins.

FAIL:

- Manifest from tenant A appears on tenant B.
- Browser uses one origin's service worker/cache to serve another tenant host.

### LCT-03. Auth And Session Isolation

Type: Mutating session
Risk: High
Can be automated: Yes

MCP steps:

1. Login to tenant A as `LCT_USER_A_EMAIL`.
2. Confirm chat or authenticated shell shows tenant A.
3. Navigate in the same browser context to tenant B.
4. Confirm tenant B is unauthenticated, or login only as `LCT_USER_B_EMAIL`.
5. Navigate to tenant C and repeat with `LCT_USER_C_EMAIL`.
6. Return to tenant A.

Expected:

- Session on one tenant host does not authenticate a different tenant host.
- Returning to tenant A keeps tenant A session and cached shell.
- No tenant shows another tenant's user, chat, or profile state.

FAIL:

- Tenant B opens tenant A chat without tenant B login.
- Login/logout on one tenant clears or mutates another tenant session.
- Auth rejection on one host deletes valid cached state for another host.

### LCT-04. Cached Chat And IndexedDB Isolation

Type: Read-only synthetic
Risk: High
Can be automated: Yes

MCP steps:

1. Login to tenant A and open chat until latest messages are cached.
2. Login to tenant B and open chat until latest messages are cached.
3. If group contacts are configured, select a group thread and warm that group
   transcript as the last opened chat.
4. Use MCP route interception to hang or abort chat startup APIs on tenant B.
5. Reload tenant B.
6. Repeat the hang/abort reload on tenant A.

Expected:

- Tenant B cached startup opens only tenant B chat.
- Tenant A cached startup opens only tenant A chat.
- If the last opened chat was a group thread, cached startup opens that group
  thread rather than falling back to `Личный чат`.
- No cached message, thread id, user id, attachment or unread state crosses
  tenant origins.

FAIL:

- Tenant A cached transcript appears on tenant B.
- Offline startup uses a tenant snapshot from a different host.
- IndexedDB keying or fallback logic ignores tenant/origin.

### LCT-05. Outbound Text/File Routing Isolation

Type: Mutating chat
Risk: High
Can be automated: Later

MCP steps:

1. In each tenant, send one text message:
   `${LCT_MESSAGE_PREFIX} <tenant> text`.
2. In each tenant, upload and send `LCT_ATTACHMENT_PATH`.
3. Verify each message appears once in that tenant transcript.
4. Verify through `LCT_CHATWOOT_VERIFY_METHOD` that each message lands in the
   expected Chatwoot account and portal API inbox.
5. If group contacts are configured, repeat text/file send in the selected
   group thread for every tenant and verify the group content does not appear
   in `Личный чат`.

Expected:

- `buhfirma` sends through Chatwoot account `3`, inbox `6`.
- `stroyfirma` sends through Chatwoot account `5`, inbox `9`.
- `zubi` sends through Chatwoot account `1`, inbox `8`.
- Group sends land in the same tenant account/inbox, but in the group contact
  conversation.
- Attachment links use portal proxy paths, not direct privileged Chatwoot URLs.

FAIL:

- Message from one tenant appears in another tenant account/conversation.
- Send uses the wrong portal inbox.
- Attachment URL leaks direct privileged Chatwoot authority.

### LCT-06. Incoming/Admin Message Isolation

Type: External actor
Risk: High
Can be automated: Later

MCP steps:

1. Open all three tenant chats in separate tabs.
2. From Chatwoot admin or a local Rails helper, send one incoming message into
   each tenant's conversation:
   `${LCT_MESSAGE_PREFIX} <tenant> incoming`.
3. If group contacts are configured, repeat the same check in each tenant's
   selected group conversation:
   `${LCT_MESSAGE_PREFIX} <tenant> group incoming`.
4. Observe realtime or refresh behavior in each tenant tab.

Expected:

- Incoming tenant A message appears only in tenant A.
- Incoming tenant B message appears only in tenant B.
- Incoming tenant C message appears only in tenant C.
- Group incoming messages appear only in the selected group thread and do not
  appear in `Личный чат`.
- Webhook processing resolves tenant by configured inbox/account, not by a
  global Chatwoot assumption.

FAIL:

- Incoming message is delivered to the wrong tenant.
- Webhook from one Chatwoot account mutates another tenant thread.
- Realtime state leaks across open tenant tabs.

### LCT-07. Offline Outbox Isolation

Type: Mutating synthetic
Risk: High
Can be automated: Yes

MCP steps:

1. Login to tenant A and switch browser context offline.
2. Queue text `${LCT_MESSAGE_PREFIX} tenant-a offline`.
3. Navigate to tenant B while still offline.
4. Confirm tenant B does not show tenant A queued outbox.
5. Queue text `${LCT_MESSAGE_PREFIX} tenant-b offline`.
6. Repeat in a selected group thread when group contacts are configured.
7. Restore online.
8. Verify queued messages drain once into their own tenant/thread.

Expected:

- Outbox queue is scoped by tenant/origin/user/thread.
- Offline notice counts are tenant-local.
- Reconnect drain does not send tenant A message through tenant B config.
- Group queued messages drain into the group contact conversation, not into
  `private:me`.

FAIL:

- Tenant B sees tenant A queued message.
- Reconnect sends a queued message to the wrong Chatwoot account/inbox.
- Queue drain creates duplicates after switching tenants.

### LCT-08. Multi-User Group Membership And Revocation

Type: Mutating group access
Risk: High
Can be automated: Later

MCP/API steps:

1. Create two portal-eligible person contacts in the same Chatwoot account.
2. Put the same group contact id in both contacts'
   `portal_client_group_contact_ids`.
3. Register/login both portal users.
4. User A sends `${LCT_MESSAGE_PREFIX} <tenant> member-a group fanout`.
5. User B opens the same group and sees the message.
6. Remove the group id from user B's person contact.
7. Refresh/resync user B.
8. User B attempts direct history and send requests for `group:<id>`.

Expected:

- User B sees user A's group message before revoke.
- After revoke, `/api/chat/threads` no longer returns the group for user B.
- Direct group history/send fail closed with controlled
  `thread_access_denied` not-ready responses.
- No Chatwoot message is created by user B after revoke.

FAIL:

- Removed group remains visible after authoritative resync.
- Direct history leaks group transcript after revoke.
- Direct send creates a Chatwoot message after revoke.

### LCT-09. Attachment Proxy Negative Isolation

Type: Negative file boundary
Risk: High
Can be automated: Yes

MCP/API steps:

1. Identify one private attachment and one group attachment per tenant.
2. Confirm their browser-visible URLs are portal proxy paths, not direct
   privileged Chatwoot URLs.
3. Open the valid same-thread attachment URL and expect success.
4. Open the group attachment through the private thread path.
5. Open the private attachment through the group thread path.
6. Open another tenant's group attachment path on the current tenant host.

Expected:

- Valid same-thread proxy returns the file.
- Group/private path swaps return controlled `attachment_unavailable`.
- Cross-tenant group paths return controlled `thread_access_denied`.
- No direct Chatwoot attachment authority is exposed to the browser.

FAIL:

- Wrong thread path returns file bytes.
- Cross-tenant path returns file bytes.
- Browser-visible attachment URL points directly at privileged Chatwoot media.

### LCT-10. Negative Host And Shared Email Checks

Type: Negative/read-only + optional auth
Risk: Medium
Can be automated: Yes

MCP steps:

1. Navigate to `http://127.0.0.1:5173` and confirm it is treated as `default`,
   not as a production-like tenant.
2. Navigate to an unknown host, for example
   `http://unknown.127.0.0.1.nip.io:5173/api/tenant`.
3. If `LCT_SHARED_EMAIL` is configured only in tenant A, try using it on tenant
   B and tenant C registration/login flows.

Expected:

- `default` is never accepted as a substitute for buhfirma/stroyfirma/zubi in
  cross-tenant QA.
- Unknown host returns controlled `TENANT_NOT_FOUND`.
- Email/contact access is tenant-scoped; tenant B cannot use tenant A-only
  contact identity.

FAIL:

- Unknown host resolves to an existing tenant.
- Shared email grants access to a tenant where the user/contact was not
  provisioned.
- Default tenant hides a broken production-like tenant setup.

### LCT-11. Same Email In Different Tenants

Type: Mutating auth/cache
Risk: High
Can be automated: Later

MCP steps:

1. Create or use the same email address as a portal-eligible person contact in
   tenant A and tenant B, backed by different Chatwoot accounts/contacts.
2. Register/login that email on tenant A.
3. Open chat and warm cached transcript.
4. Register/login the same email on tenant B in the same browser profile or a
   separate tab.
5. Open chat and compare tenant/user/thread state.
6. Run password reset for the shared email on tenant A and tenant B if safe.

Expected:

- Same email is scoped by tenant.
- Tenant A and tenant B sessions, portal users, contact links, chat cache,
  reset flows and outbox records stay separate.
- Password reset affects only the tenant where the flow was initiated.

FAIL:

- Same email logs into the wrong tenant identity.
- Tenant A reset changes tenant B credentials or session state.
- Cached chat/outbox/settings cross between same-email users.

### LCT-12. Tenant Disabled Or Misconfigured

Type: Negative configuration
Risk: High
Can be automated: Later

MCP/admin steps:

1. In local/staging only, disable a test tenant or use a tenant fixture with
   inactive status.
2. Open root URL, `/api/tenant`, auth route and `/app/chat`.
3. Restore active status.
4. Repeat with controlled misconfigurations where safe: missing Chatwoot token,
   wrong portal inbox, wrong Chatwoot account, missing webhook secret.

Expected:

- Inactive tenant fails closed with controlled tenant unavailable state.
- Misconfigured chat runtime fails current tenant only.
- No route falls back to `default` or another tenant's Chatwoot config.
- Restoring config lets the tenant recover without clearing unrelated tenants.

FAIL:

- Disabled tenant opens app shell or chat.
- Misconfigured tenant uses another tenant account/inbox/token.
- Unknown/inactive host falls back to default tenant.

### LCT-13. Webhook Signature And Account Boundary

Type: Negative webhook/realtime
Risk: High
Can be automated: Yes

MCP/API steps:

1. Prepare a valid webhook payload for tenant A.
2. Send it to tenant A webhook URL with wrong signature.
3. Send it with tenant B signature or host if the local harness supports that.
4. Send a signed payload whose account/inbox does not match current tenant.
5. Keep tenant chats open and observe realtime/push effects.

Expected:

- Wrong signature is rejected.
- Payload account/inbox mismatch is rejected.
- Rejected webhook does not create delivery bookkeeping, realtime events,
  unread markers or push notifications.
- Valid signed payload for the correct tenant still works after negative cases.

FAIL:

- Wrong-signature webhook mutates chat state.
- Account/inbox mismatch fanouts to any browser.
- Negative webhook breaks later valid webhook delivery.
