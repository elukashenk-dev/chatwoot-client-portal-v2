import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../../../app/AppRoutes'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { AuthSessionProvider } from '../../auth/lib/AuthSessionProvider'
import { clearOfflineDatabaseForTests } from '../../offline/offlineDatabase'
import { TenantIdentityContext } from '../../tenant/lib/tenantIdentityContext'
import type { ChatMessagesSnapshot } from '../types'

const CHAT_PAGE_LOAD_TIMEOUT = {
  timeout: 5000,
}
const OFFLINE_SAVED_MESSAGES_NOTICE =
  'Нет связи. Показываем сохраненные сообщения.'
const OFFLINE_QUEUED_MESSAGE_NOTICE =
  'Нет связи. 1 сообщение в очереди. Отправим, когда связь восстановится.'
const RETIRED_OFFLINE_NOTICE =
  'Нет соединения. Новые сообщения временно не обновляются, а отправка отключена.'

const tenantContextValue = {
  errorMessage: null,
  isUsingCachedData: false,
  status: 'ready' as const,
  tenant: {
    displayName: 'Бухфирма',
    primaryDomain: 'lk.buhfirma.ru',
    publicBaseUrl: 'https://lk.buhfirma.ru',
    slug: 'buhfirma',
  },
}

class MockEventSource {
  static instances: MockEventSource[] = []

  readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>()
  readonly close = vi.fn()
  readonly url: string
  readonly withCredentials: boolean | undefined

  constructor(url: string | URL, init?: EventSourceInit) {
    this.url = String(url)
    this.withCredentials = init?.withCredentials
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const listeners = this.listeners.get(type) ?? new Set()
    const callback =
      typeof listener === 'function'
        ? listener
        : listener.handleEvent.bind(listener)

    listeners.add(callback as (event: MessageEvent) => void)
    this.listeners.set(type, listeners)
  }

  emit(type: string, data: unknown = {}) {
    const event =
      type === 'open'
        ? new Event(type)
        : new MessageEvent(type, {
            data: JSON.stringify(data),
          })

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as MessageEvent)
    }
  }
}

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

function createAuthenticatedUserResponse() {
  return createJsonResponse({
    session: {
      expiresAt: '2026-06-10T10:00:00.000Z',
    },
    user: {
      email: 'name@group.ru',
      fullName: 'Portal User',
      id: 7,
    },
  })
}

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} satisfies NonNullable<ChatMessagesSnapshot['activeThread']>

function createThreadsResponse() {
  return {
    activeThreadId: privateThread.id,
    threads: [privateThread],
  }
}

function createUnauthorizedSessionResponse() {
  return createJsonResponse(
    {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Требуется вход.',
      },
    },
    401,
  )
}

function createReadySnapshot(
  overrides: Partial<ChatMessagesSnapshot> = {},
): ChatMessagesSnapshot {
  return {
    hasMoreOlder: false,
    messages: [
      {
        attachments: [],
        authorName: 'Ольга Support',
        authorRole: 'agent',
        content: 'Здравствуйте, вижу ваше обращение.',
        contentType: 'text',
        createdAt: '2026-04-21T09:12:00.000Z',
        direction: 'incoming',
        id: 101,
        status: 'sent',
      },
    ],
    nextOlderCursor: null,
    activeThread: privateThread,
    reason: 'none',
    result: 'ready',
    ...overrides,
  }
}

function createSupportAvailabilityResponse() {
  return createJsonResponse({
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
}

function createNotificationSettingsResponse() {
  return createJsonResponse({
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
  })
}

function renderChatRoute() {
  renderWithRouter(
    <TenantIdentityContext.Provider value={tenantContextValue}>
      <AuthSessionProvider>
        <AppRoutes />
      </AuthSessionProvider>
    </TenantIdentityContext.Provider>,
    { initialEntries: ['/app/chat'] },
  )
}

function setNavigatorStorageEstimate({
  quota = 1000,
  usage = 100,
}: {
  quota?: number
  usage?: number
} = {}) {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      estimate: vi.fn(async () => ({
        quota,
        usage,
      })),
      persist: vi.fn(async () => true),
    },
  })
}

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(globalThis.navigator, 'onLine', {
    configurable: true,
    value,
  })
}

