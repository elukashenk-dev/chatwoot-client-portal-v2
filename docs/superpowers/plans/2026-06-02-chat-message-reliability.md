# Chat Message Reliability UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chat text sending, media sending UX, and message receiving more reliable and honest under offline, VPN, stale reply, validation, and realtime failure scenarios.

**Architecture:** Keep the existing portal-owned text outbox and backend authority. Add local validation before outbox writes, classify outbox failures as retryable or permanent, keep media online-only with clearer UI, and add bounded snapshot fallback when realtime is unhealthy. This plan prepares the message status model for future read receipts but does not implement read receipts.

**Tech Stack:** React, TypeScript, Vitest, Fastify backend, plain service worker JavaScript, IndexedDB offline stores.

---

## Relationship To Read Receipts

Read receipts are intentionally separate from this reliability plan and are
specified in the event-based implementation plan:

```text
docs/superpowers/plans/2026-06-04-chatwoot-agent-read-webhook-read-receipts.md
```

Implementation dependency:

- Task 5 in this plan is a prerequisite for read receipts because it stops
  showing backend accepted messages as `Доставлено`.
- Read receipts must add separate receipt data such as `Прочитано поддержкой`.
- This plan must not add `read`, `delivered`, `readByAgent`, or group read
  semantics to the same field that represents local send state.
- If read receipts are implemented before the full reliability plan is closed,
  Task 5 and any required public message model separation must be completed
  first.

Recommended sequencing:

```text
1. Finish reliability baseline, especially honest sent status.
2. Implement read receipts from the separate event-based read receipts plan.
```

Rationale: read receipts rely on fresh snapshots and clear local send states.
Implementing them on top of `Доставлено` would preserve the current ambiguity.

---

## Current Implementation Status

This plan is retained because the reliability baseline is only partially
complete in current `main`. Do not execute every task blindly; start from this
status summary and the open findings.

Closed in current `main`:

- successful backend-accepted outgoing messages use `Отправлено`, not
  `Доставлено`;
- text and attachment caption length over `4000` characters are blocked in the
  composer before text reaches the durable outbox;
- text outbox send errors are classified as `temporary`, `permanent`, or
  `auth`;
- permanent text errors stop automatic retry and become failed records;
- service worker background text drain mirrors permanent error classification;
- retry button is hidden for non-retryable failed text sends;
- controlled `not_ready/thread_access_denied` send results become failed
  records instead of staying queued forever.

Still active:

- frontend validation for attachment file size, empty file, file name and type:
  `docs/findings/F-CHAT-005-frontend-attachment-validation.md`;
- bounded realtime health and snapshot fallback when visible realtime becomes
  stale: `docs/findings/F-CHAT-006-realtime-health-snapshot-fallback.md`;
- attachment selected/offline UX remains online-only and should be reviewed
  together with attachment validation.

The current scenario matrix is:

```text
docs/product/chat-message-send-ui-scenarios.md
```

---

## File Structure

- Create `frontend/src/features/chat/lib/chatSendConstraints.ts`
  - Frontend constants matching backend send limits.
- Create `frontend/src/features/chat/lib/chatSendValidation.ts`
  - Pure validators for text, attachment file, attachment caption.
- Create `frontend/src/features/chat/lib/chatSendValidation.test.ts`
  - Unit tests for validation.
- Modify `frontend/src/features/chat/components/MessageComposer.tsx`
  - Use validators.
  - Fix selected-file/offline text behavior.
  - Show local composer validation/warning.
