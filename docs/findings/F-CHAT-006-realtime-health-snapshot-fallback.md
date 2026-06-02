# F-CHAT-006 Realtime Health Snapshot Fallback

- `status`: `open`
- `found_in`: chat message reliability follow-up review
- `risk`: `medium`
- `urgency`: before claiming message receive reliability is production-grade
- `area`: frontend chat realtime, snapshot refresh, backend realtime fanout
- `evidence`:
  - `frontend/src/features/chat/pages/useChatRealtimeConnection.ts` consumes SSE
    snapshots and marks chat online when events arrive.
  - `frontend/src/features/chat/lib/useChatResumeResync.ts` refreshes the active
    snapshot on browser `online` and foreground `visibilitychange`.
  - `frontend/src/features/chat/pages/useChatSnapshotRefresh.ts` can fetch a
    bounded latest snapshot, but there is no dedicated realtime health monitor
    that detects a silent or half-open `EventSource` while the app remains
    visible.
  - A broken mobile network/VPN can leave `navigator.onLine === true` while
    realtime is no longer delivering messages.
- `fix_short`: Add bounded realtime health fallback: track last realtime
  activity/open time, detect stale visible connections, and refresh the active
  thread snapshot on a capped interval until realtime recovers.
- `acceptance`:
  - If realtime events stop while the app is visible and backend requests still
    work, the active thread eventually refreshes from `/api/chat/messages`.
  - Fallback refresh is bounded and does not poll aggressively during normal
    realtime operation, hidden tabs, offline state, or unavailable backend.
  - Incoming messages are not duplicated when a fallback snapshot and realtime
    event arrive close together.
  - Connection UI can show `Соединение...`, `Нет связи`, or normal online state
    honestly without depending only on `navigator.onLine`.
  - Tests cover stale realtime, recovery, hidden app, and duplicate merge cases.
