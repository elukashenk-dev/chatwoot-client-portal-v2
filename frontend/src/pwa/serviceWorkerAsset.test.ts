import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const APP_BADGE_DATABASE_NAME = 'provgroup-portal-app-badge'

type Listener = (event: {
  data?: unknown
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

function createServiceWorkerIndexedDbFake({
  failOpen = false,
  failPut = false,
}: {
  failOpen?: boolean
  failPut?: boolean
} = {}) {
  const putCalls: IndexedDbPutCall[] = []
  const createdStores = new Set<string>()
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
          const transaction = {
            error: null as Error | null,
            objectStore: () => ({
              put: (value: unknown, key: IDBValidKey) => {
                putCalls.push({ key, storeName, value })
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

function loadServiceWorker({
  appBadge = {},
  cacheStorage = {
    open: vi.fn(),
  },
  clientsList = [],
  fetch = vi.fn() as unknown as typeof globalThis.fetch,
  indexedDB = globalThis.indexedDB,
}: {
  appBadge?: {
    clearAppBadge?: () => Promise<void>
    setAppBadge?: (contents?: number) => Promise<void>
  }
  cacheStorage?: Pick<CacheStorage, 'open'>
  clientsList?: Array<{
    focused?: boolean
    id: string
    postMessage?: (message: unknown, transfer?: Transferable[]) => void
    url: string
    visibilityState?: string
  }>
  fetch?: typeof globalThis.fetch
  indexedDB?: unknown
} = {}) {
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
  const listeners = new Map<string, Listener[]>()
  const showNotification = vi.fn(async () => undefined)
  const serviceWorkerScope = {
    addEventListener: vi.fn((eventName: string, listener: Listener) => {
      listeners.set(eventName, [...(listeners.get(eventName) ?? []), listener])
    }),
    location: {
      origin: 'https://lk.provgroup.ru',
    },
    registration: {
      showNotification,
    },
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
    return new URL(request, 'https://lk.provgroup.ru').pathname
  }

  if (request instanceof URL) {
    return request.pathname
  }

  return new URL(request.url).pathname
}

function createCacheWithResponses(records: Record<string, Response>) {
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

async function waitForTextOrTimeout(
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

async function dispatchPush(
  listener: Listener,
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

function markClientPushReady(
  listener: Listener,
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

async function clearAppBadgeDatabase() {
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

describe('service worker push notifications', () => {
  beforeEach(async () => {
    await clearAppBadgeDatabase()
  })

  it('uses payload notification tags so pending notifications do not collapse new messages', async () => {
    const { listeners, showNotification } = loadServiceWorker()
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9001',
      tenantSlug: 'default',
      type: 'chat_message',
      url: '/',
    })
    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9002',
      tenantSlug: 'default',
      type: 'chat_message',
      url: '/',
    })

    expect(showNotification).toHaveBeenNthCalledWith(
      1,
      'Новое сообщение',
      expect.objectContaining({
        tag: 'portal-chat-message-default-9001',
      }),
    )
    expect(showNotification).toHaveBeenNthCalledWith(
      2,
      'Новое сообщение',
      expect.objectContaining({
        tag: 'portal-chat-message-default-9002',
      }),
    )
  })

  it('sets an exact app icon badge count when a system notification is shown', async () => {
    const setAppBadge = vi.fn(async () => undefined)
    const { listeners, showNotification } = loadServiceWorker({
      appBadge: {
        setAppBadge,
      },
    })
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9010',
      tenantSlug: 'default',
      totalUnreadCount: 1,
      type: 'chat_message',
      url: '/',
    })

    expect(showNotification).toHaveBeenCalled()
    expect(setAppBadge).toHaveBeenCalledWith(1)
  })

  it('uses the exact unread count from each shown system notification', async () => {
    const setAppBadge = vi.fn(async () => undefined)
    const { listeners } = loadServiceWorker({
      appBadge: {
        setAppBadge,
      },
    })
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9010',
      tenantSlug: 'default',
      totalUnreadCount: 1,
      type: 'chat_message',
      url: '/',
    })
    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9011',
      tenantSlug: 'default',
      totalUnreadCount: 2,
      type: 'chat_message',
      url: '/',
    })

    expect(setAppBadge).toHaveBeenNthCalledWith(1, 1)
    expect(setAppBadge).toHaveBeenNthCalledWith(2, 2)
  })

  it('serializes concurrent exact app icon badge count writes', async () => {
    const setAppBadge = vi.fn(async () => undefined)
    const { listeners } = loadServiceWorker({
      appBadge: {
        setAppBadge,
      },
    })
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await Promise.all([
      dispatchPush(pushListener!, {
        notificationTag: 'portal-chat-message-default-9014',
        tenantSlug: 'default',
        totalUnreadCount: 1,
        type: 'chat_message',
        url: '/',
      }),
      dispatchPush(pushListener!, {
        notificationTag: 'portal-chat-message-default-9015',
        tenantSlug: 'default',
        totalUnreadCount: 2,
        type: 'chat_message',
        url: '/',
      }),
    ])

    expect(setAppBadge).toHaveBeenNthCalledWith(1, 1)
    expect(setAppBadge).toHaveBeenNthCalledWith(2, 2)
  })

  it('resets the local app icon badge count after a clear message', async () => {
    const setAppBadge = vi.fn(async () => undefined)
    const { listeners } = loadServiceWorker({
      appBadge: {
        setAppBadge,
      },
    })
    const messageListener = listeners.get('message')?.[0]
    const pushListener = listeners.get('push')?.[0]

    expect(messageListener).toBeDefined()
    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9012',
      tenantSlug: 'default',
      totalUnreadCount: 1,
      type: 'chat_message',
      url: '/',
    })
    messageListener!({
      data: {
        type: 'PORTAL_APP_BADGE_CLEAR',
      },
      source: {
        id: 'client-1',
      },
    })
    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9013',
      tenantSlug: 'default',
      totalUnreadCount: 1,
      type: 'chat_message',
      url: '/',
    })

    expect(setAppBadge).toHaveBeenNthCalledWith(1, 1)
    expect(setAppBadge).toHaveBeenNthCalledWith(2, 1)
  })

  it('shows a system notification when the push-ready portal client is hidden', async () => {
    const postMessage = vi.fn()
    const { listeners, showNotification } = loadServiceWorker({
      clientsList: [
        {
          focused: true,
          id: 'client-1',
          postMessage,
          url: 'https://lk.provgroup.ru/app',
          visibilityState: 'hidden',
        },
      ],
    })
    const messageListener = listeners.get('message')?.[0]
    const pushListener = listeners.get('push')?.[0]

    expect(messageListener).toBeDefined()
    expect(pushListener).toBeDefined()

    markClientPushReady(messageListener!, 'client-1', 'group:155')
    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9003',
      tenantSlug: 'default',
      threadId: 'group:155',
      threadTitle: 'ООО Уточки',
      threadType: 'group',
      type: 'chat_message',
      url: '/',
    })

    expect(postMessage).not.toHaveBeenCalled()
    expect(showNotification).toHaveBeenCalledWith(
      'ООО Уточки',
      expect.objectContaining({
        body: 'Новое сообщение в групповом чате',
        tag: 'portal-chat-message-default-9003',
      }),
    )
  })

  it('lets a visible push-ready portal client suppress the system notification after it handles the push', async () => {
    const postMessage = vi.fn(
      (_message: unknown, transfer?: Transferable[]) => {
        const [responsePort] = transfer ?? []
        if (responsePort instanceof MessagePort) {
          responsePort.postMessage({
            handled: true,
          })
        }
      },
    )
    const { listeners, showNotification } = loadServiceWorker({
      clientsList: [
        {
          focused: false,
          id: 'client-1',
          postMessage,
          url: 'https://lk.provgroup.ru/app',
          visibilityState: 'visible',
        },
      ],
    })
    const messageListener = listeners.get('message')?.[0]
    const pushListener = listeners.get('push')?.[0]

    expect(messageListener).toBeDefined()
    expect(pushListener).toBeDefined()

    markClientPushReady(messageListener!, 'client-1', 'group:155')
    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9004',
      chatwootMessageId: 9004,
      portalUserId: 7,
      tenantSlug: 'default',
      threadId: 'group:155',
      threadTitle: 'ООО Уточки',
      threadType: 'group',
      type: 'chat_message',
      url: '/',
    })

    expect(postMessage).toHaveBeenCalledWith(
      {
        payload: {
          chatwootMessageId: 9004,
          notificationTag: 'portal-chat-message-default-9004',
          portalUserId: 7,
          tenantSlug: 'default',
          threadId: 'group:155',
          threadTitle: 'ООО Уточки',
          threadType: 'group',
          threadUnreadCount: null,
          totalUnreadCount: null,
          type: 'chat_message',
          url: '/',
        },
        type: 'PORTAL_PUSH_MESSAGE',
      },
      expect.arrayContaining([expect.any(MessagePort)]),
    )
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('does not set an app icon badge when a visible client suppresses the system notification', async () => {
    const setAppBadge = vi.fn(async () => undefined)
    const postMessage = vi.fn(
      (_message: unknown, transfer?: Transferable[]) => {
        const [responsePort] = transfer ?? []
        if (responsePort instanceof MessagePort) {
          responsePort.postMessage({
            handled: true,
          })
        }
      },
    )
    const { listeners, showNotification } = loadServiceWorker({
      appBadge: {
        setAppBadge,
      },
      clientsList: [
        {
          focused: false,
          id: 'client-1',
          postMessage,
          url: 'https://lk.provgroup.ru/app',
          visibilityState: 'visible',
        },
      ],
    })
    const messageListener = listeners.get('message')?.[0]
    const pushListener = listeners.get('push')?.[0]

    expect(messageListener).toBeDefined()
    expect(pushListener).toBeDefined()

    markClientPushReady(messageListener!, 'client-1', 'group:155')
    await dispatchPush(pushListener!, {
      chatwootMessageId: 9011,
      notificationTag: 'portal-chat-message-default-9011',
      tenantSlug: 'default',
      threadId: 'group:155',
      threadTitle: 'ООО Уточки',
      threadType: 'group',
      type: 'chat_message',
      url: '/',
    })

    expect(showNotification).not.toHaveBeenCalled()
    expect(setAppBadge).not.toHaveBeenCalled()
  })

  it('shows a system notification when the visible portal client reports that another chat is active', async () => {
    const postMessage = vi.fn(
      (_message: unknown, transfer?: Transferable[]) => {
        const [responsePort] = transfer ?? []
        if (responsePort instanceof MessagePort) {
          responsePort.postMessage({
            handled: false,
          })
        }
      },
    )
    const { listeners, showNotification } = loadServiceWorker({
      clientsList: [
        {
          focused: false,
          id: 'client-1',
          postMessage,
          url: 'https://lk.provgroup.ru/app',
          visibilityState: 'visible',
        },
      ],
    })
    const messageListener = listeners.get('message')?.[0]
    const pushListener = listeners.get('push')?.[0]

    expect(messageListener).toBeDefined()
    expect(pushListener).toBeDefined()

    markClientPushReady(messageListener!, 'client-1', 'private:me')
    await dispatchPush(pushListener!, {
      chatwootMessageId: 9005,
      notificationTag: 'portal-chat-message-default-9005',
      tenantSlug: 'default',
      threadId: 'group:155',
      threadTitle: 'ООО Уточки',
      threadType: 'group',
      type: 'chat_message',
      url: '/',
    })

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          chatwootMessageId: 9005,
          threadId: 'group:155',
          threadTitle: 'ООО Уточки',
          threadType: 'group',
        }),
        type: 'PORTAL_PUSH_MESSAGE',
      }),
      expect.arrayContaining([expect.any(MessagePort)]),
    )
    expect(showNotification).toHaveBeenCalledWith(
      'ООО Уточки',
      expect.objectContaining({
        body: 'Новое сообщение в групповом чате',
        tag: 'portal-chat-message-default-9005',
      }),
    )
  })

  it('does not let a visible portal client suppress a push for another active chat', async () => {
    const postMessage = vi.fn(
      (_message: unknown, transfer?: Transferable[]) => {
        const [responsePort] = transfer ?? []
        if (responsePort instanceof MessagePort) {
          responsePort.postMessage({
            handled: true,
          })
        }
      },
    )
    const { listeners, showNotification } = loadServiceWorker({
      clientsList: [
        {
          focused: false,
          id: 'client-1',
          postMessage,
          url: 'https://lk.provgroup.ru/app',
          visibilityState: 'visible',
        },
      ],
    })
    const messageListener = listeners.get('message')?.[0]
    const pushListener = listeners.get('push')?.[0]

    expect(messageListener).toBeDefined()
    expect(pushListener).toBeDefined()

    markClientPushReady(messageListener!, 'client-1', 'private:me')
    await dispatchPush(pushListener!, {
      chatwootMessageId: 9006,
      notificationTag: 'portal-chat-message-default-9006',
      tenantSlug: 'default',
      threadId: 'group:155',
      threadTitle: 'ООО Уточки',
      threadType: 'group',
      type: 'chat_message',
      url: '/',
    })

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          chatwootMessageId: 9006,
          threadId: 'group:155',
          threadTitle: 'ООО Уточки',
          threadType: 'group',
        }),
        type: 'PORTAL_PUSH_MESSAGE',
      }),
      expect.arrayContaining([expect.any(MessagePort)]),
    )
    expect(showNotification).toHaveBeenCalledWith(
      'ООО Уточки',
      expect.objectContaining({
        body: 'Новое сообщение в групповом чате',
        tag: 'portal-chat-message-default-9006',
      }),
    )
  })

  it('uses safe chat title and type in the system notification copy', async () => {
    const { listeners, showNotification } = loadServiceWorker()
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      chatwootMessageId: 9007,
      notificationTag: 'portal-chat-message-default-9007',
      tenantSlug: 'default',
      threadId: 'group:155',
      threadTitle: 'ООО Уточки',
      threadType: 'group',
      type: 'chat_message',
      url: '/',
    })

    expect(showNotification).toHaveBeenCalledWith(
      'ООО Уточки',
      expect.objectContaining({
        body: 'Новое сообщение в групповом чате',
        tag: 'portal-chat-message-default-9007',
      }),
    )
  })

  it('falls back to generic copy when chat metadata is unavailable', async () => {
    const { listeners, showNotification } = loadServiceWorker()
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      chatwootMessageId: 9008,
      notificationTag: 'portal-chat-message-default-9008',
      tenantSlug: 'default',
      threadId: 'group:155',
      threadTitle: null,
      threadType: null,
      type: 'chat_message',
      url: '/',
    })

    expect(showNotification).toHaveBeenCalledWith(
      'Новое сообщение',
      expect.objectContaining({
        body: 'Откройте портал, чтобы посмотреть чат.',
        tag: 'portal-chat-message-default-9008',
      }),
    )
  })

  it('persists push stale marker only when payload has tenant and portal user binding', async () => {
    const indexedDbFake = createServiceWorkerIndexedDbFake()
    const { listeners, showNotification } = loadServiceWorker({
      indexedDB: indexedDbFake.indexedDB,
    })
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      chatwootMessageId: 9101,
      notificationTag: 'portal-chat-message-default-9101',
      portalUserId: 7,
      tenantSlug: 'default',
      threadId: 'private:me',
      threadTitle: 'Личный чат',
      threadType: 'private',
      type: 'chat_message',
      url: '/',
    })

    expect(indexedDbFake.createdStores).toEqual(
      new Set([
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
      ]),
    )
    expect(indexedDbFake.putCalls).toEqual([
      {
        key: 'default:7:private:me:9101',
        storeName: 'push_stale_markers',
        value: {
          chatwootMessageId: 9101,
          createdAt: expect.any(String),
          tenantSlug: 'default',
          threadId: 'private:me',
          userId: 7,
        },
      },
    ])
    expect(showNotification).toHaveBeenCalledWith(
      'Личный чат',
      expect.objectContaining({
        body: 'Новое сообщение в личном чате',
        tag: 'portal-chat-message-default-9101',
      }),
    )
  })

  it('does not persist push stale marker without portalUserId', async () => {
    const indexedDbFake = createServiceWorkerIndexedDbFake()
    const { listeners } = loadServiceWorker({
      indexedDB: indexedDbFake.indexedDB,
    })
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      chatwootMessageId: 9102,
      notificationTag: 'portal-chat-message-default-9102',
      tenantSlug: 'default',
      threadId: 'private:me',
      threadTitle: 'Личный чат',
      threadType: 'private',
      type: 'chat_message',
      url: '/',
    })

    expect(indexedDbFake.indexedDB.open).not.toHaveBeenCalled()
    expect(indexedDbFake.putCalls).toEqual([])
  })

  it('still shows a system notification when stale marker persistence fails', async () => {
    const indexedDbFake = createServiceWorkerIndexedDbFake({
      failOpen: true,
    })
    const { listeners, showNotification } = loadServiceWorker({
      indexedDB: indexedDbFake.indexedDB,
    })
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      chatwootMessageId: 9103,
      notificationTag: 'portal-chat-message-default-9103',
      portalUserId: 7,
      tenantSlug: 'default',
      threadId: 'private:me',
      threadTitle: 'Личный чат',
      threadType: 'private',
      type: 'chat_message',
      url: '/',
    })

    expect(indexedDbFake.indexedDB.open).toHaveBeenCalled()
    expect(showNotification).toHaveBeenCalledWith(
      'Личный чат',
      expect.objectContaining({
        body: 'Новое сообщение в личном чате',
        tag: 'portal-chat-message-default-9103',
      }),
    )
  })

  it('keeps API routes out of service worker fetch handling', async () => {
    const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

    expect(source).toContain("requestUrl.pathname.startsWith('/api/')")
  })

  it('serves the cached app shell immediately when navigation network hangs', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      () => new Promise<Response>(() => {}),
    )
    const cachedShell = new Response('<html>cached app shell</html>', {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
      status: 200,
    })
    const cache = createCacheWithResponses({
      '/': cachedShell,
    })
    const { listeners } = loadServiceWorker({
      cacheStorage: {
        open: vi.fn(async () => cache as unknown as Cache),
      },
      fetch,
    })
    const fetchListener = listeners.get('fetch')?.[0]
    const request = {
      destination: '',
      method: 'GET',
      mode: 'navigate',
      url: 'https://lk.provgroup.ru/app/chat',
    } as unknown as Request
    let responsePromise: Promise<Response> | null = null

    expect(fetchListener).toBeDefined()

    fetchListener!({
      request,
      respondWith: (response) => {
        responsePromise = Promise.resolve(response)
      },
      waitUntil: vi.fn(),
    })

    expect(responsePromise).not.toBeNull()
    await expect(waitForTextOrTimeout(responsePromise!)).resolves.toBe(
      '<html>cached app shell</html>',
    )
    expect(fetch).toHaveBeenCalledWith(request)
  })

  it('declares stamped build assets and default branding images in the app shell', () => {
    const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

    expect(source).toContain('__PORTAL_SERVICE_WORKER_ASSETS_JSON__')
    expect(source).toContain('/default-branding/auth-header.png')
    expect(source).toContain('/default-branding/auth-footer.png')
  })
})
