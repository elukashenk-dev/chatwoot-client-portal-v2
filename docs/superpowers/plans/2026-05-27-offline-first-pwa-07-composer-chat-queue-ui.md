# Offline-first PWA Slice 07: Composer And Chat Queue UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire durable text outbox behavior into composer and chat UI without embedding queue ownership in `ChatPage`.

**Architecture:** `ChatPage` passes tenant/user/thread context into
offline-domain APIs and renders resulting queued/sending/failed state. Composer
clears draft and reply state only after durable outbox commit succeeds.
Foreground drain, due selection, retry, leases and durable queue ownership remain
in `frontend/src/features/offline/`; `ChatPage` may request a drain but never
POSTs a durable outbox text record directly.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, IndexedDB, `idb`, Service Worker, Fastify, Drizzle/Postgres, Playwright.

---

**Part Of:** [Offline-first PWA Implementation Plan](./2026-05-27-offline-first-pwa-implementation.md)

**Slice:** 07 of 9

**Depends On:** Slice 06 outbox core plus Slices 01-05 for authenticated chat scope and cached read model.

**Unlocks:** Slice 09 runtime offline send and reconciliation coverage.

---

## Task 8: Composer And Chat UI Durable Queue Integration

**Goal:** Text composer clears draft/reply only after outbox commit, allows
offline text queueing, keeps attachments/voice online-only, and renders queued
messages after durable storage.

**Files:**

- Modify: `frontend/src/features/chat/components/MessageComposer.tsx`
- Modify: `frontend/src/features/chat/components/MessageComposer.test.tsx`
- Modify: `frontend/src/features/chat/lib/optimisticTextMessages.ts`
- Modify: `frontend/src/features/chat/pages/useOptimisticTextSend.ts`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.optimistic-send.test.tsx`
- Modify: `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
- Modify: `frontend/src/features/offline/offlineOutboxStore.ts`
- Modify: `frontend/src/features/offline/offlineOutboxStore.test.ts`
- Modify: `frontend/src/features/offline/useOfflineOutboxDrain.ts`
- Modify: `frontend/src/features/offline/useOfflineOutboxDrain.test.tsx`

- [ ] **Step 1: Change composer send clear behavior**

In `MessageComposer.tsx`, make `submitText` async:

```ts
async function submitText() {
  if (!canSendText) {
    return
  }

  clearVoiceErrorMessage()
  resetPendingTextSendIfPayloadChanged(normalizedDraft, replyToMessageId)

  const clientMessageKey =
    pendingClientMessageKeyRef.current ?? createClientMessageKey()

  pendingClientMessageKeyRef.current = clientMessageKey
  pendingContentRef.current = normalizedDraft
  pendingReplyToMessageIdRef.current = replyToMessageId

  const wasAccepted = await onSend({
    clientMessageKey,
    content: normalizedDraft,
    replyToMessageId,
  })

  if (!wasAccepted) {
    return
  }

  pendingClientMessageKeyRef.current = null
  pendingContentRef.current = null
  pendingReplyToMessageIdRef.current = null
  shouldRestoreFocusRef.current = true
  onCancelReply()
  setDraft('')
}
```

Update callers:

```ts
await submitText()
```

- [ ] **Step 2: Split text vs media disabled props**

Change props:

```ts
type MessageComposerProps = {
  attachmentDisabled?: boolean
  disabled: boolean
  errorMessage: string | null
  isSending: boolean
  offlineAlertMessage?: string | null
  onCancelReply: () => void
  onSend: (input: SendMessageInput) => Promise<boolean>
  onSendAttachment: (input: SendAttachmentInput) => Promise<boolean>
  replyTarget: MessageComposerReplyTarget | null
  voiceDisabled?: boolean
}
```

Use:

```ts
const isAttachmentSendDisabled = Boolean(attachmentDisabled)
const isVoiceSendDisabled = Boolean(voiceDisabled)

const isAttachmentControlDisabled =
  isAttachmentSendDisabled ||
  disabled ||
  isSending ||
  isVoiceRecorderBusy ||
  shouldPrioritizeTextDraft

const canStartVoiceRecording =
  !isVoiceSendDisabled &&
  !disabled &&
  !isSending &&
  !isVoiceRecorderBusy &&
  selectedAttachment === null &&
  !shouldPrioritizeTextDraft

const canSendAttachment =
  selectedAttachment !== null &&
  !isAttachmentSendDisabled &&
  !disabled &&
  !isSending &&
  !isVoiceRecorderBusy
```

Also guard the runtime send path, not only the visible buttons:

```ts
async function submitAttachmentFile(
  file: File,
  {
    allowVoiceRecorderBusy = false,
    content = null,
  }: { allowVoiceRecorderBusy?: boolean; content?: string | null } = {},
) {
  const isVoiceAttachment = allowVoiceRecorderBusy
  const isMediaSendDisabled = isVoiceAttachment
    ? isVoiceSendDisabled
    : isAttachmentSendDisabled

  if (
    isMediaSendDisabled ||
    disabled ||
    isSending ||
    (!allowVoiceRecorderBusy && isVoiceRecorderBusy)
  ) {
    return false
  }

  // Keep the existing attachment send implementation below this guard.
}
```

If the app goes offline after a file was already selected, keep the selected file
and draft visible, but do not call `onSendAttachment`. If a voice recording was
started before the offline transition, `finishVoiceRecording` must resolve
through the same blocked path and must not call `onSendAttachment`.

Replace the old offline copy that said sending is disabled:

```ts
const OFFLINE_COMPOSER_QUEUE_MESSAGE =
  'Нет соединения. Сообщения будут отправлены, когда соединение восстановится.'
```

For offline mode, `ChatPage` passes queue-aware composer copy:

