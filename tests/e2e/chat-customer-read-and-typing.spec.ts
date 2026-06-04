import { expect, type Page, test } from '@playwright/test'

import { E2E_PORTAL_USER } from '../../backend/src/test/e2ePortalUser.ts'
import type { ChatMessagesSnapshot } from '../../frontend/src/features/chat/types.ts'

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} as const

const tenant = {
  displayName: 'Бухфирма',
  primaryDomain: '127.0.0.1',
  publicBaseUrl: 'http://127.0.0.1:5173',
  slug: 'buhfirma',
}

type ChatTypingRequest = {
  typingStatus?: 'off' | 'on'
}

type PortalRuntimeApiState = {
  getMessageRequests: string[]
  readRequests: string[]
  typingRequests: ChatTypingRequest[]
}

function createJsonResponse(body: unknown, status = 200) {
  return {
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  }
}

function createReadySnapshot(
  messages: ChatMessagesSnapshot['messages'],
): ChatMessagesSnapshot {
  return {
    activeThread: privateThread,
    hasMoreOlder: false,
    messages,
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
  }
}

const oldAgentMessage = {
  attachments: [],
  authorName: 'Ольга Support',
  authorRole: 'agent',
  content: 'Проверьте, пожалуйста, последние документы.',
  contentType: 'text',
  createdAt: '2026-06-04T09:00:00.000Z',
  direction: 'incoming',
  id: 101,
  status: 'sent',
} satisfies ChatMessagesSnapshot['messages'][number]

const fallbackAgentMessage = {
  attachments: [],
  authorName: 'Ольга Support',
  authorRole: 'agent',
  content: 'Новое сообщение пришло через fallback refresh.',
  contentType: 'text',
  createdAt: '2026-06-04T09:01:00.000Z',
  direction: 'incoming',
  id: 102,
  status: 'sent',
} satisfies ChatMessagesSnapshot['messages'][number]

async function installControlledRealtime(page: Page) {
  await page.addInitScript(() => {
    type ControlledRealtimeApi = {
      emit: (type: string, data?: unknown, index?: number) => void
      instanceCount: () => number
    }
    type RealtimeWindow = Window &
      typeof globalThis & {
        __portalE2eRealtime?: ControlledRealtimeApi
      }

    class ControlledEventSource extends EventTarget implements EventSource {
      static readonly CLOSED = 2
      static readonly CONNECTING = 0
      static readonly OPEN = 1
      static instances: ControlledEventSource[] = []

      readonly CLOSED = 2
      readonly CONNECTING = 0
      readonly OPEN = 1
      onerror: ((event: Event) => void) | null = null
      onmessage: ((event: MessageEvent) => void) | null = null
      onopen: ((event: Event) => void) | null = null
      readyState = ControlledEventSource.CONNECTING
      url: string
      withCredentials: boolean

      constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        super()
        this.url = String(url)
        this.withCredentials = Boolean(eventSourceInitDict?.withCredentials)
        ControlledEventSource.instances.push(this)

        window.setTimeout(() => {
          if (this.readyState === ControlledEventSource.CLOSED) {
            return
          }

          this.readyState = ControlledEventSource.OPEN
          const event = new Event('open')

          this.onopen?.(event)
          this.dispatchEvent(event)
        }, 0)
      }

      close() {
        this.readyState = ControlledEventSource.CLOSED
      }

      emit(type: string, data?: unknown) {
        const event = new MessageEvent(type, {
          data: JSON.stringify(data),
        })

        if (type === 'message') {
          this.onmessage?.(event)
        }

        this.dispatchEvent(event)
      }
    }

    ;(window as RealtimeWindow).__portalE2eRealtime = {
      emit(type, data, index = 0) {
        ControlledEventSource.instances[index]?.emit(type, data)
      },
      instanceCount() {
        return ControlledEventSource.instances.length
      },
    }
    window.EventSource = ControlledEventSource
  })
}

async function emitRealtimeEvent(page: Page, type: string, data: unknown) {
  await page.evaluate(
    ({ eventData, eventType }) => {
      const realtimeWindow = window as Window &
        typeof globalThis & {
          __portalE2eRealtime?: {
            emit: (type: string, data?: unknown) => void
          }
        }

      realtimeWindow.__portalE2eRealtime?.emit(eventType, eventData)
    },
    { eventData: data, eventType: type },
  )
}

