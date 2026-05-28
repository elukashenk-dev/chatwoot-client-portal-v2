# Offline-first PWA Slice 06: Outbox Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the offline-domain durable text outbox store, foreground drain, fallback lease, stale `sending` recovery and privacy-safe drain outcome diagnostics.

**Architecture:** Queue persistence, visible outbox read-model selectors,
due-record selection, send leases and drain logic live under
`frontend/src/features/offline/`. `ChatPage` is not touched in this slice; Slice
07 wires these offline-domain APIs into the chat UI.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, IndexedDB, `idb`, Service Worker, Fastify, Drizzle/Postgres, Playwright.

---

**Part Of:** [Offline-first PWA Implementation Plan](./2026-05-27-offline-first-pwa-implementation.md)

**Slice:** 06 of 9

**Depends On:** Slices 01-04; Slice 05 is not required for the outbox internals.

**Unlocks:** Slice 07 composer/chat UI integration and Slice 09 multi-tab/stale-send e2e coverage.

---

## Task 7: Durable Text Outbox And Foreground Drain

**Goal:** Build the offline-domain durable text outbox API, foreground drain,
stale `sending` recovery, multi-tab coordination, auth-rejection signal and
success reconciliation callbacks.

Boundary rule:

- Do not implement durable queue persistence, drain, leases or stale `sending`
  recovery inside `ChatPage`. Keep those responsibilities in
  `frontend/src/features/offline/`; `ChatPage` only calls the offline-domain
  API/hooks and renders the resulting state.
- `offlineOutboxStore.ts` exposes both drain selectors and visible UI selectors.
  Drain selectors return only due records; UI selectors return all visible
  durable local records for the current tenant/user/thread.
- `outboxDrain.ts` owns retry classification. It must branch by backend error
  code when status codes are ambiguous.
- The drain must not update `ChatPage` directly. It reports success and auth
  rejection through callbacks that Slice 07 wires to chat-cache and auth
  boundaries.
- Any diagnostics/logging added for drain outcomes must record only categories
  such as `sent`, `network_retry`, `rate_limited`, `auth_rejected`,
  `access_denied` or `conflict`; never record message text, email, tokens or raw
  cached payloads.

**Files:**

- Modify: `frontend/src/features/chat/api/chatClient.ts`
- Create: `frontend/src/features/chat/api/chatClient.retry-after.test.ts`
- Create: `frontend/src/features/offline/offlineOutboxStore.ts`
- Create: `frontend/src/features/offline/outboxDrain.ts`
- Create: `frontend/src/features/offline/outboxDrain.test.ts`
- Create: `frontend/src/features/offline/useOfflineOutboxDrain.ts`
- Create: `frontend/src/features/offline/useOfflineOutboxDrain.test.tsx`

- [ ] **Step 1: Expose chat send retry-after metadata**

In `frontend/src/features/chat/api/chatClient.ts`, extend
`ChatApiClientError`:

```ts
export class ChatApiClientError extends Error {
  readonly code?: string
  readonly retryAfterSeconds: number | null
  readonly statusCode: number

  constructor({
    code,
    message,
    retryAfterSeconds = null,
    statusCode,
  }: {
    code?: string
    message: string
    retryAfterSeconds?: number | null
    statusCode: number
  }) {
    super(message)

    this.name = 'ChatApiClientError'
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
    this.statusCode = statusCode
  }
}
```

Add a response-header parser near `parseJsonBody`:

```ts
function parseRetryAfterSeconds(response: Response) {
  const retryAfter = response.headers.get('Retry-After')

  if (!retryAfter) {
    return null
  }

  const seconds = Number(retryAfter)

  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds)
  }

  const retryAtMs = Date.parse(retryAfter)

  if (!Number.isFinite(retryAtMs)) {
    return null
  }

  const delaySeconds = Math.ceil((retryAtMs - Date.now()) / 1000)

  return delaySeconds > 0 ? delaySeconds : null
}
```

Pass it when throwing backend errors:

```ts
throw new ChatApiClientError({
  code: errorPayload?.error?.code,
  message: errorPayload?.error?.message ?? networkErrorMessage,
  retryAfterSeconds: parseRetryAfterSeconds(response),
  statusCode: response.status,
})
```

Create `frontend/src/features/chat/api/chatClient.retry-after.test.ts`:

```ts
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ChatApiClientError, sendChatMessage } from './chatClient'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

function createRateLimitedResponse(retryAfter: string | null) {
  const headers = new Headers({
    'Content-Type': 'application/json',
  })

  if (retryAfter !== null) {
    headers.set('Retry-After', retryAfter)
  }

  return new Response(
    JSON.stringify({
      error: {
        code: 'CHAT_SEND_RATE_LIMITED',
        message: 'Слишком много сообщений. Попробуйте позже.',
      },
    }),
    {
      headers,
      status: 429,
    },
  )
}

it('exposes numeric retry-after seconds for chat send rate limits', async () => {
  fetchMock.mockResolvedValueOnce(createRateLimitedResponse('7'))

  await expect(
    sendChatMessage({
      clientMessageKey: 'portal-send:retry-after',
      content: 'Queued text',
      replyToMessageId: null,
      threadId: 'private:me',
    }),
  ).rejects.toMatchObject({
    code: 'CHAT_SEND_RATE_LIMITED',
    retryAfterSeconds: 7,
    statusCode: 429,
  } satisfies Partial<ChatApiClientError>)
})

it('falls back to null retry-after metadata when the header is invalid', async () => {
  fetchMock.mockResolvedValueOnce(createRateLimitedResponse('not-a-delay'))

  await expect(
    sendChatMessage({
      clientMessageKey: 'portal-send:invalid-retry-after',
      content: 'Queued text',
      replyToMessageId: null,
      threadId: 'private:me',
    }),
  ).rejects.toMatchObject({
    code: 'CHAT_SEND_RATE_LIMITED',
    retryAfterSeconds: null,
    statusCode: 429,
  } satisfies Partial<ChatApiClientError>)
})
```