- Modify `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
  - Rename sent status aria label from `Доставлено` to `Отправлено`.
- Create `frontend/src/features/offline/outboxErrorClassification.ts`
  - Shared frontend classifier for text outbox send errors.
- Create `frontend/src/features/offline/outboxErrorClassification.test.ts`
  - Unit tests for retryable/permanent/auth/rate-limit classification.
- Modify `frontend/src/features/offline/outboxDrain.ts`
  - Use classifier.
- Modify `frontend/src/features/offline/outboxDrain.test.ts`
  - Cover permanent `400` cases and retryable temporary cases.
- Modify `frontend/public/sw.js`
  - Mirror classifier in background drain.
- Add or modify service worker classifier coverage.
  - Preferred: create `frontend/src/features/offline/serviceWorkerOutboxClassifier.test.ts`
    that reads `frontend/public/sw.js` and asserts required permanent codes are
    present in the service worker classifier.
- Modify `frontend/src/features/chat/api/chatRealtimeClient.ts`
  - Add EventSource `error` callback support.
- Modify `frontend/src/features/chat/pages/useChatRealtimeConnection.ts`
  - Track realtime health and report unhealthy state to ChatPage.
- Create `frontend/src/features/chat/pages/useChatRealtimeFallbackRefresh.ts`
  - Bounded selected-thread snapshot refresh when realtime is unhealthy.
- Create `frontend/src/features/chat/pages/useChatRealtimeFallbackRefresh.test.tsx`
  - Unit tests for fallback refresh.
- Modify `frontend/src/features/chat/pages/ChatPage.tsx`
  - Wire realtime health and fallback refresh.
- Modify `docs/product/chat-message-send-ui-scenarios.md`
  - Expand scenario table with final target behavior.

## Task 1: Add Send Constraints And Validation

**Files:**

- Create: `frontend/src/features/chat/lib/chatSendConstraints.ts`
- Create: `frontend/src/features/chat/lib/chatSendValidation.ts`
- Create: `frontend/src/features/chat/lib/chatSendValidation.test.ts`

- [ ] **Step 1: Write validation tests**

Create `frontend/src/features/chat/lib/chatSendValidation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_FILE_NAME_CHARS,
  CHAT_MESSAGE_MAX_CHARS,
} from './chatSendConstraints'
import {
  validateAttachmentCaption,
  validateAttachmentFile,
  validateTextMessageDraft,
} from './chatSendValidation'

function createFile({
  name = 'file.txt',
  size = 1,
  type = 'text/plain',
}: {
  name?: string
  size?: number
  type?: string
}) {
  return new File([new Uint8Array(size)], name, { type })
}

describe('chat send validation', () => {
  it('accepts a normal text draft', () => {
    expect(validateTextMessageDraft(' hello ')).toEqual({
      errorMessage: null,
      normalizedText: 'hello',
    })
  })

  it('rejects empty text drafts', () => {
    expect(validateTextMessageDraft('   ')).toEqual({
      errorMessage: 'Введите сообщение.',
      normalizedText: '',
    })
  })

  it('rejects text drafts over 4000 characters', () => {
    expect(
      validateTextMessageDraft('a'.repeat(CHAT_MESSAGE_MAX_CHARS + 1)),
    ).toEqual({
      errorMessage: 'Сообщение слишком длинное. Максимум 4000 символов.',
      normalizedText: 'a'.repeat(CHAT_MESSAGE_MAX_CHARS + 1),
    })
  })

  it('accepts a normal attachment file and caption', () => {
    expect(validateAttachmentFile(createFile({ size: 12 }))).toBeNull()
    expect(validateAttachmentCaption(' caption ')).toBeNull()
  })

  it('rejects empty attachments', () => {
    expect(validateAttachmentFile(createFile({ size: 0 }))).toBe('Файл пустой.')
  })

  it('rejects attachments over 40 MB', () => {
    expect(
      validateAttachmentFile(
        createFile({ size: CHAT_ATTACHMENT_MAX_BYTES + 1 }),
      ),
    ).toBe('Файл больше допустимого размера 40 МБ.')
  })

  it('rejects attachment file names over 255 characters', () => {
    expect(
      validateAttachmentFile(
        createFile({
          name: `${'a'.repeat(CHAT_ATTACHMENT_MAX_FILE_NAME_CHARS + 1)}.txt`,
        }),
      ),
    ).toBe('Имя файла слишком длинное.')
  })

  it('rejects attachment captions over 4000 characters', () => {
    expect(
      validateAttachmentCaption('a'.repeat(CHAT_MESSAGE_MAX_CHARS + 1)),
    ).toBe('Подпись к файлу слишком длинная. Максимум 4000 символов.')
  })
})
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm -C frontend vitest run src/features/chat/lib/chatSendValidation.test.ts
```

Expected: fail because files do not exist.

- [ ] **Step 3: Add constraints**

Create `frontend/src/features/chat/lib/chatSendConstraints.ts`:

```ts
export const CHAT_MESSAGE_MAX_CHARS = 4000
export const CHAT_ATTACHMENT_MAX_BYTES = 40 * 1024 * 1024
export const CHAT_ATTACHMENT_MAX_FILE_NAME_CHARS = 255
```

- [ ] **Step 4: Add validation implementation**

Create `frontend/src/features/chat/lib/chatSendValidation.ts`:

```ts
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_FILE_NAME_CHARS,
  CHAT_MESSAGE_MAX_CHARS,
} from './chatSendConstraints'

