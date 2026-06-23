import { expect, type BrowserContext, type Page, test } from '@playwright/test'

import { E2E_PORTAL_USER } from '../../backend/src/test/e2ePortalUser.ts'
import { expectControlledStorageLossState } from './support/controlledStorageLoss.ts'
import {
  countPostsForClientMessageKey,
  createSeededOutboxRecord,
  deleteOfflineSavedData,
  expectStartupChatFallbackSaved,
  readLastActiveIdentity,
  readOutboxRecord,
  readOutboxRecordByContent,
  seedOutboxRecord,
  type BrowserOutboxRecord,
} from './support/offlinePwaStorage.ts'

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

const E2E_SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000

const OFFLINE_SAVED_CHAT_NOTICE = 'Нет связи. Показываем сохраненные сообщения.'
const OFFLINE_QUEUED_TEXT_NOTICE =
  'Нет связи. 1 сообщение в очереди. Отправим, когда связь восстановится.'
const RETIRED_COMPOSER_OFFLINE_NOTICE =
  'Нет соединения. Сообщения будут отправлены, когда соединение восстановится.'

type ChatPostBody = {
  clientMessageKey?: string
  content?: string
  threadId?: string
}

type PortalApiMockRequest = {
  body: string | null
  method: string
  path: string
  search: string
}

type PortalApiMockResponse = {
  body?: unknown
  contentType?: string
  hang?: boolean
  networkError?: boolean
  status: number
}

type PortalApiMockWindow = Window &
  typeof globalThis & {
    __portalApiMock?: (
      request: PortalApiMockRequest,
    ) => Promise<PortalApiMockResponse>
  }

type BrowserServiceWorkerStatusResult =
  | { assetCount: number; revision: string; status: 'ready' }
  | {
      reason: 'no_active_worker' | 'timeout' | 'unsupported'
      status: 'unavailable'
    }

