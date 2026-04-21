import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../../../app/AppRoutes'
import { AuthSessionProvider } from '../../auth/lib/AuthSessionProvider'
import { renderWithRouter } from '../../../test/renderWithRouter'
import type { ChatMessagesSnapshot } from '../types'

const CHAT_PAGE_LOAD_TIMEOUT = {
  timeout: 5000,
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
      {
        attachments: [
          {
            fileSize: 24576,
            fileType: 'pdf',
            id: 9,
            name: 'invoice.pdf',
            thumbUrl: '',
            url: 'https://example.test/invoice.pdf',
          },
        ],
        authorName: 'Вы',
        content: 'Спасибо, прикладываю файл.',
        contentType: 'text',
        createdAt: '2026-04-21T09:16:00.000Z',
        direction: 'outgoing',
        id: 102,
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

describe('ChatPage', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('renders the backend-owned ready transcript without direct chat authority in the browser', async () => {
    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))

    renderChatRoute()

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Клиентский чат' },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('name@company.ru')).toBeInTheDocument()
    expect(
      await screen.findByText('Здравствуйте, вижу ваше обращение.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Ольга Support')).toBeInTheDocument()
    expect(screen.getByText('В работе')).toBeInTheDocument()
    expect(screen.getByText('Спасибо, прикладываю файл.')).toBeInTheDocument()
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Сообщение' }),
    ).toBeInTheDocument()

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/chat/messages',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
  })

  it('loads older messages through the bounded history cursor', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(
        createJsonResponse(
          createReadySnapshot({
            hasMoreOlder: true,
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
                content: 'Последнее сообщение.',
                contentType: 'text',
                createdAt: '2026-04-21T10:00:00.000Z',
                direction: 'incoming',
                id: 205,
                status: 'sent',
              },
            ],
            nextOlderCursor: 205,
          }),
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          createReadySnapshot({
            hasMoreOlder: false,
            messages: [
              {
                attachments: [],
                authorName: 'Вы',
                content: 'Ранее отправленное сообщение.',
                contentType: 'text',
                createdAt: '2026-04-20T08:00:00.000Z',
                direction: 'outgoing',
                id: 120,
                status: 'sent',
              },
            ],
            nextOlderCursor: null,
          }),
        ),
      )

    renderChatRoute()

    await user.click(
      await screen.findByRole(
        'button',
        {
          name: 'Загрузить более ранние сообщения',
        },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    )

    expect(
      await screen.findByText('Ранее отправленное сообщение.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Последнее сообщение.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/chat/messages?primaryConversationId=77&beforeMessageId=205',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
  })

  it('keeps the visible transcript when older history loading fails', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(
        createJsonResponse(
          createReadySnapshot({
            hasMoreOlder: true,
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
                content: 'Текущее сообщение остается на экране.',
                contentType: 'text',
                createdAt: '2026-04-21T10:00:00.000Z',
                direction: 'incoming',
                id: 205,
                status: 'sent',
              },
            ],
            nextOlderCursor: 205,
          }),
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            error: {
              code: 'invalid_history_cursor',
              message: 'History cursor is invalid.',
            },
          },
          400,
        ),
      )

    renderChatRoute()

    await user.click(
      await screen.findByRole(
        'button',
        {
          name: 'Загрузить более ранние сообщения',
        },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    )

    expect(
      await screen.findByText('Текущее сообщение остается на экране.'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        'Не удалось загрузить более ранние сообщения. Попробуйте еще раз.',
      ),
    ).toBeInTheDocument()
  })

  it('does not merge a non-ready older history response into the ready transcript', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(
        createJsonResponse(
          createReadySnapshot({
            hasMoreOlder: true,
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
                content: 'Готовая история остается видимой.',
                contentType: 'text',
                createdAt: '2026-04-21T10:00:00.000Z',
                direction: 'incoming',
                id: 205,
                status: 'sent',
              },
            ],
            nextOlderCursor: 205,
          }),
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          createReadySnapshot({
            hasMoreOlder: false,
            messages: [],
            nextOlderCursor: null,
            primaryConversation: null,
            reason: 'primary_conversation_missing',
            result: 'not_ready',
          }),
        ),
      )

    renderChatRoute()

    await user.click(
      await screen.findByRole(
        'button',
        {
          name: 'Загрузить более ранние сообщения',
        },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    )

    expect(
      await screen.findByText('Готовая история остается видимой.'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        'Не удалось загрузить более ранние сообщения. Попробуйте еще раз.',
      ),
    ).toBeInTheDocument()
  })

  it('sends a text message through the backend and appends the returned canonical message', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(
        createJsonResponse({
          linkedContact: {
            id: 42,
          },
          primaryConversation: {
            assigneeName: 'Ольга Support',
            id: 77,
            inboxId: 9,
            lastActivityAt: 1776763600,
            status: 'open',
          },
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [],
            authorName: 'Вы',
            content: 'Новое сообщение',
            contentType: 'text',
            createdAt: '2026-04-21T09:30:00.000Z',
            direction: 'outgoing',
            id: 501,
            status: 'sent',
          },
        }),
      )

    renderChatRoute()

    await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Сообщение' }),
      'Новое сообщение',
    )
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByText('Новое сообщение')).toBeInTheDocument()

    const [, requestOptions] = fetchMock.mock.calls[2] ?? []
    const requestBody = JSON.parse(String(requestOptions?.body)) as {
      clientMessageKey: string
      content: string
      primaryConversationId: number
    }

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/chat/messages',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(requestBody).toEqual({
      clientMessageKey: expect.stringMatching(/^portal-send:/),
      content: 'Новое сообщение',
      primaryConversationId: 77,
    })
  })

  it('retries a failed send with the same client message key while the draft is unchanged', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            error: {
              code: 'chatwoot_unavailable',
              message: 'Chatwoot temporarily unavailable.',
            },
          },
          503,
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          linkedContact: {
            id: 42,
          },
          primaryConversation: {
            assigneeName: 'Ольга Support',
            id: 77,
            inboxId: 9,
            lastActivityAt: 1776763600,
            status: 'open',
          },
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [],
            authorName: 'Вы',
            content: 'Повтор после сбоя',
            contentType: 'text',
            createdAt: '2026-04-21T09:31:00.000Z',
            direction: 'outgoing',
            id: 502,
            status: 'sent',
          },
        }),
      )

    renderChatRoute()

    await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Сообщение' }),
      'Повтор после сбоя',
    )
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(
      await screen.findByText('Chatwoot temporarily unavailable.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByText('Повтор после сбоя')).toBeInTheDocument()

    const firstRequestBody = JSON.parse(
      String(fetchMock.mock.calls[2]?.[1]?.body),
    ) as { clientMessageKey: string }
    const retryRequestBody = JSON.parse(
      String(fetchMock.mock.calls[3]?.[1]?.body),
    ) as { clientMessageKey: string }

    expect(retryRequestBody.clientMessageKey).toBe(
      firstRequestBody.clientMessageKey,
    )
  })

  it('allows the first text send to bootstrap a conversation without a selected conversation id', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(
        createJsonResponse(
          createReadySnapshot({
            linkedContact: {
              id: 42,
            },
            messages: [],
            primaryConversation: null,
            reason: 'conversation_missing',
            result: 'not_ready',
          }),
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          linkedContact: {
            id: 42,
          },
          primaryConversation: {
            assigneeName: null,
            id: 301,
            inboxId: 9,
            lastActivityAt: 1776763600,
            status: 'open',
          },
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [],
            authorName: 'Вы',
            content: 'Первое сообщение',
            contentType: 'text',
            createdAt: '2026-04-21T09:32:00.000Z',
            direction: 'outgoing',
            id: 503,
            status: 'sent',
          },
        }),
      )

    renderChatRoute()

    await screen.findByText(
      'В этой переписке пока нет сообщений, доступных клиентскому порталу.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Сообщение' }),
      'Первое сообщение',
    )
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByText('Первое сообщение')).toBeInTheDocument()

    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[2]?.[1]?.body),
    ) as {
      primaryConversationId?: number
    }

    expect(requestBody.primaryConversationId).toBeUndefined()
  })
})
