# Offline-first PWA Slice 09: Runtime E2E And Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the Offline-first PWA MVP in browser runtime, storage-loss states and installed-PWA smoke coverage, then close the implementation with review, checks and work-log update.

**Architecture:** E2E verifies the integrated runtime after earlier slices are complete. Closure updates stable docs only after implementation, review, fixes and required checks are done.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, IndexedDB, `idb`, Service Worker, Fastify, Drizzle/Postgres, Playwright.

---

**Part Of:** [Offline-first PWA Implementation Plan](./2026-05-27-offline-first-pwa-implementation.md)

**Slice:** 09 of 9

**Depends On:** Slices 01-08.

**Unlocks:** SMS fallback gateway implementation on top of the verified Offline-first PWA baseline.

---

## Task 10: Runtime E2E Coverage

**Goal:** Prove the MVP in a browser: slow startup leaves splash, offline reload
opens saved data, offline text send queues durably, online restore reconciles,
storage loss leaves a controlled state, multi-tab drain does not duplicate
sends, and stale sending recovers.

**Files:**

- Create: `tests/e2e/offline-first-pwa.spec.ts`

- [ ] **Step 1: Add primary offline reload/send E2E**

Create `tests/e2e/offline-first-pwa.spec.ts`:

```ts
import { expect, type BrowserContext, type Page, test } from '@playwright/test'

import { E2E_PORTAL_USER } from '../../backend/src/test/e2ePortalUser.ts'

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} as const

const tenant = {
  displayName: 'Бухфирма',
  primaryDomain: '127.0.0.1',
  publicBaseUrl: 'http://127.0.0.1:4173',
  slug: 'buhfirma',
}

const portalUser = {
  email: E2E_PORTAL_USER.email,
  fullName: E2E_PORTAL_USER.fullName,
  id: 7,
}

const portalSession = {
  expiresAt: '2026-06-10T10:00:00.000Z',
}

const OFFLINE_STORE_NAMES = [
  'tenant_contexts',
  'last_active_identities',
  'local_device_signouts',
  'auth_snapshots',
  'chat_thread_lists',
  'chat_message_snapshots',
  'chat_text_outbox',
  'sync_leases',
  'push_stale_markers',
] as const

type BrowserLastActiveIdentity = {
  tenantSlug: string
  userId: number
}

type BrowserOutboxKey = {
  clientMessageKey: string
  tenantSlug: string
  threadId: string
  userId: number
}

type BrowserOutboxRecord = {
  attemptCount: number
  clientMessageKey: string
  content: string
  createdAt: string
  errorCode: string | null
  errorMessage: string | null
  lastAttemptAt: string | null
  nextAttemptAt: string | null
  replyTo: null
  replyToMessageId: null
  sendOwnerId: string | null
  sendingLeaseExpiresAt: string | null
  sendingStartedAt: string | null
  status: 'queued' | 'sending'
  tenantSlug: string
  threadId: string
  updatedAt: string
  userId: number
}

type ChatPostBody = {
  clientMessageKey?: string
  content?: string
  threadId?: string
}

type BrowserServiceWorkerStatusResult =
  | { assetCount: number; revision: string; status: 'ready' }
  | {
      reason: 'no_active_worker' | 'timeout' | 'unsupported'
      status: 'unavailable'
    }

function createReadySnapshot({
  content = 'Cached online message',
  messageId = 501,
}: {
  content?: string
  messageId?: number
} = {}) {
  return {
    activeThread: privateThread,
    hasMoreOlder: false,
    messages: [
      {
        attachments: [],
        authorName: 'Ольга Support',
        authorRole: 'agent',
        content,
        contentType: 'text',
        createdAt: '2026-05-27T10:00:00.000Z',
        direction: 'incoming',
        id: messageId,
        status: 'sent',
      },
    ],
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
  }
}

function createNotificationSettings(threadId: string) {
  return {
    effective: {
      newMessagesEnabled: false,
      pushEnabled: false,
      soundEnabled: false,
    },
    global: {
      newMessagesEnabled: false,
      pushEnabled: false,
      soundEnabled: false,
    },
    overrides: {
      newMessagesEnabled: null,
      pushEnabled: null,
      soundEnabled: null,
    },
    threadId,
  }
}

async function routePortalApi(
  context: BrowserContext,
  postBodies: ChatPostBody[] = [],
) {
  let isAuthenticated = false
  const hangingPaths = new Set<string>()
  let sentMessageId = 9000

  await context.route('**/api/**', async (route) => {
    const request = route.request()
    const requestUrl = new URL(request.url())
    const path = requestUrl.pathname

    if (hangingPaths.has(path)) {
      await new Promise(() => {})
      return
    }

    if (path === '/api/tenant') {
      await route.fulfill({
        body: JSON.stringify({ tenant }),
        contentType: 'application/json',
        status: 200,
      })
      return
    }

    if (path === '/api/auth/login' && request.method() === 'POST') {
      isAuthenticated = true
      await route.fulfill({
        body: JSON.stringify({ session: portalSession, user: portalUser }),
        contentType: 'application/json',
        status: 200,
      })
      return
    }

    if (path === '/api/auth/me') {
      if (!isAuthenticated) {
        await route.fulfill({
          body: JSON.stringify({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Требуется вход.',
            },
          }),
          contentType: 'application/json',
          status: 401,
        })
        return
      }

      await route.fulfill({
        body: JSON.stringify({ session: portalSession, user: portalUser }),
        contentType: 'application/json',
        status: 200,
      })
      return
    }

    if (path === '/api/auth/logout') {
      isAuthenticated = false
      await route.fulfill({ status: 204 })
      return
    }

    if (path === '/api/chat/threads') {
      await route.fulfill({
        body: JSON.stringify({
          activeThreadId: privateThread.id,
          threads: [privateThread],
        }),
        contentType: 'application/json',
        status: 200,
      })
      return
    }

    if (path === '/api/chat/realtime') {
      await route.fulfill({ status: 204 })
      return
    }

    if (path === '/api/chat/support-availability') {
      await route.fulfill({
        body: JSON.stringify({
          currentStatus: 'online',
          outOfOfficeMessage: null,
          reason: 'none',
          result: 'ready',
          workingHours: {
            enabled: false,
            isWithinWorkingHours: null,
            rows: [],
            timezone: 'UTC',
          },
        }),
        contentType: 'application/json',
        status: 200,
      })
      return
    }

    if (path.endsWith('/notification-settings')) {
      await route.fulfill({
        body: JSON.stringify(createNotificationSettings(privateThread.id)),
        contentType: 'application/json',
        status: 200,
      })
      return
    }

    if (path === '/api/chat/messages' && request.method() === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as ChatPostBody

      postBodies.push(body)
      sentMessageId += 1
      await route.fulfill({
        body: JSON.stringify({
          activeThread: privateThread,
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [],
            authorName: 'Вы',
            authorRole: 'current_user',
            clientMessageKey: body.clientMessageKey ?? null,
            content: body.content ?? '',
            contentType: 'text',
            createdAt: new Date().toISOString(),
            direction: 'outgoing',
            id: sentMessageId,
            status: 'sent',
          },
        }),
        contentType: 'application/json',
        status: 200,
      })
      return
    }

    if (path === '/api/chat/messages') {
      await route.fulfill({
        body: JSON.stringify(createReadySnapshot()),
        contentType: 'application/json',
        status: 200,
      })
      return
    }

    await route.fulfill({
      body: JSON.stringify({
        error: {
          code: 'unexpected_e2e_api',
          message: `Unexpected E2E API request: ${path}`,
        },
      }),
      contentType: 'application/json',
      status: 500,
    })
  })

  return {
    hang(path: string) {
      hangingPaths.add(path)
    },
    unhang(path: string) {
      hangingPaths.delete(path)
    },
  }
}

async function loginPortalUser(page: Page) {
  await page.goto('/auth/login')
  await page.getByLabel('Email').fill(E2E_PORTAL_USER.email)
  await page
    .getByRole('textbox', { name: 'Пароль' })
    .fill(E2E_PORTAL_USER.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByText('Личный чат')).toBeVisible()
}

async function ensureServiceWorkerControlsPage(page: Page) {
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service worker is unavailable in this browser.')
    }

    await navigator.serviceWorker.ready
  })

  if (
    !(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
  ) {
    await page.reload()
  }

  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true)

  const status = await queryActiveServiceWorkerStatus(page)

  if (status.status !== 'ready') {
    throw new Error(
      `Active service worker did not report ready status: ${JSON.stringify(
        status,
      )}`,
    )
  }

  expect(status.assetCount).toBeGreaterThan(0)
  expect(status.revision).not.toContain('__PORTAL_SERVICE_WORKER_REVISION__')
  expect(status.revision.length).toBeGreaterThan(0)
}

async function queryActiveServiceWorkerStatus(
  page: Page,
): Promise<BrowserServiceWorkerStatusResult> {
  return page.evaluate(async (): Promise<BrowserServiceWorkerStatusResult> => {
    if (!('serviceWorker' in navigator)) {
      return { reason: 'unsupported', status: 'unavailable' }
    }

    const timeoutMs = 1000
    const container = navigator.serviceWorker
    const worker =
      container.controller ??
      (await new Promise<ServiceWorker | null>((resolve) => {
        const timeoutId = window.setTimeout(() => resolve(null), timeoutMs)

        container.ready
          .then((registration) => {
            window.clearTimeout(timeoutId)
            resolve(registration.active ?? null)
          })
          .catch(() => {
            window.clearTimeout(timeoutId)
            resolve(null)
          })
      }))

    if (!worker) {
      return { reason: 'no_active_worker', status: 'unavailable' }
    }

    return new Promise<BrowserServiceWorkerStatusResult>((resolve) => {
      const channel = new MessageChannel()
      const timeoutId = window.setTimeout(() => {
        channel.port1.close()
        resolve({ reason: 'timeout', status: 'unavailable' })
      }, timeoutMs)

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
  })
}

// These Playwright browser-context helpers intentionally use native IndexedDB:
// they run inside page.evaluate outside the app bundle. App code uses `idb`.

async function readLastActiveIdentity(page: Page) {
  return page.evaluate(
    async ({ storeNames }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('portal-offline', 1)

        request.onupgradeneeded = () => {
          const database = request.result

          for (const storeName of storeNames) {
            if (!database.objectStoreNames.contains(storeName)) {
              database.createObjectStore(storeName)
            }
          }
        }
        request.onsuccess = () => {
          resolve(request.result)
        }
        request.onerror = () => {
          reject(request.error)
        }
      })

      return new Promise<BrowserLastActiveIdentity>((resolve, reject) => {
        const transaction = database.transaction(
          'last_active_identities',
          'readonly',
        )
        const cursorRequest = transaction
          .objectStore('last_active_identities')
          .openCursor()

        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result

          if (!cursor) {
            reject(new Error('Missing last active offline identity.'))
            return
          }

          const value = cursor.value as BrowserLastActiveIdentity
          resolve({
            tenantSlug: value.tenantSlug,
            userId: value.userId,
          })
        }
        cursorRequest.onerror = () => {
          reject(cursorRequest.error)
        }
        transaction.oncomplete = () => {
          database.close()
        }
        transaction.onabort = () => {
          database.close()
        }
      })
    },
    { storeNames: OFFLINE_STORE_NAMES },
  )
}

async function readOutboxRecord(page: Page, record: BrowserOutboxKey) {
  return page.evaluate(
    async ({ outboxRecord, storeNames }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('portal-offline', 1)

        request.onupgradeneeded = () => {
          const database = request.result

          for (const storeName of storeNames) {
            if (!database.objectStoreNames.contains(storeName)) {
              database.createObjectStore(storeName)
            }
          }
        }
        request.onsuccess = () => {
          resolve(request.result)
        }
        request.onerror = () => {
          reject(request.error)
        }
      })

      return new Promise<BrowserOutboxRecord | null>((resolve, reject) => {
        const transaction = database.transaction('chat_text_outbox', 'readonly')
        const key = `${outboxRecord.tenantSlug}:${outboxRecord.userId}:${outboxRecord.threadId}:${outboxRecord.clientMessageKey}`
        const request = transaction.objectStore('chat_text_outbox').get(key)

        request.onsuccess = () => {
          resolve((request.result as BrowserOutboxRecord | undefined) ?? null)
        }
        request.onerror = () => {
          reject(request.error)
        }
        transaction.oncomplete = () => {
          database.close()
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
    },
    { outboxRecord: record, storeNames: OFFLINE_STORE_NAMES },
  )
}

async function readOutboxRecordByContent(
  page: Page,
  identity: BrowserLastActiveIdentity,
  content: string,
) {
  return page.evaluate(
    async ({ expectedContent, storeNames, userIdentity }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('portal-offline', 1)

        request.onupgradeneeded = () => {
          const database = request.result

          for (const storeName of storeNames) {
            if (!database.objectStoreNames.contains(storeName)) {
              database.createObjectStore(storeName)
            }
          }
        }
        request.onsuccess = () => {
          resolve(request.result)
        }
        request.onerror = () => {
          reject(request.error)
        }
      })

      return new Promise<BrowserOutboxRecord | null>((resolve, reject) => {
        const transaction = database.transaction('chat_text_outbox', 'readonly')
        const request = transaction.objectStore('chat_text_outbox').getAll()

        request.onsuccess = () => {
          const records = request.result as BrowserOutboxRecord[]
          const record =
            records.find(
              (record) =>
                record.tenantSlug === userIdentity.tenantSlug &&
                record.userId === userIdentity.userId &&
                record.threadId === 'private:me' &&
                record.content === expectedContent,
            ) ?? null

          resolve(record)
        }
        request.onerror = () => {
          reject(request.error)
        }
        transaction.oncomplete = () => {
          database.close()
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
    },
    {
      expectedContent: content,
      storeNames: OFFLINE_STORE_NAMES,
      userIdentity: identity,
    },
  )
}

async function seedOutboxRecord(page: Page, record: BrowserOutboxRecord) {
  await page.evaluate(
    async ({ outboxRecord, storeNames }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('portal-offline', 1)

        request.onupgradeneeded = () => {
          const database = request.result

          for (const storeName of storeNames) {
            if (!database.objectStoreNames.contains(storeName)) {
              database.createObjectStore(storeName)
            }
          }
        }
        request.onsuccess = () => {
          resolve(request.result)
        }
        request.onerror = () => {
          reject(request.error)
        }
      })

      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          'chat_text_outbox',
          'readwrite',
        )
        const key = `${outboxRecord.tenantSlug}:${outboxRecord.userId}:${outboxRecord.threadId}:${outboxRecord.clientMessageKey}`

        transaction.objectStore('chat_text_outbox').put(outboxRecord, key)
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
    },
    { outboxRecord: record, storeNames: OFFLINE_STORE_NAMES },
  )
}

function createSeededOutboxRecord(
  identity: BrowserLastActiveIdentity,
  overrides: Partial<BrowserOutboxRecord>,
): BrowserOutboxRecord {
  const now = new Date().toISOString()

  return {
    attemptCount: 0,
    clientMessageKey: 'portal-send:e2e-seeded',
    content: 'Seeded offline text',
    createdAt: now,
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
    tenantSlug: identity.tenantSlug,
    threadId: 'private:me',
    updatedAt: now,
    userId: identity.userId,
    ...overrides,
  }
}

function countPostsForClientMessageKey(
  postBodies: ChatPostBody[],
  clientMessageKey: string,
) {
  return postBodies.filter((body) => body.clientMessageKey === clientMessageKey)
    .length
}

test('opens saved chat during slow startup and queues offline text', async ({
  context,
  page,
}) => {
  const postBodies: ChatPostBody[] = []
  const apiRoutes = await routePortalApi(context, postBodies)

  await loginPortalUser(page)
  await ensureServiceWorkerControlsPage(page)
  await expect(page.getByText('Cached online message')).toBeVisible()

  apiRoutes.hang('/api/tenant')
  apiRoutes.hang('/api/auth/me')

  await page.reload()

  await expect(
    page.getByText('Связь отвечает медленно. Проверяем сохраненные данные.'),
  ).toBeVisible()
  await expect(
    page.getByText('Нет соединения. Показываем сохраненные данные.'),
  ).toBeVisible()

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('Личный чат')).toBeVisible()
  await expect(
    page.getByText('Нет соединения. Показываем сохраненные данные.'),
  ).toBeVisible()

  const identity = await readLastActiveIdentity(page)

  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Тест offline')
  await page.getByRole('button', { name: 'Отправить' }).click()
  await expect(page.getByLabel('В очереди')).toBeVisible()
  await expect
    .poll(
      async () =>
        (await readOutboxRecordByContent(page, identity, 'Тест offline'))
          ?.status ?? null,
    )
    .toBe('queued')
  const queuedRecord = await readOutboxRecordByContent(
    page,
    identity,
    'Тест offline',
  )

  if (!queuedRecord) {
    throw new Error('Queued outbox record was not persisted.')
  }

  expect(queuedRecord).toMatchObject({
    content: 'Тест offline',
    status: 'queued',
  })

  await page.reload()
  await expect(page.getByText('Личный чат')).toBeVisible()
  await expect(page.getByText('Тест offline')).toBeVisible()
  await expect(page.getByLabel('В очереди')).toBeVisible()
  await expect(
    readOutboxRecord(page, {
      clientMessageKey: queuedRecord.clientMessageKey,
      tenantSlug: identity.tenantSlug,
      threadId: privateThread.id,
      userId: identity.userId,
    }),
  ).resolves.toMatchObject({
    content: 'Тест offline',
    status: 'queued',
  })

  apiRoutes.unhang('/api/tenant')
  apiRoutes.unhang('/api/auth/me')
  await context.setOffline(false)
  await expect
    .poll(() => postBodies.some((body) => body.content === 'Тест offline'))
    .toBe(true)
  await expect(page.getByLabel('В очереди')).toHaveCount(0)
})
```