export function validateTextMessageDraft(draft: string) {
  const normalizedText = draft.trim()

  if (!normalizedText) {
    return {
      errorMessage: 'Введите сообщение.',
      normalizedText,
    }
  }

  if (normalizedText.length > CHAT_MESSAGE_MAX_CHARS) {
    return {
      errorMessage: 'Сообщение слишком длинное. Максимум 4000 символов.',
      normalizedText,
    }
  }

  return {
    errorMessage: null,
    normalizedText,
  }
}

export function validateAttachmentCaption(caption: string | null | undefined) {
  const normalizedCaption = caption?.trim() ?? ''

  if (normalizedCaption.length > CHAT_MESSAGE_MAX_CHARS) {
    return 'Подпись к файлу слишком длинная. Максимум 4000 символов.'
  }

  return null
}

export function validateAttachmentFile(file: File) {
  if (file.size <= 0) {
    return 'Файл пустой.'
  }

  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
    return 'Файл больше допустимого размера 40 МБ.'
  }

  if (!file.name.trim()) {
    return 'Имя файла обязательно.'
  }

  if (file.name.trim().length > CHAT_ATTACHMENT_MAX_FILE_NAME_CHARS) {
    return 'Имя файла слишком длинное.'
  }

  return null
}
```

- [ ] **Step 5: Run test and verify it passes**

Run:

```bash
pnpm -C frontend vitest run src/features/chat/lib/chatSendValidation.test.ts
```

Expected: pass.

## Task 2: Wire Composer Validation And File-Offline UX

**Files:**

- Modify: `frontend/src/features/chat/components/MessageComposer.tsx`
- Test: existing `frontend/src/features/chat/pages/ChatPage.optimistic-send.test.tsx`
  or create focused composer tests if current harness is too broad.

- [ ] **Step 1: Add tests for overlong text and selected file offline**

Add focused tests using existing ChatPage harness:

```ts
it('keeps overlong text out of the offline outbox', async () => {
  // Arrange ready chat with online session.
  // Type 4001 chars.
  // Click send.
  // Assert no POST /api/chat/messages happened.
  // Assert no IndexedDB outbox record was written.
  // Assert composer error says "Сообщение слишком длинное. Максимум 4000 символов."
})

it('sends text when a selected file becomes unavailable offline and keeps the file preview', async () => {
  // Arrange ready chat with selected attachment.
  // Simulate connection unavailable after the file is selected.
  // Type "hello while offline".
  // Click send.
  // Assert text outbox contains "hello while offline".
  // Assert attachment preview still exists.
  // Assert warning says file can be sent only when connection is available.
})

it('blocks empty selected-file send while offline', async () => {
  // Arrange ready chat with selected attachment and no draft.
  // Simulate connection unavailable.
  // Assert send button is disabled.
  // Assert warning says file can be sent only when connection is available.
})
```

Expected before implementation: fail.

- [ ] **Step 2: Import validators and add local composer error**

Modify `MessageComposer.tsx` imports:

```ts
import {
  validateAttachmentCaption,
  validateAttachmentFile,
  validateTextMessageDraft,
} from '../lib/chatSendValidation'
```

Add state near `selectedAttachment`:

```ts
const [localErrorMessage, setLocalErrorMessage] = useState<string | null>(null)
```

Change combined error:

```ts
const composerErrorMessage =
  voiceErrorMessage ?? localErrorMessage ?? errorMessage