- [ ] **Step 2: Add dedicated outbox persistence module**

Create `frontend/src/features/offline/offlineOutboxStore.ts`. Keep this module
separate from `ChatPage`; it owns outbox keys, due-record selection and fallback
lease records.

```ts
import { openOfflineDatabase } from './offlineDatabase'
import type { OfflineSyncLeaseRecord, OfflineTextOutboxRecord } from './types'

function outboxKey(
  record: Pick<
    OfflineTextOutboxRecord,
    'clientMessageKey' | 'tenantSlug' | 'threadId' | 'userId'
  >,
) {
  return `${record.tenantSlug}:${record.userId}:${record.threadId}:${record.clientMessageKey}`
}

function userPrefix(tenantSlug: string, userId: number) {
  return `${tenantSlug}:${userId}:`
}

function drainLeaseKey(tenantSlug: string, userId: number) {
  return `portal-outbox:${tenantSlug}:${userId}`
}

async function listOutboxRecords() {
  const database = await openOfflineDatabase()

  try {
    return await database.getAll('chat_text_outbox')
  } finally {
    database.close()
  }
}

async function putOutboxRecord(record: OfflineTextOutboxRecord) {
  const database = await openOfflineDatabase()

  try {
    await database.put('chat_text_outbox', record, outboxKey(record))
  } finally {
    database.close()
  }
}

export const offlineOutboxStore = {
  async deleteOutboxRecord(
    record: Pick<
      OfflineTextOutboxRecord,
      'clientMessageKey' | 'tenantSlug' | 'threadId' | 'userId'
    >,
  ) {
    const database = await openOfflineDatabase()

    try {
      await database.delete('chat_text_outbox', outboxKey(record))
    } finally {
      database.close()
    }
  },
  async readOutboxRecord(
    record: Pick<
      OfflineTextOutboxRecord,
      'clientMessageKey' | 'tenantSlug' | 'threadId' | 'userId'
    >,
  ) {
    const database = await openOfflineDatabase()

    try {
      return (await database.get('chat_text_outbox', outboxKey(record))) ?? null
    } finally {
      database.close()
    }
  },
  async listThreadOutboxRecords({
    tenantSlug,
    threadId,
    userId,
  }: {
    tenantSlug: string
    threadId: string
    userId: number
  }) {
    const records = await listOutboxRecords()

    return records
      .filter(
        (record) =>
          record.tenantSlug === tenantSlug &&
          record.userId === userId &&
          record.threadId === threadId,
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  },
  async listUserOutboxRecords({
    tenantSlug,
    userId,
  }: {
    tenantSlug: string
    userId: number
  }) {
    const records = await listOutboxRecords()
    const prefix = userPrefix(tenantSlug, userId)

    return records
      .filter((record) => `${record.tenantSlug}:${record.userId}:` === prefix)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  },
  async listDueOutboxRecords({
    now,
    tenantSlug,
    userId,
  }: {
    now: Date
    tenantSlug: string
    userId: number
  }) {
    const records = await listOutboxRecords()
    const nowMs = now.getTime()
    const prefix = userPrefix(tenantSlug, userId)

    return records
      .filter(
        (record) =>
          `${record.tenantSlug}:${record.userId}:` === prefix &&
          (record.status === 'queued' || record.status === 'sending'),
      )
      .filter((record) => {
        if (record.status === 'queued') {
          return (
            !record.nextAttemptAt ||
            new Date(record.nextAttemptAt).getTime() <= nowMs
          )
        }

        return (
          record.sendingLeaseExpiresAt !== null &&
          new Date(record.sendingLeaseExpiresAt).getTime() <= nowMs
        )
      })
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  },
  markOutboxFailed(
    record: OfflineTextOutboxRecord,
    errorCode: string | null,
    errorMessage: string,
    now: Date,
  ) {
    return putOutboxRecord({
      ...record,
      errorCode,
      errorMessage,
      sendOwnerId: null,
      sendingLeaseExpiresAt: null,
      sendingStartedAt: null,
      status: 'failed',
      updatedAt: now.toISOString(),
    })
  },
  markOutboxQueued(
    record: OfflineTextOutboxRecord,
    nextAttemptAt: string | null,
    errorMessage: string | null,
    now: Date,
  ) {
    return putOutboxRecord({
      ...record,
      errorCode: null,
      errorMessage,
      nextAttemptAt,
      sendOwnerId: null,
      sendingLeaseExpiresAt: null,
      sendingStartedAt: null,
      status: 'queued',
      updatedAt: now.toISOString(),
    })
  },
  markOutboxSending(
    record: OfflineTextOutboxRecord,
    ownerId: string,
    now: Date,
    leaseMs: number,
  ) {
    const nextRecord = {
      ...record,
      attemptCount: record.attemptCount + 1,
      errorCode: null,
      errorMessage: null,
      lastAttemptAt: now.toISOString(),
      sendOwnerId: ownerId,
      sendingLeaseExpiresAt: new Date(now.getTime() + leaseMs).toISOString(),
      sendingStartedAt: now.toISOString(),
      status: 'sending',
      updatedAt: now.toISOString(),
    } satisfies OfflineTextOutboxRecord

    return putOutboxRecord(nextRecord).then(() => nextRecord)
  },
  saveOutboxRecord: putOutboxRecord,
}
```