- [ ] **Step 2: Add multi-tab drain E2E**

```ts
test('drains one queued text once across two tabs', async ({ context }) => {
  const first = await context.newPage()
  const second = await context.newPage()
  const postBodies: ChatPostBody[] = []
  const clientMessageKey = 'portal-send:e2e-multitab'

  await routePortalApi(context, postBodies)

  await loginPortalUser(first)
  await ensureServiceWorkerControlsPage(first)
  await second.goto('/app/chat')
  await expect(second.getByText('Личный чат')).toBeVisible()

  const identity = await readLastActiveIdentity(first)

  await seedOutboxRecord(
    first,
    createSeededOutboxRecord(identity, {
      clientMessageKey,
      content: 'Only once',
    }),
  )

  await Promise.all([first.reload(), second.reload()])
  await expect
    .poll(() => countPostsForClientMessageKey(postBodies, clientMessageKey))
    .toBe(1)
  await first.waitForTimeout(1000)
  expect(countPostsForClientMessageKey(postBodies, clientMessageKey)).toBe(1)
  await expect(
    readOutboxRecord(first, {
      clientMessageKey,
      tenantSlug: identity.tenantSlug,
      threadId: 'private:me',
      userId: identity.userId,
    }),
  ).resolves.toBeNull()
})
```