```

- [ ] **Step 3: Validate text before calling `onSend`**

In `submitText`, replace direct use of `normalizedDraft` with validation:

```ts
const textValidation = validateTextMessageDraft(draft)

if (textValidation.errorMessage) {
  setLocalErrorMessage(textValidation.errorMessage)
  return
}

const normalizedText = textValidation.normalizedText
resetPendingTextSendIfPayloadChanged(normalizedText, replyToMessageId)
```

Use `normalizedText` for pending content and `onSend({ content: normalizedText })`.

- [ ] **Step 4: Validate file and caption before attachment send**

At the start of `submitAttachmentFile` after disabled checks:

```ts
const fileErrorMessage = validateAttachmentFile(file)

if (fileErrorMessage) {
  setLocalErrorMessage(fileErrorMessage)
  return false
}

const captionErrorMessage = validateAttachmentCaption(content)

if (captionErrorMessage) {
  setLocalErrorMessage(captionErrorMessage)
  return false
}
```

- [ ] **Step 5: Change submit priority when media cannot be sent**

Replace `submitCurrentDraft` with:

```ts
async function submitCurrentDraft() {
  if (selectedAttachment && canSendAttachment) {
    await submitAttachment()
    return
  }

  if (selectedAttachment && !canSendAttachment && canSendText) {
    await submitText()
    return
  }

  if (selectedAttachment) {
    await submitAttachment()
    return
  }

  await submitText()
}
```

- [ ] **Step 6: Add selected-file offline warning**

Add:

```ts
const selectedAttachmentOfflineWarning =
  selectedAttachment && isAttachmentSendDisabled
    ? 'Файл можно отправить только при связи. Текст можно отправить сейчас.'
    : null
```

Render below `ComposerAttachmentPreview`:

```tsx
{
  selectedAttachmentOfflineWarning ? (
    <div className="mb-2 rounded-[0.8rem] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800">
      {selectedAttachmentOfflineWarning}
    </div>
  ) : null
}
```

- [ ] **Step 7: Clear local errors on user edits**

In `selectAttachment` and `updateDraft`, call:

```ts
setLocalErrorMessage(null)
```

- [ ] **Step 8: Run targeted tests**

Run:

```bash
pnpm -C frontend vitest run src/features/chat/pages/ChatPage.optimistic-send.test.tsx
pnpm -C frontend vitest run src/features/chat/lib/chatSendValidation.test.ts
```

Expected: pass.

## Task 3: Add Outbox Error Classification

**Files:**

- Create: `frontend/src/features/offline/outboxErrorClassification.ts`
- Create: `frontend/src/features/offline/outboxErrorClassification.test.ts`
- Modify: `frontend/src/features/offline/outboxDrain.ts`
- Modify: `frontend/src/features/offline/outboxDrain.test.ts`

- [ ] **Step 1: Write classifier tests**

Create `frontend/src/features/offline/outboxErrorClassification.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { classifyTextOutboxSendError } from './outboxErrorClassification'

