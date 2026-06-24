import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { createReadStream, existsSync } from 'node:fs'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize, resolve, sep } from 'node:path'

import { E2E_PORTAL_USER } from '../../backend/src/test/e2ePortalUser.ts'
import {
  countPostsForClientMessageKey,
  createSeededOutboxRecord,
  readLastActiveIdentity,
  readOutboxRecord,
  seedOutboxRecord,
  type BrowserOutboxRecord,
} from './support/offlinePwaStorage.ts'

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} as const

const portalUser = {
  email: E2E_PORTAL_USER.email,
  fullName: E2E_PORTAL_USER.fullName,
  id: 7,
}

const E2E_SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000
const DIST_DIR = resolve(process.cwd(), 'frontend/dist')
const OUTBOX_TEXT = 'Background sync real network text'
const OUTBOX_CLIENT_MESSAGE_KEY = 'portal-send:e2e-background-real-network'

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

type RuntimeServer = {
  close: () => Promise<void>
  failedMessageRequestCount: () => number
  origin: string
  postBodies: ChatPostBody[]
  setMessageEndpointAvailable: (isAvailable: boolean) => void
}

function createPortalSession() {
  return {
    expiresAt: new Date(Date.now() + E2E_SESSION_TTL_MS).toISOString(),
  }
}

function createReadySnapshot(sentMessages: unknown[] = []) {
  return {
    activeThread: privateThread,
    hasMoreOlder: false,
    messages: [
      {
        attachments: [],
        authorName: 'Ольга Support',
        authorRole: 'agent',
        content: 'Cached online message',
        contentType: 'text',
        createdAt: '2026-05-27T10:00:00.000Z',
        direction: 'incoming',
        id: 501,
        status: 'sent',
      },
      ...sentMessages,
    ],
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
  }
}

function createDefaultBranding(tenantDisplayName: string) {
  return {
    appearance: {
      authBackgroundOverlay: 'none',
      authButtonStyle: 'solid',
      authColorScheme: 'light',
      authFieldStyle: 'solid',
    },
    assets: {},
    colors: {
      accent: '#4676b4',
      authBackground: '#f3f7fc',
      authMutedText: '#64748b',
      authText: '#15486b',
      chatBackground: '#ffffff',
      chatHeaderBackground: '#ffffff',
      chatHeaderText: '#0f172a',
      chatMutedText: '#64748b',
      chatText: '#334155',
      primary: '#112540',
    },
    copy: {
      authSubtitle: 'Войдите, чтобы продолжить общение с поддержкой.',
      authTitle: 'ВХОД ДЛЯ КЛИЕНТОВ',
      chatEmptyBody: 'Напишите нам, когда будет удобно. Мы ответим здесь.',
      chatEmptyTitle: 'Мы на связи',
      chatInfoTitle: 'Информация о чате',
    },
    layout: {
      authBrandPlacement: 'center',
    },
    portalName: tenantDisplayName,
    supportContact: {
      phoneDisplay: null,
      phoneHref: null,
    },
    supportLabel: `Команда ${tenantDisplayName}`,
    version: 1,
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

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body?: unknown,
) {
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'application/json',
  })
  response.end(body === undefined ? undefined : JSON.stringify(body))
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString('utf8')
}