function createPortalSession() {
  return {
    expiresAt: new Date(Date.now() + E2E_SESSION_TTL_MS).toISOString(),
  }
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
  let isApiOffline = false
  const hangingPaths = new Set<string>()
  let sentMessageId = 9000

  await context.exposeBinding(
    '__portalApiMock',
    async (
      _source,
      request: PortalApiMockRequest,
    ): Promise<PortalApiMockResponse> => {
      const path = request.path

      if (isApiOffline) {
        return { networkError: true, status: 0 }
      }

      if (hangingPaths.has(path)) {
        return { hang: true, status: 0 }
      }

      if (path === '/api/tenant') {
        return {
          body: { tenant },
          status: 200,
        }
      }

      if (path === '/api/auth/login' && request.method === 'POST') {
        isAuthenticated = true
        return {
          body: { session: createPortalSession(), user: portalUser },
          status: 200,
        }
      }

      if (path === '/api/auth/me') {
        if (!isAuthenticated) {
          return {
            body: {
              error: {
                code: 'UNAUTHORIZED',
                message: 'Требуется вход.',
              },
            },
            status: 401,
          }
        }

        return {
          body: { session: createPortalSession(), user: portalUser },
          status: 200,
        }
      }

      if (path === '/api/auth/logout') {
        isAuthenticated = false
        return {
          status: 204,
        }
      }

      if (path === '/api/chat/threads') {
        return {
          body: {
            activeThreadId: privateThread.id,
            threads: [{ ...privateThread, unreadCount: 0 }],
            totalUnreadCount: 0,
          },
          status: 200,
        }
      }

      if (path === '/api/chat/realtime') {
        return {
          status: 204,
        }
      }

      if (path === '/api/chat/support-availability') {
        return {
          body: {
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
          },
          status: 200,
        }
      }

      if (path.endsWith('/read') && request.method === 'POST') {
        return {
          status: 204,
        }
      }

      if (path.endsWith('/notification-settings')) {
        return {
          body: createNotificationSettings(privateThread.id),
          status: 200,
        }
      }

      if (path === '/api/chat/messages' && request.method === 'POST') {
        const body = JSON.parse(request.body ?? '{}') as ChatPostBody

        postBodies.push(body)
        sentMessageId += 1
        return {
          body: {
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
          },
          status: 200,
        }
      }

      if (path === '/api/chat/messages') {
        return {
          body: createReadySnapshot(),
          status: 200,
        }
      }

      return {
        body: {
          error: {
            code: 'unexpected_e2e_api',
            message: `Unexpected E2E API request: ${path}`,
          },
        },
        status: 500,
      }
    },
  )

  // Keep the real service worker active; Playwright request routing is flaky
  // with controlled pages in this production-preview smoke.
  await context.addInitScript(() => {
    const originalFetch = window.fetch.bind(window)

    window.fetch = async (input, init) => {
      const request = new Request(input, init)
      const requestUrl = new URL(request.url, window.location.href)

      if (
        requestUrl.origin !== window.location.origin ||
        !requestUrl.pathname.startsWith('/api/')
      ) {
        return originalFetch(request)
      }

      if (!window.navigator.onLine) {
        throw new TypeError('Failed to fetch')
      }

      const apiMock = (window as PortalApiMockWindow).__portalApiMock

      if (!apiMock) {
        return originalFetch(request)
      }

      const response = await apiMock({
        body:
          request.method === 'GET' || request.method === 'HEAD'
            ? null
            : await request.clone().text(),
        method: request.method,
        path: requestUrl.pathname,
        search: requestUrl.search,
      })

      if (response.hang) {
        return new Promise<Response>(() => {})
      }

      if (response.networkError) {
        throw new TypeError('Failed to fetch')
      }

      const headers = new Headers()

      if (response.contentType !== null) {
        headers.set('content-type', response.contentType ?? 'application/json')
      }

      return new Response(
        response.body === undefined ? null : JSON.stringify(response.body),
        {
          headers,
          status: response.status,
        },
      )
    }

    class MockEventSource extends EventTarget implements EventSource {
      static readonly CLOSED = 2
      static readonly CONNECTING = 0
      static readonly OPEN = 1
      readonly CLOSED = 2
      readonly CONNECTING = 0
      readonly OPEN = 1
      onerror: ((event: Event) => void) | null = null
      onmessage: ((event: MessageEvent) => void) | null = null
      onopen: ((event: Event) => void) | null = null
      readyState = MockEventSource.CONNECTING
      url: string
      withCredentials: boolean

      constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        super()
        this.url = String(url)
        this.withCredentials = Boolean(eventSourceInitDict?.withCredentials)
        window.setTimeout(() => {
          this.readyState = MockEventSource.CLOSED
          const event = new Event('error')

          this.onerror?.(event)
          this.dispatchEvent(event)
        }, 0)
      }

      close() {
        this.readyState = MockEventSource.CLOSED
      }
    }

    window.EventSource = MockEventSource
  })

  return {
    hang(path: string) {
      hangingPaths.add(path)
    },
    unhang(path: string) {
      hangingPaths.delete(path)
    },
    setApiOffline(nextIsOffline: boolean) {
      isApiOffline = nextIsOffline
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

test('opens saved chat during slow startup and queues offline text', async ({
  context,
  page,
}) => {
  const postBodies: ChatPostBody[] = []
  const apiRoutes = await routePortalApi(context, postBodies)

  await loginPortalUser(page)
  await ensureServiceWorkerControlsPage(page)
  await expect(page.getByText('Cached online message')).toBeVisible()

  apiRoutes.hang('/api/chat/threads')
  await page.reload()
  await expect(page.getByText('Личный чат')).toBeVisible()
  await expect(
    page.getByRole('status', { name: 'Соединение...' }),
  ).toBeVisible()
  await expect(page.getByText(OFFLINE_SAVED_CHAT_NOTICE)).toHaveCount(0)
  await expect(page.getByText('Cached online message')).toBeVisible()
  apiRoutes.unhang('/api/chat/threads')

  apiRoutes.hang('/api/tenant')
  apiRoutes.hang('/api/auth/me')

  await page.reload()

  await expect(
    page.getByText('Связь отвечает медленно. Проверяем сохраненные данные.'),
  ).toHaveCount(0)
  await expect(page.getByText('Личный чат')).toBeVisible()
  await expect(page.getByRole('status', { name: 'На связи' })).toBeVisible()
  await expect(page.getByText('Cached online message')).toBeVisible()

  await context.setOffline(true)
  apiRoutes.setApiOffline(true)
  await page.reload()
  await expect(page.getByText('Личный чат')).toBeVisible()
  await expect(page.getByText(OFFLINE_SAVED_CHAT_NOTICE)).toBeVisible()

  const identity = await readLastActiveIdentity(page)

  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Тест offline')
  await page.getByRole('button', { name: 'Отправить' }).click()
  await expect(page.getByText(OFFLINE_QUEUED_TEXT_NOTICE)).toBeVisible()
  await expect(page.getByText(RETIRED_COMPOSER_OFFLINE_NOTICE)).toHaveCount(0)
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
  apiRoutes.setApiOffline(false)
  await context.setOffline(false)
  await expect
    .poll(() => postBodies.some((body) => body.content === 'Тест offline'))
    .toBe(true)
  await expect(page.getByLabel('В очереди')).toHaveCount(0)
})

test('opens saved chat from installed PWA start url after cold offline launch', async ({
  context,
  page,
}) => {
  const postBodies: ChatPostBody[] = []
  const apiRoutes = await routePortalApi(context, postBodies)

  await loginPortalUser(page)
  await ensureServiceWorkerControlsPage(page)
  await expect(page.getByText('Cached online message')).toBeVisible()
  await expectStartupChatFallbackSaved(page)
  const identity = await readLastActiveIdentity(page)

  await page.close()
  apiRoutes.setApiOffline(true)
  await context.setOffline(true)

  const offlinePage = await context.newPage()

  await offlinePage.goto('/')
  await expect(offlinePage).toHaveURL(/\/app\/chat/)
  await expect(offlinePage.getByText('Личный чат')).toBeVisible()
  await expect(offlinePage.getByText(OFFLINE_SAVED_CHAT_NOTICE)).toBeVisible()
  await expect(offlinePage.getByText('Cached online message')).toBeVisible()

  await offlinePage
    .getByRole('textbox', { name: 'Сообщение' })
    .fill('Cold launch offline')
  await offlinePage.getByRole('button', { name: 'Отправить' }).click()
  await expect(offlinePage.getByText(OFFLINE_QUEUED_TEXT_NOTICE)).toBeVisible()
  await expect
    .poll(
      async () =>
        (
          await readOutboxRecordByContent(
            offlinePage,
            identity,
            'Cold launch offline',
          )
        )?.status ?? null,
    )
    .toBe('queued')
})

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
      threadId: privateThread.id,
      userId: identity.userId,
    }),
  ).resolves.toBeNull()
})

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
      threadId: privateThread.id,
      userId: identity.userId,
    }),
  ).resolves.toBeNull()
})

test('leaves splash when app shell opens but saved data was removed', async ({
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
  apiRoutes.setApiOffline(true)
  await context.setOffline(true)
  await deleteOfflineSavedData(page)
  await page.reload()

  await expectControlledStorageLossState(page)
})