Add fallback drain lease helpers in the same file:

```ts
export async function tryAcquireOutboxDrainLease({
  leaseMs,
  now,
  ownerId,
  tenantSlug,
  userId,
}: {
  leaseMs: number
  now: Date
  ownerId: string
  tenantSlug: string
  userId: number
}) {
  const database = await openOfflineDatabase()
  const key = drainLeaseKey(tenantSlug, userId)

  try {
    const transaction = database.transaction('sync_leases', 'readwrite')
    const store = transaction.objectStore('sync_leases')
    const current = await store.get(key)
    const currentExpiresAt = current ? new Date(current.expiresAt).getTime() : 0
    let acquired = false

    if (!current || currentExpiresAt <= now.getTime()) {
      acquired = true
      await store.put(
        {
          expiresAt: new Date(now.getTime() + leaseMs).toISOString(),
          ownerId,
        } satisfies OfflineSyncLeaseRecord,
        key,
      )
    }

    await transaction.done

    return acquired
  } finally {
    database.close()
  }
}
```

```ts
export async function releaseOutboxDrainLease({
  ownerId,
  tenantSlug,
  userId,
}: {
  ownerId: string
  tenantSlug: string
  userId: number
}) {
  const database = await openOfflineDatabase()
  const key = drainLeaseKey(tenantSlug, userId)

  try {
    const transaction = database.transaction('sync_leases', 'readwrite')
    const store = transaction.objectStore('sync_leases')
    const current = await store.get(key)

    if (current?.ownerId === ownerId) {
      await store.delete(key)
    }

    await transaction.done
  } finally {
    database.close()
  }
}
```

- [ ] **Step 3: Write failing outbox drain tests**

In `outboxDrain.test.ts`, mock `sendChatMessage` and cover:

```ts
import { beforeEach, expect, it, vi } from 'vitest'

import { ChatApiClientError, sendChatMessage } from '../chat/api/chatClient'
import type { ChatSendResult } from '../chat/types'
import { clearOfflineDatabaseForTests } from './offlineDatabase'
import { offlineOutboxStore } from './offlineOutboxStore'
import { drainOfflineTextOutbox } from './outboxDrain'
import type { OfflineTextOutboxRecord } from './types'

const sendChatMessageMock = vi.fn<typeof sendChatMessage>()

beforeEach(async () => {
  await clearOfflineDatabaseForTests()
  sendChatMessageMock.mockReset()
})

function createQueuedOutboxRecord(
  overrides: Partial<OfflineTextOutboxRecord> = {},
): OfflineTextOutboxRecord {
  return {
    attemptCount: 0,
    clientMessageKey: 'portal-send:abc',
    content: 'Queued text',
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

function createSendResult(content = 'Queued text'): ChatSendResult {
  return {
    activeThread: {
      id: 'private:me',
      subtitle: 'Вы и поддержка',
      title: 'Личный чат',
      type: 'private',
    },
    reason: 'none',
    result: 'ready',
    sentMessage: {
      attachments: [],
      authorName: 'Вы',
      authorRole: 'current_user',
      content,
      contentType: 'text',
      createdAt: '2026-05-27T10:00:01.000Z',
      direction: 'outgoing',
      id: 501,
      status: 'sent',
    },
  }
}

function createChatApiError({
  code = 'network_error',
  retryAfterSeconds = null,
  statusCode,
}: {
  code?: string
  retryAfterSeconds?: number | null
  statusCode: number
}) {
  return new ChatApiClientError({
    code,
    message: 'Send failed.',
    retryAfterSeconds,
    statusCode,
  })
}

it('lists visible thread outbox records including future queued, sending and failed records', async () => {
  await offlineOutboxStore.saveOutboxRecord(
    createQueuedOutboxRecord({
      clientMessageKey: 'portal-send:future',
      createdAt: '2026-05-27T10:00:03.000Z',
      nextAttemptAt: '2026-05-27T10:10:00.000Z',
      status: 'queued',
    }),
  )
  await offlineOutboxStore.saveOutboxRecord(
    createQueuedOutboxRecord({
      clientMessageKey: 'portal-send:sending',
      createdAt: '2026-05-27T10:00:01.000Z',
      sendOwnerId: 'current-tab',
      sendingLeaseExpiresAt: '2026-05-27T10:05:00.000Z',
      sendingStartedAt: '2026-05-27T10:00:00.000Z',
      status: 'sending',
    }),
  )
  await offlineOutboxStore.saveOutboxRecord(
    createQueuedOutboxRecord({
      clientMessageKey: 'portal-send:failed',
      createdAt: '2026-05-27T10:00:02.000Z',
      errorMessage: 'Access denied.',
      status: 'failed',
    }),
  )
  await offlineOutboxStore.saveOutboxRecord(
    createQueuedOutboxRecord({
      clientMessageKey: 'portal-send:other-thread',
      threadId: 'group:other',
    }),
  )

  await expect(
    offlineOutboxStore.listThreadOutboxRecords({
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 7,
    }),
  ).resolves.toMatchObject([
    {
      clientMessageKey: 'portal-send:sending',
      status: 'sending',
    },
    {
      clientMessageKey: 'portal-send:failed',
      status: 'failed',
    },
    {
      clientMessageKey: 'portal-send:future',
      status: 'queued',
    },
  ])
})

it('keeps due drain selection separate from visible outbox selection', async () => {
  await offlineOutboxStore.saveOutboxRecord(
    createQueuedOutboxRecord({
      clientMessageKey: 'portal-send:future',
      nextAttemptAt: '2026-05-27T10:10:00.000Z',
      status: 'queued',
    }),
  )
  await offlineOutboxStore.saveOutboxRecord(
    createQueuedOutboxRecord({
      clientMessageKey: 'portal-send:due',
      nextAttemptAt: '2026-05-27T10:00:00.000Z',
      status: 'queued',
    }),
  )

  await expect(
    offlineOutboxStore.listDueOutboxRecords({
      now: new Date('2026-05-27T10:00:01.000Z'),
      tenantSlug: 'buhfirma',
      userId: 7,
    }),
  ).resolves.toMatchObject([
    {
      clientMessageKey: 'portal-send:due',
      status: 'queued',
    },
  ])
})

it('sends queued records with the original clientMessageKey, deletes them and emits reconciliation', async () => {
  const record = createQueuedOutboxRecord()
  const onDrainOutcome = vi.fn()
  const onSendSucceeded = vi.fn()

  await offlineOutboxStore.saveOutboxRecord(record)
  sendChatMessageMock.mockResolvedValueOnce(createSendResult())

  await drainOfflineTextOutbox({
    now: () => new Date('2026-05-27T10:00:01.000Z'),
    sendChatMessage: sendChatMessageMock,
    tenantSlug: 'buhfirma',
    userId: 7,
    onDrainOutcome,
    onSendSucceeded,
  })

  expect(sendChatMessageMock).toHaveBeenCalledWith({
    clientMessageKey: 'portal-send:abc',
    content: 'Queued text',
    replyToMessageId: null,
    threadId: 'private:me',
  })
  await expect(offlineOutboxStore.readOutboxRecord(record)).resolves.toBeNull()
  expect(onSendSucceeded).toHaveBeenCalledWith({
    record: expect.objectContaining({
      clientMessageKey: 'portal-send:abc',
      status: 'sending',
    }),
    sendResult: expect.objectContaining({
      sentMessage: expect.objectContaining({
        content: 'Queued text',
        id: 501,
      }),
    }),
  })
  expect(onDrainOutcome).toHaveBeenCalledWith({
    category: 'sent',
    clientMessageKey: 'portal-send:abc',
    tenantSlug: 'buhfirma',
    threadId: 'private:me',
    userId: 7,
  })
  const outcome = onDrainOutcome.mock.calls[0]?.[0] ?? {}
  expect(outcome).not.toHaveProperty('content')
  expect(outcome).not.toHaveProperty('replyTo')
})

it('does not requeue a sent record when success callback fails', async () => {
  const record = createQueuedOutboxRecord()

  await offlineOutboxStore.saveOutboxRecord(record)
  sendChatMessageMock.mockResolvedValueOnce(createSendResult())

  await expect(
    drainOfflineTextOutbox({
      now: () => new Date('2026-05-27T10:00:01.000Z'),
      onSendSucceeded: vi.fn(async () => {
        throw new Error('callback failed')
      }),
      sendChatMessage: sendChatMessageMock,
      tenantSlug: 'buhfirma',
      userId: 7,
    }),
  ).resolves.toBe('drained')

  await expect(offlineOutboxStore.readOutboxRecord(record)).resolves.toBeNull()
})
```

Add the error-path tests in the same file:

```ts
it('returns network failures to queued with exponential backoff', async () => {
  const record = createQueuedOutboxRecord({ attemptCount: 1 })

  await offlineOutboxStore.saveOutboxRecord(record)
  sendChatMessageMock.mockRejectedValueOnce(
    createChatApiError({ statusCode: 0 }),
  )

  await drainOfflineTextOutbox({
    now: () => new Date('2026-05-27T10:00:01.000Z'),
    sendChatMessage: sendChatMessageMock,
    tenantSlug: 'buhfirma',
    userId: 7,
  })

  await expect(
    offlineOutboxStore.readOutboxRecord(record),
  ).resolves.toMatchObject({
    attemptCount: 2,
    errorMessage: 'Send failed.',
    nextAttemptAt: '2026-05-27T10:00:03.000Z',
    status: 'queued',
  })
})

it('stops drain on 401 and keeps record queued for reauth', async () => {
  const record = createQueuedOutboxRecord()

  await offlineOutboxStore.saveOutboxRecord(record)
  sendChatMessageMock.mockRejectedValueOnce(
    createChatApiError({ code: 'unauthorized', statusCode: 401 }),
  )

  await expect(
    drainOfflineTextOutbox({
      now: () => new Date('2026-05-27T10:00:01.000Z'),
      sendChatMessage: sendChatMessageMock,
      tenantSlug: 'buhfirma',
      userId: 7,
    }),
  ).resolves.toBe('auth_rejected')
  await expect(
    offlineOutboxStore.readOutboxRecord(record),
  ).resolves.toMatchObject({
    errorMessage: 'Send failed.',
    status: 'queued',
  })
})

it.each([
  { code: 'forbidden', statusCode: 403 },
  { code: 'thread_access_denied', statusCode: 400 },
  { code: 'client_message_key_conflict', statusCode: 409 },
])(
  'marks permanent send error $code/$statusCode as failed',
  async ({ code, statusCode }) => {
    const record = createQueuedOutboxRecord({
      clientMessageKey: `portal-send:${statusCode}`,
    })

    await offlineOutboxStore.saveOutboxRecord(record)
    sendChatMessageMock.mockRejectedValueOnce(
      createChatApiError({ code, statusCode }),
    )

    await drainOfflineTextOutbox({
      now: () => new Date('2026-05-27T10:00:01.000Z'),
      sendChatMessage: sendChatMessageMock,
      tenantSlug: 'buhfirma',
      userId: 7,
    })

    await expect(
      offlineOutboxStore.readOutboxRecord(record),
    ).resolves.toMatchObject({
      errorCode: code,
      errorMessage: 'Send failed.',
      status: 'failed',
    })
  },
)

it.each([
  {
    error: { statusCode: 0 },
    expectedCategory: 'network_retry',
  },
  {
    error: {
      code: 'CHAT_SEND_RATE_LIMITED',
      retryAfterSeconds: 17,
      statusCode: 429,
    },
    expectedCategory: 'rate_limited',
  },
  {
    error: { code: 'unauthorized', statusCode: 401 },
    expectedCategory: 'auth_rejected',
  },
  {
    error: { code: 'thread_access_denied', statusCode: 400 },
    expectedCategory: 'access_denied',
  },
  {
    error: { code: 'client_message_key_conflict', statusCode: 409 },
    expectedCategory: 'conflict',
  },
])(
  'emits privacy-safe $expectedCategory drain outcome',
  async ({ error, expectedCategory }) => {
    const record = createQueuedOutboxRecord()
    const onDrainOutcome = vi.fn()

    await offlineOutboxStore.saveOutboxRecord(record)
    sendChatMessageMock.mockRejectedValueOnce(createChatApiError(error))

    await drainOfflineTextOutbox({
      now: () => new Date('2026-05-27T10:00:01.000Z'),
      onDrainOutcome,
      sendChatMessage: sendChatMessageMock,
      tenantSlug: 'buhfirma',
      userId: 7,
    })

    const outcome = onDrainOutcome.mock.calls[0]?.[0] ?? {}
    expect(outcome).toMatchObject({
      category: expectedCategory,
      clientMessageKey: 'portal-send:abc',
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 7,
    })
    expect(outcome).not.toHaveProperty('content')
    expect(outcome).not.toHaveProperty('replyTo')
    expect(outcome).not.toHaveProperty('email')
  },
)

it('requeues chat_send_in_progress with a short retry delay', async () => {
  const record = createQueuedOutboxRecord()

  await offlineOutboxStore.saveOutboxRecord(record)
  sendChatMessageMock.mockRejectedValueOnce(
    createChatApiError({
      code: 'chat_send_in_progress',
      statusCode: 409,
    }),
  )

  await drainOfflineTextOutbox({
    now: () => new Date('2026-05-27T10:00:01.000Z'),
    sendChatMessage: sendChatMessageMock,
    tenantSlug: 'buhfirma',
    userId: 7,
  })

  await expect(
    offlineOutboxStore.readOutboxRecord(record),
  ).resolves.toMatchObject({
    errorCode: null,
    errorMessage: 'Send failed.',
    nextAttemptAt: '2026-05-27T10:00:06.000Z',
    status: 'queued',
  })
})

it('keeps 429 in queued state and respects Retry-After', async () => {
  const record = createQueuedOutboxRecord({ attemptCount: 3 })

  await offlineOutboxStore.saveOutboxRecord(record)
  sendChatMessageMock.mockRejectedValueOnce(
    createChatApiError({
      code: 'CHAT_SEND_RATE_LIMITED',
      retryAfterSeconds: 17,
      statusCode: 429,
    }),
  )

  await drainOfflineTextOutbox({
    now: () => new Date('2026-05-27T10:00:01.000Z'),
    sendChatMessage: sendChatMessageMock,
    tenantSlug: 'buhfirma',
    userId: 7,
  })

  await expect(
    offlineOutboxStore.readOutboxRecord(record),
  ).resolves.toMatchObject({
    errorMessage: 'Send failed.',
    nextAttemptAt: '2026-05-27T10:00:18.000Z',
    status: 'queued',
  })
})

it('falls back to exponential backoff when 429 has no Retry-After metadata', async () => {
  const record = createQueuedOutboxRecord({ attemptCount: 3 })

  await offlineOutboxStore.saveOutboxRecord(record)
  sendChatMessageMock.mockRejectedValueOnce(
    createChatApiError({
      code: 'CHAT_SEND_RATE_LIMITED',
      statusCode: 429,
    }),
  )

  await drainOfflineTextOutbox({
    now: () => new Date('2026-05-27T10:00:01.000Z'),
    sendChatMessage: sendChatMessageMock,
    tenantSlug: 'buhfirma',
    userId: 7,
  })

  await expect(
    offlineOutboxStore.readOutboxRecord(record),
  ).resolves.toMatchObject({
    errorMessage: 'Send failed.',
    nextAttemptAt: '2026-05-27T10:00:09.000Z',
    status: 'queued',
  })
})

it('retries expired sending leases with the original clientMessageKey', async () => {
  const record = createQueuedOutboxRecord({
    clientMessageKey: 'portal-send:stale',
    sendOwnerId: 'old-tab',
    sendingLeaseExpiresAt: '2026-05-27T09:59:59.000Z',
    sendingStartedAt: '2026-05-27T09:59:00.000Z',
    status: 'sending',
  })

  await offlineOutboxStore.saveOutboxRecord(record)
  sendChatMessageMock.mockResolvedValueOnce(createSendResult())

  await drainOfflineTextOutbox({
    now: () => new Date('2026-05-27T10:00:01.000Z'),
    sendChatMessage: sendChatMessageMock,
    tenantSlug: 'buhfirma',
    userId: 7,
  })

  expect(sendChatMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      clientMessageKey: 'portal-send:stale',
    }),
  )
  await expect(offlineOutboxStore.readOutboxRecord(record)).resolves.toBeNull()
})
```

