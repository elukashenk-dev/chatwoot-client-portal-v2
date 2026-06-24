# Chat Recovery Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the chat network-recovery work after restoring the narrow reconnect probe from `7d9046f`, without changing unrelated PWA cache, auth, UI, or Chatwoot authority boundaries.

**Architecture:** The portal backend remains the only authority for chat send, session, and realtime. `navigator.onLine` is only a hint. Chat online/offline state must be proven by backend fetch/SSE outcomes. Recovery requests must be bounded so a half-open mobile connection cannot keep chat recovery stuck forever.

**Tech Stack:** React, TypeScript, Vitest/jsdom, Playwright e2e, Vite, portal service worker, IndexedDB offline stores.

---

## Current State After Closure

Restored and preserved behavior:

- The chat page now has a selected-thread reconnect probe in `frontend/src/features/chat/pages/useChatReconnectProbe.ts`.
- When chat is marked offline but the browser hint is online, the probe periodically calls `refreshChatSnapshot()` and drains queued text only after a successful backend snapshot refresh.
- When the selected thread has queued text, the probe can recover even if no fresh browser `online` event arrives.
- The existing explicit `online` event drain path still exists in `frontend/src/features/chat/pages/ChatPage.tsx`.
- The existing realtime-stale snapshot fallback still exists in `frontend/src/features/chat/pages/useChatRealtimeHealthFallback.ts`.
- Same-user, same-tenant outbox network failures from non-selected threads now mark chat offline without hydrating those non-selected messages into the selected transcript. This closes `F-CHAT-010`.
- The port did not bring back the broad old branch changes from `7d9046f`; it restored the narrow idea: "retry recovery based on real backend reachability, not only `window.online`."
- `F-CHAT-009` is closed: non-startup chat recovery requests, attachment sends
  and service-worker background text sends now use bounded abort signals.
- `F-CHAT-011` is closed: service-worker background text recovery now has a
  deterministic real-network e2e smoke with a real same-origin network failure.

What remains outside this scope:

- Attachment send remains online-only and outside the restored text outbox
  probe.
- Avatar/media cacheability is a separate PWA finding and must not be mixed into this task.

---

## Port Review Of `7d9046f`

Scope that was intentionally ported:

- A reconnect loop driven by request success/failure rather than trusting `navigator.onLine`.
- Backoff retries while the selected chat remains offline.
- Immediate retry opportunities on focus and visibility changes.
- Outbox drain only after a successful snapshot proves backend reachability.

Scope that was intentionally not ported:

- No broad service-worker rewrite.
- No startup auth/cache format changes.
- No avatar/media cache changes.
- No attachment outbox changes.
- No router or installed PWA boot changes.
- No old compatibility fields or legacy storage readers.

Regression check from the port:

- `useChatSnapshotRefresh` now returns `Promise<boolean>` instead of `Promise<void>`, but current consumers either await it for truthy recovery or ignore the return value safely.
- `useChatReconnectProbe` is isolated in a new hook, so `ChatPage.tsx` only wires dependencies and keeps prior flows intact.
- `useChatOutboxDrainIntegration` now marks browser offline for network failures before the selected-thread hydration filter. This is intentional because network reachability is tenant/user-level state, while optimistic transcript hydration is selected-thread state.
- The residual `F-CHAT-009` risk was closed by adding bounded timeouts to the
  remaining non-startup recovery requests that can feed the reconnect probe.
- `ChatPage.tsx` is at the current code-health line-count allowlist. Future code additions should avoid growing that file further.

---

## Non-Goals

- Do not change chat bubble UI, branding previews, or CSS surfaces.
- Do not change offline auth lifetime.
- Do not change avatar or media cache strategy.
- Do not add backward-compatibility shims.
- Do not change Chatwoot core.
- Do not treat service-worker test gaps as fixed by page-level fetch mocks.

---

## Files

Primary implementation files:

- `frontend/src/features/chat/pages/chatRecoveryRequestTimeout.ts`
- `frontend/src/features/chat/pages/useChatSnapshotRefresh.ts`
- `frontend/src/features/chat/pages/useChatForegroundUnreadRefresh.ts`
- `frontend/src/features/chat/pages/useChatPushStaleMarkerRefresh.ts`
- `frontend/src/features/chat/pages/useChatOlderMessages.ts`
- `frontend/src/features/chat/pages/useChatSupportAvailability.ts`
- `frontend/src/features/chat/pages/useChatAttachmentSend.ts`
- `frontend/src/features/chat/api/chatClient.ts`
- `frontend/public/sw.js`

