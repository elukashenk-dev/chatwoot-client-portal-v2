# F-CHAT-SEC-001. Authenticated Chat Send Rate Limit

- `status`: `open`
- `found_in`: F-SSE-001 manual validation follow-up
- `risk`: `medium`
- `urgency`: before higher-traffic production usage or public rollout beyond trusted users
- `area`: backend chat messages, authenticated send/attachment abuse, Chatwoot outbound protection
- `evidence`:
  - `backend/src/modules/chat-messages/routes.ts` protects text and attachment send routes with authenticated user and tenant/chat boundaries, but does not apply a per-user send rate limit.
  - `backend/src/modules/auth/rateLimit.ts` currently rate-limits public auth routes only; it does not cover authenticated chat send endpoints.
  - `backend/src/modules/chat-messages/service.ts` uses `clientMessageKey` send ledger idempotency, which prevents duplicate processing for repeated keys but does not limit a script that sends many unique keys.
  - `F-SSE-001` caps long-lived realtime subscriptions, but `POST /api/chat/messages` and `POST /api/chat/messages/attachment` remain separate request/Chatwoot outbound paths.
- `fix_short`: Add authenticated per tenant/user/conversation rate limiting for text sends and attachment sends, returning controlled `429` responses without changing normal chat UX.
- `acceptance`:
  - Authenticated users cannot send unbounded text messages with unique `clientMessageKey` values in a short window for the same tenant/user/conversation.
  - Attachment sends have a stricter or separate limit from text sends.
  - Normal manual usage from phone and laptop remains unaffected.
  - Exceeded limits return a safe `429` error before Chatwoot outbound work starts.
  - Backend tests cover allowed sends, capped sends, per-user/per-conversation isolation, and reset after the configured window.