- [ ] **Step 3: Add stale sending recovery E2E**

```ts
test('recovers stale sending text with original client message key', async ({
  context,
  page,
}) => {
  const postBodies: ChatPostBody[] = []
  const expiredLease = new Date(Date.now() - 60_000).toISOString()

  await routePortalApi(context, postBodies)

  await loginPortalUser(page)
  await ensureServiceWorkerControlsPage(page)

  const identity = await readLastActiveIdentity(page)

  await seedOutboxRecord(
    page,
    createSeededOutboxRecord(identity, {
      clientMessageKey: 'portal-send:e2e-stale',
      content: 'Recovered stale send',
      sendingLeaseExpiresAt: expiredLease,
      sendingStartedAt: expiredLease,
      status: 'sending',
    }),
  )

  await page.reload()

  await expect
    .poll(() =>
      postBodies.some(
        (body) => body.clientMessageKey === 'portal-send:e2e-stale',
      ),
    )
    .toBe(true)
  await expect(
    readOutboxRecord(page, {
      clientMessageKey: 'portal-send:e2e-stale',
      tenantSlug: identity.tenantSlug,
      threadId: 'private:me',
      userId: identity.userId,
    }),
  ).resolves.toBeNull()
})
```

- [ ] **Step 4: Add storage-loss E2E**

