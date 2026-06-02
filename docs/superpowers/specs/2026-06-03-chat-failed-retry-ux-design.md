# Chat Failed Retry UX Design

## Goal

Make failed local text messages understandable after the outbox starts
classifying permanent and temporary send errors.

The user can only retry sending the same local text message. The portal must
not add delete, edit, or "fix message" actions in this slice.

## Current Baseline

- Text messages are stored in the local durable outbox before send.
- Outbox records can be `queued`, `sending`, or `failed`.
- Failed text bubbles already render a `Повторить` button.
- `retryFailedOfflineTextOutboxRecord()` changes the same local outbox record
  from `failed` back to `queued`, clears local error metadata, preserves the
  same `clientMessageKey`, and registers background sync.
- There is no user-facing delete/edit mechanism for chat messages or local
  outbox messages by product decision.

## Problem

After permanent error classification, not every `failed` message should invite
the same retry action.

Examples:

- `thread_access_denied`: retrying the same message is useful only if access
  was restored later.
- `message_content_too_long`: retrying the exact same text is not useful,
  because the backend will reject it again.
- `reply_target_unavailable`: retrying the exact same message can keep failing
  because the reply target is no longer valid.

The UI should not imply that the user can edit or remove the failed bubble. It
should also not encourage repeated retry loops for errors where the same record
cannot succeed.

## Decision

Use one local rule for failed text retry availability.

Retry button is shown only for failed text sends whose `errorCode` is retryable.
The retry action always reuses the same local outbox record and the same
`clientMessageKey`.

Non-retryable failed text sends stay visible as local failed bubbles with the
status icon and a short explanatory text. They do not show a retry button.

## Retryable And Non-Retryable Rules

Retryable failed errors:

- `thread_access_denied`
- unknown/null error code

Non-retryable failed errors:

- `INVALID_REQUEST`
- `chat_thread_unsupported`
- `client_message_key_conflict`
- `client_message_key_required`
- `client_message_key_too_long`
- `message_content_required`
- `message_content_too_long`
- `reply_target_invalid`
- `reply_target_unavailable`

Rationale:

- Access errors can become valid later if the user regains chat access.
- Unknown/null codes stay retryable because older local records and generic
  failed records should not become dead without an obvious reason.
- Validation, key, content, and invalid reply errors are not retryable because
  sending the exact same record is expected to fail again.

## UI Copy

Retryable failed text send:

- status icon label: `Не отправлено`
- action button: `Повторить`
- when offline: disabled action text remains `Нет сети`

Non-retryable failed text send:

- status icon label: `Не отправлено`
- no action button
- helper text under the bubble:
  - `Сообщение нельзя отправить повторно. Напишите новое.`

The copy intentionally says "write a new message" instead of offering edit or
delete actions.

## Architecture

Add a small chat-domain helper:

- `frontend/src/features/chat/lib/failedTextRetry.ts`

Responsibilities:

- decide whether a failed text send can be retried from `errorCode`;
- keep non-retryable code lists close to chat UI behavior;
- stay independent from IndexedDB and network code.

Update optimistic text mapping:

- preserve `errorCode` from `OfflineTextOutboxRecord` in
  `OptimisticTextSend`;
- expose `errorCode` in local optimistic `ChatMessage` objects.

Update `MessageBubble`:

- failed local text sends with retryable `errorCode` render the existing retry
  button;
- failed local text sends with non-retryable `errorCode` render helper text and
  no retry button.

No backend changes are required.

## Tests

Required targeted tests:

- helper unit tests for retryable/non-retryable error codes;
- optimistic outbox hydration preserves `errorCode`;
- chat page renders `Повторить` for retryable failed records;
- chat page hides `Повторить` and shows helper text for non-retryable failed
  records;
- existing retry test must keep passing and prove retry uses the outbox drain
  path.

## Out Of Scope

- deleting failed local messages;
- editing failed local messages;
- creating a new corrected message from the old failed message;
- backend delivered/read receipt work;
- changing attachment or voice send behavior.
