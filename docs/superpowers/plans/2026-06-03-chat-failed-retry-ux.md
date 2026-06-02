# Chat Failed Retry UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show retry only for failed local text messages where retrying the same outbox record can reasonably help.

**Architecture:** Add a small chat-domain helper that decides retry availability from `errorCode`. Preserve `errorCode` from outbox records through optimistic text sends into local `ChatMessage` objects, then let `MessageBubble` choose between the existing `Повторить` button and a non-retryable helper text.

**Tech Stack:** React 19, TypeScript, Vitest, fake IndexedDB-backed chat tests, existing durable text outbox.

---

## File Structure

- Create: `frontend/src/features/chat/lib/failedTextRetry.ts`
  - Pure helper for failed text retry eligibility.
- Create: `frontend/src/features/chat/lib/failedTextRetry.test.ts`
  - Unit tests for retryable and non-retryable error codes.
- Modify: `frontend/src/features/chat/lib/optimisticTextMessages.ts`
  - Add `errorCode` to optimistic text sends and local optimistic `ChatMessage`.
- Modify: `frontend/src/features/chat/types.ts`
  - Allow local optimistic `ChatMessage` objects to carry optional `errorCode`.
- Modify: `frontend/src/features/chat/pages/useOptimisticTextSend.ts`
  - Preserve `OfflineTextOutboxRecord.errorCode` during hydration and clear it on retry.
- Modify: `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
  - Hide `Повторить` for non-retryable failed text sends and show helper copy.
- Modify: `frontend/src/features/chat/pages/ChatPage.optimistic-send.test.tsx`
  - Add UI regression coverage for retryable and non-retryable failed bubbles.

## Task 1: Failed Retry Helper

**Files:**
- Create: `frontend/src/features/chat/lib/failedTextRetry.test.ts`
- Create: `frontend/src/features/chat/lib/failedTextRetry.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `frontend/src/features/chat/lib/failedTextRetry.test.ts`:

```ts
import { expect, it } from 'vitest'

import { canRetryFailedTextSend } from './failedTextRetry'

it.each([null, undefined, 'thread_access_denied'])(
  'allows retry for failed text error code %s',
  (errorCode) => {
    expect(canRetryFailedTextSend(errorCode)).toBe(true)
  },
)

it.each([
  'INVALID_REQUEST',
  'chat_thread_unsupported',
  'client_message_key_conflict',
  'client_message_key_required',
  'client_message_key_too_long',
  'message_content_required',
  'message_content_too_long',
  'reply_target_invalid',
  'reply_target_unavailable',
])('hides retry for non-retryable failed text error code %s', (errorCode) => {
  expect(canRetryFailedTextSend(errorCode)).toBe(false)
})
```

- [ ] **Step 2: Run the helper test and verify RED**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/lib/failedTextRetry.test.ts
```

Expected: FAIL because `./failedTextRetry` does not exist.

- [ ] **Step 3: Implement the helper**

Create `frontend/src/features/chat/lib/failedTextRetry.ts`:

```ts
const NON_RETRYABLE_FAILED_TEXT_SEND_ERROR_CODES = new Set([
  'INVALID_REQUEST',
  'chat_thread_unsupported',
  'client_message_key_conflict',
  'client_message_key_required',
  'client_message_key_too_long',
  'message_content_required',
  'message_content_too_long',
  'reply_target_invalid',
  'reply_target_unavailable',
])

export function canRetryFailedTextSend(errorCode?: string | null) {
  if (!errorCode) {
    return true
  }

  return !NON_RETRYABLE_FAILED_TEXT_SEND_ERROR_CODES.has(errorCode)
}
```

- [ ] **Step 4: Run the helper test and verify GREEN**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/lib/failedTextRetry.test.ts
```

Expected: PASS.

## Task 2: Preserve Failed Error Code In Local Messages

**Files:**
- Modify: `frontend/src/features/chat/types.ts`
- Modify: `frontend/src/features/chat/lib/optimisticTextMessages.ts`
- Modify: `frontend/src/features/chat/pages/useOptimisticTextSend.ts`
- Test: `frontend/src/features/chat/pages/ChatPage.optimistic-send.test.tsx`

- [ ] **Step 1: Write a failing UI test for non-retryable failed text**

Add this test to `frontend/src/features/chat/pages/ChatPage.optimistic-send.test.tsx` near the existing failed outbox tests:

```tsx
it('hides retry for a failed text record that cannot be resent unchanged', async () => {
  await offlineOutboxStore.saveOutboxRecord(
    createOutboxRecord({
      clientMessageKey: 'portal-send:too-long',
      content: 'Too long to resend unchanged',
      errorCode: 'message_content_too_long',
      errorMessage: 'Сообщение слишком длинное.',
      status: 'failed',
    }),
  )

  fetchMock
    .mockResolvedValueOnce(createAuthenticatedUserResponse())
    .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
    .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
    .mockResolvedValueOnce(createNotificationSettingsResponse())
    .mockResolvedValueOnce(createSupportAvailabilityResponse())

  renderChatRoute()

  expect(
    await screen.findByText('Too long to resend unchanged'),
  ).toBeInTheDocument()
  await waitForInitialChatRequests()

  expect(screen.getByLabelText('Не отправлено')).toBeInTheDocument()
  expect(
    screen.getByText('Сообщение нельзя отправить повторно. Напишите новое.'),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the UI test and verify RED**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/ChatPage.optimistic-send.test.tsx --testNamePattern "hides retry for a failed text record that cannot be resent unchanged"
```

