import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PORTAL_OFFLINE_DATABASE_NAME = 'portal-offline'
const PORTAL_OFFLINE_DATABASE_VERSION = 2
const PORTAL_OFFLINE_STORES = [
  'tenant_contexts',
  'last_active_identities',
  'local_device_signouts',
  'auth_snapshots',
  'chat_thread_lists',
  'chat_message_snapshots',
  'chat_message_pages',
  'chat_text_outbox',
  'sync_leases',
  'push_stale_markers',
] as const

type Listener = (event: {
  tag?: string
  waitUntil?: (promise: Promise<unknown>) => void
}) => void

type TextOutboxRecordForTests = {
  attemptCount: number
  clientMessageKey: string
  content: string
  createdAt: string
  errorCode: string | null
  errorMessage: string | null
  lastAttemptAt: string | null
  nextAttemptAt: string | null
  replyTo: null
  replyToMessageId: number | null
  sendOwnerId: string | null
  sendingLeaseExpiresAt: string | null
  sendingStartedAt: string | null
  status: 'queued'
  tenantSlug: string
  threadId: string
  updatedAt: string
  userId: number
}

let testIndexedDB: IDBFactory

function loadServiceWorker({
  clientsList = [],
  fetch = vi.fn(),
  indexedDB = testIndexedDB,
  sourceTransform,
}: {
  clientsList?: Array<{
    id: string
    url: string
    visibilityState?: string
  }>
  fetch?: typeof globalThis.fetch
  indexedDB?: unknown
  sourceTransform?: (source: string) => string
} = {}) {
  const originalSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
  const source = sourceTransform
    ? sourceTransform(originalSource)
    : originalSource
  const listeners = new Map<string, Listener[]>()
  const serviceWorkerScope = {
    addEventListener: vi.fn((eventName: string, listener: Listener) => {
      listeners.set(eventName, [...(listeners.get(eventName) ?? []), listener])
    }),
    location: {
      origin: 'https://lk.provgroup.ru',
    },
    registration: {
      showNotification: vi.fn(),
    },
  }
  const cachesScope = {
    open: vi.fn(),
  }
  const clientsScope = {
    matchAll: vi.fn(async () => clientsList),
  }

  new Function(
    'self',
    'caches',
    'clients',
    'navigator',
    'indexedDB',
    'Response',
    'URL',
    'fetch',
    source,
  )(
    serviceWorkerScope,
    cachesScope,
    clientsScope,
    {},
    indexedDB,
    Response,
    URL,
    fetch,
  )

  return {
    fetch,
    listeners,
  }
}

async function openPortalOfflineDatabaseForTests() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = testIndexedDB.open(
      PORTAL_OFFLINE_DATABASE_NAME,
      PORTAL_OFFLINE_DATABASE_VERSION,
    )

    request.onupgradeneeded = () => {
      for (const storeName of PORTAL_OFFLINE_STORES) {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName)
        }
      }
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open portal offline DB.'))
    }
  })
}

async function putPortalOfflineRecord(
  storeName: (typeof PORTAL_OFFLINE_STORES)[number],
  key: IDBValidKey,
  value: unknown,
) {
  const database = await openPortalOfflineDatabaseForTests()

  try {
    const transaction = database.transaction(storeName, 'readwrite')

    transaction.objectStore(storeName).put(value, key)
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => {
        resolve()
      }
      transaction.onerror = () => {
        reject(transaction.error)
      }
      transaction.onabort = () => {
        reject(transaction.error)
      }
    })
  } finally {
    database.close()
  }
}

async function readPortalOfflineRecord(
  storeName: (typeof PORTAL_OFFLINE_STORES)[number],
  key: IDBValidKey,
) {
  const database = await openPortalOfflineDatabaseForTests()

  try {
    return await new Promise<unknown>((resolve, reject) => {
      const request = database
        .transaction(storeName)
        .objectStore(storeName)
        .get(key)

      request.onsuccess = () => {
        resolve(request.result)
      }
      request.onerror = () => {
        reject(request.error)
      }
    })
  } finally {
    database.close()
  }
}

async function dispatchSync(listener: Listener, tag: string) {
  const promises: Promise<unknown>[] = []

  listener({
    tag,
    waitUntil: (promise) => {
      promises.push(promise)
    },
  })

  await Promise.all(promises)
}

function createQueuedTextOutboxRecord(
  overrides: Partial<TextOutboxRecordForTests> = {},
): TextOutboxRecordForTests {
  return {
    attemptCount: 0,
    clientMessageKey: 'portal-send:bg-sync',
    content: 'Фоновая отправка',
    createdAt: '2026-05-29T12:00:01.000Z',
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
    tenantSlug: 'provgroup',
    threadId: 'private:me',
    updatedAt: '2026-05-29T12:00:01.000Z',
    userId: 7,
    ...overrides,
  }
}

async function saveLastActiveIdentity() {
  await putPortalOfflineRecord('last_active_identities', 'lk.provgroup.ru', {
    host: 'lk.provgroup.ru',
    savedAt: '2026-05-29T12:00:00.000Z',
    tenantSlug: 'provgroup',
    userId: 7,
  })
}

async function saveQueuedTextOutboxRecord(
  overrides: Partial<TextOutboxRecordForTests> = {},
) {
  const record = createQueuedTextOutboxRecord(overrides)

  await putPortalOfflineRecord(
    'chat_text_outbox',
    `provgroup:7:private:me:${record.clientMessageKey}`,
    record,
  )

  return record
}