Primary tests:

- `frontend/src/features/chat/pages/chatRecoveryRequestTimeout.test.ts`
- `frontend/src/features/chat/pages/ChatPage.runtime.test.tsx`
- `frontend/src/features/chat/pages/useChatForegroundUnreadRefresh.test.tsx`
- `frontend/src/features/chat/pages/useChatPushStaleMarkerRefresh.test.tsx`
- `frontend/src/features/chat/pages/useChatOlderMessages.test.tsx`
- `frontend/src/features/chat/pages/useChatSupportAvailability.test.tsx`
- `frontend/src/features/chat/pages/ChatPage.history.test.tsx`
- `frontend/src/features/chat/pages/ChatPage.test.tsx`
- `frontend/src/features/chat/pages/ChatPage.media.test.tsx`
- `frontend/src/pwa/serviceWorkerBackgroundSync.test.ts`
- `tests/e2e/chat-background-sync-real-network.spec.ts`

Closed findings that defined acceptance:

- `docs/findings/F-CHAT-009-recovery-requests-without-timeout.md`
- `docs/findings/F-CHAT-011-background-sync-real-network-e2e-gap.md`

---

## Task 0: Tighten Restored-Port Regression Coverage

- [x] Update the existing reconnect-probe case in `frontend/src/features/chat/pages/ChatPage.runtime.test.tsx`.
- [x] Keep the current assertion that the failed POST is retried without a browser `online` event.
- [x] Add the old `7d9046f` assertion that the retry body is still for `threadId: 'private:me'`.
- [x] Add the old `7d9046f` assertion that the retried `clientMessageKey` no longer has a matching durable outbox record after successful drain.
- [x] Do not create a separate broad reconnect test file unless the runtime test becomes too large.

Verification command:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/ChatPage.runtime.test.tsx
```

Expected result:

```text
Test Files  1 passed
```

---

## Task 1: Add A Shared Chat Recovery Timeout Helper

- [x] Create `frontend/src/features/chat/pages/chatRecoveryRequestTimeout.ts`.
- [x] Reuse `createRequestTimeout` and `BOOT_REQUEST_TIMEOUT_MS` from `frontend/src/features/offline/bootCoordinator.ts`.
- [x] Export `CHAT_RECOVERY_REQUEST_TIMEOUT_MS`.
- [x] Export `withChatRecoveryRequestTimeout<T>(operation, timeoutMs?)`.
- [x] Always cancel the timeout in `finally`.
- [x] Do not swallow aborts in the helper. Callers decide whether timeout is a recoverable offline signal.

Implementation target:

```ts
import {
  BOOT_REQUEST_TIMEOUT_MS,
  createRequestTimeout,
} from '../../offline/bootCoordinator'

export const CHAT_RECOVERY_REQUEST_TIMEOUT_MS = BOOT_REQUEST_TIMEOUT_MS

export async function withChatRecoveryRequestTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = CHAT_RECOVERY_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const timeout = createRequestTimeout(timeoutMs)

  try {
    return await operation(timeout.signal)
  } finally {
    timeout.cancel()
  }
}
```

Test target:

- [x] Add `frontend/src/features/chat/pages/chatRecoveryRequestTimeout.test.ts`.
- [x] Verify the helper aborts a never-resolving operation after the configured timeout.
- [x] Verify `cancel()` prevents later abort after a fast success.

Verification command:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/chatRecoveryRequestTimeout.test.ts
```

Expected result:

```text
Test Files  1 passed
Tests       2 passed
```

---

## Task 2: Bound Snapshot Refresh And The Reconnect Probe

- [x] Update `frontend/src/features/chat/pages/useChatSnapshotRefresh.ts`.
- [x] Wrap `getChatMessages` with `withChatRecoveryRequestTimeout`.
- [x] Pass the timeout `signal` into `getChatMessages({ threadId, signal })`.
- [x] Preserve current return semantics:
  - `true` after a successful latest snapshot refresh;
  - `false` for aborted, auth-cleared, network-failed, or unmounted paths.
- [x] Do not change stale-thread semantics silently. Today a successful request can still resolve `true` even when the state updater ignores the snapshot because the selected thread changed; reconnect-probe cleanup currently prevents acting on stale effect results.
- [x] Keep existing cache refresh and `loadCachedSnapshot` behavior unchanged.

