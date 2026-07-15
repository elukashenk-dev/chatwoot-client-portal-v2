# F-CHAT-012: Chat unavailable after successful email-code login

- `status`: `open`
- `found_in`: production customer report after successful email-code login; identifying customer data remains in the private support conversation and is intentionally not committed
- `risk`: `high`
- `urgency`: investigate in the next bugfix slice; the failure blocks the portal's primary chat workflow for an affected customer
- `area`: customer authentication handoff, initial chat bootstrap, private-thread context and support-service integration
- `confidence`: `high` that the customer-facing failure occurred; `low` on the root cause until production requests and logs are correlated
- `evidence`: a production customer report confirms the post-login unavailable state; the initial source trace reaches the thread/message bootstrap and support-service integration boundaries described below, but does not yet establish the root cause
- `fix_short`: correlate the failed production bootstrap boundary, add focused regression coverage, fix that transition, and preserve a specific internal failure reason without exposing customer data
- `acceptance`: the affected class of eligible customers can open the correct chat after email-code login, the confirmed root cause has focused automated coverage, transient upstream recovery remains retryable, and the fix adds no cross-tenant or unbounded recovery work

## Observed Behavior

An existing customer successfully confirms the email code and reaches the chat
screen, but the conversation does not open. The screen shows:

- header state `Соединение...`;
- `Чат временно недоступен`;
- `Мы не смогли получить состояние переписки из сервиса поддержки`;
- a `Повторить` action;
- no transcript or usable composer.

The report demonstrates that authentication advanced far enough to render the
authenticated chat shell. It does not by itself identify which bootstrap
request or integration operation failed.

## Expected Behavior

After a valid email-code login, an eligible existing contact must enter the
authenticated customer session and open an accessible chat. An existing
conversation should show its history; an eligible contact without a
conversation should receive the supported empty/new-conversation state rather
than a generic unavailable screen.

## Evidence

- `frontend/src/features/chat/pages/useChatThreadSelection.ts`: initial chat
  bootstrap loads `/api/chat/threads` and then `/api/chat/messages`; without a
  usable cache, any non-auth failure ends in `pageState.status = 'error'`.
- `frontend/src/features/chat/pages/ChatPage.tsx`: an error state is rendered as
  `ChatNotReadyState` with the fallback reason `chatwoot_unavailable`, even when
  no backend snapshot supplied that reason.
- `frontend/src/features/chat/components/ChatNotReadyState.tsx`: the observed
  production copy corresponds to `chatwoot_unavailable`.
- `backend/src/modules/chat-messages/service.ts`: support-service configuration
  and request errors while resolving or reading the selected conversation are
  converted to an `unavailable` chat snapshot.
- The screenshot contains no request status, backend error code, correlation ID
  or reliable distinction between a thread-list failure, message-bootstrap
  failure, timeout, and an explicit backend `unavailable` result.

## Investigation Scope

1. Reproduce the email-code login with the affected production account through
   an approved operator workflow; do not copy personal data into logs, tests or
   repository files.
2. Correlate the login redirect with responses for `/api/chat/threads` and
   `/api/chat/messages?threadId=...`, including status codes, response reason,
   request timing and backend structured logs.
3. Verify the tenant-scoped portal user/contact link, inbox eligibility,
   private-thread mapping and upstream conversation for the affected account.
4. Determine whether the failure is account-specific, tenant-wide or a
   transient support-service request failure.
5. Confirm whether `Повторить` recovers after the upstream dependency is
   healthy and whether a fresh browser session changes the result.

## Suspected Boundaries, Not Conclusions

- contact or inbox resolution after clean portal reprovisioning;
- stale or incomplete private-thread/conversation mapping;
- an upstream API request rejected or timed out while building the thread
  context or loading history;
- a frontend bootstrap failure that is mislabeled as
  `chatwoot_unavailable` because the real error reason is discarded.

## Load Impact

The fix must not add unbounded upstream contact/conversation scans, repeated
bootstrap fan-out or writes on every retry. Any recovery lookup must remain
tenant-scoped, indexed or strictly bounded, and retries must use the existing
request budget/backoff model.

## Fix Short

Identify the exact failed bootstrap boundary from production telemetry, add a
targeted regression test for that failure path, and fix the responsible
contact/thread/integration transition. Preserve a specific machine-readable
failure reason through the frontend so future incidents are diagnosable without
exposing customer data.

## Acceptance

- The affected class of eligible existing customers can complete email-code
  login and open the correct private chat without operator intervention.
- Existing history is displayed when a conversation exists; the supported
  new-conversation state is displayed when it does not.
- The confirmed root cause has focused automated coverage at the responsible
  service/API and frontend bootstrap boundary.
- A transient upstream outage remains retryable and does not require another
  login after service recovery.
- Bootstrap failures retain a specific internal reason/correlation path while
  the customer sees neutral, actionable copy and no internal product names.
- The fix introduces no cross-tenant lookup, unbounded scan, duplicate external
  request fan-out or per-retry write amplification.