- [ ] **Step 4: Implement `outboxDrain.ts`**

Create:

```ts
import type {
  ChatApiClientError,
  sendChatMessage as defaultSendChatMessage,
} from '../chat/api/chatClient'
import type { ChatSendResult } from '../chat/types'
import {
  offlineOutboxStore,
  releaseOutboxDrainLease,
  tryAcquireOutboxDrainLease,
} from './offlineOutboxStore'
import type { OfflineTextOutboxRecord } from './types'

const SEND_LEASE_MS = 30_000
const DRAIN_LEASE_MS = 30_000
const SEND_IN_PROGRESS_RETRY_MS = 5_000

function createOwnerId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `portal-outbox-owner:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function addBackoff(now: Date, attemptCount: number) {
  const delayMs = Math.min(60_000, 1000 * 2 ** Math.max(0, attemptCount - 1))

  return new Date(now.getTime() + delayMs).toISOString()
}

function addRetryAfter(
  now: Date,
  retryAfterSeconds: number | null | undefined,
) {
  if (
    typeof retryAfterSeconds === 'number' &&
    Number.isFinite(retryAfterSeconds) &&
    retryAfterSeconds > 0
  ) {
    return new Date(now.getTime() + retryAfterSeconds * 1000).toISOString()
  }

  return null
}

type DrainResult = 'auth_rejected' | 'drained'

type DrainSendSucceededEvent = {
  record: OfflineTextOutboxRecord
  sendResult: ChatSendResult
}

export type DrainOutcomeCategory =
  | 'access_denied'
  | 'auth_rejected'
  | 'conflict'
  | 'network_retry'
  | 'rate_limited'
  | 'sent'

export type DrainOutcomeEvent = {
  category: DrainOutcomeCategory
  clientMessageKey: string
  errorCode?: string | null
  statusCode?: number | null
  tenantSlug: string
  threadId: string
  userId: number
}

async function emitSendSucceeded(
  onSendSucceeded:
    | ((event: DrainSendSucceededEvent) => void | Promise<void>)
    | undefined,
  event: DrainSendSucceededEvent,
) {
  try {
    await onSendSucceeded?.(event)
  } catch {
    // Reconciliation callbacks are best-effort and must not requeue sent text.
  }
}

async function emitDrainOutcome(
  onDrainOutcome:
    | ((event: DrainOutcomeEvent) => void | Promise<void>)
    | undefined,
  event: DrainOutcomeEvent,
) {
  try {
    await onDrainOutcome?.(event)
  } catch {
    // Diagnostics are best-effort and must not change outbox state.
  }
}

