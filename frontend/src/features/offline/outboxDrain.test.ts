import { beforeEach, expect, it, vi } from 'vitest'

import { ChatApiClientError, sendChatMessage } from '../chat/api/chatClient'
import type { ChatSendResult } from '../chat/types'
import {
  clearOfflineDatabaseForTests,
  openOfflineDatabase,
} from './offlineDatabase'
import { offlineOutboxStore } from './offlineOutboxStore'
import { drainOfflineTextOutbox, withOutboxDrainLock } from './outboxDrain'
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

async function putRawRecord(
  storeName: 'chat_text_outbox' | 'sync_leases',
  key: IDBValidKey,
  value: unknown,
) {
  const database = await openOfflineDatabase()
  const transaction = database.transaction(storeName, 'readwrite')

  try {
    await transaction.objectStore(storeName).put(value as never, key as never)
    await transaction.done
  } finally {
    database.close()
  }
}

function createSendResult({
  activeThreadId = 'private:me',
  clientMessageKey = 'portal-send:abc',
  content = 'Queued text',
}: {
  activeThreadId?: 'private:me' | `group:${number}`
  clientMessageKey?: string
  content?: string
} = {}): ChatSendResult {
  const activeThread =
    activeThreadId === 'private:me'
      ? {
          id: activeThreadId,
          subtitle: 'Вы и поддержка',
          title: 'Личный чат',
          type: 'private' as const,
        }
      : {
          id: activeThreadId,
          subtitle: 'Групповой чат',
          title: 'Другой чат',
          type: 'group' as const,
        }

  return {
    activeThread,
    reason: 'none',
    result: 'ready',
    sentMessage: {
      attachments: [],
      authorName: 'Вы',
      authorRole: 'current_user',
      clientMessageKey,
      content,
      contentType: 'text',
      createdAt: '2026-05-27T10:00:01.000Z',
      direction: 'outgoing',
      id: 501,
      status: 'sent',
    },
  }
}

