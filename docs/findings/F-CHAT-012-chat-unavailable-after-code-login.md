# F-CHAT-012: Chat unavailable after successful email-code login

- `status`: `open`
- `found_in`: production customer report after successful email-code login; identifying customer data remains in the private support conversation and is intentionally not committed
- `risk`: `high`
- `urgency`: complete the controlled production cutover and customer-path smoke before closing; the failure blocks the portal's primary chat workflow for an affected customer
- `area`: customer authentication handoff, initial chat bootstrap, private-thread context and support-service integration
- `confidence`: `high`; the affected ordinary contact was missing the formerly required person-type value, and the new backend, frontend and browser regressions cover that failure class without customer data
- `evidence`: the production report confirms the post-login unavailable state; the approved checkbox design, strict backend contract tests, full email-code integration, frontend error classification tests and local Chromium regression now reproduce and protect the confirmed boundary
- `fix_short`: treat an eligible contact as an ordinary person unless `portal_is_group=true`, require the checkbox only for groups, provision that checkbox definition, preserve specific configuration errors in the UI, then complete the production cutover and smoke
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

## Confirmed Root Cause

The affected eligible ordinary Chatwoot contact did not have the old mandatory
person-type value. The previous backend contract required that value even
though ordinary customers are the default case. It therefore rejected the
contact during thread bootstrap, and the frontend collapsed that configuration
error into the generic support-service unavailable screen.

The approved replacement contract is:

- ordinary customer: `portal_enabled=true`; `portal_is_group` absent or
  boolean `false`;
- group contact: `portal_enabled=true`; `portal_is_group=true`;
- non-boolean `portal_is_group`: fail closed with
  `portal_is_group_invalid`;
- referenced group without the flag: fail closed with
  `portal_group_flag_required`.

No affected email, name, tenant secret or message data is stored in this
finding.

## Local Fix Evidence

- `docs/superpowers/specs/2026-07-15-portal-group-checkbox-design.md` records
  the approved ordinary-by-default and explicit-group checkbox contract.
- `backend/src/modules/chat-threads/contactAttributes.test.ts` covers absent,
  false, true and invalid `portal_is_group` values plus person/group mismatch
  errors.
- `backend/src/app-passwordless-login.integration.test.ts` covers email-code
  request, verification, legal acceptance, session creation, thread bootstrap
  and the supported first-conversation state for an ordinary contact without a
  group flag.
- `frontend/src/features/chat/pages/chatBootstrapErrorReason.test.ts` and
  `frontend/src/features/chat/pages/ChatPage.test.tsx` distinguish contact
  configuration failures from retryable network/upstream failures.
- `tests/e2e/chat-code-login-bootstrap.spec.ts` proves the full local browser
  path from a real Chatwoot contact with only `portal_enabled=true` through
  Mailpit code login to the private first-message composer.

## Remaining Production Closure

1. After separate production approval, run the updated attribute-definition
   ensure command for the selected tenant.
2. Mark only the already-known configured group contacts with
   `portal_is_group=true`; do not run an unbounded contact scan.
3. Deploy the reviewed portal runtime only after those group flags are ready.
4. Smoke an ordinary contact and each configured group through the approved
   operator workflow without copying customer data into logs or repository
   files.
5. Confirm transient upstream failures still retain the retry action, while
   configuration failures show the non-retryable support instruction.

## Load Impact

The fix must not add unbounded upstream contact/conversation scans, repeated
bootstrap fan-out or writes on every retry. Any recovery lookup must remain
tenant-scoped, indexed or strictly bounded, and retries must use the existing
request budget/backoff model.

## Fix Short

The local branch replaces the mandatory person-type field with an explicit
group checkbox, defaults absent/false to an ordinary customer, rejects invalid
values, provisions the new definition, preserves configuration-specific UI
reasoning and adds backend/frontend/browser regressions. Production deployment,
group-contact cutover and customer-path smoke remain intentionally pending.

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