export async function drainOfflineTextOutbox({
  now = () => new Date(),
  onDrainOutcome,
  onSendSucceeded,
  sendChatMessage,
  tenantSlug,
  userId,
}: {
  now?: () => Date
  onDrainOutcome?: (event: DrainOutcomeEvent) => void | Promise<void>
  onSendSucceeded?: (event: DrainSendSucceededEvent) => void | Promise<void>
  sendChatMessage: typeof defaultSendChatMessage
  tenantSlug: string
  userId: number
}): Promise<DrainResult> {
  const dueRecords = await offlineOutboxStore.listDueOutboxRecords({
    now: now(),
    tenantSlug,
    userId,
  })

  for (const record of dueRecords) {
    const attemptAt = now()
    const ownerId = createOwnerId()

    const sendingRecord = await offlineOutboxStore.markOutboxSending(
      record,
      ownerId,
      attemptAt,
      SEND_LEASE_MS,
    )

    try {
      const result = await sendChatMessage({
        clientMessageKey: record.clientMessageKey,
        content: record.content,
        replyToMessageId: record.replyToMessageId,
        threadId: record.threadId,
      })

      if (result.result === 'ready' && result.sentMessage) {
        try {
          await offlineOutboxStore.deleteOutboxRecord(sendingRecord)
        } catch {
          // A sent backend message must not be requeued because local deletion failed.
        }
        await emitSendSucceeded(onSendSucceeded, {
          record: sendingRecord,
          sendResult: result,
        })
        await emitDrainOutcome(onDrainOutcome, {
          category: 'sent',
          clientMessageKey: sendingRecord.clientMessageKey,
          tenantSlug,
          threadId: sendingRecord.threadId,
          userId,
        })
        continue
      }

      await offlineOutboxStore.markOutboxQueued(
        sendingRecord,
        null,
        'Не удалось отправить сообщение.',
        now(),
      )
      await emitDrainOutcome(onDrainOutcome, {
        category: 'network_retry',
        clientMessageKey: sendingRecord.clientMessageKey,
        tenantSlug,
        threadId: sendingRecord.threadId,
        userId,
      })
    } catch (error) {
      const apiError = error as ChatApiClientError

      if (apiError.statusCode === 401) {
        await offlineOutboxStore.markOutboxQueued(
          sendingRecord,
          null,
          apiError.message,
          now(),
        )
        await emitDrainOutcome(onDrainOutcome, {
          category: 'auth_rejected',
          clientMessageKey: sendingRecord.clientMessageKey,
          errorCode: apiError.code ?? null,
          statusCode: apiError.statusCode,
          tenantSlug,
          threadId: sendingRecord.threadId,
          userId,
        })
        return 'auth_rejected'
      }

      if (
        apiError.statusCode === 403 ||
        apiError.code === 'thread_access_denied'
      ) {
        await offlineOutboxStore.markOutboxFailed(
          sendingRecord,
          apiError.code ?? null,
          apiError.message,
          now(),
        )
        await emitDrainOutcome(onDrainOutcome, {
          category: 'access_denied',
          clientMessageKey: sendingRecord.clientMessageKey,
          errorCode: apiError.code ?? null,
          statusCode: apiError.statusCode ?? null,
          tenantSlug,
          threadId: sendingRecord.threadId,
          userId,
        })
        continue
      }

      if (apiError.statusCode === 409) {
        if (apiError.code === 'chat_send_in_progress') {
          await offlineOutboxStore.markOutboxQueued(
            sendingRecord,
            new Date(now().getTime() + SEND_IN_PROGRESS_RETRY_MS).toISOString(),
            apiError.message,
            now(),
          )
          await emitDrainOutcome(onDrainOutcome, {
            category: 'network_retry',
            clientMessageKey: sendingRecord.clientMessageKey,
            errorCode: apiError.code,
            statusCode: apiError.statusCode,
            tenantSlug,
            threadId: sendingRecord.threadId,
            userId,
          })
          continue
        }

        if (apiError.code === 'client_message_key_conflict') {
          await offlineOutboxStore.markOutboxFailed(
            sendingRecord,
            apiError.code,
            apiError.message,
            now(),
          )
          await emitDrainOutcome(onDrainOutcome, {
            category: 'conflict',
            clientMessageKey: sendingRecord.clientMessageKey,
            errorCode: apiError.code,
            statusCode: apiError.statusCode,
            tenantSlug,
            threadId: sendingRecord.threadId,
            userId,
          })
          continue
        }
      }

      if (apiError.statusCode === 429) {
        await offlineOutboxStore.markOutboxQueued(
          sendingRecord,
          addRetryAfter(now(), apiError.retryAfterSeconds) ??
            addBackoff(now(), sendingRecord.attemptCount),
          apiError.message,
          now(),
        )
        await emitDrainOutcome(onDrainOutcome, {
          category: 'rate_limited',
          clientMessageKey: sendingRecord.clientMessageKey,
          errorCode: apiError.code ?? null,
          statusCode: apiError.statusCode,
          tenantSlug,
          threadId: sendingRecord.threadId,
          userId,
        })
        continue
      }

      await offlineOutboxStore.markOutboxQueued(
        sendingRecord,
        addBackoff(now(), sendingRecord.attemptCount),
        apiError.message,
        now(),
      )
      await emitDrainOutcome(onDrainOutcome, {
        category: 'network_retry',
        clientMessageKey: sendingRecord.clientMessageKey,
        errorCode: apiError.code ?? null,
        statusCode: apiError.statusCode ?? null,
        tenantSlug,
        threadId: sendingRecord.threadId,
        userId,
      })
    }
  }

  return 'drained'
}
```

Include Web Locks:

```ts
export async function withOutboxDrainLock<T>(
  tenantSlug: string,
  userId: number,
  operation: () => Promise<T>,
) {
  const lockName = `portal-outbox:${tenantSlug}:${userId}`
  const ownerId = createOwnerId()
  const now = new Date()

  const navigatorWithLocks = navigator as Navigator & {
    locks?: {
      request<TValue>(
        name: string,
        callback: () => Promise<TValue>,
      ): Promise<TValue>
    }
  }

  if (navigatorWithLocks.locks) {
    return navigatorWithLocks.locks.request(lockName, operation)
  }

  const acquired = await tryAcquireOutboxDrainLease({
    leaseMs: DRAIN_LEASE_MS,
    now,
    ownerId,
    tenantSlug,
    userId,
  })

  if (!acquired) {
    return null
  }

  try {
    return await operation()
  } finally {
    await releaseOutboxDrainLease({
      ownerId,
      tenantSlug,
      userId,
    })
  }
}
```

- [ ] **Step 5: Add React drain hook**

Create `useOfflineOutboxDrain.ts`:

```ts
import { useEffect } from 'react'