```tsx
<MessageComposer
  attachmentDisabled={!isBrowserOnline}
  disabled={!canSend}
  errorMessage={sendErrorMessage}
  isSending={isSending}
  offlineAlertMessage={isBrowserOnline ? null : OFFLINE_COMPOSER_QUEUE_MESSAGE}
  onCancelReply={() => {
    setReplyTarget(null)
  }}
  onSend={handleSendMessage}
  onSendAttachment={handleSendAttachment}
  replyTarget={replyTarget}
  voiceDisabled={!isBrowserOnline}
/>
```

- [ ] **Step 3: Update durable text send hook**

First update `OptimisticTextSendStatus` and `createOptimisticTextSend` in
`frontend/src/features/chat/lib/optimisticTextMessages.ts` so callers can pass
the initial local status:

```ts
export type OptimisticTextSendStatus = 'failed' | 'queued' | 'sending'

export type CreateOptimisticTextSendInput = {
  clientMessageKey: string
  content: string
  id: number
  now: Date
  replyTarget: MessageComposerReplyTarget | null
  replyToMessageId: number | null
  status?: OptimisticTextSendStatus
  threadId: string
}

export function createOptimisticTextSend({
  clientMessageKey,
  content,
  id,
  now,
  replyTarget,
  replyToMessageId,
  status = 'sending',
  threadId,
}: CreateOptimisticTextSendInput): OptimisticTextSend {
  return {
    clientMessageKey,
    content,
    createdAt: now.toISOString(),
    errorMessage: null,
    id,
    replyTo:
      replyTarget && replyTarget.id === replyToMessageId
        ? {
            attachmentName: replyTarget.attachmentName ?? null,
            authorName: replyTarget.authorName,
            content: replyTarget.content,
            direction: replyTarget.direction,
            messageId: replyTarget.id,
          }
        : null,
    replyToMessageId,
    status,
    threadId,
  }
}
```

Add a durable retry operation to `frontend/src/features/offline/offlineOutboxStore.ts`.
This keeps explicit retry in the offline domain instead of sending directly from
`ChatPage`:

```ts
type RetryFailedOutboxRecordInput = {
  clientMessageKey: string
  now?: Date
  tenantSlug: string
  threadId: string
  userId: number
}

async retryFailedOutboxRecord({
  clientMessageKey,
  now = new Date(),
  tenantSlug,
  threadId,
  userId,
}: RetryFailedOutboxRecordInput) {
  const existing = await this.readOutboxRecord({
    clientMessageKey,
    tenantSlug,
    threadId,
    userId,
  })

  if (!existing || existing.status !== 'failed') {
    return null
  }

  const retryRecord: OfflineTextOutboxRecord = {
    ...existing,
    errorCode: null,
    errorMessage: null,
    nextAttemptAt: null,
    sendOwnerId: null,
    sendingLeaseExpiresAt: null,
    sendingStartedAt: null,
    status: 'queued',
    updatedAt: now.toISOString(),
  }

  await this.saveOutboxRecord(retryRecord)

  return retryRecord
}
```

Add unit coverage in `offlineOutboxStore.test.ts`:

```ts
it('queues a failed outbox record for explicit retry without changing the client key', async () => {
  const failedRecord = createOutboxRecord({
    clientMessageKey: 'portal-send:failed-retry',
    errorCode: 'thread_access_denied',
    errorMessage: 'Нет доступа.',
    nextAttemptAt: '2026-05-28T10:00:00.000Z',
    status: 'failed',
  })

  await offlineOutboxStore.saveOutboxRecord(failedRecord)

  await expect(
    offlineOutboxStore.retryFailedOutboxRecord({
      clientMessageKey: 'portal-send:failed-retry',
      now: new Date('2026-05-27T10:10:00.000Z'),
      tenantSlug: failedRecord.tenantSlug,
      threadId: failedRecord.threadId,
      userId: failedRecord.userId,
    }),
  ).resolves.toMatchObject({
    clientMessageKey: 'portal-send:failed-retry',
    errorCode: null,
    errorMessage: null,
    nextAttemptAt: null,
    status: 'queued',
  })
})
```

Then extend `UseOptimisticTextSendInput` in `useOptimisticTextSend.ts`. Remove
the old direct `sendChatMessage`/`sendOptimisticText` path from this hook:

```ts
import { ONLINE_CHAT_PAGE_CACHE_STATE } from './chatPageState'
import { offlineOutboxStore } from '../../offline/offlineOutboxStore'
import { isOfflineStorageQuotaError } from '../../offline/storagePersistence'
import type { OfflineTextOutboxRecord } from '../../offline/types'
import type { ChatSendResult } from '../types'

const OUTBOX_WRITE_ERROR_MESSAGE =
  'Не удалось сохранить сообщение на этом устройстве. Попробуйте позже.'
const OUTBOX_QUOTA_ERROR_MESSAGE =
  'На устройстве мало места. Освободите место и попробуйте еще раз.'
const OFFLINE_QUEUE_STORAGE_UNAVAILABLE_MESSAGE =
  'На устройстве недостаточно места для офлайн-отправки сообщений.'

type UseOptimisticTextSendInput = {
  canUseOfflineTextQueue: boolean
  isBrowserOnline: boolean
  onOutboxRecordQueued?: () => void
  onTextSendStarted?: () => void
  pageState: ChatPageState
  replyTarget: MessageComposerReplyTarget | null
  setPageState: Dispatch<SetStateAction<ChatPageState>>
  setSendErrorMessage: Dispatch<SetStateAction<string | null>>
  tenantSlug: string
  threadId: string
  userId: number
}
```

Add helpers inside `useOptimisticTextSend.ts` for durable outbox hydration and
drain reconciliation:

```ts
type OutboxSendSucceededEvent = {
  record: OfflineTextOutboxRecord
  sendResult: ChatSendResult
}

function toOptimisticTextSendFromOutboxRecord(
  record: OfflineTextOutboxRecord,
  index: number,
): OptimisticTextSend {
  return {
    clientMessageKey: record.clientMessageKey,
    content: record.content,
    createdAt: record.createdAt,
    errorMessage: record.errorMessage,
    id: -1_000_000 - index,
    replyTo: record.replyTo,
    replyToMessageId: record.replyToMessageId,
    status: record.status,
    threadId: record.threadId,
  }
}
```

Expose the two callbacks from the hook:

```ts
const hydrateOptimisticTextSendsFromOutbox = useCallback(
  (records: OfflineTextOutboxRecord[]) => {
    const hydratedSends = records.map(toOptimisticTextSendFromOutboxRecord)

    setOptimisticTextSends(hydratedSends)
  },
  [],
)

const handleOutboxSendSucceeded = useCallback(
  ({ record, sendResult }: OutboxSendSucceededEvent) => {
    setOptimisticTextSends((currentSends) =>
      currentSends.filter(
        (send) =>
          send.clientMessageKey !== record.clientMessageKey ||
          send.threadId !== record.threadId,
      ),
    )

    setPageState((currentState) => {
      if (currentState.selectedThreadId !== record.threadId) {
        return currentState
      }

      const currentSnapshot =
        currentState.status === 'ready' ? currentState.snapshot : null

      return {
        ...ONLINE_CHAT_PAGE_CACHE_STATE,
        snapshot: buildSnapshotFromSendResult({
          currentSnapshot,
          sendResult,
        }),
        selectedThreadId: currentState.selectedThreadId,
        status: 'ready',
        threads: currentState.threads,
      }
    })
  },
  [setPageState],
)
```

In `handleSendMessage`, create the outbox record before clearing composer text
or rendering the queued bubble:

```ts
if (!tenantSlug || !userId || pageState.status !== 'ready') {
  return false
}

if (!isBrowserOnline && !canUseOfflineTextQueue) {
  setSendErrorMessage(OFFLINE_QUEUE_STORAGE_UNAVAILABLE_MESSAGE)
  return false
}

const now = new Date()
const queuedSend = createOptimisticTextSend({
  clientMessageKey,
  content,
  id: optimisticMessageIdRef.current,
  now,
  replyTarget,
  replyToMessageId: replyToMessageId ?? null,
  status: isBrowserOnline ? 'sending' : 'queued',
  threadId,
})

try {
  await offlineOutboxStore.saveOutboxRecord({
    attemptCount: 0,
    clientMessageKey,
    content,
    createdAt: now.toISOString(),
    errorCode: null,
    errorMessage: null,
    lastAttemptAt: null,
    nextAttemptAt: null,
    replyTo: queuedSend.replyTo,
    replyToMessageId: replyToMessageId ?? null,
    sendOwnerId: null,
    sendingLeaseExpiresAt: null,
    sendingStartedAt: null,
    status: 'queued',
    tenantSlug,
    threadId,
    updatedAt: now.toISOString(),
    userId,
  })
} catch (error) {
  setSendErrorMessage(
    isOfflineStorageQuotaError(error)
      ? OUTBOX_QUOTA_ERROR_MESSAGE
      : OUTBOX_WRITE_ERROR_MESSAGE,
  )
  return false
}
```

Only after this resolves:

```ts
optimisticMessageIdRef.current -= 1
setOptimisticTextSends((currentSends) => [...currentSends, queuedSend])
onTextSendStarted?.()
onOutboxRecordQueued?.()

return true
```

Update `handleRetryTextMessage` so failed durable records retry through the
offline outbox state machine:

```ts
const handleRetryTextMessage = useCallback(
  async (clientMessageKey: string) => {
    if (!isBrowserOnline || !tenantSlug || !userId) {
      return
    }

    const optimisticSend = optimisticTextSends.find(
      (send) =>
        send.clientMessageKey === clientMessageKey &&
        send.threadId === threadId,
    )

    if (!optimisticSend || optimisticSend.status !== 'failed') {
      return
    }

    try {
      const retryRecord = await offlineOutboxStore.retryFailedOutboxRecord({
        clientMessageKey,
        tenantSlug,
        threadId,
        userId,
      })

      if (!retryRecord) {
        return
      }

      setOptimisticTextSends((currentSends) =>
        currentSends.map((send) =>
          send.clientMessageKey === clientMessageKey &&
          send.threadId === threadId
            ? {
                ...send,
                errorMessage: null,
                status: 'sending',
              }
            : send,
        ),
      )
      onOutboxRecordQueued?.()
    } catch (error) {
      setSendErrorMessage(
        isOfflineStorageQuotaError(error)
          ? OUTBOX_QUOTA_ERROR_MESSAGE
          : OUTBOX_WRITE_ERROR_MESSAGE,
      )
    }
  },
  [
    isBrowserOnline,
    onOutboxRecordQueued,
    optimisticTextSends,
    setSendErrorMessage,
    tenantSlug,
    threadId,
    userId,
  ],
)
```

Do not keep a direct successful `sendOptimisticText` branch in this hook. The
only component allowed to POST an outbox-backed text record is the Slice 06 drain
implementation in `frontend/src/features/offline/outboxDrain.ts`.

`ChatPage` must pass the new hook inputs:

```ts
const tenantSlug = tenant?.slug ?? null
const [outboxDrainRequestSignal, requestOutboxDrain] = useReducer(
  (value: number) => value + 1,
  0,
)

const {
  handleOutboxSendSucceeded,
  handleRetryTextMessage,
  handleSendMessage,
  hydrateOptimisticTextSendsFromOutbox,
  optimisticTextSends,
} = useOptimisticTextSend({
  canUseOfflineTextQueue,
  isBrowserOnline,
  onOutboxRecordQueued: requestOutboxDrain,
  onTextSendStarted: () => {
    clearHistoryFragment()
    clearSendError()
  },
  pageState,
  replyTarget,
  setPageState,
  setSendErrorMessage,
  tenantSlug: tenantSlug ?? '',
  threadId: pageState.selectedThreadId ?? PRIVATE_CHAT_THREAD_ID,
  userId: user?.id ?? 0,
})
```