describe('text outbox send error classification', () => {
  it.each([
    { code: 'reply_target_unavailable', statusCode: 400 },
    { code: 'reply_target_invalid', statusCode: 400 },
    { code: 'message_content_too_long', statusCode: 400 },
    { code: 'message_content_required', statusCode: 400 },
    { code: 'client_message_key_required', statusCode: 400 },
    { code: 'client_message_key_too_long', statusCode: 400 },
    { code: 'chat_thread_unsupported', statusCode: 400 },
    { code: 'INVALID_REQUEST', statusCode: 400 },
    { code: 'thread_access_denied', statusCode: 400 },
    { code: 'forbidden', statusCode: 403 },
    { code: 'client_message_key_conflict', statusCode: 409 },
  ])('classifies $code/$statusCode as permanent', (error) => {
    expect(classifyTextOutboxSendError(error)).toBe('permanent')
  })

  it.each([
    { code: null, statusCode: 0 },
    { code: null, statusCode: 408 },
    { code: 'CHAT_SEND_RATE_LIMITED', statusCode: 429 },
    { code: 'chat_send_in_progress', statusCode: 409 },
    { code: 'chat_send_unavailable', statusCode: 503 },
    { code: 'chat_send_ledger_unavailable', statusCode: 503 },
    { code: null, statusCode: 500 },
  ])('classifies $code/$statusCode as temporary', (error) => {
    expect(classifyTextOutboxSendError(error)).toBe('temporary')
  })

  it('classifies 401 as auth', () => {
    expect(
      classifyTextOutboxSendError({ code: 'UNAUTHORIZED', statusCode: 401 }),
    ).toBe('auth')
  })
})
```

- [ ] **Step 2: Add classifier implementation**

Create `frontend/src/features/offline/outboxErrorClassification.ts`:

```ts
export type TextOutboxSendErrorClassification =
  | 'auth'
  | 'permanent'
  | 'temporary'

type TextOutboxSendErrorInput = {
  code: string | null
  statusCode: number | null
}

const PERMANENT_TEXT_SEND_ERROR_CODES = new Set([
  'INVALID_REQUEST',
  'chat_thread_unsupported',
  'client_message_key_conflict',
  'client_message_key_required',
  'client_message_key_too_long',
  'message_content_required',
  'message_content_too_long',
  'reply_target_invalid',
  'reply_target_unavailable',
  'thread_access_denied',
])

const TEMPORARY_TEXT_SEND_ERROR_CODES = new Set([
  'CHAT_SEND_RATE_LIMITED',
  'chat_send_in_progress',
  'chat_send_ledger_unavailable',
  'chat_send_unavailable',
])

export function classifyTextOutboxSendError({
  code,
  statusCode,
}: TextOutboxSendErrorInput): TextOutboxSendErrorClassification {
  if (statusCode === 401) {
    return 'auth'
  }

  if (code && PERMANENT_TEXT_SEND_ERROR_CODES.has(code)) {
    return 'permanent'
  }

  if (statusCode === 403) {
    return 'permanent'
  }

  if (statusCode === 400) {
    return 'permanent'
  }

  if (code && TEMPORARY_TEXT_SEND_ERROR_CODES.has(code)) {
    return 'temporary'
  }

  if (
    statusCode === null ||
    statusCode === 0 ||
    statusCode === 408 ||
    statusCode === 429 ||
    statusCode >= 500
  ) {
    return 'temporary'
  }

  return 'permanent'
}
```

- [ ] **Step 3: Use classifier in `outboxDrain.ts`**

Import:

```ts
import { classifyTextOutboxSendError } from './outboxErrorClassification'
```

In the catch block, compute:

```ts
const classification = classifyTextOutboxSendError(apiError)
```

Then:

- `classification === 'auth'` keeps current 401 behavior.
- Permanent errors call `markOutboxFailed`.
- Temporary errors preserve existing `chat_send_in_progress`, `429`, and
  generic backoff branches.

- [ ] **Step 4: Extend outbox tests**

In `frontend/src/features/offline/outboxDrain.test.ts`, extend the existing
permanent cases:

```ts
it.each([
  { code: 'reply_target_unavailable', statusCode: 400 },
  { code: 'reply_target_invalid', statusCode: 400 },
  { code: 'message_content_too_long', statusCode: 400 },
  { code: 'message_content_required', statusCode: 400 },
  { code: 'INVALID_REQUEST', statusCode: 400 },
  { code: 'chat_thread_unsupported', statusCode: 400 },
])(
  'marks permanent validation error $code as failed',
  async ({ code, statusCode }) => {
    // Use existing createQueuedOutboxRecord helper.
    // Mock sendChatMessage rejection.
    // Assert status: failed and errorCode: code.
  },
)
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
pnpm -C frontend vitest run src/features/offline/outboxErrorClassification.test.ts src/features/offline/outboxDrain.test.ts
```

Expected: pass.

## Task 4: Mirror Permanent Error Handling In Service Worker

**Files:**

- Modify: `frontend/public/sw.js`
- Create: `frontend/src/features/offline/serviceWorkerOutboxClassifier.test.ts`

- [ ] **Step 1: Add static service worker classifier coverage**

Create `frontend/src/features/offline/serviceWorkerOutboxClassifier.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const swSource = readFileSync(
  resolve(__dirname, '../../../../public/sw.js'),
  'utf8',
)

