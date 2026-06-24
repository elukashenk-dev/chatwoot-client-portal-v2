---
status: open
found_in: chat/PWA recovery audit
risk: medium
urgency: fix before treating degraded-network recovery as complete
area: frontend chat recovery, foreground refresh, attachment/background send
---

# F-CHAT-009 Recovery Requests Can Hang On Half-Open Connections

## Evidence

- `frontend/src/features/chat/api/chatClient.ts` supports an optional
  `AbortSignal`, but the shared request helper does not create a default
  timeout. Calls without a signal can wait until the browser or OS eventually
  fails the fetch.
- Startup chat loading and thread switching are protected because
  `frontend/src/features/chat/pages/useChatThreadSelection.ts` passes a
  `BOOT_REQUEST_TIMEOUT_MS` signal to `getChatThreads` and `getChatMessages`.
- Active-tab text outbox drain is protected on
  `fix/chat-recovery-request-timeouts`: `drainOfflineTextOutbox` creates a
  bounded send timeout and passes it through `sendChatMessage`.
- Remaining recovery paths call chat APIs without an explicit timeout:
  - `frontend/src/features/chat/pages/useChatSnapshotRefresh.ts` calls
    `getChatMessages({ threadId })` during online/resume and realtime health
    fallback refresh.
  - `frontend/src/features/chat/pages/useChatForegroundUnreadRefresh.ts` calls
    `getChatThreads()` for focus/visibility/interval unread refresh.
  - `frontend/src/features/chat/pages/useChatPushStaleMarkerRefresh.ts` calls
    `getChatMessages({ threadId })` while consuming selected-thread stale push
    markers.
  - `frontend/src/features/chat/pages/useChatOlderMessages.ts` calls
    `getChatMessages({ beforeMessageId, threadId })` while loading older
    history from an already-open chat.
  - `frontend/src/features/chat/pages/useChatSupportAvailability.ts` polls
    `getChatSupportAvailability()` while the chat is ready and considered
    online.
  - `frontend/src/features/chat/pages/useChatAttachmentSend.ts` calls
    `sendChatAttachment` without a request timeout.
  - `frontend/public/sw.js` background outbox sync calls
    `fetch('/api/chat/messages')` without a request timeout when no visible
    portal client is handling sends.
- Existing tests cover hanging startup requests, offline startup, reconnect
  after explicit offline/online events, request-detected offline recovery
  without a new browser `online` event, stale sending lease recovery, and
  realtime health fallback. They do not cover a half-open recovery request that
  never resolves after the app is already open.

## Risk

On slow or half-open mobile networks, a recovery request can stay in-flight
instead of quickly becoming a controlled network failure:

- resume/realtime fallback can leave the UI in `resyncing` or silently keep stale
  data longer than intended;
- foreground unread refresh can skip later refreshes while `isRefreshingRef`
  remains true;
- selected-thread stale-marker refresh can keep markers pending while the
  refresh promise is stuck;
- older-history loading can leave the history loader spinning instead of
  falling back to cached older pages;
- support availability polling can leave loading state stale and keep later
  polls racing against an unresolved request;
- attachment send can leave the composer in sending state for an unbounded time;
- background sync can keep a service worker sync event waiting on a half-open
  send instead of quickly returning the record to retry.

## fix_short

Introduce bounded request timeouts for non-startup recovery operations. Keep
startup deadlines separate, but ensure snapshot refresh, unread refresh,
selected stale-marker refresh, older-history load, support availability polling,
background text outbox sends and attachment sends either complete or convert to
the existing controlled failure/retry path within a defined window.

## acceptance

- Tests cover a never-resolving recovery `getChatMessages` request and verify
  the app exits the in-flight recovery state.
- Tests cover a never-resolving foreground unread refresh and verify later
  refresh attempts are not permanently blocked.
- Tests cover a never-resolving selected-thread stale-marker refresh and verify
  the marker remains retryable without blocking later recovery.
- Tests cover a never-resolving older-history request and verify cached older
  pages or a controlled error state replaces the spinner.
- Tests cover a never-resolving support availability poll and verify later polls
  are not permanently blocked.
- Tests cover a never-resolving attachment send and verify the composer leaves
  sending state with a controlled error/offline state.
- Tests cover a never-resolving background text outbox send and verify the
  record returns to retryable queued/sending-expired behavior.
- Existing startup offline, cold installed launch and text outbox e2e coverage
  still passes.
