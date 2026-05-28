# Offline-first PWA Slice 08: Service Worker And PWA Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden app-shell precache, build/cache version signaling and persist user-scoped push stale markers without caching `/api/*`.

**Architecture:** Service worker owns static app shell, build assets and push
bridge only. It opens the same complete IndexedDB schema as the app and remains
a passthrough for backend-authoritative APIs. Push stale-marker persistence is
best-effort in the service worker, while the foreground app consumes markers
after auth resolves and refreshes affected cached chat threads under the current
`tenantSlug:userId` scope.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, IndexedDB, `idb`, Service Worker, Fastify, Drizzle/Postgres, Playwright.

---

**Part Of:** [Offline-first PWA Implementation Plan](./2026-05-27-offline-first-pwa-implementation.md)

**Slice:** 08 of 9

**Depends On:** Slices 01-02 and 05; can be reviewed independently from outbox
and composer queue UI work.

**Unlocks:** Slice 09 final runtime verification.

---

## Task 9: Push Stale Markers And Service Worker Precache Hardening

**Goal:** Persist push stale markers only when push payload identifies
`tenantSlug:userId`, keep message body out of SW storage, and ensure production
route chunks can be cached for offline startup without losing app/SW/IndexedDB
version compatibility.

**Files:**

- Modify: `frontend/public/sw.js`
- Modify: `frontend/scripts/stamp-service-worker.mjs`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/src/pwa/serviceWorkerAsset.test.ts`
- Modify: `frontend/src/pwa/serviceWorkerRuntime.ts`
- Modify: `frontend/src/pwa/serviceWorkerRuntime.test.ts`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.unread-indicators.test.tsx`
- Modify: `frontend/src/features/chat/pages/offlineChatCache.ts`
- Modify: `frontend/src/features/chat/pages/offlineChatCache.test.ts`
- Modify: `frontend/src/features/offline/offlineStore.ts`
- Modify: `frontend/src/features/offline/offlineStore.test.ts`

- [ ] **Step 1: Enable build manifest**

In `frontend/vite.config.ts`:

```ts
build: {
  manifest: 'asset-manifest.json',
},
```

- [ ] **Step 2: Add service worker asset placeholder**

In `frontend/public/sw.js`:

```js
const BUILD_ASSET_URLS = parseBuildAssetUrls(
  '__PORTAL_SERVICE_WORKER_ASSETS_JSON__',
)
const APP_SHELL_URLS = [
  '/',
  '/default-branding/auth-header.png',
  '/default-branding/auth-footer.png',
  '/favicon.svg',
  '/pwa-icons/icon-192.png',
  '/pwa-icons/icon-512.png',
  '/pwa-icons/icon-maskable-512.png',
  ...BUILD_ASSET_URLS,
]
```

Add helper:

```js
function parseBuildAssetUrls(rawValue) {
  try {
    const parsed = JSON.parse(rawValue)

    return Array.isArray(parsed)
      ? parsed.filter((value) => typeof value === 'string')
      : []
  } catch {
    return []
  }
}
```

Add a small status reply so the foreground app and E2E can detect the active
service worker revision instead of hanging on an unknown old worker:

```js
if (event.data?.type === 'PORTAL_SERVICE_WORKER_STATUS') {
  const replyTarget = event.ports?.[0] ?? event.source

  replyTarget?.postMessage({
    assetCount: APP_SHELL_URLS.length,
    revision: SERVICE_WORKER_REVISION,
    type: 'PORTAL_SERVICE_WORKER_STATUS_RESULT',
  })
  return
}
```

- [ ] **Step 3: Inject build assets in stamp script**

In `frontend/scripts/stamp-service-worker.mjs`, add:

```js
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
```

Read the Vite manifest with fail-fast validation. The stamp script must not
silently build a service worker with an empty asset list if the manifest is
missing, unreadable, or does not contain generated JS/CSS assets:

```js
const distDir = dirname(serviceWorkerPath)
const manifestPath = join(distDir, 'asset-manifest.json')

function readBuildAssetUrls() {
  let manifest

  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`Could not read Vite asset manifest at ${manifestPath}.`, {
      cause: error,
    })
  }

  const assetUrls = Object.values(manifest)
    .flatMap((entry) => [entry.file, ...(entry.css ?? [])])
    .filter(
      (assetPath) => typeof assetPath === 'string' && assetPath.length > 0,
    )
    .map((assetPath) => `/${assetPath}`)
  const uniqueAssetUrls = [...new Set(assetUrls)]

  if (uniqueAssetUrls.length === 0) {
    throw new Error(
      `Vite asset manifest at ${manifestPath} did not contain generated JS/CSS assets.`,
    )
  }

  return uniqueAssetUrls
}

const assetUrls = readBuildAssetUrls()
```

Before writing the stamped service worker, assert that the production asset
list includes the chat/startup route chunks and CSS emitted by the Vite manifest.
Do not rely on a hand-maintained chunk name list; derive this from the manifest
and fail the stamp script if the manifest is unreadable in production build.

Replace placeholder:

```js
const stampedSource = serviceWorkerSource
  .replaceAll(SERVICE_WORKER_REVISION_PLACEHOLDER, revision)
  .replaceAll(
    '__PORTAL_SERVICE_WORKER_ASSETS_JSON__',
    JSON.stringify(assetUrls),
  )

writeFileSync(serviceWorkerPath, stampedSource)
```

- [ ] **Step 4: Consume Slice 01 push user binding**

Slice 01 owns backend push payload generation and backend push tests. Before
starting this slice, verify that Slice 01 has already added the safe
`portalUserId` field to the Web Push payload and kept message body/content out
of that payload. Do not reopen
`backend/src/modules/chat-notifications/pushDeliveryService.ts` in this slice
unless Slice 01 has not been completed.

In `serviceWorkerRuntime.ts`, extend the public payload type:

```ts
export type PortalPushMessagePayload = {
  chatwootMessageId: number | null
  portalUserId: number | null
  tenantSlug: string | null
  threadId: string | null
  threadTitle: string | null
  threadType: 'group' | 'private' | null
  type: 'chat_message'
  url: string
}
```

Also update the `PORTAL_PUSH_MESSAGE` parser inside
`registerPortalPushMessageListener(...)`:

```ts
const payload = {
  chatwootMessageId: Number.isSafeInteger(event.data.payload?.chatwootMessageId)
    ? event.data.payload.chatwootMessageId
    : null,
  portalUserId: Number.isSafeInteger(event.data.payload?.portalUserId)
    ? event.data.payload.portalUserId
    : null,
  tenantSlug:
    typeof event.data.payload?.tenantSlug === 'string'
      ? event.data.payload.tenantSlug
      : null,
  threadId:
    typeof event.data.payload?.threadId === 'string' &&
    event.data.payload.threadId.length > 0
      ? event.data.payload.threadId
      : null,
  threadTitle:
    typeof event.data.payload?.threadTitle === 'string' &&
    event.data.payload.threadTitle.trim().length > 0
      ? event.data.payload.threadTitle.trim()
      : null,
  threadType:
    event.data.payload?.threadType === 'private' ||
    event.data.payload?.threadType === 'group'
      ? event.data.payload.threadType
      : null,
  type: 'chat_message',
  url:
    typeof event.data.payload?.url === 'string' ? event.data.payload.url : '/',
} satisfies PortalPushMessagePayload
```

Add a foreground status helper in `serviceWorkerRuntime.ts` so runtime checks and
Slice 09 E2E can distinguish an active stamped worker from unsupported/no-worker
states without hanging behind the splash screen:

```ts
export type ServiceWorkerStatusResult =
  | { assetCount: number; revision: string; status: 'ready' }
  | {
      reason: 'no_active_worker' | 'timeout' | 'unsupported'
      status: 'unavailable'
    }

const SERVICE_WORKER_STATUS_TIMEOUT_MS = 1000

function resolveReadyActiveWorker(container: ServiceWorkerContainer) {
  return new Promise<ServiceWorker | null>((resolve) => {
    const timeoutId = window.setTimeout(
      () => resolve(null),
      SERVICE_WORKER_STATUS_TIMEOUT_MS,
    )

    container.ready
      .then((registration) => {
        window.clearTimeout(timeoutId)
        resolve(registration.active ?? null)
      })
      .catch(() => {
        window.clearTimeout(timeoutId)
        resolve(null)
      })
  })
}

export async function queryActiveServiceWorkerStatus(): Promise<ServiceWorkerStatusResult> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return { reason: 'unsupported', status: 'unavailable' }
  }

  const container = navigator.serviceWorker
  const worker =
    container.controller ?? (await resolveReadyActiveWorker(container))

  if (!worker) {
    return { reason: 'no_active_worker', status: 'unavailable' }
  }

  return new Promise<ServiceWorkerStatusResult>((resolve) => {
    const channel = new MessageChannel()
    const timeoutId = window.setTimeout(() => {
      channel.port1.close()
      resolve({ reason: 'timeout', status: 'unavailable' })
    }, SERVICE_WORKER_STATUS_TIMEOUT_MS)

    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeoutId)
      channel.port1.close()

      if (
        event.data?.type === 'PORTAL_SERVICE_WORKER_STATUS_RESULT' &&
        typeof event.data.revision === 'string' &&
        Number.isSafeInteger(event.data.assetCount)
      ) {
        resolve({
          assetCount: event.data.assetCount,
          revision: event.data.revision,
          status: 'ready',
        })
        return
      }

      resolve({ reason: 'timeout', status: 'unavailable' })
    }

    worker.postMessage({ type: 'PORTAL_SERVICE_WORKER_STATUS' }, [
      channel.port2,
    ])
  })
}
```

Add `serviceWorkerRuntime.test.ts` coverage:

```ts
it('queries the active service worker status through a message channel', async () => {
  const controller = new MockServiceWorker('activated')
  const registration = new MockServiceWorkerRegistration()
  setServiceWorkerContainer(
    new MockServiceWorkerContainer({
      controller: controller as unknown as ServiceWorker,
      registration: registration as unknown as ServiceWorkerRegistration,
    }),
  )
  controller.postMessage.mockImplementationOnce((_message, transfer) => {
    const port = transfer?.[0] as MessagePort

    port.postMessage({
      assetCount: 12,
      revision: '2026-05-27T10:00:00.000Z',
      type: 'PORTAL_SERVICE_WORKER_STATUS_RESULT',
    })
  })

  const runtime = await import('./serviceWorkerRuntime')

  await expect(runtime.queryActiveServiceWorkerStatus()).resolves.toEqual({
    assetCount: 12,
    revision: '2026-05-27T10:00:00.000Z',
    status: 'ready',
  })
})

it('returns unavailable when no active service worker can answer status', async () => {
  const registration = new MockServiceWorkerRegistration()
  setServiceWorkerContainer(
    new MockServiceWorkerContainer({
      controller: null,
      registration: registration as unknown as ServiceWorkerRegistration,
    }),
  )

  const runtime = await import('./serviceWorkerRuntime')

  await expect(runtime.queryActiveServiceWorkerStatus()).resolves.toEqual({
    reason: 'no_active_worker',
    status: 'unavailable',
  })
})
```

Update every typed push fixture to include `portalUserId`. In
`ChatPage.unread-indicators.test.tsx`, the current-user helper values are:

```ts
function createOtherThreadPush(): PortalPushMessagePayload {
  return {
    chatwootMessageId: 9001,
    portalUserId: 7,
    tenantSlug: 'buhfirma',
    threadId: 'group:154',
    threadTitle: 'ООО "Ромашка"',
    threadType: 'group',
    type: 'chat_message',
    url: '/',
  }
}

function createCurrentThreadPush(): PortalPushMessagePayload {
  return {
    chatwootMessageId: 9002,
    portalUserId: 7,
    tenantSlug: 'buhfirma',
    threadId: privateThread.id,
    threadTitle: privateThread.title,
    threadType: privateThread.type,
    type: 'chat_message',
    url: '/',
  }
}
```

In the existing `serviceWorkerRuntime.test.ts` test
`registers the page as push-ready while a message listener is active`, add the
new field to the dispatched payload and expected handler payload:

```ts
container.dispatchEvent(
  new MessageEvent('message', {
    data: {
      payload: {
        chatwootMessageId: 9004,
        portalUserId: 7,
        tenantSlug: 'buhfirma',
        threadId: 'group:155',
        threadTitle: 'ООО Уточки',
        threadType: 'group',
        type: 'chat_message',
        url: '/',
      },
      type: 'PORTAL_PUSH_MESSAGE',
    },
    ports: [channel.port2],
  }),
)

expect(handler).toHaveBeenCalledWith({
  chatwootMessageId: 9004,
  portalUserId: 7,
  tenantSlug: 'buhfirma',
  threadId: 'group:155',
  threadTitle: 'ООО Уточки',
  threadType: 'group',
  type: 'chat_message',
  url: '/',
})
```

In `serviceWorkerAsset.test.ts`, any test that asserts the full
`PORTAL_PUSH_MESSAGE` payload must include `portalUserId` in both the dispatched
push payload and expected client payload. For example, the visible-client
suppression case uses:

```ts
await dispatchPush(pushListener!, {
  chatwootMessageId: 9004,
  notificationTag: 'portal-chat-message-default-9004',
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
      type: 'chat_message',
      url: '/',
    },
    type: 'PORTAL_PUSH_MESSAGE',
  },
  expect.arrayContaining([expect.any(MessagePort)]),
)
```

- [ ] **Step 5: Parse and persist user-scoped stale markers**

In `frontend/public/sw.js`, parse `portalUserId` and include `portalUserId:
null` in every fallback object returned by `readPushPayload(...)`:

```js
portalUserId: Number.isSafeInteger(payload.portalUserId)
  ? payload.portalUserId
  : null,
```

Every fallback return from `readPushPayload(...)` must include:

```js
portalUserId: null,
```

After `notifyPortalClients`, if no client can handle the push, start marker
persistence as best-effort work. Do not let IndexedDB failures block the system
notification fallback:

```js
const staleMarkerPersistence = persistPushStaleMarkerBestEffort(payload)
```

Then await that best-effort work only after the visible fallback has already been
shown:

```js
await self.registration.showNotification(
  notificationCopy.title,
  notificationOptions,
)
await setAppIconBadge()
await staleMarkerPersistence
```

Implementation:

This service-worker snippet intentionally uses native IndexedDB callbacks
because `frontend/public/sw.js` is not bundled in the MVP. Foreground app code
continues to use the shared `idb`-based helpers from `offlineStore.ts`.

```js
async function persistPushStaleMarkerBestEffort(payload) {
  try {
    await persistPushStaleMarker(payload)
  } catch {
    // Push notifications must still be delivered if IndexedDB is unavailable.
  }
}

async function persistPushStaleMarker(payload) {
  if (
    !payload.tenantSlug ||
    !payload.portalUserId ||
    !payload.threadId ||
    !payload.chatwootMessageId
  ) {
    return
  }

  const database = await openPortalOfflineDatabase()
  const key = `${payload.tenantSlug}:${payload.portalUserId}:${payload.threadId}:${payload.chatwootMessageId}`

  return new Promise((resolve, reject) => {
    const transaction = database.transaction('push_stale_markers', 'readwrite')
    transaction.objectStore('push_stale_markers').put(
      {
        chatwootMessageId: payload.chatwootMessageId,
        createdAt: new Date().toISOString(),
        tenantSlug: payload.tenantSlug,
        threadId: payload.threadId,
        userId: payload.portalUserId,
      },
      key,
    )
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error)
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error)
    }
  })
}
```

Add SW-local `openPortalOfflineDatabase` with database name `portal-offline`,
version `1`, and the same store list as `offlineDatabase.ts`. The service
worker must not create a partial schema first; if it opens the database before
the app does, it must create every MVP store so the app does not get stuck with
a poisoned version-1 database.

```js
const PORTAL_OFFLINE_DATABASE_NAME = 'portal-offline'
const PORTAL_OFFLINE_DATABASE_VERSION = 1
const PORTAL_OFFLINE_STORES = [
  'tenant_contexts',
  'last_active_identities',
  'local_device_signouts',
  'auth_snapshots',
  'chat_thread_lists',
  'chat_message_snapshots',
  'chat_text_outbox',
  'sync_leases',
  'push_stale_markers',
]

function openPortalOfflineDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable.'))
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      PORTAL_OFFLINE_DATABASE_NAME,
      PORTAL_OFFLINE_DATABASE_VERSION,
    )

    request.onupgradeneeded = () => {
      const database = request.result

      for (const storeName of PORTAL_OFFLINE_STORES) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName)
        }
      }
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      reject(
        request.error ?? new Error('Failed to open portal offline database.'),
      )
    }
  })
}
```