Return the new callbacks:

```ts
return {
  handleOutboxSendSucceeded,
  handleRetryTextMessage,
  handleSendMessage,
  hydrateOptimisticTextSendsFromOutbox,
  optimisticTextSends,
}
```

Guard before enabling send:

```ts
const canSend =
  Boolean(tenantSlug) &&
  Boolean(user?.id) &&
  pageState.status === 'ready' &&
  Boolean(pageState.selectedThreadId) &&
  (isReady || isFirstConversationBootstrapReady(pageState.snapshot))
```

- [ ] **Step 4: Hydrate durable outbox records and wire foreground drain**

In `ChatPage.tsx`, import the offline-domain APIs and cache/auth helpers:

```ts
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import {
  clearRejectedAuthSnapshot,
  offlineStore,
} from '../../offline/offlineStore'
import { offlineOutboxStore } from '../../offline/offlineOutboxStore'
import {
  estimateOfflineStorage,
  requestOfflineStoragePersistence,
} from '../../offline/storagePersistence'
import type { DrainOutcomeEvent } from '../../offline/outboxDrain'
import { useOfflineOutboxDrain } from '../../offline/useOfflineOutboxDrain'
import { buildSnapshotFromSendResult } from '../lib/chatSnapshot'
import { saveOfflineMessageSnapshot } from './offlineChatCache'
```

After trusted online auth, request persistent browser storage. Also estimate
storage before enabling offline text queueing:

```ts
const { refreshSession, sessionSource, user } = useAuthSession()
const [canUseOfflineTextQueue, setCanUseOfflineTextQueue] = useState(false)

useEffect(() => {
  if (sessionSource !== 'online' || !user?.id) {
    return
  }

  void requestOfflineStoragePersistence()
}, [sessionSource, user?.id])

useEffect(() => {
  if (!tenantSlug || !user?.id) {
    setCanUseOfflineTextQueue(false)
    return
  }

  let isCurrent = true

  estimateOfflineStorage()
    .then((estimate) => {
      if (isCurrent) {
        setCanUseOfflineTextQueue(!estimate.isLowQuota)
      }
    })
    .catch(() => {
      if (isCurrent) {
        setCanUseOfflineTextQueue(false)
      }
    })

  return () => {
    isCurrent = false
  }
}, [tenantSlug, user?.id])
```

Create a reusable selected-thread outbox loader, then call it when the selected
thread scope changes. This renders queued, sending and failed local records after
reload and lets drain outcome events refresh the visible local bubble without
reloading the route:

```ts
const loadSelectedThreadOutboxRecords = useCallback(async () => {
  if (!tenantSlug || !user?.id || !pageState.selectedThreadId) {
    return []
  }

  return offlineOutboxStore.listThreadOutboxRecords({
    tenantSlug,
    threadId: pageState.selectedThreadId,
    userId: user.id,
  })
}, [pageState.selectedThreadId, tenantSlug, user?.id])

useEffect(() => {
  let isCurrent = true

  loadSelectedThreadOutboxRecords()
    .then((records) => {
      if (isCurrent) {
        hydrateOptimisticTextSendsFromOutbox(records)
      }
    })
    .catch(() => {
      if (isCurrent) {
        hydrateOptimisticTextSendsFromOutbox([])
      }
    })

  return () => {
    isCurrent = false
  }
}, [hydrateOptimisticTextSendsFromOutbox, loadSelectedThreadOutboxRecords])
```

Add the drain success callback. It removes the local queued bubble through the
hook, merges the canonical `sentMessage` into the selected thread if needed, and
updates the cached thread snapshot even when the drained record belongs to a
non-selected thread:

```ts
const handleOutboxDrainSucceeded = useCallback(
  async ({
    record,
    sendResult,
  }: Parameters<typeof handleOutboxSendSucceeded>[0]) => {
    handleOutboxSendSucceeded({ record, sendResult })

    if (!tenantSlug || !user?.id) {
      return
    }

    const cachedSnapshotRecord = await offlineStore.readMessageSnapshot(
      tenantSlug,
      user.id,
      record.threadId,
    )
    const currentSnapshot =
      pageState.status === 'ready' &&
      pageState.selectedThreadId === record.threadId
        ? pageState.snapshot
        : (cachedSnapshotRecord?.snapshot ?? null)

    const snapshot = buildSnapshotFromSendResult({
      currentSnapshot,
      sendResult,
    })

    await saveOfflineMessageSnapshot({
      snapshot,
      tenantSlug,
      threadId: record.threadId,
      userId: user.id,
    })
  },
  [handleOutboxSendSucceeded, pageState, tenantSlug, user?.id],
)
```

Add a drain outcome callback for non-success branches. It does not log message
content and only re-hydrates local outbox records for the visible selected
thread. This keeps the UI in sync when drain returns a record from `sending` to
`queued`, rate-limits it, or marks it permanently `failed`:

```ts
const handleOutboxDrainOutcome = useCallback(
  async (event: DrainOutcomeEvent) => {
    if (
      event.category === 'sent' ||
      !tenantSlug ||
      !user?.id ||
      event.tenantSlug !== tenantSlug ||
      event.userId !== user.id ||
      event.threadId !== pageState.selectedThreadId
    ) {
      return
    }

    try {
      const records = await loadSelectedThreadOutboxRecords()
      hydrateOptimisticTextSendsFromOutbox(records)
    } catch {
      hydrateOptimisticTextSendsFromOutbox([])
    }
  },
  [
    hydrateOptimisticTextSendsFromOutbox,
    loadSelectedThreadOutboxRecords,
    pageState.selectedThreadId,
    tenantSlug,
    user?.id,
  ],
)
```