function createThreadAccessDeniedSendResult(): ChatSendResult {
  return {
    activeThread: null,
    reason: 'thread_access_denied',
    result: 'not_ready',
    sentMessage: null,
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

it('ignores corrupted outbox records instead of trusting raw IndexedDB values', async () => {
  await putRawRecord(
    'chat_text_outbox',
    'buhfirma:7:private:me:portal-send:corrupted',
    {
      clientMessageKey: 'portal-send:corrupted',
      content: 'Broken text',
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 7,
    },
  )
  await offlineOutboxStore.saveOutboxRecord(
    createQueuedOutboxRecord({
      clientMessageKey: 'portal-send:valid',
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
      clientMessageKey: 'portal-send:valid',
    },
  ])
  await expect(
    offlineOutboxStore.listDueOutboxRecords({
      now: new Date('2026-05-27T10:00:01.000Z'),
      tenantSlug: 'buhfirma',
      userId: 7,
    }),
  ).resolves.toMatchObject([
    {
      clientMessageKey: 'portal-send:valid',
    },
  ])
})

it('returns null when a raw outbox record is corrupted or stored under the wrong scope', async () => {
  await putRawRecord(
    'chat_text_outbox',
    'buhfirma:7:private:me:portal-send:corrupted',
    {
      clientMessageKey: 'portal-send:corrupted',
      content: 'Broken text',
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 7,
    },
  )
  await putRawRecord(
    'chat_text_outbox',
    'buhfirma:7:private:me:portal-send:wrong-scope',
    createQueuedOutboxRecord({
      clientMessageKey: 'portal-send:wrong-scope',
      tenantSlug: 'stroyfirma',
    }),
  )

  await expect(
    offlineOutboxStore.readOutboxRecord({
      clientMessageKey: 'portal-send:corrupted',
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 7,
    }),
  ).resolves.toBeNull()
  await expect(
    offlineOutboxStore.readOutboxRecord({
      clientMessageKey: 'portal-send:wrong-scope',
      tenantSlug: 'buhfirma',
      threadId: 'private:me',
      userId: 7,
    }),
  ).resolves.toBeNull()
})

it('treats invalid retry timestamps as due instead of blocking local sends forever', async () => {
  await offlineOutboxStore.saveOutboxRecord(
    createQueuedOutboxRecord({
      clientMessageKey: 'portal-send:invalid-next-at',
      createdAt: '2026-05-27T10:00:01.000Z',
      nextAttemptAt: 'not-a-date',
      status: 'queued',
    }),
  )
  await offlineOutboxStore.saveOutboxRecord(
    createQueuedOutboxRecord({
      clientMessageKey: 'portal-send:invalid-lease',
      createdAt: '2026-05-27T10:00:02.000Z',
      sendOwnerId: 'old-tab',
      sendingLeaseExpiresAt: 'not-a-date',
      sendingStartedAt: '2026-05-27T09:59:00.000Z',
      status: 'sending',
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
      clientMessageKey: 'portal-send:invalid-next-at',
    },
    {
      clientMessageKey: 'portal-send:invalid-lease',
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
    onDrainOutcome,
    onSendSucceeded,
    sendChatMessage: sendChatMessageMock,
    tenantSlug: 'buhfirma',
    userId: 7,
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

it('keeps a record queued when a nominally successful ack belongs to another client message key', async () => {
  const record = createQueuedOutboxRecord()
  const onDrainOutcome = vi.fn()
  const onSendSucceeded = vi.fn()

  await offlineOutboxStore.saveOutboxRecord(record)
  sendChatMessageMock.mockResolvedValueOnce(
    createSendResult({ clientMessageKey: 'portal-send:other' }),
  )

  await drainOfflineTextOutbox({
    now: () => new Date('2026-05-27T10:00:01.000Z'),
    onDrainOutcome,
    onSendSucceeded,
    sendChatMessage: sendChatMessageMock,
    tenantSlug: 'buhfirma',
    userId: 7,
  })

  await expect(
    offlineOutboxStore.readOutboxRecord(record),
  ).resolves.toMatchObject({
    errorMessage: 'Не удалось отправить сообщение.',
    status: 'queued',
  })
  expect(onSendSucceeded).not.toHaveBeenCalled()
  expect(onDrainOutcome).toHaveBeenCalledWith({
    category: 'network_retry',
    clientMessageKey: 'portal-send:abc',
    tenantSlug: 'buhfirma',
    threadId: 'private:me',
    userId: 7,
  })
})

it('marks controlled thread access denial send results as failed', async () => {
  const record = createQueuedOutboxRecord({
    threadId: 'group:256',
  })
  const onDrainOutcome = vi.fn()
  const onSendSucceeded = vi.fn()

  await offlineOutboxStore.saveOutboxRecord(record)
  sendChatMessageMock.mockResolvedValueOnce(
    createThreadAccessDeniedSendResult(),
  )

  await drainOfflineTextOutbox({
    now: () => new Date('2026-05-27T10:00:01.000Z'),
    onDrainOutcome,
    onSendSucceeded,
    sendChatMessage: sendChatMessageMock,
    tenantSlug: 'buhfirma',
    userId: 7,
  })

  await expect(
    offlineOutboxStore.readOutboxRecord(record),
  ).resolves.toMatchObject({
    errorCode: 'thread_access_denied',
    errorMessage: 'Доступ к чату запрещен.',
    status: 'failed',
  })
  expect(onSendSucceeded).not.toHaveBeenCalled()
  expect(onDrainOutcome).toHaveBeenCalledWith({
    category: 'access_denied',
    clientMessageKey: 'portal-send:abc',
    errorCode: 'thread_access_denied',
    statusCode: 403,
    tenantSlug: 'buhfirma',
    threadId: 'group:256',
    userId: 7,
  })
})

it('keeps a record queued when a nominally successful ack belongs to another thread', async () => {
  const record = createQueuedOutboxRecord()
  const onSendSucceeded = vi.fn()

  await offlineOutboxStore.saveOutboxRecord(record)
  sendChatMessageMock.mockResolvedValueOnce(
    createSendResult({ activeThreadId: 'group:42' }),
  )

  await drainOfflineTextOutbox({
    now: () => new Date('2026-05-27T10:00:01.000Z'),
    onSendSucceeded,
    sendChatMessage: sendChatMessageMock,
    tenantSlug: 'buhfirma',
    userId: 7,
  })

  await expect(
    offlineOutboxStore.readOutboxRecord(record),
  ).resolves.toMatchObject({
    errorMessage: 'Не удалось отправить сообщение.',
    status: 'queued',
  })
  expect(onSendSucceeded).not.toHaveBeenCalled()
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
  { code: 'message_content_too_long', statusCode: 422 },
  { code: 'reply_target_unavailable', statusCode: 409 },
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

it('defaults unknown backend rejections to failed instead of retrying forever', async () => {
  const record = createQueuedOutboxRecord()

  await offlineOutboxStore.saveOutboxRecord(record)
  sendChatMessageMock.mockRejectedValueOnce(
    createChatApiError({
      code: 'unexpected_backend_rejection',
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
    errorCode: 'unexpected_backend_rejection',
    errorMessage: 'Send failed.',
    status: 'failed',
  })
})

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
  sendChatMessageMock.mockResolvedValueOnce(
    createSendResult({ clientMessageKey: 'portal-send:stale' }),
  )

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

it('runs only one fallback drain lease per tenant user scope', async () => {
  const operation = vi.fn(async () => 'drained' as const)

  await expect(
    Promise.all([
      withOutboxDrainLock('buhfirma', 7, operation),
      withOutboxDrainLock('buhfirma', 7, operation),
    ]),
  ).resolves.toContain('drained')
  expect(operation).toHaveBeenCalledTimes(1)
})

it('treats a corrupted fallback drain lease timestamp as expired', async () => {
  const operation = vi.fn(async () => 'drained' as const)

  await putRawRecord('sync_leases', 'portal-outbox:buhfirma:7', {
    expiresAt: 'not-a-date',
    ownerId: 'old-tab',
  })

  await expect(withOutboxDrainLock('buhfirma', 7, operation)).resolves.toBe(
    'drained',
  )
  expect(operation).toHaveBeenCalledTimes(1)
})