describe('service worker text outbox classifier', () => {
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
    'thread_access_denied',
  ])('contains permanent code %s', (code) => {
    expect(swSource).toContain(`'${code}'`)
  })

  it('defines a permanent text outbox classifier', () => {
    expect(swSource).toContain('function isPermanentTextOutboxSendError')
  })
})
```

- [ ] **Step 2: Add service worker helper**

In `frontend/public/sw.js`, add near background outbox helpers:

```js
const PERMANENT_TEXT_OUTBOX_SEND_ERROR_CODES = new Set([
  'INVALID_REQUEST',
  'chat_thread_unsupported',
  'client_message_key_conflict',
  'client_message_key_required',
  'client_message_key_too_long',
  'message_content_required',
  'message_content_too_long',
  'reply_target_invalid',
  'reply_target_unavailable',
  'thread_access_denied',
])

function isPermanentTextOutboxSendError(apiError) {
  if (
    apiError.code &&
    PERMANENT_TEXT_OUTBOX_SEND_ERROR_CODES.has(apiError.code)
  ) {
    return true
  }

  if (apiError.statusCode === 403) {
    return true
  }

  if (apiError.statusCode === 400) {
    return true
  }

  return false
}
```

- [ ] **Step 3: Use helper in background drain**

In `drainTextOutboxForIdentity`, before generic retry:

```js
if (isPermanentTextOutboxSendError(apiError)) {
  await markTextOutboxFailed(
    sendingRecord,
    apiError.code,
    apiError.message,
    new Date(),
  )
  continue
}
```

Keep existing special branches for `401`, `chat_send_in_progress`, `429`, and
`client_message_key_conflict`.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm -C frontend vitest run src/features/offline/serviceWorkerOutboxClassifier.test.ts
```

Expected: pass.

## Task 5: Make Sent Status Honest

**Files:**

- Modify: `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
- Modify tests that assert `Доставлено`, if any.

- [ ] **Step 1: Search existing assertions**

Run:

```bash
rg -n "Доставлено|data-message-status-icon=\"sent\"|Отправлено" frontend/src
```

Expected: identify tests or snapshots to update.

- [ ] **Step 2: Rename aria-label**

In `MessageStatusIcon`, change:

```tsx
<span aria-label="Доставлено" data-message-status-icon="sent">
```

to:

```tsx
<span aria-label="Отправлено" data-message-status-icon="sent">
```

Do not add read receipt labels in this task. `Отправлено` must remain a
backend-accepted send state only. The later read receipts slice will add a
separate receipt field/label such as `Прочитано поддержкой`.

- [ ] **Step 3: Run affected frontend tests**

Run the files found in Step 1, then:

```bash
pnpm -C frontend vitest run src/features/chat/pages
```

Expected: pass.

## Task 6: Add Realtime Health And Snapshot Fallback

**Files:**

- Modify: `frontend/src/features/chat/api/chatRealtimeClient.ts`
- Modify: `frontend/src/features/chat/pages/useChatRealtimeConnection.ts`
- Create: `frontend/src/features/chat/pages/useChatRealtimeFallbackRefresh.ts`
- Create: `frontend/src/features/chat/pages/useChatRealtimeFallbackRefresh.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`

- [ ] **Step 1: Add fallback hook test**

Create `frontend/src/features/chat/pages/useChatRealtimeFallbackRefresh.test.tsx`
using `renderHook`:

```ts
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useChatRealtimeFallbackRefresh } from './useChatRealtimeFallbackRefresh'

describe('useChatRealtimeFallbackRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
  })

  it('refreshes selected snapshot while realtime is unhealthy', async () => {
    const refreshChatSnapshot = vi.fn(async () => undefined)

    renderHook(() =>
      useChatRealtimeFallbackRefresh({
        enabled: true,
        isBrowserOnline: true,
        isRealtimeHealthy: false,
        refreshChatSnapshot,
        selectedThreadId: 'private:me',
      }),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(refreshChatSnapshot).toHaveBeenCalledTimes(1)
  })

  it('does not refresh when realtime is healthy', async () => {
    const refreshChatSnapshot = vi.fn(async () => undefined)

    renderHook(() =>
      useChatRealtimeFallbackRefresh({
        enabled: true,
        isBrowserOnline: true,
        isRealtimeHealthy: true,
        refreshChatSnapshot,
        selectedThreadId: 'private:me',
      }),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(refreshChatSnapshot).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Add EventSource error callback**

In `chatRealtimeClient.ts`, extend input:

```ts
onError?: () => void
```

Register:

```ts
eventSource.addEventListener('error', () => {
  onError?.()
})
```

- [ ] **Step 3: Return realtime health from connection hook**

In `useChatRealtimeConnection.ts`, add state:

```ts
const [isRealtimeHealthy, setIsRealtimeHealthy] = useState(false)
```

Set:

```ts
onOpen: () => {
  setIsRealtimeHealthy(true)
  markBrowserOnline()
},
onError: () => {
  setIsRealtimeHealthy(false)
},
```

Return:

```ts
return { isRealtimeHealthy }
```

Reset to false when `threadId` changes or connection closes.

- [ ] **Step 4: Add fallback hook implementation**

Create `useChatRealtimeFallbackRefresh.ts`:

```ts
import { useEffect, useRef } from 'react'

const REALTIME_FALLBACK_REFRESH_INTERVAL_MS = 30_000

export function useChatRealtimeFallbackRefresh({
  enabled,
  isBrowserOnline,
  isRealtimeHealthy,
  refreshChatSnapshot,
  selectedThreadId,
}: {
  enabled: boolean
  isBrowserOnline: boolean
  isRealtimeHealthy: boolean
  refreshChatSnapshot: () => Promise<unknown>
  selectedThreadId: string | null
}) {
  const isRefreshingRef = useRef(false)

  useEffect(() => {
    if (
      !enabled ||
      !selectedThreadId ||
      !isBrowserOnline ||
      isRealtimeHealthy
    ) {
      return
    }

    async function refreshFromSnapshot() {
      if (isRefreshingRef.current || document.visibilityState !== 'visible') {
        return
      }

      isRefreshingRef.current = true

      try {
        await refreshChatSnapshot()
      } catch {
        // Fallback refresh is best-effort; regular reconnect paths still run.
      } finally {
        isRefreshingRef.current = false
      }
    }

    const intervalId = window.setInterval(
      refreshFromSnapshot,
      REALTIME_FALLBACK_REFRESH_INTERVAL_MS,
    )

    return () => {
      window.clearInterval(intervalId)
    }
  }, [
    enabled,
    isBrowserOnline,
    isRealtimeHealthy,
    refreshChatSnapshot,
    selectedThreadId,
  ])
}
```

- [ ] **Step 5: Wire ChatPage**

In `ChatPage.tsx`:

```ts
const { isRealtimeHealthy } = useChatRealtimeConnection(...)

useChatRealtimeFallbackRefresh({
  enabled: isRealtimeSupported,
  isBrowserOnline: canUseBackend,
  isRealtimeHealthy,
  refreshChatSnapshot,
  selectedThreadId: pageState.selectedThreadId,
})
```

If `EventSource` is unsupported, reuse the same hook with
`enabled: !isRealtimeSupported` and `isRealtimeHealthy: false`, or pass
`enabled: true` and compute health as `isRealtimeSupported && isRealtimeHealthy`.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
pnpm -C frontend vitest run src/features/chat/pages/useChatRealtimeFallbackRefresh.test.tsx src/features/chat/pages/useChatRealtimeConnection.test.tsx
```

Expected: pass.

## Task 7: Update Scenario Documentation

**Files:**

- Modify: `docs/product/chat-message-send-ui-scenarios.md`

- [ ] **Step 1: Update existing rows**

Change the successful text row to use `Отправлено` instead of `Доставлено`.

Change attachment/voice rows to explicitly say online-only.

- [ ] **Step 2: Add missing scenarios**

Add rows for:

- overlong text blocked before outbox;
- overlong/stale text from old local outbox becomes `Не отправлено`;
- stale reply target becomes `Не отправлено`;
- file too large;
- empty file;
- unsupported attachment type;
- caption too long;
- selected file then offline, text still sends and file remains;
- voice conversion/preparation failure;
- voice file too large;
- session expired while queued;
- group access removed while queued;
- realtime unsupported;
- realtime unhealthy with fallback snapshot refresh;
- app sleeping/background differences on Android and iOS;
- local storage unavailable/evicted.

- [ ] **Step 3: Check formatting**

Run:

```bash
pnpm exec prettier --check docs/product/chat-message-send-ui-scenarios.md
git diff --check
```

Expected: pass.

## Task 8: Final Verification

**Files:**

- All files touched above.

- [ ] **Step 1: Run targeted frontend tests**

Run:

```bash
pnpm -C frontend vitest run \
  src/features/chat/lib/chatSendValidation.test.ts \
  src/features/chat/pages/ChatPage.optimistic-send.test.tsx \
  src/features/chat/pages/useChatRealtimeConnection.test.tsx \
  src/features/chat/pages/useChatRealtimeFallbackRefresh.test.tsx \
  src/features/offline/outboxErrorClassification.test.ts \
  src/features/offline/outboxDrain.test.ts \
  src/features/offline/serviceWorkerOutboxClassifier.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run frontend typecheck**

Run:

```bash
pnpm -C frontend typecheck
```

Expected: pass.

- [ ] **Step 3: Run root lint**

Run:

```bash
pnpm lint
```

Expected: pass.

- [ ] **Step 4: Run full frontend tests**

Run:

```bash
pnpm -C frontend test
```

Expected: pass.

- [ ] **Step 5: Manual smoke checklist**

Use real device or local browser:

- online text sends and shows `Отправлено`;
- VPN/router cut during text send queues after timeout/probe;
- queued text sends after reconnect;
- overlong text is blocked before outbox;
- reply target stale becomes `Не отправлено`;
- file over 40 MB is blocked before upload;
- selected file + offline + typed text sends text and keeps file preview;
- realtime disabled/unhealthy still receives messages through snapshot refresh;
- push disabled does not affect in-app unread or receive refresh.

## Plan Self-Review

Spec coverage:

- Text validation is covered by Task 1 and Task 2.
- Permanent vs temporary outbox errors are covered by Task 3 and Task 4.
- Honest sent status is covered by Task 5.
- Compatibility with future read receipts is covered by the dedicated
  Relationship section and Task 5 guardrail.
- Realtime fallback receive behavior is covered by Task 6.
- Scenario documentation is covered by Task 7.
- Verification is covered by Task 8.

Placeholder scan:

- No `TBD`, `TODO`, or "implement later" placeholders are present.
- Code snippets define concrete functions, constants and messages.

Type consistency:

- Validation functions use `File`, `string`, and nullable caption types used by
  `MessageComposer`.
- Classifier accepts the same `code/statusCode` shape produced by
  `getSendErrorDetails`.
- Realtime fallback hook accepts `refreshChatSnapshot`, matching current
  `ChatPage.tsx`.

Risk review:

- Service worker classifier duplicates frontend classifier because `sw.js` is
  plain public JavaScript. Static coverage reduces drift but does not fully
  execute service worker code. A deeper SW integration test can be added later
  if this becomes a repeated risk.
- Attachment upload progress/cancel remains out of scope. This is intentional:
  media stays online-only and bounded by validation/errors.
- `INVALID_REQUEST` on text send is treated as permanent. This is correct for
  current text route because malformed payloads do not become valid by waiting.
- Read receipts are not implemented in this plan. The separate read receipts
  spec depends on this plan's honest send-state cleanup.