describe('service worker background outbox sync', () => {
  beforeEach(() => {
    testIndexedDB = new IDBFactory()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('drains queued text outbox records from background sync when no portal client is visible', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
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
          clientMessageKey: 'portal-send:bg-sync',
          content: 'Фоновая отправка',
          contentType: 'text',
          createdAt: '2026-05-29T12:00:05.000Z',
          direction: 'outgoing',
          id: 9001,
          status: 'sent',
        },
      }),
    )
    const { listeners } = loadServiceWorker({ fetch })
    const syncListener = listeners.get('sync')?.[0]

    expect(syncListener).toBeDefined()

    await saveLastActiveIdentity()
    await saveQueuedTextOutboxRecord()

    await dispatchSync(syncListener!, 'portal-text-outbox-drain')

    expect(fetch).toHaveBeenCalledWith(
      '/api/chat/messages',
      expect.objectContaining({
        body: JSON.stringify({
          clientMessageKey: 'portal-send:bg-sync',
          content: 'Фоновая отправка',
          threadId: 'private:me',
        }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    )
    await expect(
      readPortalOfflineRecord(
        'chat_text_outbox',
        'provgroup:7:private:me:portal-send:bg-sync',
      ),
    ).resolves.toBeUndefined()
    await expect(
      readPortalOfflineRecord(
        'chat_message_snapshots',
        'provgroup:7:private:me',
      ),
    ).resolves.toMatchObject({
      snapshot: {
        messages: [
          expect.objectContaining({
            clientMessageKey: 'portal-send:bg-sync',
            content: 'Фоновая отправка',
            id: 9001,
          }),
        ],
        result: 'ready',
      },
      tenantSlug: 'provgroup',
      threadId: 'private:me',
      userId: 7,
    })
  })

  it.each([
    { code: 'message_content_too_long', statusCode: 422 },
    { code: 'reply_target_unavailable', statusCode: 409 },
  ])(
    'marks permanent background send error $code/$statusCode as failed',
    async ({ code, statusCode }) => {
      const fetch = vi.fn(async () =>
        Response.json(
          {
            error: {
              code,
              message: 'Background send failed.',
            },
          },
          { status: statusCode },
        ),
      )
      const { listeners } = loadServiceWorker({ fetch })
      const syncListener = listeners.get('sync')?.[0]

      expect(syncListener).toBeDefined()

      const record = await saveQueuedTextOutboxRecord({
        clientMessageKey: `portal-send:${code}`,
      })
      await saveLastActiveIdentity()

      await dispatchSync(syncListener!, 'portal-text-outbox-drain')

      await expect(
        readPortalOfflineRecord(
          'chat_text_outbox',
          `provgroup:7:private:me:${record.clientMessageKey}`,
        ),
      ).resolves.toMatchObject({
        errorCode: code,
        errorMessage: 'Background send failed.',
        status: 'failed',
      })
    },
  )

  it('defaults unknown background backend rejections to failed instead of retrying forever', async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: 'unexpected_backend_rejection',
            message: 'Background send failed.',
          },
        },
        { status: 409 },
      ),
    )
    const { listeners } = loadServiceWorker({
      fetch,
      sourceTransform: (source) =>
        source.replace(
          'const TEXT_OUTBOX_BACKGROUND_SEND_TIMEOUT_MS = 10_000',
          'const TEXT_OUTBOX_BACKGROUND_SEND_TIMEOUT_MS = 25',
        ),
    })
    const syncListener = listeners.get('sync')?.[0]

    expect(syncListener).toBeDefined()

    await saveQueuedTextOutboxRecord()
    await saveLastActiveIdentity()

    await dispatchSync(syncListener!, 'portal-text-outbox-drain')

    await expect(
      readPortalOfflineRecord(
        'chat_text_outbox',
        'provgroup:7:private:me:portal-send:bg-sync',
      ),
    ).resolves.toMatchObject({
      errorCode: 'unexpected_backend_rejection',
      errorMessage: 'Background send failed.',
      status: 'failed',
    })
  })

  it('times out a hanging background text send and keeps the record retryable', async () => {
    let backgroundSendSignal: AbortSignal | undefined
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, options?: RequestInit) => {
        backgroundSendSignal = options?.signal ?? undefined

        return new Promise<Response>((_resolve, reject) => {
          backgroundSendSignal?.addEventListener(
            'abort',
            () => reject(new DOMException('Request timed out.', 'AbortError')),
            { once: true },
          )
        })
      },
    )
    const { listeners } = loadServiceWorker({
      fetch,
      sourceTransform: (source) =>
        source.replace(
          'const TEXT_OUTBOX_BACKGROUND_SEND_TIMEOUT_MS = 10_000',
          'const TEXT_OUTBOX_BACKGROUND_SEND_TIMEOUT_MS = 25',
        ),
    })
    const syncListener = listeners.get('sync')?.[0]

    expect(syncListener).toBeDefined()

    await saveQueuedTextOutboxRecord()
    await saveLastActiveIdentity()

    const syncPromise = dispatchSync(syncListener!, 'portal-text-outbox-drain')

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(backgroundSendSignal?.aborted).toBe(true)
    })
    await syncPromise

    await expect(
      readPortalOfflineRecord(
        'chat_text_outbox',
        'provgroup:7:private:me:portal-send:bg-sync',
      ),
    ).resolves.toMatchObject({
      errorCode: null,
      errorMessage: 'Не удалось отправить сообщение.',
      nextAttemptAt: expect.any(String),
      sendOwnerId: null,
      sendingLeaseExpiresAt: null,
      sendingStartedAt: null,
      status: 'queued',
    })
  })
})