```ts
async function deleteOfflineDatabase(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('portal-offline')

        request.onsuccess = () => resolve()
        request.onerror = () =>
          reject(request.error ?? new Error('Failed to delete offline DB.'))
        request.onblocked = () =>
          reject(new Error('Offline DB deletion was blocked.'))
      }),
  )
}

test('leaves splash when app shell opens but saved data was removed', async ({
  context,
  page,
}) => {
  const postBodies: ChatPostBody[] = []
  const apiRoutes = await routePortalApi(context, postBodies)

  await loginPortalUser(page)
  await ensureServiceWorkerControlsPage(page)
  await expect(page.getByText('Cached online message')).toBeVisible()

  await deleteOfflineDatabase(page)
  apiRoutes.hang('/api/tenant')
  apiRoutes.hang('/api/auth/me')
  await context.setOffline(true)
  await page.reload()

  await expect(page.getByText('Нужно подключение к интернету.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible()
  await expect(page.getByText('Личный чат')).toHaveCount(0)
})
```

- [ ] **Step 5: Run E2E**

Use the existing local Postgres/env setup from
`docs/operations/local-testing.md`. This spec must run against a production
frontend build because `registerServiceWorker()` is gated by
`import.meta.env.PROD`; the Playwright spec mocks same-origin `/api/*` responses
so `vite preview` does not need the dev-server proxy for this proof. Use
`127.0.0.1` rather than a `nip.io` tenant hostname for this service-worker E2E:
loopback HTTP is a browser-trusted service-worker context, while arbitrary HTTP
hostnames may not be.

