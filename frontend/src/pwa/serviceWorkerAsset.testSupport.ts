import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { vi } from 'vitest'

const APP_BADGE_DATABASE_NAME = 'provgroup-portal-app-badge'

export type ServiceWorkerTestListener = (event: {
  data?: unknown
  notification?: {
    close: () => void
    data?: unknown
  }
  request?: Request
  respondWith?: (response: Promise<Response> | Response) => void
  source?: { id?: string }
  waitUntil?: (promise: Promise<unknown>) => void
}) => void

type IndexedDbPutCall = {
  key: IDBValidKey
  storeName: string
  value: unknown
}

export function createServiceWorkerIndexedDbFake({
  failOpen = false,
  failPut = false,
  records = {},
}: {
  failOpen?: boolean
  failPut?: boolean
  records?: Record<string, Record<string, unknown>>
} = {}) {
  const putCalls: IndexedDbPutCall[] = []
  const createdStores = new Set<string>()
  const storeRecords = new Map(
    Object.entries(records).map(([storeName, values]) => [
      storeName,
      new Map(Object.entries(values)),
    ]),
  )
  const indexedDB = {
    open: vi.fn(() => {
      const database = {
        close: vi.fn(),
        createObjectStore: vi.fn((storeName: string) => {
          createdStores.add(storeName)
        }),
        objectStoreNames: {
          contains: (storeName: string) => createdStores.has(storeName),
        },
        transaction: vi.fn((storeName: string) => {
          const recordsForStore =
            storeRecords.get(storeName) ?? new Map<string, unknown>()
          storeRecords.set(storeName, recordsForStore)

          const transaction = {
            error: null as Error | null,
            objectStore: () => ({
              get: (key: IDBValidKey) => {
                const request = {
                  error: null as Error | null,
                  result: undefined as unknown,
                  onerror: null as (() => void) | null,
                  onsuccess: null as (() => void) | null,
                }

                queueMicrotask(() => {
                  request.result = recordsForStore.get(String(key))
                  request.onsuccess?.()
                  setTimeout(() => {
                    transaction.oncomplete?.()
                  }, 0)
                })

                return request
              },
              put: (value: unknown, key: IDBValidKey) => {
                putCalls.push({ key, storeName, value })
                recordsForStore.set(String(key), value)
                queueMicrotask(() => {
                  if (failPut) {
                    transaction.error = new Error('put failed')
                    transaction.onerror?.()
                    return
                  }

                  transaction.oncomplete?.()
                })
              },
            }),
            onabort: null as (() => void) | null,
            oncomplete: null as (() => void) | null,
            onerror: null as (() => void) | null,
          }

          return transaction
        }),
      }
      const request = {
        error: null as Error | null,
        result: database,
        onerror: null as (() => void) | null,
        onsuccess: null as (() => void) | null,
        onupgradeneeded: null as (() => void) | null,
      }

      queueMicrotask(() => {
        if (failOpen) {
          request.error = new Error('open failed')
          request.onerror?.()
          return
        }

        request.onupgradeneeded?.()
        request.onsuccess?.()
      })

      return request
    }),
  }

  return { createdStores, indexedDB, putCalls }
}

export function loadServiceWorker({
  appBadge = {},
  cacheStorage = {
    open: vi.fn(),
  },
  clientsList = [],
  fetch = vi.fn() as unknown as typeof globalThis.fetch,
  indexedDB = globalThis.indexedDB,
  notifications = [],
  openWindow,
}: {
  appBadge?: {
    clearAppBadge?: () => Promise<void>
    setAppBadge?: (contents?: number) => Promise<void>
  }
  cacheStorage?: Pick<CacheStorage, 'open'>
  clientsList?: Array<{
    focused?: boolean
    focus?: () => Promise<unknown>
    id: string
    navigate?: (url: string) => Promise<unknown>
    postMessage?: (message: unknown, transfer?: Transferable[]) => void
    url: string
    visibilityState?: string
  }>
  fetch?: typeof globalThis.fetch
  indexedDB?: unknown
  notifications?: Array<{
    close: () => void
    data?: unknown
    tag?: string
  }>
  openWindow?: (url: string) => Promise<unknown>
} = {}) {
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
  const listeners = new Map<string, ServiceWorkerTestListener[]>()
  const showNotification = vi.fn(
    async (title: string, options?: NotificationOptions) => {
      void title
      void options
    },
  )
  const serviceWorkerScope = {
    addEventListener: vi.fn(
      (eventName: string, listener: ServiceWorkerTestListener) => {
        listeners.set(eventName, [
          ...(listeners.get(eventName) ?? []),
          listener,
        ])
      },
    ),
    location: {
      origin: 'https://lk.provgroup.ru',
    },
    registration: {
      getNotifications: vi.fn(async () => notifications),
      showNotification,
    },
  }
  const clientsScope = {
    matchAll: vi.fn(async () => clientsList),
    openWindow: openWindow ?? vi.fn(async () => null),
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
    cacheStorage,
    clientsScope,
    appBadge,
    indexedDB,
    Response,
    URL,
    fetch,
  )

  return {
    listeners,
    showNotification,
  }
}

function normalizeCacheRequestKey(request: RequestInfo | URL) {
  if (typeof request === 'string') {
    const url = new URL(request, 'https://lk.provgroup.ru')

    return `${url.pathname}${url.search}`
  }

  if (request instanceof URL) {
    return `${request.pathname}${request.search}`
  }

  const url = new URL(request.url)

  return `${url.pathname}${url.search}`
}

export function createCacheWithResponses(records: Record<string, Response>) {
  const responses = new Map(Object.entries(records))

  return {
    match: vi.fn(async (request: RequestInfo | URL) => {
      const response = responses.get(normalizeCacheRequestKey(request))

      return response?.clone()
    }),
    put: vi.fn(async (request: RequestInfo | URL, response: Response) => {
      responses.set(normalizeCacheRequestKey(request), response.clone())
    }),
  } satisfies Pick<Cache, 'match' | 'put'>
}

export async function waitForTextOrTimeout(
  responsePromise: Promise<Response>,
  timeoutMs = 25,
) {
  return Promise.race([
    responsePromise.then((response) => response.text()),
    new Promise<'timeout'>((resolve) => {
      setTimeout(() => {
        resolve('timeout')
      }, timeoutMs)
    }),
  ])
}

export async function dispatchPush(
  listener: ServiceWorkerTestListener,
  payload: Record<string, unknown>,
) {
  const promises: Promise<unknown>[] = []

  listener({
    data: {
      json: () => payload,
    },
    waitUntil: (promise) => {
      promises.push(promise)
    },
  })

  await Promise.all(promises)
}

export function markClientPushReady(
  listener: ServiceWorkerTestListener,
  clientId: string,
  activeThreadId: string | null = null,
) {
  listener({
    data: {
      activeThreadId,
      type: 'PORTAL_PUSH_CLIENT_READY',
    },
    source: {
      id: clientId,
    },
  })
}

export async function clearAppBadgeDatabase() {
  if (typeof indexedDB === 'undefined') {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(APP_BADGE_DATABASE_NAME)

    request.onsuccess = () => {
      resolve()
    }
    request.onerror = () => {
      reject(request.error ?? new Error('Failed to clear app badge database.'))
    }
    request.onblocked = () => {
      resolve()
    }
  })
}