Expected: FAIL because the current failed bubble still renders `Повторить`.

- [ ] **Step 3: Preserve `errorCode` in optimistic text sends**

In `frontend/src/features/chat/types.ts`, add optional local metadata to
`ChatMessage`:

```ts
errorCode?: string | null
```

In `frontend/src/features/chat/lib/optimisticTextMessages.ts`, add `errorCode`:

```ts
export type OptimisticTextSend = {
  clientMessageKey: string
  content: string
  createdAt: string
  errorCode: string | null
  errorMessage: string | null
  id: number
  replyTo: ChatMessageReplyPreview | null
  replyToMessageId: number | null
  status: OptimisticTextSendStatus
  threadId: string
}
```

Set new sends to `errorCode: null` in `createOptimisticTextSend()`, and include it in `toOptimisticChatMessage()`:

```ts
errorCode: send.errorCode,
```

In `frontend/src/features/chat/pages/useOptimisticTextSend.ts`, update `toOptimisticTextSendFromOutboxRecord()`:

```ts
errorCode: record.errorCode,
```

When retrying a failed record, clear it in the optimistic send update:

```ts
errorCode: null,
errorMessage: null,
status: 'sending',
```

- [ ] **Step 4: Run the UI test again**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/ChatPage.optimistic-send.test.tsx --testNamePattern "hides retry for a failed text record that cannot be resent unchanged"
```

Expected: still FAIL until `MessageBubble` uses the helper.

## Task 3: Render Retry Only When Retryable

**Files:**
- Modify: `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
- Test: `frontend/src/features/chat/pages/ChatPage.optimistic-send.test.tsx`

- [ ] **Step 1: Update `RetryTextSend` rendering**

Import the helper:

```ts
import { canRetryFailedTextSend } from '../../lib/failedTextRetry'
```

In `RetryTextSend`, after the existing failed/local text guard, add:

```tsx
if (!canRetryFailedTextSend(message.errorCode)) {
  return (
    <p className="mt-1.5 max-w-64 text-right text-[11px] leading-snug text-rose-600">
      Сообщение нельзя отправить повторно. Напишите новое.
    </p>
  )
}
```

Keep the existing `Повторить` button unchanged for retryable failed records.

- [ ] **Step 2: Run the non-retryable UI test and verify GREEN**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/ChatPage.optimistic-send.test.tsx --testNamePattern "hides retry for a failed text record that cannot be resent unchanged"
```

Expected: PASS.

- [ ] **Step 3: Run the existing retry path test**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/ChatPage.optimistic-send.test.tsx --testNamePattern "retries a failed durable text record through the outbox drain path"
```

Expected: PASS. This confirms `thread_access_denied` still shows `Повторить` and retry still drains through the outbox path.

## Task 4: Targeted Verification And Review

**Files:**
- All files modified in Tasks 1-3.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/lib/failedTextRetry.test.ts src/features/chat/pages/ChatPage.optimistic-send.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run formatting and lint checks**

Run:

```bash
pnpm exec prettier --check frontend/src/features/chat/lib/failedTextRetry.ts frontend/src/features/chat/lib/failedTextRetry.test.ts frontend/src/features/chat/lib/optimisticTextMessages.ts frontend/src/features/chat/pages/useOptimisticTextSend.ts frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx frontend/src/features/chat/pages/ChatPage.optimistic-send.test.tsx
pnpm --dir frontend exec eslint src/features/chat/lib/failedTextRetry.ts src/features/chat/lib/failedTextRetry.test.ts src/features/chat/lib/optimisticTextMessages.ts src/features/chat/types.ts src/features/chat/pages/useOptimisticTextSend.ts src/features/chat/components/chat-transcript/MessageBubble.tsx src/features/chat/pages/ChatPage.optimistic-send.test.tsx
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
pnpm --dir frontend run typecheck
```

Expected: PASS.

- [ ] **Step 4: Review the diff**

Check:

- no delete/edit message action was added;
- retry still uses the existing outbox retry path;
- non-retryable failed copy tells the user to write a new message;
- `errorCode` is only local UI metadata for optimistic sends.

- [ ] **Step 5: Commit the implementation**

Run:

```bash
git add frontend/src/features/chat/lib/failedTextRetry.ts frontend/src/features/chat/lib/failedTextRetry.test.ts frontend/src/features/chat/lib/optimisticTextMessages.ts frontend/src/features/chat/types.ts frontend/src/features/chat/pages/useOptimisticTextSend.ts frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx frontend/src/features/chat/pages/ChatPage.optimistic-send.test.tsx
git commit -m "fix: limit retry for permanent failed chat sends"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: retry-only UX, no delete/edit, retryable/non-retryable split, helper, UI copy and tests are covered.
- Placeholder scan: no placeholder tasks remain.
- Type consistency: `errorCode` is `string | null` across outbox records, optimistic sends, and local chat messages.