Test target:

- [x] Extend `frontend/src/features/chat/pages/ChatPage.runtime.test.tsx`.
- [x] Add a fake-timer case where `getChatMessages` never resolves, chat is offline, and the reconnect probe does not stay permanently blocked.
- [x] Verify the page remains mounted and can retry after the timeout window.

Verification command:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/ChatPage.runtime.test.tsx
```

Expected result:

```text
Test Files  1 passed
```

---

## Task 3: Bound Foreground Thread Recovery

- [x] Update `frontend/src/features/chat/pages/useChatForegroundUnreadRefresh.ts`.
- [x] Wrap `getChatThreads` with `withChatRecoveryRequestTimeout`.
- [x] Pass `getChatThreads({ signal })`.
- [x] Preserve existing stale marker cleanup behavior.
- [x] Preserve existing error handling that treats failed refresh as non-fatal.

Test target:

- [x] Extend `frontend/src/features/chat/pages/useChatForegroundUnreadRefresh.test.tsx`.
- [x] Add a fake-timer case where the first refresh hangs and times out.
- [x] Verify a later foreground refresh can still run.

Verification command:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/useChatForegroundUnreadRefresh.test.tsx
```

Expected result:

```text
Test Files  1 passed
```

---

## Task 4: Bound Secondary Chat Recovery Requests

- [x] Update `frontend/src/features/chat/pages/useChatPushStaleMarkerRefresh.ts`.
- [x] Wrap `getChatMessages({ threadId, signal })`.
- [x] Extend `frontend/src/features/chat/pages/useChatPushStaleMarkerRefresh.test.tsx` with a timeout/hang case.

- [x] Update `frontend/src/features/chat/pages/useChatOlderMessages.ts`.
- [x] Wrap `getChatMessages({ beforeMessageId, threadId, signal })`.
- [x] Extend `frontend/src/features/chat/pages/useChatOlderMessages.test.tsx` with a timeout/hang case that clears the loading state and keeps the page usable.

- [x] Update `frontend/src/features/chat/api/chatClient.ts`.
- [x] Change `getChatSupportAvailability()` to accept an optional `{ signal?: AbortSignal }` parameter.
- [x] Update `frontend/src/features/chat/pages/useChatSupportAvailability.ts`.
- [x] Wrap `getChatSupportAvailability({ signal })`.
- [x] Extend `frontend/src/features/chat/pages/useChatSupportAvailability.test.tsx` with a timeout/hang case.

Verification commands:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/useChatPushStaleMarkerRefresh.test.tsx
pnpm --dir frontend exec vitest run src/features/chat/pages/useChatOlderMessages.test.tsx src/features/chat/pages/ChatPage.history.test.tsx
pnpm --dir frontend exec vitest run src/features/chat/pages/useChatSupportAvailability.test.tsx
```

Expected result:

```text
Test Files passed for each command
```

---

## Task 5: Bound Attachment Send Without Changing Attachment Offline Semantics

- [x] Update `frontend/src/features/chat/api/chatClient.ts`.
- [x] Add an optional `signal?: AbortSignal` argument to `sendChatAttachment`.
- [x] Keep attachment send online-only.
- [x] Do not add attachment records to the durable text outbox.
- [x] Update `frontend/src/features/chat/pages/useChatAttachmentSend.ts`.
- [x] Wrap `sendChatAttachment(..., signal)` with `withChatRecoveryRequestTimeout`.
- [x] Preserve current user-facing error path for failed attachment sends.

Test target:

- [x] Extend `frontend/src/features/chat/pages/ChatPage.test.tsx`.
- [x] Add a timeout case where attachment send hangs and then exits the sending state after timeout.
- [x] Verify the failed attachment is not queued into the text outbox.

Verification command:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/ChatPage.media.test.tsx
```

Expected result:

```text
Test Files  1 passed
```

---

## Task 6: Bound Service-Worker Background Text Send

- [x] Update `frontend/public/sw.js`.
- [x] Add a local service-worker timeout helper using `AbortController` and `setTimeout`.
- [x] Do not use `AbortSignal.timeout()` because service-worker browser support is less explicit than plain `AbortController`.
- [x] Use the timeout signal for the `/api/chat/messages` fetch inside background text send.
- [x] Preserve current permanent/temporary/auth error classification.
- [x] Preserve the existing retryable queued-record behavior after temporary failures.