If Task 12 later bumps the IndexedDB version for SMS metadata, update
`PORTAL_OFFLINE_DATABASE_VERSION`, `PORTAL_OFFLINE_STORES`, and
`OFFLINE_DATABASE_VERSION` in the same implementation slice.

- [ ] **Step 6: Add service worker tests**

In `serviceWorkerAsset.test.ts`, extend the SW loader with an IndexedDB fake:

```ts
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
```

Add `indexedDB?: unknown` to `loadServiceWorker` options. Then change the
existing `new Function` call to accept and pass the fake IndexedDB object:

```ts
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
  appBadge,
  indexedDB,
  Response,
  URL,
  vi.fn(),
)
```

Add tests:

```ts
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
```

- [ ] **Step 7: Consume push stale markers in the foreground app**

Add marker read/delete helpers to `frontend/src/features/offline/offlineStore.ts`.
The service worker may write markers while no app tab is open; the foreground app
must later consume them under the authenticated user scope:

```ts
function isPushStaleMarkerRecord(
  value: unknown,
): value is OfflinePushStaleMarkerRecord {
  return (
    isObject(value) &&
    isNumber(value.chatwootMessageId) &&
    isString(value.createdAt) &&
    isString(value.tenantSlug) &&
    isString(value.threadId) &&
    isNumber(value.userId)
  )
}

async function collectPushStaleMarkers(
  tenantSlug: string,
  userId: number,
): Promise<OfflinePushStaleMarkerRecord[]> {
  const database = await openOfflineDatabase()

  try {
    const records = await database.getAll('push_stale_markers')

    return records
      .map((record) => readRecord(record, isPushStaleMarkerRecord))
      .filter(
        (record): record is OfflinePushStaleMarkerRecord =>
          Boolean(record) &&
          record.tenantSlug === tenantSlug &&
          record.userId === userId,
      )
  } finally {
    database.close()
  }
}

async function deleteCollectedPushStaleMarkers(
  records: OfflinePushStaleMarkerRecord[],
) {
  if (records.length === 0) {
    return
  }

  const database = await openOfflineDatabase()

  try {
    const transaction = database.transaction('push_stale_markers', 'readwrite')
    const store = transaction.objectStore('push_stale_markers')

    for (const record of records) {
      await store.delete(pushMarkerKey(record))
    }

    await transaction.done
  } finally {
    database.close()
  }
}
```

Expose the helpers on `offlineStore`:

```ts
listPushStaleMarkers(tenantSlug: string, userId: number) {
  return collectPushStaleMarkers(tenantSlug, userId)
},
deletePushStaleMarkers(records: OfflinePushStaleMarkerRecord[]) {
  return deleteCollectedPushStaleMarkers(records)
},
```

Add `offlineStore.test.ts` coverage:

```ts
it('lists and deletes push stale markers only for the current user scope', async () => {
  await offlineStore.savePushStaleMarker({
    chatwootMessageId: 9001,
    createdAt: '2026-05-27T10:00:00.000Z',
    tenantSlug: 'buhfirma',
    threadId: 'private:me',
    userId: 7,
  })
  await offlineStore.savePushStaleMarker({
    chatwootMessageId: 9002,
    createdAt: '2026-05-27T10:01:00.000Z',
    tenantSlug: 'buhfirma',
    threadId: 'private:me',
    userId: 8,
  })

  const markers = await offlineStore.listPushStaleMarkers('buhfirma', 7)

  expect(markers).toHaveLength(1)
  expect(markers[0]).toMatchObject({
    chatwootMessageId: 9001,
    tenantSlug: 'buhfirma',
    userId: 7,
  })

  await offlineStore.deletePushStaleMarkers(markers)

  await expect(
    offlineStore.listPushStaleMarkers('buhfirma', 7),
  ).resolves.toEqual([])
  await expect(
    offlineStore.listPushStaleMarkers('buhfirma', 8),
  ).resolves.toHaveLength(1)
})
```

