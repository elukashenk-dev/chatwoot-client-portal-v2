import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../../../app/AppRoutes'
import { AuthSessionProvider } from '../../auth/lib/AuthSessionProvider'
import { renderWithRouter } from '../../../test/renderWithRouter'
import type { ChatMessagesSnapshot } from '../types'

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
      await screen.findByRole('heading', { name: 'Клиентский чат' }),
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
      screen.getByText('Отправка сообщений будет доступна на следующем этапе'),
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
      await screen.findByRole('button', {
        name: 'Загрузить более ранние сообщения',
      }),
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
})
