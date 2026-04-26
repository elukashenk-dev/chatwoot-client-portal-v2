import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../../../app/AppRoutes'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { AuthSessionProvider } from '../../auth/lib/AuthSessionProvider'
import type { ChatMessagesSnapshot } from '../types'

const CHAT_PAGE_LOAD_TIMEOUT = {
  timeout: 5000,
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
    user: {
      email: 'name@company.ru',
      fullName: 'Portal User',
      id: 7,
    },
  })
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
    linkedContact: {
      id: 42,
    },
    messages: [
      {
        attachments: [],
        authorName: 'Ольга Support',
        content: 'Здравствуйте, вижу ваше обращение.',
        contentType: 'text',
        createdAt: '2026-04-21T09:12:00.000Z',
        direction: 'incoming',
        id: 101,
        status: 'sent',
      },
    ],
    nextOlderCursor: null,
    primaryConversation: {
      assigneeName: 'Ольга Support',
      id: 77,
      inboxId: 9,
      lastActivityAt: 1776762960,
      status: 'open',
    },
    reason: 'none',
    result: 'ready',
    ...overrides,
  }
}

function renderChatRoute() {
  renderWithRouter(
    <AuthSessionProvider>
      <AppRoutes />
    </AuthSessionProvider>,
    { initialEntries: ['/app/chat'] },
  )
}

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(globalThis.navigator, 'onLine', {
    configurable: true,
    value,
  })
}

describe('ChatPage runtime hardening', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('EventSource', MockEventSource)
    setNavigatorOnline(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
    setNavigatorOnline(true)
  })

  it('shows an offline state and disables composer actions while the browser is offline', async () => {
    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))

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

    expect(
      await screen.findByText(
        'Нет соединения. Новые сообщения временно не обновляются, а отправка отключена.',
      ),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('contentinfo')).getByText(
        'Нет соединения. Новые сообщения временно не обновляются, а отправка отключена.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Голосовое сообщение' }),
    ).toBeDisabled()
  })

  it('resyncs the chat snapshot when the browser comes back online', async () => {
    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(
        createJsonResponse(
          createReadySnapshot({
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
                content: 'Последнее сохраненное сообщение.',
                contentType: 'text',
                createdAt: '2026-04-21T09:12:00.000Z',
                direction: 'incoming',
                id: 101,
                status: 'sent',
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          createReadySnapshot({
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
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
                content: 'Новый ответ после восстановления соединения.',
                contentType: 'text',
                createdAt: '2026-04-21T09:17:00.000Z',
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
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/chat/messages?primaryConversationId=77',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
  })

  it('switches to offline mode when send fails before the browser dispatches an offline event', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
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
      await screen.findByText(
        'Нет соединения. Новые сообщения временно не обновляются, а отправка отключена.',
      ),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('contentinfo')).getByText(
        'Нет соединения. Новые сообщения временно не обновляются, а отправка отключена.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()
    expect(
      screen.queryByText('Не удалось отправить сообщение. Попробуйте еще раз.'),
    ).not.toBeInTheDocument()
  })

  it('recovers from a request-detected offline state on the next lifecycle resync', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        createJsonResponse(
          createReadySnapshot({
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
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

    await screen.findByText(
      'Нет соединения. Новые сообщения временно не обновляются, а отправка отключена.',
    )

    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(
      await screen.findByText('Связь вернулась, чат снова обновляется.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Нет соединения. Новые сообщения временно не обновляются, а отправка отключена.',
      ),
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
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
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

    await screen.findByText(
      'Нет соединения. Новые сообщения временно не обновляются, а отправка отключена.',
    )

    act(() => {
      MockEventSource.instances[0]?.emit(
        'messages',
        createReadySnapshot({
          messages: [
            {
              attachments: [],
              authorName: 'Ольга Support',
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
      screen.queryByText(
        'Нет соединения. Новые сообщения временно не обновляются, а отправка отключена.',
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Сообщение' }),
    ).not.toBeDisabled()
  })

  it('returns to login when resume resync hits an expired backend session', async () => {
    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(createUnauthorizedSessionResponse())
      .mockResolvedValueOnce(createUnauthorizedSessionResponse())

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
      await screen.findByRole('heading', { name: 'Клиентский портал' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Не удалось обновить чат после восстановления соединения. Попробуйте еще раз.',
      ),
    ).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/auth/me',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
  })
})