async function routePortalRuntimeApi(
  page: Page,
  {
    fallbackSnapshot = createReadySnapshot([oldAgentMessage]),
    initialSnapshot = createReadySnapshot([oldAgentMessage]),
  }: {
    fallbackSnapshot?: ChatMessagesSnapshot
    initialSnapshot?: ChatMessagesSnapshot
  } = {},
): Promise<PortalRuntimeApiState> {
  const state: PortalRuntimeApiState = {
    getMessageRequests: [],
    readRequests: [],
    typingRequests: [],
  }
  let isAuthenticated = false

  await page.route(/^https?:\/\/[^/]+\/api\/.*/, async (route) => {
    const request = route.request()
    const requestUrl = new URL(request.url())
    const path = requestUrl.pathname
    const method = request.method()

    if (path === '/api/tenant') {
      await route.fulfill(createJsonResponse({ tenant }))
      return
    }

    if (path === '/api/auth/me') {
      await route.fulfill(
        isAuthenticated
          ? createJsonResponse({
              session: {
                expiresAt: '2026-06-10T10:00:00.000Z',
              },
              user: {
                email: E2E_PORTAL_USER.email,
                fullName: E2E_PORTAL_USER.fullName,
                id: 7,
              },
            })
          : createJsonResponse(
              {
                error: {
                  code: 'UNAUTHORIZED',
                  message: 'Требуется вход.',
                },
              },
              401,
            ),
      )
      return
    }

    if (path === '/api/auth/login' && method === 'POST') {
      isAuthenticated = true
      await route.fulfill(
        createJsonResponse({
          session: {
            expiresAt: '2026-06-10T10:00:00.000Z',
          },
          user: {
            email: E2E_PORTAL_USER.email,
            fullName: E2E_PORTAL_USER.fullName,
            id: 7,
          },
        }),
      )
      return
    }

    if (path === '/api/chat/threads') {
      await route.fulfill(
        createJsonResponse({
          activeThreadId: privateThread.id,
          threads: [{ ...privateThread, unreadCount: 0 }],
          totalUnreadCount: 0,
        }),
      )
      return
    }

    if (path === '/api/chat/messages') {
      state.getMessageRequests.push(`${path}${requestUrl.search}`)
      await route.fulfill(
        createJsonResponse(
          state.getMessageRequests.length === 1
            ? initialSnapshot
            : fallbackSnapshot,
        ),
      )
      return
    }

    if (path === '/api/chat/support-availability') {
      await route.fulfill(
        createJsonResponse({
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
      )
      return
    }

    if (path === '/api/chat/threads/private%3Ame/notification-settings') {
      await route.fulfill(
        createJsonResponse({
          effective: {
            newMessagesEnabled: true,
            pushEnabled: false,
            soundEnabled: true,
          },
          global: {
            newMessagesEnabled: true,
            pushEnabled: false,
            soundEnabled: true,
          },
          overrides: {
            newMessagesEnabled: null,
            pushEnabled: null,
            soundEnabled: null,
          },
          threadId: privateThread.id,
        }),
      )
      return
    }

    if (path === '/api/chat/threads/private%3Ame/read' && method === 'POST') {
      state.readRequests.push(path)
      await route.fulfill({ status: 204 })
      return
    }

    if (path === '/api/chat/threads/private%3Ame/typing' && method === 'POST') {
      state.typingRequests.push(
        (request.postDataJSON() ?? {}) as ChatTypingRequest,
      )
      await route.fulfill({ status: 204 })
      return
    }

    await route.fulfill(
      createJsonResponse(
        {
          error: {
            code: 'unexpected_e2e_api',
            message: `Unexpected E2E API request: ${method} ${path}`,
          },
        },
        500,
      ),
    )
  })

  return state
}

async function loginPortalUser(page: Page) {
  await page.goto('/auth/login')
  await page.getByLabel('Email').fill(E2E_PORTAL_USER.email)
  await page
    .getByRole('textbox', { name: 'Пароль' })
    .fill(E2E_PORTAL_USER.password)
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page).toHaveURL(/\/app\/chat/)
  await expect(page.getByText(oldAgentMessage.content)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await installControlledRealtime(page)
})

test('posts customer read only after the latest agent message is visible', async ({
  page,
}) => {
  const state = await routePortalRuntimeApi(page)

  await loginPortalUser(page)

  await expect.poll(() => state.readRequests.length).toBe(1)
})

test('syncs portal user typing through the backend typing route', async ({
  page,
}) => {
  const state = await routePortalRuntimeApi(page)

  await loginPortalUser(page)
  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Печатаю ответ')

  await expect
    .poll(() => state.typingRequests.map((request) => request.typingStatus))
    .toContain('on')

  await page.getByRole('textbox', { name: 'Сообщение' }).fill('')

  await expect
    .poll(() => state.typingRequests.map((request) => request.typingStatus))
    .toContain('off')
})

test('shows textless agent typing from realtime without creating a message', async ({
  page,
}) => {
  await routePortalRuntimeApi(page)
  await loginPortalUser(page)

  await emitRealtimeEvent(page, 'typing', {
    actor: 'agent',
    isTyping: true,
    threadId: privateThread.id,
  })

  const typingIndicator = page.getByRole('status', {
    name: 'Идет набор сообщения',
  })

  await expect(typingIndicator).toBeVisible()
  await expect(typingIndicator.locator('span')).toHaveCount(3)
  await expect(page.getByText(/печатает/i)).toHaveCount(0)
  await expect(page.getByText(oldAgentMessage.content)).toHaveCount(1)

  await emitRealtimeEvent(page, 'typing', {
    actor: 'agent',
    isTyping: false,
    threadId: privateThread.id,
  })

  await expect(typingIndicator).toBeHidden()
})

test('refreshes stale realtime through fallback without duplicating delayed SSE messages', async ({
  page,
}) => {
  await page.clock.install({
    time: new Date('2026-06-04T09:00:00.000Z'),
  })
  const fallbackSnapshot = createReadySnapshot([
    oldAgentMessage,
    fallbackAgentMessage,
  ])
  const state = await routePortalRuntimeApi(page, { fallbackSnapshot })

  await loginPortalUser(page)

  await expect(page.getByText(fallbackAgentMessage.content)).toHaveCount(0)
  await page.clock.fastForward(31_000)

  await expect(page.getByText(fallbackAgentMessage.content)).toBeVisible()
  await expect
    .poll(() => state.getMessageRequests)
    .toEqual([
      '/api/chat/messages?threadId=private%3Ame',
      '/api/chat/messages?threadId=private%3Ame',
    ])

  await emitRealtimeEvent(page, 'messages', fallbackSnapshot)

  await expect(page.getByText(fallbackAgentMessage.content)).toHaveCount(1)
})