function getContentType(filePath: string) {
  switch (extname(filePath)) {
    case '.css':
      return 'text/css; charset=utf-8'
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.json':
    case '.webmanifest':
      return 'application/json; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.svg':
      return 'image/svg+xml'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

function resolveStaticFile(pathname: string) {
  const decodedPath = decodeURIComponent(pathname)
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '')
  const relativePath =
    normalizedPath === sep || normalizedPath === '.'
      ? 'index.html'
      : normalizedPath.replace(/^[/\\]/, '')
  const filePath = resolve(DIST_DIR, relativePath)

  if (filePath !== DIST_DIR && !filePath.startsWith(`${DIST_DIR}${sep}`)) {
    return null
  }

  if (existsSync(filePath)) {
    return filePath
  }

  return join(DIST_DIR, 'index.html')
}

async function startRuntimeServer(): Promise<RuntimeServer> {
  const indexPath = join(DIST_DIR, 'index.html')
  const serviceWorkerPath = join(DIST_DIR, 'sw.js')

  if (!existsSync(indexPath) || !existsSync(serviceWorkerPath)) {
    throw new Error(
      'Missing frontend production build. Run `pnpm --dir frontend build` before this smoke.',
    )
  }

  let origin = ''
  let isAuthenticated = false
  let isMessageEndpointAvailable = true
  let failedMessageRequestCount = 0
  let sentMessageId = 9000
  const postBodies: ChatPostBody[] = []
  const sentMessages: unknown[] = []
  const tenantDisplayName = 'PWA Runtime'

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
    const pathname = requestUrl.pathname

    if (pathname === '/api/tenant') {
      writeJson(response, 200, {
        tenant: {
          displayName: tenantDisplayName,
          primaryDomain: '127.0.0.1',
          publicBaseUrl: origin,
          slug: 'pwa-runtime',
        },
      })
      return
    }

    if (pathname === '/api/branding') {
      writeJson(response, 200, {
        branding: createDefaultBranding(tenantDisplayName),
      })
      return
    }

    if (pathname === '/api/tenant/manifest.webmanifest') {
      writeJson(response, 200, {
        background_color: '#f3f7fc',
        display: 'standalone',
        icons: [
          {
            sizes: '192x192',
            src: '/pwa-icons/icon-192.png',
          },
          {
            purpose: 'maskable',
            sizes: '512x512',
            src: '/pwa-icons/icon-maskable-512.png',
          },
        ],
        id: '/',
        name: `${tenantDisplayName} Личный кабинет`,
        scope: '/',
        short_name: tenantDisplayName,
        start_url: '/',
        theme_color: '#112540',
      })
      return
    }

    if (pathname === '/api/auth/login' && request.method === 'POST') {
      isAuthenticated = true
      response.setHeader(
        'set-cookie',
        'portal_session=e2e; Path=/; SameSite=Lax',
      )
      writeJson(response, 200, {
        session: createPortalSession(),
        user: portalUser,
      })
      return
    }

    if (pathname === '/api/auth/me') {
      if (!isAuthenticated) {
        writeJson(response, 401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Требуется вход.',
          },
        })
        return
      }

      writeJson(response, 200, {
        session: createPortalSession(),
        user: portalUser,
      })
      return
    }

    if (pathname === '/api/auth/logout') {
      isAuthenticated = false
      response.writeHead(204)
      response.end()
      return
    }

    if (pathname === '/api/chat/threads') {
      writeJson(response, 200, {
        activeThreadId: privateThread.id,
        threads: [{ ...privateThread, unreadCount: 0 }],
        totalUnreadCount: 0,
      })
      return
    }

    if (pathname === '/api/chat/messages' && request.method === 'POST') {
      if (!isMessageEndpointAvailable) {
        failedMessageRequestCount += 1
        request.socket.destroy()
        return
      }

      const body = JSON.parse(await readRequestBody(request)) as ChatPostBody

      postBodies.push(body)
      sentMessageId += 1

      const sentMessage = {
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
      }

      sentMessages.push(sentMessage)
      writeJson(response, 200, {
        activeThread: privateThread,
        reason: 'none',
        result: 'ready',
        sentMessage,
      })
      return
    }

    if (pathname === '/api/chat/messages') {
      writeJson(response, 200, createReadySnapshot(sentMessages))
      return
    }

    if (pathname === '/api/chat/support-availability') {
      writeJson(response, 200, {
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
      })
      return
    }

    if (pathname === '/api/chat/realtime') {
      response.writeHead(204)
      response.end()
      return
    }

    if (pathname.endsWith('/read') && request.method === 'POST') {
      response.writeHead(204)
      response.end()
      return
    }

    if (pathname.endsWith('/notification-settings')) {
      writeJson(response, 200, createNotificationSettings(privateThread.id))
      return
    }

    if (pathname.startsWith('/api/')) {
      writeJson(response, 500, {
        error: {
          code: 'unexpected_e2e_api',
          message: `Unexpected E2E API request: ${pathname}`,
        },
      })
      return
    }

    const filePath = resolveStaticFile(pathname)

    if (!filePath || !existsSync(filePath)) {
      response.writeHead(404)
      response.end()
      return
    }

    response.writeHead(200, {
      'cache-control': pathname === '/sw.js' ? 'no-store' : 'public, max-age=0',
      'content-type': getContentType(filePath),
    })
    createReadStream(filePath).pipe(response)
  })

  await new Promise<void>((resolveServer) => {
    server.listen(0, '127.0.0.1', resolveServer)
  })

  const address = server.address() as AddressInfo
  origin = `http://127.0.0.1:${address.port}`

  return {
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolveClose()
        })
      }),
    failedMessageRequestCount: () => failedMessageRequestCount,
    origin,
    postBodies,
    setMessageEndpointAvailable: (nextIsAvailable) => {
      isMessageEndpointAvailable = nextIsAvailable
    },
  }
}