Add the auth rejection callback. It invalidates only the rejected cached auth
snapshot and leaves unsent outbox records intact:

```ts
const handleOutboxAuthRejected = useCallback(async () => {
  if (!tenantSlug || !user?.id) {
    return
  }

  await clearRejectedAuthSnapshot({
    host: window.location.host,
    tenantSlug,
    userId: user.id,
  })
  await refreshSession()
}, [refreshSession, tenantSlug, user?.id])
```

Update `useOfflineOutboxDrain.ts` so the foreground can request a drain after a
new durable outbox record commits. The hook still owns the lock and calls
`drainOfflineTextOutbox(...)`:

```ts
export function useOfflineOutboxDrain({
  drainRequestSignal = 0,
  enabled,
  onAuthRejected,
  onDrainOutcome,
  onSendSucceeded,
  tenantSlug,
  userId,
}: {
  drainRequestSignal?: number
  enabled: boolean
  onAuthRejected: () => void | Promise<void>
  onDrainOutcome?: (event: DrainOutcomeEvent) => void | Promise<void>
  onSendSucceeded: (event: OutboxDrainSuccessEvent) => void | Promise<void>
  tenantSlug: string | null
  userId: number | null
}) {
  // Keep the Slice 06 useEffect body exactly as implemented.
  // Only keep passing onDrainOutcome and add drainRequestSignal to the dependency array:
  // [drainRequestSignal, enabled, onAuthRejected, onDrainOutcome, onSendSucceeded, tenantSlug, userId]
}
```

Add `useOfflineOutboxDrain.test.tsx` coverage that changing
`drainRequestSignal` triggers the same locked drain path and does not bypass
`withOutboxDrainLock(...)`.

```ts
it('drains again through the lock when the request signal changes', async () => {
  const onAuthRejected = vi.fn()
  const onDrainOutcome = vi.fn()
  const onSendSucceeded = vi.fn()

  drainOfflineTextOutboxMock.mockResolvedValue('drained')

  const { rerender } = renderHook(
    ({ drainRequestSignal }) =>
      useOfflineOutboxDrain({
        drainRequestSignal,
        enabled: true,
        onAuthRejected,
        onDrainOutcome,
        onSendSucceeded,
        tenantSlug: 'buhfirma',
        userId: 7,
      }),
    {
      initialProps: {
        drainRequestSignal: 0,
      },
    },
  )

  await waitFor(() => {
    expect(withOutboxDrainLockMock).toHaveBeenCalledTimes(1)
  })

  rerender({ drainRequestSignal: 1 })

  await waitFor(() => {
    expect(withOutboxDrainLockMock).toHaveBeenCalledTimes(2)
  })
  expect(drainOfflineTextOutboxMock).toHaveBeenCalledTimes(2)
  expect(drainOfflineTextOutboxMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      onDrainOutcome,
      onSendSucceeded,
      tenantSlug: 'buhfirma',
      userId: 7,
    }),
  )
})
```

Wire the foreground drain. `ChatPage` does not own the queue; it only supplies
scope, sends a drain request signal and reacts to offline-domain events:

```ts
useOfflineOutboxDrain({
  drainRequestSignal: outboxDrainRequestSignal,
  enabled:
    isBrowserOnline &&
    Boolean(tenantSlug) &&
    Boolean(user?.id) &&
    pageState.status === 'ready',
  onAuthRejected: handleOutboxAuthRejected,
  onDrainOutcome: handleOutboxDrainOutcome,
  onSendSucceeded: handleOutboxDrainSucceeded,
  tenantSlug,
  userId: user?.id ?? null,
})
```

- [ ] **Step 5: Ensure queued UI has accessible label**

In `MessageBubble.tsx`, treat `queued` as a local text send and add status
mapping:

```ts
function isLocalTextSend(message: ChatMessage) {
  return (
    message.authorRole === 'current_user' &&
    message.attachments.length === 0 &&
    Boolean(message.clientMessageKey) &&
    (message.status === 'queued' ||
      message.status === 'sending' ||
      message.status === 'failed')
  )
}
```

```ts
if (message.status === 'queued') {
  return {
    ariaLabel: 'В очереди',
    label: 'В очереди',
  }
}
```

- [ ] **Step 6: Update composer tests**

Import the reply target type and add the durability regression:

```ts
import type { MessageComposerReplyTarget } from './message-composer/types'

it('keeps draft and reply target when text outbox write fails', async () => {
  const user = userEvent.setup()
  const onSend = vi.fn(async () => false)
  const onCancelReply = vi.fn()
  const replyTarget = {
    attachmentName: null,
    authorName: 'Поддержка',
    content: 'Предыдущее сообщение',
    direction: 'incoming',
    id: 77,
  } satisfies MessageComposerReplyTarget

  render(
    <MessageComposer
      disabled={false}
      errorMessage="Не удалось сохранить сообщение на этом устройстве."
      isSending={false}
      onCancelReply={onCancelReply}
      onSend={onSend}
      onSendAttachment={vi.fn(async () => true)}
      replyTarget={replyTarget}
    />,
  )

  await user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Offline')
  await user.click(screen.getByRole('button', { name: 'Отправить' }))

  expect(screen.getByRole('textbox', { name: 'Сообщение' })).toHaveValue(
    'Offline',
  )
  expect(screen.getByText('Предыдущее сообщение')).toBeInTheDocument()
  expect(onCancelReply).not.toHaveBeenCalled()
})

it('does not submit an already selected attachment after attachment send is disabled', async () => {
  const user = userEvent.setup()
  const onSendAttachment = vi.fn(async () => true)
  const attachment = new File(['invoice'], 'invoice.pdf', {
    type: 'application/pdf',
  })

  const { rerender } = render(
    <MessageComposer
      attachmentDisabled={false}
      disabled={false}
      errorMessage={null}
      isSending={false}
      onCancelReply={vi.fn()}
      onSend={vi.fn(async () => true)}
      onSendAttachment={onSendAttachment}
      replyTarget={null}
    />,
  )

  await user.upload(screen.getByLabelText('Файл вложения'), attachment)
  expect(screen.getByText('invoice.pdf')).toBeInTheDocument()

  rerender(
    <MessageComposer
      attachmentDisabled
      disabled={false}
      errorMessage={null}
      isSending={false}
      onCancelReply={vi.fn()}
      onSend={vi.fn(async () => true)}
      onSendAttachment={onSendAttachment}
      replyTarget={null}
    />,
  )

  await user.click(screen.getByRole('button', { name: 'Отправить файл' }))

  expect(onSendAttachment).not.toHaveBeenCalled()
  expect(screen.getByText('invoice.pdf')).toBeInTheDocument()
})
```

Add voice coverage with the existing recorder test strategy or a focused
`useVoiceRecorder` mock: when `voiceDisabled` becomes true before
`finishVoiceRecording` resolves the voice file, `onSendAttachment` is not called
and the composer does not clear text/reply state. The regression must exercise
the runtime `submitAttachmentFile(..., { allowVoiceRecorderBusy: true })` path,
not only the disabled microphone button.

- [ ] **Step 7: Update optimistic send tests**

Add offline store imports, tenant context, storage estimate helpers and clear the
database in `ChatPage.optimistic-send.test.tsx`:

```ts
import { clearOfflineDatabaseForTests } from '../../offline/offlineDatabase'
import { offlineOutboxStore } from '../../offline/offlineOutboxStore'
import { offlineStore } from '../../offline/offlineStore'
import { TenantIdentityContext } from '../../tenant/lib/tenantIdentityContext'
import type { OfflineTextOutboxRecord } from '../../offline/types'

const tenantContextValue = {
  errorMessage: null,
  isUsingCachedData: false,
  status: 'ready' as const,
  tenant: {
    displayName: 'Бухфирма',
    primaryDomain: 'lk.buhfirma.ru',
    publicBaseUrl: 'https://lk.buhfirma.ru',
    slug: 'buhfirma',
  },
}

function createAuthenticatedUserResponse() {
  return createJsonResponse({
    session: {
      expiresAt: '2026-06-10T10:00:00.000Z',
    },
    user: {
      email: 'name@group.ru',
      fullName: 'Portal User',
      id: 7,
    },
  })
}

function createOutboxRecord(
  overrides: Partial<OfflineTextOutboxRecord> = {},
): OfflineTextOutboxRecord {
  return {
    attemptCount: 0,
    clientMessageKey: 'portal-send:test-outbox',
    content: 'Saved queued text',
    createdAt: '2026-05-27T10:00:00.000Z',
    errorCode: null,
    errorMessage: null,
    lastAttemptAt: null,
    nextAttemptAt: null,
    replyTo: null,
    replyToMessageId: null,
    sendOwnerId: null,
    sendingLeaseExpiresAt: null,
    sendingStartedAt: null,
    status: 'queued',
    tenantSlug: 'buhfirma',
    threadId: 'private:me',
    updatedAt: '2026-05-27T10:00:00.000Z',
    userId: 7,
    ...overrides,
  }
}

function renderChatRoute() {
  renderWithRouter(
    <TenantIdentityContext.Provider value={tenantContextValue}>
      <AuthSessionProvider>
        <AppRoutes />
      </AuthSessionProvider>
    </TenantIdentityContext.Provider>,
    { initialEntries: ['/app/chat'] },
  )
}

function setNavigatorStorageEstimate({
  quota = 1000,
  usage = 100,
}: {
  quota?: number
  usage?: number
} = {}) {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      estimate: vi.fn(async () => ({
        quota,
        usage,
      })),
      persist: vi.fn(async () => true),
    },
  })
}

beforeEach(async () => {
  await clearOfflineDatabaseForTests()
  setNavigatorStorageEstimate()
  vi.stubGlobal('fetch', fetchMock)
})

function getMessagePostCalls() {
  return fetchMock.mock.calls.filter(
    ([url, options]) =>
      String(url).includes('/api/chat/messages') && options?.method === 'POST',
  )
}
```

Change current test name from "clears composer immediately" to durable drain
behavior:

```ts
it('queues a durable online text record and lets foreground drain reconcile it', async () => {
  const user = userEvent.setup()
  const sendResponse = createDeferredResponse()

  fetchMock
    .mockResolvedValueOnce(createAuthenticatedUserResponse())
    .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
    .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
    .mockReturnValueOnce(sendResponse.promise)

  renderChatRoute()

  await screen.findByText('Здравствуйте, вижу ваше обращение.')
  await user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Принято')
  await user.click(screen.getByRole('button', { name: 'Отправить' }))

  expect(screen.getByRole('textbox', { name: 'Сообщение' })).toHaveValue('')
  expect(screen.getByLabelText('Отправляется')).toBeInTheDocument()
  await waitFor(() => {
    expect(getMessagePostCalls()).toHaveLength(1)
  })
  window.dispatchEvent(new Event('online'))
  expect(getMessagePostCalls()).toHaveLength(1)

  await act(async () => {
    sendResponse.resolve(
      createJsonResponse({
        activeThread: privateThread,
        reason: 'none',
        result: 'ready',
        sentMessage: {
          attachments: [],
          authorName: 'Вы',
          authorRole: 'current_user',
          clientMessageKey: JSON.parse(
            String(getMessagePostCalls()[0]?.[1]?.body),
          ).clientMessageKey,
          content: 'Принято',
          contentType: 'text',
          createdAt: '2026-04-21T09:30:00.000Z',
          direction: 'outgoing',
          id: 501,
          status: 'sent',
        },
      }),
    )
  })

  await waitFor(() => {
    expect(screen.queryByLabelText('Отправляется')).not.toBeInTheDocument()
  })

  const [, requestOptions] = getMessagePostCalls()[0] ?? []
  const requestBody = JSON.parse(String(requestOptions?.body)) as {
    clientMessageKey: string
    threadId: string
  }

  await expect(
    offlineOutboxStore.readOutboxRecord({
      clientMessageKey: requestBody.clientMessageKey,
      tenantSlug: 'buhfirma',
      threadId: requestBody.threadId,
      userId: 7,
    }),
  ).resolves.toBeNull()
})
```