In `frontend/src/features/chat/pages/offlineChatCache.ts`, add a foreground
consumer that refreshes only known current-user threads and deletes markers only
after the refresh succeeds:

```ts
export type PushStaleThreadRefresh = {
  snapshot: ChatMessagesSnapshot
  threadId: string
}

type ConsumePushStaleMarkersInput = OfflineChatScope & {
  refreshThread: (threadId: string) => Promise<ChatMessagesSnapshot>
  threads: ChatThreadSummary[]
}

export async function consumePushStaleMarkersForKnownThreads({
  refreshThread,
  tenantSlug,
  threads,
  userId,
}: ConsumePushStaleMarkersInput): Promise<PushStaleThreadRefresh[]> {
  const knownThreadIds = new Set(threads.map((thread) => thread.id))
  const markers = (
    await offlineStore.listPushStaleMarkers(tenantSlug, userId)
  ).filter((marker) => knownThreadIds.has(marker.threadId))
  const refreshed: PushStaleThreadRefresh[] = []

  for (const threadId of [
    ...new Set(markers.map((marker) => marker.threadId)),
  ]) {
    const snapshot = await refreshThread(threadId)
    const canUseRefresh =
      shouldSaveOfflineMessageSnapshot(snapshot) &&
      snapshot.activeThread?.id === threadId

    if (!canUseRefresh) {
      continue
    }

    await saveOfflineMessageSnapshot({
      snapshot,
      tenantSlug,
      threadId,
      userId,
    })
    await offlineStore.deletePushStaleMarkers(
      markers.filter((marker) => marker.threadId === threadId),
    )
    refreshed.push({
      snapshot,
      threadId,
    })
  }

  return refreshed
}
```

Update the existing `offlineChatCache` import in `ChatPage.tsx` to include the
new consumer:

```ts
import {
  consumePushStaleMarkersForKnownThreads,
  saveOfflineMessageSnapshot,
  saveOfflineThreadList,
} from './offlineChatCache'
```

Wire the consumer in `ChatPage.tsx` after auth, tenant and the current thread
list are ready. This effect only runs online; if refresh fails, markers remain
for a later attempt. Use the `userId` value introduced by Slice 05, not a
truthiness check on `user?.id`:

```ts
useEffect(() => {
  if (
    !isBrowserOnline ||
    !tenantSlug ||
    userId === null ||
    pageState.status !== 'ready' ||
    pageState.threads.length === 0
  ) {
    return
  }

  let isCurrent = true

  consumePushStaleMarkersForKnownThreads({
    refreshThread: (threadId) => getChatMessages({ threadId }),
    tenantSlug,
    threads: pageState.threads,
    userId,
  })
    .then((refreshedThreads) => {
      if (!isCurrent || refreshedThreads.length === 0) {
        return
      }

      setPageState((currentState) => {
        if (currentState.status !== 'ready') {
          return currentState
        }

        const selectedRefresh = refreshedThreads.find(
          (refresh) => refresh.threadId === currentState.selectedThreadId,
        )

        if (!selectedRefresh) {
          return currentState
        }

        return {
          ...ONLINE_CHAT_PAGE_CACHE_STATE,
          selectedThreadId: currentState.selectedThreadId,
          snapshot: selectedRefresh.snapshot,
          status: 'ready',
          threads: currentState.threads,
        }
      })
    })
    .catch(() => {
      // Keep markers for the next online attempt.
    })

  return () => {
    isCurrent = false
  }
}, [isBrowserOnline, pageState, tenantSlug, userId])
```

Add `offlineChatCache.test.ts` coverage:

```ts
it('refreshes known current-user stale marker threads and leaves other user markers untouched', async () => {
  const refreshedSnapshot = createReadySnapshot({
    messages: [
      {
        attachments: [],
        authorName: 'Ольга Support',
        authorRole: 'agent',
        content: 'Fresh from push marker',
        contentType: 'text',
        createdAt: '2026-05-27T10:05:00.000Z',
        direction: 'incoming',
        id: 9010,
        status: 'sent',
      },
    ],
  })
  const refreshThread = vi.fn(async () => refreshedSnapshot)

  await offlineStore.savePushStaleMarker({
    chatwootMessageId: 9001,
    createdAt: '2026-05-27T10:00:00.000Z',
    tenantSlug: 'buhfirma',
    threadId: 'private:me',
    userId: 7,
  })
  await offlineStore.savePushStaleMarker({
    chatwootMessageId: 9002,
    createdAt: '2026-05-27T10:00:00.000Z',
    tenantSlug: 'buhfirma',
    threadId: 'private:me',
    userId: 8,
  })

  await expect(
    consumePushStaleMarkersForKnownThreads({
      refreshThread,
      tenantSlug: 'buhfirma',
      threads: [privateThread],
      userId: 7,
    }),
  ).resolves.toEqual([
    {
      snapshot: refreshedSnapshot,
      threadId: 'private:me',
    },
  ])

  expect(refreshThread).toHaveBeenCalledWith('private:me')
  await expect(
    offlineStore.readMessageSnapshot('buhfirma', 7, 'private:me'),
  ).resolves.toMatchObject({
    snapshot: refreshedSnapshot,
  })
  await expect(
    offlineStore.listPushStaleMarkers('buhfirma', 7),
  ).resolves.toEqual([])
  await expect(
    offlineStore.listPushStaleMarkers('buhfirma', 8),
  ).resolves.toHaveLength(1)
})

it('keeps push stale markers when the refresh fails', async () => {
  const refreshThread = vi.fn(async () => {
    throw new Error('network unavailable')
  })

  await offlineStore.savePushStaleMarker({
    chatwootMessageId: 9003,
    createdAt: '2026-05-27T10:00:00.000Z',
    tenantSlug: 'buhfirma',
    threadId: 'private:me',
    userId: 7,
  })

  await expect(
    consumePushStaleMarkersForKnownThreads({
      refreshThread,
      tenantSlug: 'buhfirma',
      threads: [privateThread],
      userId: 7,
    }),
  ).rejects.toThrow('network unavailable')

  await expect(
    offlineStore.listPushStaleMarkers('buhfirma', 7),
  ).resolves.toHaveLength(1)
})

it('keeps push stale markers when the refresh result is not for the marker thread', async () => {
  const refreshedSnapshot = createReadySnapshot({
    activeThread: groupThread,
  })
  const refreshThread = vi.fn(async () => refreshedSnapshot)

  await offlineStore.savePushStaleMarker({
    chatwootMessageId: 9004,
    createdAt: '2026-05-27T10:00:00.000Z',
    tenantSlug: 'buhfirma',
    threadId: 'private:me',
    userId: 7,
  })

  await expect(
    consumePushStaleMarkersForKnownThreads({
      refreshThread,
      tenantSlug: 'buhfirma',
      threads: [privateThread],
      userId: 7,
    }),
  ).resolves.toEqual([])

  await expect(
    offlineStore.listPushStaleMarkers('buhfirma', 7),
  ).resolves.toHaveLength(1)
})
```

- [ ] **Step 8: Run PWA tests**

```bash
pnpm --dir frontend test -- src/pwa/serviceWorkerAsset.test.ts src/pwa/serviceWorkerRuntime.test.ts src/features/offline/offlineStore.test.ts src/features/chat/pages/offlineChatCache.test.ts src/features/chat/pages/ChatPage.unread-indicators.test.tsx --run
pnpm --dir frontend typecheck
pnpm --dir frontend build
```

Expected:

- Tests pass.
- Typecheck passes.
- Build succeeds.
- Built `dist/sw.js` contains injected asset URLs and no raw
  `__PORTAL_SERVICE_WORKER_ASSETS_JSON__` placeholder.
- Built `dist/sw.js` contains a non-empty generated asset list. A missing or
  empty Vite manifest fails `stamp-service-worker.mjs` instead of silently
  producing a shell-only service worker.
- Built `dist/sw.js` includes the default public branding images used by CSS and
  the generated JS/CSS assets needed for startup/chat routes.
- Service worker status message returns a stamped revision so Slice 09 can
  diagnose old-worker/update states during production-preview E2E.
- The service worker IndexedDB open path still uses the same `portal-offline`
  version/store contract as `offlineDatabase.ts`; any future schema bump must
  update both paths in the same slice.
- Backend push payload coverage remains owned by Slice 01 unless this slice
  unexpectedly changes backend push delivery files.