async function loginPortalUser(page: Page, origin: string) {
  await page.goto(`${origin}/auth/login`)
  await page.getByLabel('Email').fill(E2E_PORTAL_USER.email)
  await page
    .getByRole('textbox', { name: 'Пароль' })
    .fill(E2E_PORTAL_USER.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByText('Личный чат')).toBeVisible()
}

async function ensureServiceWorkerControlsPage(
  context: BrowserContext,
  page: Page,
) {
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

  return (
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 5000 }))
  )
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

async function triggerServiceWorkerOutboxDrain(
  serviceWorker: Awaited<ReturnType<typeof ensureServiceWorkerControlsPage>>,
) {
  await serviceWorker.evaluate(async () => {
    const serviceWorkerGlobal = globalThis as typeof globalThis & {
      drainTextOutboxInBackgroundSync?: () => Promise<void>
    }

    if (
      typeof serviceWorkerGlobal.drainTextOutboxInBackgroundSync !== 'function'
    ) {
      throw new Error(
        'Service worker does not expose drainTextOutboxInBackgroundSync.',
      )
    }

    await serviceWorkerGlobal.drainTextOutboxInBackgroundSync()
  })
}

async function readOutboxRecordFromServiceWorker(
  serviceWorker: Awaited<ReturnType<typeof ensureServiceWorkerControlsPage>>,
  key: string,
) {
  return serviceWorker.evaluate(async (recordKey) => {
    const database = await new Promise<IDBDatabase>((resolveOpen, reject) => {
      const request = indexedDB.open('portal-offline', 2)

      request.onsuccess = () => resolveOpen(request.result)
      request.onerror = () => reject(request.error)
    })

    return new Promise<BrowserOutboxRecord | null>((resolveRead, reject) => {
      const transaction = database.transaction('chat_text_outbox', 'readonly')
      const request = transaction.objectStore('chat_text_outbox').get(recordKey)

      request.onsuccess = () => {
        resolveRead((request.result as BrowserOutboxRecord | undefined) ?? null)
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
  }, key)
}

test('service worker keeps queued text after a real network failure and sends after recovery', async ({
  context,
  page,
}) => {
  const server = await startRuntimeServer()

  try {
    await loginPortalUser(page, server.origin)
    const serviceWorker = await ensureServiceWorkerControlsPage(context, page)
    const identity = await readLastActiveIdentity(page)
    const outboxRecord = createSeededOutboxRecord(identity, {
      clientMessageKey: OUTBOX_CLIENT_MESSAGE_KEY,
      content: OUTBOX_TEXT,
    })
    const outboxKey = `${identity.tenantSlug}:${identity.userId}:${privateThread.id}:${OUTBOX_CLIENT_MESSAGE_KEY}`

    await seedOutboxRecord(page, outboxRecord)
    await page.close()
    server.setMessageEndpointAvailable(false)

    await triggerServiceWorkerOutboxDrain(serviceWorker)

    await expect.poll(() => server.failedMessageRequestCount() > 0).toBe(true)
    expect(
      countPostsForClientMessageKey(
        server.postBodies,
        OUTBOX_CLIENT_MESSAGE_KEY,
      ),
    ).toBe(0)
    await expect
      .poll(async () => {
        const record = await readOutboxRecordFromServiceWorker(
          serviceWorker,
          outboxKey,
        )

        return record?.status ?? null
      })
      .toBe('queued')

    server.setMessageEndpointAvailable(true)
    await new Promise((resolveWait) => setTimeout(resolveWait, 1100))
    await triggerServiceWorkerOutboxDrain(serviceWorker)

    await expect
      .poll(() =>
        countPostsForClientMessageKey(
          server.postBodies,
          OUTBOX_CLIENT_MESSAGE_KEY,
        ),
      )
      .toBe(1)
    await expect
      .poll(() => readOutboxRecordFromServiceWorker(serviceWorker, outboxKey))
      .toBeNull()

    const recoveryPage = await context.newPage()

    await recoveryPage.goto(`${server.origin}/app/chat`)
    await expect(recoveryPage.getByText('Личный чат')).toBeVisible()
    await expect(recoveryPage.getByText(OUTBOX_TEXT)).toHaveCount(1)
    await expect(
      readOutboxRecord(recoveryPage, {
        clientMessageKey: OUTBOX_CLIENT_MESSAGE_KEY,
        tenantSlug: identity.tenantSlug,
        threadId: privateThread.id,
        userId: identity.userId,
      }),
    ).resolves.toBeNull()
  } finally {
    await server.close()
  }
})
