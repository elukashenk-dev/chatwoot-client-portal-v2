# F-SSE-001. Realtime Subscription Cap

- `status`: `open`
- `found_in`: Security & Production Hardening Review
- `risk`: `medium`
- `urgency`: before higher-traffic production usage or multi-instance realtime scaling
- `area`: backend SSE realtime, availability hardening
- `evidence`:
  - `backend/src/modules/chat-realtime/routes.ts` authenticates the SSE endpoint and cleans up subscriptions on socket close, but every accepted request creates a dedicated subscription plus a 25 second keepalive timer.
  - `backend/src/modules/chat-realtime/hub.ts` stores subscriptions in an in-memory `Map<string, Set<RealtimeSubscription>>` keyed by tenant, user and conversation, and `subscribe()` adds to the `Set` without a per-user, per-conversation or global cap.
  - `backend/src/modules/auth/rateLimit.ts` rate-limits public auth routes only; `/api/chat/realtime` is not rate-limited.
  - Production nginx currently keeps proxied connections open with `proxy_read_timeout 3600s` and `proxy_send_timeout 3600s`.
- `fix_short`: Add a small per-user/per-conversation SSE connection cap, and optionally a global process cap, returning `429` or replacing the oldest subscription when the cap is exceeded.
- `acceptance`:
  - Authenticated users cannot create unbounded concurrent SSE subscriptions for the same tenant/user/conversation.
  - Normal browser behavior still allows the active chat connection and reconnect flow.
  - Disconnect cleanup continues to remove subscriptions and timers.
  - Backend tests cover accepted, capped and cleanup cases.