import { sendChatMessage } from '../chat/api/chatClient'
import type { ChatSendResult } from '../chat/types'
import { drainOfflineTextOutbox, withOutboxDrainLock } from './outboxDrain'
import type { DrainOutcomeEvent } from './outboxDrain'
import type { OfflineTextOutboxRecord } from './types'

type OutboxDrainSuccessEvent = {
  record: OfflineTextOutboxRecord
  sendResult: ChatSendResult
}

export function useOfflineOutboxDrain({
  enabled,
  onAuthRejected,
  onDrainOutcome,
  onSendSucceeded,
  tenantSlug,
  userId,
}: {
  enabled: boolean
  onAuthRejected: () => void | Promise<void>
  onDrainOutcome?: (event: DrainOutcomeEvent) => void | Promise<void>
  onSendSucceeded: (event: OutboxDrainSuccessEvent) => void | Promise<void>
  tenantSlug: string | null
  userId: number | null
}) {
  useEffect(() => {
    if (!enabled || !tenantSlug || !userId) {
      return
    }

    let isMounted = true

    async function drain() {
      if (!isMounted) {
        return
      }

      try {
        const result = await withOutboxDrainLock(tenantSlug!, userId!, () =>
          drainOfflineTextOutbox({
            onDrainOutcome,
            onSendSucceeded,
            sendChatMessage,
            tenantSlug: tenantSlug!,
            userId: userId!,
          }),
        )

        if (result === 'auth_rejected' && isMounted) {
          await onAuthRejected()
        }
      } catch {
        // Drain is best-effort; later startup, online and visibility events retry.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void drain()
      }
    }

    void drain()
    window.addEventListener('online', drain)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isMounted = false
      window.removeEventListener('online', drain)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [
    enabled,
    onAuthRejected,
    onDrainOutcome,
    onSendSucceeded,
    tenantSlug,
    userId,
  ])
}
```

- [ ] **Step 6: Write drain hook tests**

Create `frontend/src/features/offline/useOfflineOutboxDrain.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { drainOfflineTextOutbox, withOutboxDrainLock } from './outboxDrain'
import { useOfflineOutboxDrain } from './useOfflineOutboxDrain'

vi.mock('../chat/api/chatClient', () => ({
  sendChatMessage: vi.fn(),
}))

vi.mock('./outboxDrain', () => ({
  drainOfflineTextOutbox: vi.fn(),
  withOutboxDrainLock: vi.fn(
    async (
      _tenantSlug: string,
      _userId: number,
      operation: () => Promise<unknown>,
    ) => operation(),
  ),
}))

const drainOfflineTextOutboxMock = vi.mocked(drainOfflineTextOutbox)
const withOutboxDrainLockMock = vi.mocked(withOutboxDrainLock)

afterEach(() => {
  vi.clearAllMocks()
})

it('drains on mount with the current tenant user scope and success callback', async () => {
  const onAuthRejected = vi.fn()
  const onDrainOutcome = vi.fn()
  const onSendSucceeded = vi.fn()

  drainOfflineTextOutboxMock.mockResolvedValueOnce('drained')

  renderHook(() =>
    useOfflineOutboxDrain({
      enabled: true,
      onAuthRejected,
      onDrainOutcome,
      onSendSucceeded,
      tenantSlug: 'buhfirma',
      userId: 7,
    }),
  )

  await waitFor(() => {
    expect(withOutboxDrainLockMock).toHaveBeenCalledWith(
      'buhfirma',
      7,
      expect.any(Function),
    )
  })
  expect(drainOfflineTextOutboxMock).toHaveBeenCalledWith(
    expect.objectContaining({
      onDrainOutcome,
      onSendSucceeded,
      tenantSlug: 'buhfirma',
      userId: 7,
    }),
  )
  expect(onAuthRejected).not.toHaveBeenCalled()
})

it('invokes the auth rejection callback when drain returns auth_rejected', async () => {
  const onAuthRejected = vi.fn()

  drainOfflineTextOutboxMock.mockResolvedValueOnce('auth_rejected')

  renderHook(() =>
    useOfflineOutboxDrain({
      enabled: true,
      onAuthRejected,
      onSendSucceeded: vi.fn(),
      tenantSlug: 'buhfirma',
      userId: 7,
    }),
  )

  await waitFor(() => {
    expect(onAuthRejected).toHaveBeenCalledTimes(1)
  })
})

it('does not drain without a valid scope', async () => {
  renderHook(() =>
    useOfflineOutboxDrain({
      enabled: true,
      onAuthRejected: vi.fn(),
      onSendSucceeded: vi.fn(),
      tenantSlug: null,
      userId: 7,
    }),
  )

  expect(withOutboxDrainLockMock).not.toHaveBeenCalled()
  expect(drainOfflineTextOutboxMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 7: Run outbox tests**

```bash
pnpm --dir frontend test -- src/features/chat/api/chatClient.retry-after.test.ts src/features/offline/outboxDrain.test.ts src/features/offline/useOfflineOutboxDrain.test.tsx --run
pnpm --dir frontend typecheck
```

Expected: PASS.

Additional acceptance for this slice:

- outbox drain exposes enough category-level outcome information for production
  troubleshooting without logging message content;
- retry/backoff/auth-rejection branches can be counted or inspected in tests by
  category, but user text remains only in the local outbox record and backend
  send request.