Add offline queue test:

```ts
it('queues text while offline and keeps the original client message key for later drain', async () => {
  const user = userEvent.setup()

  fetchMock
    .mockResolvedValueOnce(createAuthenticatedUserResponse())
    .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
    .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))

  renderChatRoute()
  await screen.findByText('Здравствуйте, вижу ваше обращение.')
  await waitFor(() => {
    expect(navigator.storage.estimate).toHaveBeenCalled()
  })

  window.dispatchEvent(new Event('offline'))

  await user.type(
    screen.getByRole('textbox', { name: 'Сообщение' }),
    'Плохая связь',
  )
  await user.click(screen.getByRole('button', { name: 'Отправить' }))

  expect(
    await screen.findByText(
      'Нет соединения. Сообщения будут отправлены, когда соединение восстановится.',
    ),
  ).toBeInTheDocument()
  expect(screen.queryByText(/отправка отключена/i)).not.toBeInTheDocument()
  expect(await screen.findByLabelText('В очереди')).toBeInTheDocument()
  expect(getMessagePostCalls()).toHaveLength(0)
  await waitFor(async () => {
    await expect(
      offlineOutboxStore.listThreadOutboxRecords({
        tenantSlug: 'buhfirma',
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toMatchObject([
      {
        clientMessageKey: expect.stringMatching(/^portal-send:/),
        content: 'Плохая связь',
        status: 'queued',
      },
    ])
  })
})
```

Add low storage queue guard coverage:

```ts
it('keeps draft visible when offline queueing is disabled by low storage estimate', async () => {
  const user = userEvent.setup()
  setNavigatorStorageEstimate({ quota: 100, usage: 95 })

  fetchMock
    .mockResolvedValueOnce(createAuthenticatedUserResponse())
    .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
    .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))

  renderChatRoute()
  await screen.findByText('Здравствуйте, вижу ваше обращение.')
  await waitFor(() => {
    expect(navigator.storage.estimate).toHaveBeenCalled()
  })

  window.dispatchEvent(new Event('offline'))

  await user.type(
    screen.getByRole('textbox', { name: 'Сообщение' }),
    'Мало места',
  )
  await user.click(screen.getByRole('button', { name: 'Отправить' }))

  expect(screen.getByRole('textbox', { name: 'Сообщение' })).toHaveValue(
    'Мало места',
  )
  expect(
    screen.getByText(
      'На устройстве недостаточно места для офлайн-отправки сообщений.',
    ),
  ).toBeInTheDocument()
  expect(getMessagePostCalls()).toHaveLength(0)
})
```

Add durable reload and drain integration tests:

```ts
it('renders a queued text message restored from durable outbox after reload', async () => {
  await offlineOutboxStore.saveOutboxRecord(
    createOutboxRecord({
      nextAttemptAt: '2026-05-27T10:10:00.000Z',
    }),
  )

  fetchMock
    .mockResolvedValueOnce(createAuthenticatedUserResponse())
    .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
    .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))

  renderChatRoute()

  expect(await screen.findByText('Saved queued text')).toBeInTheDocument()
  expect(screen.getByLabelText('В очереди')).toBeInTheDocument()
})

it('drains a queued text message on mount and reconciles it to the canonical backend message', async () => {
  await offlineOutboxStore.saveOutboxRecord(
    createOutboxRecord({
      clientMessageKey: 'portal-send:drain-on-mount',
      content: 'Drain me',
    }),
  )

  fetchMock
    .mockResolvedValueOnce(createAuthenticatedUserResponse())
    .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
    .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
    .mockResolvedValueOnce(
      createJsonResponse({
        activeThread: privateThread,
        reason: 'none',
        result: 'ready',
        sentMessage: {
          attachments: [],
          authorName: 'Вы',
          authorRole: 'current_user',
          clientMessageKey: 'portal-send:drain-on-mount',
          content: 'Drain me',
          contentType: 'text',
          createdAt: '2026-05-27T10:00:01.000Z',
          direction: 'outgoing',
          id: 601,
          status: 'sent',
        },
      }),
    )

  renderChatRoute()

  await waitFor(() => {
    expect(
      fetchMock.mock.calls.some(
        ([url, options]) =>
          String(url).includes('/api/chat/messages') &&
          options?.method === 'POST',
      ),
    ).toBe(true)
  })
  await waitFor(() => {
    expect(screen.queryByLabelText('В очереди')).not.toBeInTheDocument()
  })
  expect(screen.getByText('Drain me')).toBeInTheDocument()
  await expect(
    offlineOutboxStore.readOutboxRecord({
      clientMessageKey: 'portal-send:drain-on-mount',
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 7,
    }),
  ).resolves.toBeNull()
})

it('updates the visible local bubble when drain marks the outbox record failed', async () => {
  await offlineOutboxStore.saveOutboxRecord(
    createOutboxRecord({
      clientMessageKey: 'portal-send:drain-denied',
      content: 'Denied by backend',
    }),
  )

  fetchMock
    .mockResolvedValueOnce(createAuthenticatedUserResponse())
    .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
    .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
    .mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'thread_access_denied',
            message: 'Доступ к чату запрещен.',
          },
        },
        403,
      ),
    )

  renderChatRoute()

  expect(await screen.findByText('Denied by backend')).toBeInTheDocument()
  await waitFor(() => {
    expect(getMessagePostCalls()).toHaveLength(1)
  })
  await waitFor(() => {
    expect(screen.getByLabelText('Не отправлено')).toBeInTheDocument()
  })
  await expect(
    offlineOutboxStore.readOutboxRecord({
      clientMessageKey: 'portal-send:drain-denied',
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 7,
    }),
  ).resolves.toMatchObject({
    errorCode: 'thread_access_denied',
    status: 'failed',
  })
})

it('returns the visible local bubble to queued when drain is rate limited', async () => {
  await offlineOutboxStore.saveOutboxRecord(
    createOutboxRecord({
      clientMessageKey: 'portal-send:rate-limited',
      content: 'Retry later',
    }),
  )

  fetchMock
    .mockResolvedValueOnce(createAuthenticatedUserResponse())
    .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
    .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
    .mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'CHAT_SEND_RATE_LIMITED',
            message: 'Слишком много попыток отправки.',
          },
        },
        429,
      ),
    )

  renderChatRoute()

  expect(await screen.findByText('Retry later')).toBeInTheDocument()
  await waitFor(() => {
    expect(getMessagePostCalls()).toHaveLength(1)
  })
  await waitFor(() => {
    expect(screen.getByLabelText('В очереди')).toBeInTheDocument()
  })
  await expect(
    offlineOutboxStore.readOutboxRecord({
      clientMessageKey: 'portal-send:rate-limited',
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 7,
    }),
  ).resolves.toMatchObject({
    status: 'queued',
  })
})

it('retries a failed durable text record through the outbox drain path', async () => {
  await offlineOutboxStore.saveOutboxRecord(
    createOutboxRecord({
      clientMessageKey: 'portal-send:retry-failed',
      content: 'Retry me',
      errorCode: 'thread_access_denied',
      errorMessage: 'Нет доступа.',
      status: 'failed',
    }),
  )

  fetchMock
    .mockResolvedValueOnce(createAuthenticatedUserResponse())
    .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
    .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
    .mockResolvedValueOnce(
      createJsonResponse({
        activeThread: privateThread,
        reason: 'none',
        result: 'ready',
        sentMessage: {
          attachments: [],
          authorName: 'Вы',
          authorRole: 'current_user',
          clientMessageKey: 'portal-send:retry-failed',
          content: 'Retry me',
          contentType: 'text',
          createdAt: '2026-05-27T10:00:02.000Z',
          direction: 'outgoing',
          id: 602,
          status: 'sent',
        },
      }),
    )

  renderChatRoute()

  expect(await screen.findByText('Retry me')).toBeInTheDocument()
  expect(screen.getByLabelText('Не отправлено')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))

  await waitFor(() => {
    expect(getMessagePostCalls()).toHaveLength(1)
  })
  await waitFor(() => {
    expect(screen.queryByLabelText('Не отправлено')).not.toBeInTheDocument()
  })
  await expect(
    offlineOutboxStore.readOutboxRecord({
      clientMessageKey: 'portal-send:retry-failed',
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 7,
    }),
  ).resolves.toBeNull()
})

it('invalidates cached auth after outbox drain receives 401 and keeps unsent text queued', async () => {
  const record = createOutboxRecord({
    clientMessageKey: 'portal-send:auth-rejected',
    content: 'Keep me queued',
  })

  await offlineStore.saveLastActiveIdentity({
    host: window.location.host,
    savedAt: '2026-05-27T10:00:00.000Z',
    tenantSlug: 'buhfirma',
    userId: 7,
  })
  await offlineStore.saveAuthSnapshot({
    lastVerifiedAt: '2026-05-27T10:00:00.000Z',
    offlineAccessUntil: '2026-05-28T10:00:00.000Z',
    savedAt: '2026-05-27T10:00:00.000Z',
    sessionExpiresAt: '2026-06-10T10:00:00.000Z',
    tenantSlug: 'buhfirma',
    user: {
      email: 'name@group.ru',
      fullName: 'Portal User',
      id: 7,
    },
    userId: 7,
  })
  await offlineOutboxStore.saveOutboxRecord(record)

  fetchMock
    .mockResolvedValueOnce(createAuthenticatedUserResponse())
    .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
    .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
    .mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'unauthorized',
            message: 'Требуется вход.',
          },
        },
        401,
      ),
    )
    .mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'unauthorized',
            message: 'Требуется вход.',
          },
        },
        401,
      ),
    )

  renderChatRoute()

  await waitFor(async () => {
    await expect(
      offlineStore.readAuthSnapshot('buhfirma', 7),
    ).resolves.toBeNull()
  })
  await expect(
    offlineOutboxStore.readOutboxRecord({
      clientMessageKey: 'portal-send:auth-rejected',
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 7,
    }),
  ).resolves.toMatchObject({
    clientMessageKey: 'portal-send:auth-rejected',
    status: 'queued',
  })
})
```

- [ ] **Step 8: Run chat send tests**

```bash
pnpm --dir frontend test -- src/features/offline/offlineOutboxStore.test.ts src/features/offline/useOfflineOutboxDrain.test.tsx src/features/chat/components/MessageComposer.test.tsx src/features/chat/pages/ChatPage.optimistic-send.test.tsx --run
pnpm --dir frontend typecheck
```

Expected: PASS.