Terminal A:

```bash
pnpm --dir frontend build
pnpm --dir frontend preview -- --host 0.0.0.0 --port 4173
```

Terminal B:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 E2E_TENANT_SLUG=buhfirma pnpm test:e2e -- offline-first-pwa.spec.ts
```

Expected: PASS.

The primary spec must assert active service worker status through
`PORTAL_SERVICE_WORKER_STATUS` after `ensureServiceWorkerControlsPage()`: stamped
revision is not a placeholder, and generated app-shell asset count is positive.

If the production preview runner cannot be used in the local environment, record
this exact blocker in the final closure:

```md
Blocked service-worker app-shell E2E locally: `registerServiceWorker()` only
runs in production builds, and this environment could not keep
`pnpm --dir frontend preview -- --host 0.0.0.0 --port 4173` reachable at
`http://127.0.0.1:4173`. Foreground IndexedDB offline fallback,
outbox drain and service-worker asset injection remain covered by targeted
Vitest/build checks until a production preview runner is available.
```

- [ ] **Step 6: Run installed-PWA smoke matrix or record blocker**

After Chromium E2E is green, run a short manual smoke on installed PWAs:

```md
| Platform                     | Required checks                                                                                  | Result                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Android Chrome installed PWA | Online login/chat load, offline reload, queued text, online reconciliation                       | Record PASS, or BLOCKED with exact blocker text |
| iOS/iPadOS Home Screen PWA   | Online login/chat load, poor/offline reload leaves splash, storage removal shows controlled copy | Record PASS, or BLOCKED with exact blocker text |
```

If a device is unavailable, record the exact blocker in closure instead of
silently treating Chromium as full platform coverage.

## Task 11: Final Closure, Review, And Work Log

**Goal:** Complete closure flow, fix findings, run targeted checks, and update
stable docs only after runtime baseline is verified.

**Files:**

- Modify: `docs/roadmap/work-log.md`

- [ ] **Step 1: Run targeted checks**

```bash
pnpm --dir backend test -- src/modules/auth/service.test.ts src/app-auth.integration.test.ts src/modules/chat-notifications/pushDeliveryService.test.ts --run
pnpm --dir frontend test -- src/features/offline/offlineStore.test.ts src/features/offline/outboxDrain.test.ts src/features/offline/useOfflineOutboxDrain.test.tsx src/features/offline/storagePersistence.test.ts src/features/tenant/lib/TenantProvider.test.tsx src/features/auth src/features/chat/pages/offlineChatCache.test.ts src/features/chat/pages/ChatPage.offline-cache.test.tsx src/features/chat/pages/ChatPage.optimistic-send.test.tsx src/features/chat/pages/ChatPage.unread-indicators.test.tsx src/pwa/serviceWorkerAsset.test.ts src/pwa/serviceWorkerRuntime.test.ts --run
pnpm --dir frontend typecheck
pnpm --dir frontend build
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 E2E_TENANT_SLUG=buhfirma pnpm test:e2e -- offline-first-pwa.spec.ts
git diff --check
```

Expected: PASS. If the Playwright command is blocked by local production-preview
availability, use the exact blocker text from Task 10 Step 5 and keep the
Vitest/build checks green before closure.

Also attach or paste the installed-PWA smoke matrix from Task 10 Step 6. If a
platform was not checked, closure must say whether that platform is explicitly
deferred or blocked.

- [ ] **Step 2: Code review touched areas**

Review checklist:

- Tenant cache fallback does not open after authoritative tenant rejection.
- `offlineAccessUntil` gates protected cached auth.
- Logout and local device removal clear only current `tenantSlug:userId` scope.
- No Chatwoot token or Chatwoot direct URL enters browser storage.
- `/api/*` remains service-worker passthrough.
- Composer clears draft/reply only after durable outbox commit.
- Stale `sending` records retry with original `clientMessageKey`.
- Web Locks/fallback lease prevents routine multi-tab duplicate sends.
- Push stale markers are scoped to `tenantSlug:userId`.
- Retention pruning cannot silently delete fresh unsent text.
- Evicted or deleted IndexedDB opens controlled online-required/session-check UI.
- Suspicious local clock rollback cannot extend cached auth.
- Active service worker revision/build asset status is queried during E2E through
  `PORTAL_SERVICE_WORKER_STATUS`, not only inspected manually.
- Reconnect refreshes thread list and selected thread even when no push stale
  marker exists.
- Privacy-safe logs/events do not include message content, emails, tokens or raw
  cached payloads.
- SMS fallback can add `sms_fallback_metadata` through IndexedDB schema upgrade.

- [ ] **Step 3: Fix review findings and rerun relevant checks**

For every finding found during review, first create a finding file in
`docs/findings/` with exact targeted checks for that finding. Use this closure
matrix as the default targeted rerun set by area.

Frontend offline store, outbox, chat cache and PWA runtime:

```bash
pnpm --dir frontend test -- src/features/offline/offlineStore.test.ts src/features/offline/outboxDrain.test.ts src/features/offline/useOfflineOutboxDrain.test.tsx src/features/offline/storagePersistence.test.ts src/features/chat/pages/offlineChatCache.test.ts src/features/chat/pages/ChatPage.offline-cache.test.tsx src/features/chat/pages/ChatPage.optimistic-send.test.tsx src/features/chat/pages/ChatPage.unread-indicators.test.tsx src/pwa/serviceWorkerAsset.test.ts src/pwa/serviceWorkerRuntime.test.ts --run
```

Backend auth/session and push payload boundaries:

```bash
pnpm --dir backend test -- src/modules/auth/service.test.ts src/app-auth.integration.test.ts src/modules/chat-notifications/pushDeliveryService.test.ts --run
```

Browser runtime proof after E2E changes:

```bash
pnpm --dir frontend build
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 E2E_TENANT_SLUG=buhfirma pnpm test:e2e -- offline-first-pwa.spec.ts
```

Expected: PASS for the touched area, or an open finding with the exact blocker
and next action.

- [ ] **Step 4: Update work log after full closure**

In `docs/roadmap/work-log.md`, add one concise completed baseline bullet under
`Core Product` or `Current Baseline`:

```md
- Offline-first PWA MVP реализован: установленный portal открывает сохраненные
  tenant/auth/chat данные при плохой связи после предыдущего online входа,
  текстовые сообщения ставятся в локальную durable outbox и доставляются после
  восстановления соединения; backend остается единственной authority-зоной.
```

Replace final `Recommended Next Step` with:

```md
## Recommended Next Step

- Start SMS fallback gateway from the verified Offline-first PWA baseline:
  run the SMSGate Private Server spike, then implement
  `sms_fallback_metadata` caching and the native `sms:` emergency action for
  `private:me`.
```