Implementation target:

```js
const TEXT_OUTBOX_BACKGROUND_SEND_TIMEOUT_MS = 10000

async function withBackgroundSendTimeout(operation) {
  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    TEXT_OUTBOX_BACKGROUND_SEND_TIMEOUT_MS,
  )

  try {
    return await operation(controller.signal)
  } finally {
    clearTimeout(timeoutId)
  }
}
```

Test target:

- [x] Extend `frontend/src/pwa/serviceWorkerBackgroundSync.test.ts`.
- [x] Add a deterministic short-timeout harness case where `fetch('/api/chat/messages')` never resolves.
- [x] Verify the background sync promise settles after timeout.
- [x] Verify the outbox record remains retryable and is not marked permanent.

Verification command:

```bash
pnpm --dir frontend exec vitest run src/pwa/serviceWorkerBackgroundSync.test.ts
```

Expected result:

```text
Test Files  1 passed
```

---

## Task 7: Close The Real-Network Background Sync E2E Gap

- [x] Inspect the current Playwright PWA harness in `tests/e2e/offline-first-pwa.spec.ts` and `tests/e2e/support/offlinePwaStorage.ts`.
- [x] Add a focused real-network background-sync scenario either in `tests/e2e/offline-first-pwa.spec.ts` or a new `tests/e2e/chat-background-sync-real-network.spec.ts`.
- [x] The scenario must not rely only on `window.fetch` mocks, because those do not prove service-worker fetch behavior.
- [x] The scenario must make the service worker experience a real same-origin API network failure or controlled server unavailability.
- [x] Deterministic same-origin API toggling exists in the new smoke, so no blocker was added to `docs/findings/F-CHAT-011-background-sync-real-network-e2e-gap.md`.
- [x] If deterministic infrastructure exists or is added in this task, verify that:
  - queued text remains durable after service-worker background send fails;
  - no page-level online event is required for the next recovery attempt;
  - once backend reachability returns, background or foreground recovery sends the queued text;
  - the message appears in the selected chat without duplicate optimistic records.

Implemented as `tests/e2e/chat-background-sync-real-network.spec.ts`. The smoke
serves the production build from `frontend/dist`, uses a local same-origin
runtime server with a deterministic `/api/chat/messages` network gate, closes
visible portal clients, triggers the real service worker drain path from the
service worker context, and verifies queued durability plus one successful send
after the gate reopens.

Verification command when implemented:

```bash
pnpm exec playwright test tests/e2e/offline-first-pwa.spec.ts --project=chromium
```

or:

```bash
pnpm exec playwright test tests/e2e/chat-background-sync-real-network.spec.ts --project=chromium
```

Expected result:

```text
1 passed
```

---

## Task 8: Findings Cleanup And Full Verification

- [x] Delete `docs/findings/F-CHAT-009-recovery-requests-without-timeout.md` only after Tasks 1-6 are implemented and targeted tests pass.
- [x] Delete `docs/findings/F-CHAT-011-background-sync-real-network-e2e-gap.md` only after Task 7 has a deterministic real-network e2e or equivalent approved runtime smoke and it passes.
- [x] Update `docs/roadmap/work-log.md` only if the completed work changes the stable chat recovery baseline.
- [x] Keep a single `Recommended Next Step` block at the end of `docs/roadmap/work-log.md`.
- [x] Run targeted tests from Tasks 1-7.
- [x] Run the required closure commands.

Closure commands:

```bash
pnpm --dir frontend test
pnpm --dir frontend typecheck
pnpm lint
pnpm build
git diff --check
```

Expected result:

```text
All commands pass.
```

---

## Self-Review

Important constraints this plan preserves:

- It closes recovery reliability in bounded slices instead of rewriting the PWA subsystem.
- It keeps `navigator.onLine` as a hint and uses backend request outcomes as the source of truth.
- It keeps selected-thread transcript hydration separate from tenant/user-level network state.
- It does not treat page-level fetch mocks as enough coverage for service-worker background sync.
- It does not mix avatar/media cacheability work into chat send/recovery hardening.

Main risk to watch during implementation:

- Adding timeouts in many hooks can accidentally change non-fatal error UX. Tests must verify that timeout exits stuck states without introducing noisy errors or deleting durable queued text.