describe('ChatPage runtime hardening', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(async () => {
    await clearOfflineDatabaseForTests()
    MockEventSource.instances = []
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('EventSource', MockEventSource)
    setNavigatorStorageEstimate()
    setNavigatorOnline(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
    setNavigatorOnline(true)
  })

  it('shows an offline state and disables composer actions while the browser is offline', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (url === '/api/chat/threads') {
        return createJsonResponse(createThreadsResponse())
      }

      if (url === '/api/chat/messages?threadId=private%3Ame') {
        return createJsonResponse(createReadySnapshot())
      }

      if (url === '/api/chat/threads/private%3Ame/notification-settings') {
        return createNotificationSettingsResponse()
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/chat/support-availability',
        expect.objectContaining({
          credentials: 'include',
          method: 'GET',
        }),
      )
    })
    await act(async () => undefined)

    act(() => {
      setNavigatorOnline(false)
      window.dispatchEvent(new Event('offline'))
    })

    expect(
      await screen.findByText(OFFLINE_SAVED_MESSAGES_NOTICE),
    ).toBeInTheDocument()
    expect(screen.getByText('Нет связи')).toBeInTheDocument()
    expect(
      within(screen.getByRole('contentinfo')).queryByText(
        RETIRED_OFFLINE_NOTICE,
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Сообщение' }),
    ).not.toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Голосовое сообщение' }),
    ).toBeDisabled()
  })

  it('resyncs the chat snapshot when the browser comes back online', async () => {
    let messageRequestCount = 0

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (url === '/api/chat/threads') {
        return createJsonResponse(createThreadsResponse())
      }

      if (url === '/api/chat/messages?threadId=private%3Ame') {
        messageRequestCount += 1

        return createJsonResponse(
          createReadySnapshot(
            messageRequestCount === 1
              ? {
                  messages: [
                    {
                      attachments: [],
                      authorName: 'Ольга Support',
                      authorRole: 'agent',
                      content: 'Последнее сохраненное сообщение.',
                      contentType: 'text',
                      createdAt: '2026-04-21T09:12:00.000Z',
                      direction: 'incoming',
                      id: 101,
                      status: 'sent',
                    },
                  ],
                }
              : {
                  messages: [
                    {
                      attachments: [],
                      authorName: 'Ольга Support',
                      authorRole: 'agent',
                      content: 'Последнее сохраненное сообщение.',
                      contentType: 'text',
                      createdAt: '2026-04-21T09:12:00.000Z',
                      direction: 'incoming',
                      id: 101,
                      status: 'sent',
                    },
                    {
                      attachments: [],
                      authorName: 'Ольга Support',
                      authorRole: 'agent',
                      content: 'Новый ответ после восстановления соединения.',
                      contentType: 'text',
                      createdAt: '2026-04-21T09:17:00.000Z',
                      direction: 'incoming',
                      id: 102,
                      status: 'sent',
                    },
                  ],
                },
          ),
        )
      }

      if (url === '/api/chat/threads/private%3Ame/notification-settings') {
        return createNotificationSettingsResponse()
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    await screen.findByText(
      'Последнее сохраненное сообщение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )

    act(() => {
      setNavigatorOnline(false)
      window.dispatchEvent(new Event('offline'))
    })

    act(() => {
      setNavigatorOnline(true)
      window.dispatchEvent(new Event('online'))
    })

    expect(
      await screen.findByText('Новый ответ после восстановления соединения.'),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/messages?threadId=private%3Ame',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
    expect(messageRequestCount).toBe(2)
  })

  it('switches to offline mode when send fails before the browser dispatches an offline event', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(createNotificationSettingsResponse())
      .mockResolvedValueOnce(createSupportAvailabilityResponse())
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))

    renderChatRoute()

    await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )

    await user.type(
      screen.getByRole('textbox', { name: 'Сообщение' }),
      'Проверяю поведение без offline event',
    )
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(
      await screen.findByText(OFFLINE_QUEUED_MESSAGE_NOTICE),
    ).toBeInTheDocument()
    expect(screen.getByText('Нет связи')).toBeInTheDocument()
    expect(
      within(screen.getByRole('contentinfo')).queryByText(
        RETIRED_OFFLINE_NOTICE,
      ),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()
    expect(
      screen.queryByText('Не удалось отправить сообщение. Попробуйте еще раз.'),
    ).not.toBeInTheDocument()
  })

  it('recovers from a request-detected offline state on the next lifecycle resync', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(createNotificationSettingsResponse())
      .mockResolvedValueOnce(createSupportAvailabilityResponse())
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        createJsonResponse(
          createReadySnapshot({
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
                authorRole: 'agent',
                content: 'Здравствуйте, вижу ваше обращение.',
                contentType: 'text',
                createdAt: '2026-04-21T09:12:00.000Z',
                direction: 'incoming',
                id: 101,
                status: 'sent',
              },
              {
                attachments: [],
                authorName: 'Ольга Support',
                authorRole: 'agent',
                content: 'Связь вернулась, чат снова обновляется.',
                contentType: 'text',
                createdAt: '2026-04-21T09:16:00.000Z',
                direction: 'incoming',
                id: 102,
                status: 'sent',
              },
            ],
          }),
        ),
      )

    renderChatRoute()

    await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )

    await user.type(
      screen.getByRole('textbox', { name: 'Сообщение' }),
      'Проверяю восстановление после сетевой ошибки',
    )
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    await screen.findByText(OFFLINE_QUEUED_MESSAGE_NOTICE)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(
      await screen.findByText('Связь вернулась, чат снова обновляется.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(OFFLINE_QUEUED_MESSAGE_NOTICE),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Сообщение' }),
    ).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()
  })

  it('clears request-detected offline state when realtime receives a fresh snapshot', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(createNotificationSettingsResponse())
      .mockResolvedValueOnce(createSupportAvailabilityResponse())
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))

    renderChatRoute()

    await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )

    await user.type(
      screen.getByRole('textbox', { name: 'Сообщение' }),
      'Проверяю восстановление через realtime',
    )
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    await screen.findByText(OFFLINE_QUEUED_MESSAGE_NOTICE)

    act(() => {
      MockEventSource.instances[0]?.emit(
        'messages',
        createReadySnapshot({
          messages: [
            {
              attachments: [],
              authorName: 'Ольга Support',
              authorRole: 'agent',
              content: 'Realtime снова доставляет сообщения.',
              contentType: 'text',
              createdAt: '2026-04-21T09:18:00.000Z',
              direction: 'incoming',
              id: 103,
              status: 'sent',
            },
          ],
        }),
      )
    })

    expect(
      await screen.findByText('Realtime снова доставляет сообщения.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(OFFLINE_QUEUED_MESSAGE_NOTICE),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Сообщение' }),
    ).not.toBeDisabled()
  })

  it('returns to login when resume resync hits an expired backend session', async () => {
    let authRequestCount = 0
    let messageRequestCount = 0

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        authRequestCount += 1

        return authRequestCount === 1
          ? createAuthenticatedUserResponse()
          : createUnauthorizedSessionResponse()
      }

      if (url === '/api/chat/threads') {
        return createJsonResponse(createThreadsResponse())
      }

      if (url === '/api/chat/messages?threadId=private%3Ame') {
        messageRequestCount += 1

        return messageRequestCount === 1
          ? createJsonResponse(createReadySnapshot())
          : createUnauthorizedSessionResponse()
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      if (url === '/api/chat/threads/private%3Ame/notification-settings') {
        return createNotificationSettingsResponse()
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )

    act(() => {
      setNavigatorOnline(false)
      window.dispatchEvent(new Event('offline'))
    })

    act(() => {
      setNavigatorOnline(true)
      window.dispatchEvent(new Event('online'))
    })

    expect(
      await screen.findByRole('heading', { name: 'Центр поддержки' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Не удалось обновить чат после восстановления соединения. Попробуйте еще раз.',
      ),
    ).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
    expect(authRequestCount).toBeGreaterThan(1)
  })
})
